"""A lost delivery acknowledgement replays through the real idempotent session API."""

from __future__ import annotations

import json
from functools import partial
from pathlib import Path

import httpx
import pytest

from omnigent.session_import.observation_delivery import deliver_observation_once
from tests.server.helpers import create_test_agent


@pytest.mark.asyncio
async def test_collector_retry_persists_each_item_once_without_starting_agent(
    client: httpx.AsyncClient, tmp_path: Path
) -> None:
    agent = await create_test_agent(client, name="observed-delivery-fixture")
    created = await client.post("/v1/sessions", json={"agent_id": agent["id"]})
    assert created.status_code == 201, created.text
    session_id = created.json()["id"]
    path = tmp_path / "rollout.jsonl"
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
            for text in ["Observed one", "Observed two"]
        )
    )
    requests = 0

    async def proxy(request: httpx.Request) -> httpx.Response:
        nonlocal requests
        response = await client.post(
            request.url.path, content=request.content, headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 202, response.text
        assert response.json()["queued"] is False
        requests += 1
        if requests == 2:
            raise httpx.ReadTimeout("Lost acknowledgement after commit", request=request)
        return httpx.Response(response.status_code, json=response.json())

    async with httpx.AsyncClient(
        base_url=str(client.base_url), transport=httpx.MockTransport(proxy)
    ) as delivery_client:
        deliver = partial(
            deliver_observation_once,
            client=delivery_client,
            session_id=session_id,
            namespace="fixture-machine/codex/session",
            source="codex",
            transcript=path,
            checkpoint_dir=tmp_path / "checkpoints",
        )
        with pytest.raises(httpx.ReadTimeout):
            await deliver()
        assert not list((tmp_path / "checkpoints").glob("*.json"))
        await deliver()
        resumed = await deliver()
        assert resumed.delivered_items == 0
    assert requests == 4
    response = await client.get(f"/v1/sessions/{session_id}/items")
    assert response.status_code == 200
    items = response.json()["data"]
    texts = [
        block.get("text")
        for item in items
        if item.get("type") == "message"
        for block in item.get("content", [])
    ]
    assert texts == ["Observed one", "Observed two"]
    session = (await client.get(f"/v1/sessions/{session_id}")).json()
    assert session.get("runner_id") is None
