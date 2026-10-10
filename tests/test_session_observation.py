"""Passive collectors can retry without losing or duplicating transcript records."""

from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path

import pytest

from omnigent.session_import.observation import (
    ObservationCursor,
    ObservationReadError,
    read_observation_batch,
)


def write_records(path: Path, *records: object) -> None:
    with path.open("ab") as handle:
        for record in records:
            handle.write((json.dumps(record, ensure_ascii=False) + "\n").encode())


def codex_message(text: str) -> dict[str, object]:
    return {
        "type": "response_item",
        "payload": {
            "type": "message",
            "role": "assistant",
            "content": [{"type": "output_text", "text": text}],
        },
    }


def test_partial_utf8_record_waits_and_retry_ids_survive_cursor_serialization(
    tmp_path: Path,
) -> None:
    path = tmp_path / "rollout.jsonl"
    raw = (json.dumps(codex_message("Built 🚀"), ensure_ascii=False) + "\n").encode()
    split = raw.index("🚀".encode()) + 1
    path.write_bytes(raw[:split])
    start = ObservationCursor("machine/codex/session", "codex")
    partial = read_observation_batch(path, start)
    assert partial.cursor.offset == 0
    assert not partial.items
    with path.open("ab") as handle:
        handle.write(raw[split:])
    first = read_observation_batch(path, partial.cursor)
    retry = read_observation_batch(path, ObservationCursor(**asdict(partial.cursor)))
    assert first == retry
    assert first.records == 1
    assert first.items[0].item.data.model_dump()["content"][0]["text"] == "Built 🚀"
    assert not read_observation_batch(path, first.cursor).items


def test_bounded_batches_preserve_turn_and_tool_result_identity(tmp_path: Path) -> None:
    path = tmp_path / "rollout.jsonl"
    write_records(
        path,
        {"type": "session_meta", "payload": {"cwd": "/work/project"}},
        {"type": "turn_context", "payload": {"turn_id": "turn-one"}},
        {
            "type": "response_item",
            "payload": {
                "type": "function_call",
                "name": "read_file",
                "arguments": '{"path":"src/main.py"}',
                "call_id": "call-one",
            },
        },
        {
            "type": "response_item",
            "payload": {
                "type": "function_call_output",
                "call_id": "call-one",
                "output": "file content",
            },
        },
    )
    cursor = ObservationCursor("machine/codex/session", "codex")
    first = read_observation_batch(path, cursor, max_records=2)
    assert first.records == 2 and first.workspace == "/work/project"
    second = read_observation_batch(path, first.cursor, max_records=1)
    third = read_observation_batch(path, second.cursor)
    assert [item.item.type for item in (*second.items, *third.items)] == [
        "function_call",
        "function_call_output",
    ]
    assert second.items[0].item.response_id == third.items[0].item.response_id == "codex:turn-one"
    assert second.items[0].source_id != third.items[0].source_id


def test_codex_only_emits_supplied_reasoning_summary(tmp_path: Path) -> None:
    path = tmp_path / "rollout.jsonl"
    private = codex_message("not a visible assistant message")
    payload = private["payload"]
    assert isinstance(payload, dict)
    payload["channel"] = "analysis"
    write_records(
        path,
        private,
        {
            "type": "response_item",
            "payload": {
                "type": "reasoning",
                "summary": [{"type": "summary_text", "text": "Checking tests"}],
                "content": [{"text": "private content"}],
                "encrypted_content": "opaque",
            },
        },
    )
    result = read_observation_batch(path, ObservationCursor("a", "codex"))
    assert len(result.items) == 1
    data = result.items[0].item.data.model_dump()
    assert data["summary"] == [{"type": "summary_text", "text": "Checking tests"}]
    assert data["content"] is None and data["encrypted_content"] is None


