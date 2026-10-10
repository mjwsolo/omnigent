"""Acknowledged delivery and private local checkpoints for transcript collectors."""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Literal
from urllib.parse import quote

import httpx
from filelock import FileLock
from pydantic import BaseModel, ConfigDict, ValidationError

from omnigent.session_import.observation import (
    ObservationCursor,
    ObservationSource,
    read_observation_batch,
)

_MAX_CHECKPOINT_BYTES = 64 * 1024


class _Checkpoint(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: Literal[1]
    connection_key: str
    cursor: ObservationCursor


class ObservationCheckpointError(ValueError):
    """Checkpoint state cannot safely be replayed against this connection."""


@dataclass(frozen=True)
class ObservationDeliveryResult:
    records: int
    delivered_items: int
    cursor: ObservationCursor
    workspace: str | None


def _read_checkpoint(path: Path, initial: ObservationCursor) -> ObservationCursor:
    try:
        with path.open("rb") as handle:
            raw = handle.read(_MAX_CHECKPOINT_BYTES + 1)
    except FileNotFoundError:
        return initial
    if len(raw) > _MAX_CHECKPOINT_BYTES:
        raise ObservationCheckpointError("Observation checkpoint exceeds its size limit")
    try:
        stored = _Checkpoint.model_validate_json(raw, strict=True)
        cursor = stored.cursor
    except (ValueError, TypeError, ValidationError) as exc:
        raise ObservationCheckpointError(
            "Invalid observation checkpoint; source was not replayed"
        ) from exc
    if (
        stored.connection_key != path.stem
        or cursor.namespace != initial.namespace
        or cursor.source != initial.source
    ):
        raise ObservationCheckpointError("Observation checkpoint belongs to another source")
    return cursor


def _commit_checkpoint(path: Path, cursor: ObservationCursor) -> None:
    """Replace the private checkpoint only after the complete batch was accepted."""
    payload = (
        _Checkpoint(version=1, connection_key=path.stem, cursor=cursor).model_dump_json().encode()
    )
    if len(payload) > _MAX_CHECKPOINT_BYTES:
        raise ObservationCheckpointError("Observation checkpoint exceeds its size limit")
    fd, temporary = tempfile.mkstemp(prefix=f".{path.stem}-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        if os.name != "nt":
            directory_fd = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
    finally:
        Path(temporary).unlink(missing_ok=True)


async def deliver_observation_once(
    *,
    client: httpx.AsyncClient,
    session_id: str,
    namespace: str,
    source: ObservationSource,
    transcript: Path,
    checkpoint_dir: Path,
    max_records: int = 512,
) -> ObservationDeliveryResult:
    """Deliver one bounded batch to an existing authorized Omnigent session.

    The caller owns session provisioning, capability checks and client auth.
    This function only sends external observation events; it cannot create,
    launch, resume or steer an agent. One writer owns each target checkpoint.
    """
    if not session_id or not namespace or client.base_url.scheme not in {"http", "https"}:
        raise ValueError("A session, source namespace and absolute server URL are required")
    server = str(
        client.base_url.copy_with(username=None, password=None, query=None, fragment=None)
    )
    identity = json.dumps([server.rstrip("/"), session_id, namespace, source])
    key = hashlib.sha256(identity.encode()).hexdigest()
    checkpoint_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    checkpoint_path = checkpoint_dir / f"{key}.json"
    initial = ObservationCursor(namespace, source)
    # Nonblocking: another collector must not wait with an old checkpoint.
    with FileLock(checkpoint_dir / f"{key}.lock", timeout=0, mode=0o600):
        cursor = _read_checkpoint(checkpoint_path, initial)
        batch = await asyncio.to_thread(
            read_observation_batch, transcript, cursor, max_records=max_records
        )
        for observed in batch.items:
            item = observed.item
            response = await client.post(
                f"v1/sessions/{quote(session_id, safe='')}/events",
                json={
                    "type": "external_conversation_item",
                    "data": {
                        "item_type": item.type,
                        "item_data": item.data.model_dump(mode="json", exclude_none=True),
                        "response_id": item.response_id,
                        "source_id": observed.source_id,
                    },
                },
                headers={"x-omnigent-background-session-titles": "off"},
                timeout=30.0,
            )
            response.raise_for_status()
            try:
                acknowledgement = response.json()
            except ValueError as exc:
                raise ObservationCheckpointError(
                    "Server did not acknowledge the observed item"
                ) from exc
            if (
                not isinstance(acknowledgement, dict)
                or not isinstance(acknowledgement.get("item_id"), str)
                or not acknowledgement["item_id"].strip()
            ):
                raise ObservationCheckpointError("Server did not acknowledge the observed item")
        if batch.cursor != cursor:
            # Keep lock ownership through fsync/replace, including task cancellation.
            _commit_checkpoint(checkpoint_path, batch.cursor)
        return ObservationDeliveryResult(
            batch.records, len(batch.items), batch.cursor, batch.workspace
        )
