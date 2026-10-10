"""Delivery commits a cursor only after durable server acknowledgements."""

from __future__ import annotations

import asyncio
import json
import stat
from functools import partial
from pathlib import Path

import httpx
import pytest
from filelock import Timeout

from omnigent.session_import.observation_delivery import (
    ObservationCheckpointError,
    deliver_observation_once,
)


def transcript(path: Path) -> Path:
    path.write_text(
        "".join(
            json.dumps(
                {
                    "type": "response_item",
                    "payload": {
                        "type": "message",
                        "role": "assistant",
                        "content": [{"type": "output_text", "text": text}],
                    },
                }
            )
            + "\n"
            for text in ["one", "two"]
        )
    )
    return path


@pytest.mark.asyncio
async def test_restart_after_partial_delivery_replays_stable_ids(tmp_path: Path) -> None:
    path = transcript(tmp_path / "rollout.jsonl")
    seen: dict[str, str] = {}
    requests: list[str] = []
    failing = True

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal failing
        assert request.headers["authorization"] == "Bearer fixture"
        assert request.headers["x-omnigent-background-session-titles"] == "off"
        payload = json.loads(request.content)
        assert payload["type"] == "external_conversation_item"
        key = payload["data"]["source_id"]
        requests.append(key)
        seen.setdefault(key, str(len(seen)))
        if failing and len(requests) == 2:
            failing = False
            raise httpx.ReadTimeout("Response lost after server commit", request=request)
        return httpx.Response(202, json={"item_id": seen[key]})

    checkpoint_dir = tmp_path / "checkpoints"
    async with httpx.AsyncClient(
        base_url="http://fixture",
        transport=httpx.MockTransport(handler),
        headers={"Authorization": "Bearer fixture"},
    ) as client:
        deliver = partial(
            deliver_observation_once,
            client=client,
            session_id="session-one",
            namespace="machine/codex/native",
            source="codex",
            transcript=path,
            checkpoint_dir=checkpoint_dir,
        )
        with pytest.raises(httpx.ReadTimeout):
            await deliver()
        assert not list(checkpoint_dir.glob("*.json"))
        result = await deliver()
        assert result.delivered_items == 2 and len(seen) == 2
        assert requests[:2] == requests[2:]
        checkpoint = next(checkpoint_dir.glob("*.json"))
        assert stat.S_IMODE(checkpoint.stat().st_mode) == 0o600
        assert "fixture" not in checkpoint.read_text()
        resumed = await deliver()
        assert resumed.delivered_items == 0 and len(requests) == 4


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(403),
        httpx.Response(200, text="login page"),
        httpx.Response(202, json={"queued": True}),
        httpx.Response(202, json={"item_id": ""}),
    ],
)
async def test_unacknowledged_delivery_never_advances_cursor(
    tmp_path: Path, response: httpx.Response
) -> None:
    path = transcript(tmp_path / "rollout.jsonl")
    root = tmp_path / "checkpoints"
    async with httpx.AsyncClient(
        base_url="http://fixture", transport=httpx.MockTransport(lambda _: response)
    ) as client:
        with pytest.raises((httpx.HTTPStatusError, ObservationCheckpointError)):
            await deliver_observation_once(
                client=client,
                session_id="one",
                namespace="source",
                source="codex",
                transcript=path,
                checkpoint_dir=root,
            )
    assert not list(root.glob("*.json"))


@pytest.mark.asyncio
async def test_target_server_and_session_each_have_independent_checkpoints(tmp_path: Path) -> None:
    path = transcript(tmp_path / "rollout.jsonl")
    root = tmp_path / "checkpoints"
    delivered = 0

    def handler(_: httpx.Request) -> httpx.Response:
        nonlocal delivered
        delivered += 1
        return httpx.Response(202, json={"item_id": str(delivered)})

    for server, session in [("http://a", "one"), ("http://b", "one"), ("http://a", "two")]:
        async with httpx.AsyncClient(
            base_url=server, transport=httpx.MockTransport(handler)
        ) as client:
            await deliver_observation_once(
                client=client,
                session_id=session,
                namespace="source",
                source="codex",
                transcript=path,
                checkpoint_dir=root,
            )
    assert delivered == 6 and len(list(root.glob("*.json"))) == 3


@pytest.mark.asyncio
async def test_concurrent_collector_cannot_send_from_same_checkpoint(tmp_path: Path) -> None:
    path = transcript(tmp_path / "rollout.jsonl")
    entered, release = asyncio.Event(), asyncio.Event()

    async def handler(_: httpx.Request) -> httpx.Response:
        entered.set()
        await release.wait()
        return httpx.Response(202, json={"item_id": "accepted"})

    async with httpx.AsyncClient(
        base_url="http://fixture", transport=httpx.MockTransport(handler)
    ) as client:
        deliver = partial(
            deliver_observation_once,
            client=client,
            session_id="one",
            namespace="source",
            source="codex",
            transcript=path,
            checkpoint_dir=tmp_path / "state",
        )
        first = asyncio.create_task(deliver())
        await asyncio.wait_for(entered.wait(), timeout=2)
        try:
            with pytest.raises(Timeout):
                await deliver()
        finally:
            release.set()
            await first


@pytest.mark.asyncio
@pytest.mark.parametrize("corruption", ["malformed", "wrong_target", "future_version"])
async def test_corrupt_checkpoint_does_not_replay_source(tmp_path: Path, corruption: str) -> None:
    path = transcript(tmp_path / "rollout.jsonl")
    root = tmp_path / "state"
    requests = 0

    def handler(_: httpx.Request) -> httpx.Response:
        nonlocal requests
        requests += 1
        return httpx.Response(202, json={"item_id": str(requests)})

    async with httpx.AsyncClient(
        base_url="http://fixture", transport=httpx.MockTransport(handler)
    ) as client:
        deliver = partial(
            deliver_observation_once,
            client=client,
            session_id="one",
            namespace="source",
            source="codex",
            transcript=path,
            checkpoint_dir=root,
        )
        await deliver()
        checkpoint = next(root.glob("*.json"))
        state = json.loads(checkpoint.read_text())
        if corruption == "malformed":
            state = {"offset": 99}
        elif corruption == "wrong_target":
            state["connection_key"] = "another-server-or-session"
        else:
            state["version"] = 999
        checkpoint.write_text(json.dumps(state))
        with pytest.raises(ObservationCheckpointError):
            await deliver()
        assert requests == 2


@pytest.mark.asyncio
async def test_cancelled_delivery_releases_lock_without_advancing_checkpoint(
    tmp_path: Path,
) -> None:
    path = transcript(tmp_path / "rollout.jsonl")
    root = tmp_path / "state"
    entered = asyncio.Event()
    block = True
    keys: list[str] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        keys.append(json.loads(request.content)["data"]["source_id"])
        entered.set()
        if block:
            await asyncio.Event().wait()
        return httpx.Response(202, json={"item_id": "accepted"})

    async with httpx.AsyncClient(
        base_url="http://fixture", transport=httpx.MockTransport(handler)
    ) as client:
        deliver = partial(
            deliver_observation_once,
            client=client,
            session_id="one",
            namespace="source",
            source="codex",
            transcript=path,
            checkpoint_dir=root,
        )
        task = asyncio.create_task(deliver())
        await asyncio.wait_for(entered.wait(), timeout=2)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert not list(root.glob("*.json"))
        block = False
        result = await deliver()
        assert result.delivered_items == 2
        assert keys[0] == keys[1]