def test_identical_messages_remain_distinct_and_machine_namespaces_do_not_collide(
    tmp_path: Path,
) -> None:
    path = tmp_path / "rollout.jsonl"
    write_records(path, codex_message("same"), codex_message("same"))
    a = read_observation_batch(path, ObservationCursor("machine-a/codex/session", "codex"))
    b = read_observation_batch(path, ObservationCursor("machine-b/codex/session", "codex"))
    assert len({i.source_id for i in (*a.items, *b.items)}) == 4


@pytest.mark.parametrize("change", ["truncate", "rewrite", "replace"])
def test_changed_source_fails_instead_of_silently_replaying(tmp_path: Path, change: str) -> None:
    path = tmp_path / "rollout.jsonl"
    write_records(path, codex_message("first"))
    cursor = read_observation_batch(path, ObservationCursor("a", "codex")).cursor
    if change == "truncate":
        path.write_bytes(b"")
    elif change == "replace":
        replacement = tmp_path / "replacement.jsonl"
        write_records(replacement, codex_message("second"))
        replacement.replace(path)
    else:
        path.write_bytes(path.read_bytes().replace(b"first", b"other"))
    with pytest.raises(ObservationReadError):
        read_observation_batch(path, cursor)


def test_malformed_and_oversized_records_fail_without_checkpoint(tmp_path: Path) -> None:
    path = tmp_path / "rollout.jsonl"
    cursor = ObservationCursor("a", "codex")
    path.write_bytes(b'{"partial":\n')
    with pytest.raises(ObservationReadError, match="Invalid transcript"):
        read_observation_batch(path, cursor)
    path.write_bytes(b"x" * 101)
    with pytest.raises(ObservationReadError, match="size limit"):
        read_observation_batch(path, cursor, max_record_bytes=100)
    assert cursor.offset == 0


def test_byte_budget_does_not_drop_next_record(tmp_path: Path) -> None:
    path = tmp_path / "rollout.jsonl"
    write_records(path, codex_message("first"), codex_message("second"))
    budget = len(path.read_bytes().splitlines(keepends=True)[0]) + 10
    first = read_observation_batch(
        path, ObservationCursor("a", "codex"), max_bytes=budget, max_record_bytes=budget
    )
    second = read_observation_batch(path, first.cursor, max_bytes=budget, max_record_bytes=budget)
    assert first.records == second.records == 1
    assert len(first.items) == len(second.items) == 1


def test_claude_native_tools_and_results_survive_separate_polls(tmp_path: Path) -> None:
    path = tmp_path / "session.jsonl"
    write_records(
        path,
        {
            "type": "assistant",
            "uuid": "assistant-one",
            "cwd": "/work",
            "message": {
                "role": "assistant",
                "content": [
                    {
                        "type": "tool_use",
                        "id": "tool-one",
                        "name": "Edit",
                        "input": {"file_path": "a.py", "old_string": "a", "new_string": "b"},
                    }
                ],
            },
        },
    )
    first = read_observation_batch(path, ObservationCursor("machine/claude/session", "claude"))
    assert first.items[0].item.type == "function_call"
    write_records(
        path,
        {
            "type": "user",
            "uuid": "result-one",
            "message": {
                "role": "user",
                "content": [
                    {"type": "tool_result", "tool_use_id": "tool-one", "content": "saved"}
                ],
            },
        },
    )
    second = read_observation_batch(path, first.cursor)
    assert second.items[0].item.type == "function_call_output"
    assert second.items[0].item.response_id == first.items[0].item.response_id
    assert first.workspace == "/work"


def test_native_web_observation_is_not_invented_search_results(tmp_path: Path) -> None:
    path = tmp_path / "rollout.jsonl"
    write_records(
        path,
        {
            "type": "response_item",
            "payload": {
                "type": "web_search_call",
                "id": "search-one",
                "status": "completed",
                "action": {"type": "search", "query": "Python docs"},
            },
        },
    )
    batch = read_observation_batch(path, ObservationCursor("a", "codex"))
    assert batch.items[0].item.type == "native_tool"
    data = batch.items[0].item.data.model_dump()["item"]
    assert data["action"]["query"] == "Python docs"
    assert "output" not in data
