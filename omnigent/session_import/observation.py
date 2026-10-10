"""Bounded, replayable reads for passive Claude and Codex transcript collectors."""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass, replace
from pathlib import Path
from typing import BinaryIO, Literal, cast

from omnigent.entities import NewConversationItem, parse_item_data
from omnigent.harnesses.claude_native.bridge import _transcript_items_from_entry
from omnigent.session_import.local import _claude_import_item_data, _codex_response_item
from omnigent.util.json_types import JsonObject

ObservationSource = Literal["claude", "codex"]


class ObservationReadError(ValueError):
    """The collector must report this source error without advancing its checkpoint."""


@dataclass(frozen=True)
class ObservationCursor:
    """Serializable checkpoint; commit only after every batch event is acknowledged."""

    namespace: str
    source: ObservationSource
    offset: int = 0
    line: int = 0
    response_id: str | None = None
    device: int | None = None
    inode: int | None = None
    anchor: str | None = None


@dataclass(frozen=True)
class ObservedItem:
    source_id: str
    item: NewConversationItem


@dataclass(frozen=True)
class ObservationBatch:
    items: tuple[ObservedItem, ...]
    cursor: ObservationCursor
    records: int
    workspace: str | None


def _anchor(handle: BinaryIO, offset: int) -> str:
    handle.seek(max(0, offset - 256))
    return hashlib.sha256(handle.read(min(offset, 256))).hexdigest()


def _codex_items(
    entry: dict[str, object], response_id: str | None
) -> tuple[str | None, list[NewConversationItem], str | None]:
    payload = entry.get("payload")
    if not isinstance(payload, dict):
        return response_id, [], None
    if entry.get("type") == "session_meta":
        cwd = payload.get("cwd")
        return response_id, [], cwd if isinstance(cwd, str) else None
    if entry.get("type") == "turn_context":
        turn_id = payload.get("turn_id")
        return (turn_id if isinstance(turn_id, str) else response_id), [], None
    if entry.get("type") != "response_item" or payload.get("channel") == "analysis":
        return response_id, [], None
    turn = f"codex:{response_id or 'history'}"[:64]
    if payload.get("type") == "web_search_call":
        return (
            response_id,
            [
                NewConversationItem(
                    type="native_tool",
                    response_id=turn,
                    data=parse_item_data(
                        "native_tool",
                        {
                            "item": {
                                key: payload[key]
                                for key in ("type", "id", "status", "action")
                                if key in payload
                            }
                        },
                    ),
                )
            ],
            None,
        )
    if payload.get("type") == "reasoning":
        raw_summary = payload.get("summary")
        summary = (
            [
                {"type": "summary_text", "text": block["text"]}
                for block in raw_summary
                if isinstance(block, dict)
                and block.get("type") == "summary_text"
                and isinstance(block.get("text"), str)
            ]
            if isinstance(raw_summary, list)
            else []
        )
        items = (
            [
                NewConversationItem(
                    type="reasoning",
                    response_id=turn,
                    data=parse_item_data(
                        "reasoning", {"agent": "codex-native-ui", "summary": summary}
                    ),
                )
            ]
            if summary
            else []
        )
        return response_id, items, None
    item = _codex_response_item(payload, response_id=turn)
    return response_id, [item] if item is not None else [], None


def read_observation_batch(
    path: Path,
    cursor: ObservationCursor,
    *,
    max_records: int = 512,
    max_bytes: int = 4 * 1024 * 1024,
    max_record_bytes: int = 4 * 1024 * 1024,
) -> ObservationBatch:
    """Read complete records without writing the source or committing a cursor.

    Namespace must identify the collector machine, harness and external session.
    Retrying with the same cursor produces the same source IDs. Replaced, truncated
    or overwritten files fail explicitly rather than silently replaying new data.
    """
    if not cursor.namespace or cursor.source not in {"claude", "codex"}:
        raise ValueError("An observation namespace and supported source are required")
    if (
        cursor.offset < 0
        or cursor.line < 0
        or max_records < 1
        or not 0 < max_record_bytes <= max_bytes
    ):
        raise ValueError("Invalid observation cursor or batch limits")
    items: list[ObservedItem] = []
    workspace: str | None = None
    current = cursor
    records = 0
    with path.open("rb") as handle:
        stat = os.fstat(handle.fileno())
        if cursor.device is not None and (cursor.device, cursor.inode) != (
            stat.st_dev,
            stat.st_ino,
        ):
            raise ObservationReadError("Transcript was replaced; reconnect this source explicitly")
        if stat.st_size < cursor.offset or (
            cursor.anchor is not None and cursor.anchor != _anchor(handle, cursor.offset)
        ):
            raise ObservationReadError(
                "Transcript was truncated or rewritten; checkpoint not advanced"
            )
        handle.seek(cursor.offset)
        while records < max_records:
            offset = handle.tell()
            remaining = max_bytes - (offset - cursor.offset)
            if remaining <= 0:
                break
            raw = handle.readline(min(max_record_bytes, remaining) + 1)
            if len(raw) > max_record_bytes:
                raise ObservationReadError("Transcript record exceeds the configured size limit")
            if len(raw) > remaining or not raw.endswith(b"\n"):
                handle.seek(offset)
                break
            try:
                entry = json.loads(raw)
            except (ValueError, UnicodeDecodeError) as exc:
                raise ObservationReadError(f"Invalid transcript record at byte {offset}") from exc
            if not isinstance(entry, dict):
                raise ObservationReadError(f"Expected a transcript object at byte {offset}")
            response_id = current.response_id
            parsed: list[NewConversationItem]
            if cursor.source == "codex":
                response_id, parsed, observed_workspace = _codex_items(entry, response_id)
            else:
                previous_response_id = response_id
                response_id, claude_items = _transcript_items_from_entry(
                    cast(JsonObject, entry),
                    line_number=current.line + 1,
                    record_offset=offset,
                    agent_name="claude-native-ui",
                    current_response_id=response_id,
                )
                if any(item.agent_message_candidate for item in claude_items):
                    response_id = previous_response_id
                parsed = [
                    NewConversationItem(
                        type=item.item_type,
                        response_id=item.response_id,
                        data=parse_item_data(item.item_type, _claude_import_item_data(item)),
                    )
                    for item in claude_items
                    if not item.is_compact_noop
                ]
                cwd = entry.get("cwd")
                observed_workspace = cwd if isinstance(cwd, str) else None
            workspace = observed_workspace or workspace
            record_digest = hashlib.sha256(raw).hexdigest()
            for index, item in enumerate(parsed):
                identity = json.dumps(
                    [cursor.namespace, cursor.source, offset, record_digest, index]
                )
                items.append(
                    ObservedItem("obs:" + hashlib.sha256(identity.encode()).hexdigest(), item)
                )
            records += 1
            current = replace(
                current, offset=handle.tell(), line=current.line + 1, response_id=response_id
            )
        current = replace(
            current, device=stat.st_dev, inode=stat.st_ino, anchor=_anchor(handle, current.offset)
        )
    return ObservationBatch(tuple(items), current, records, workspace)
