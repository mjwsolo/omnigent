# External observation contract

External agents remain owned by the terminal or harness that launched them. A passive connection reads their emitted records and sends normalized evidence to Omnigent. Connecting must not launch, resume, interrupt or approve a provider session.

## Implemented reader

`omnigent.session_import.observation.read_observation_batch` reads Codex rollout or Claude parent-session JSONL incrementally. It reuses the existing transcript normalizers and emits Omnigent item types. Codex web observations retain the reported action; search results are not invented. Codex reasoning includes supplied summary blocks only; analysis-channel messages, raw reasoning and encrypted content are excluded. Claude uses the existing native transcript interpretation, including explicitly emitted thinking blocks.

Each connection chooses a stable namespace containing collector machine identity, harness and external session ID. Each emitted item has a SHA-256 source ID derived from that namespace, harness, record byte offset, record digest and item index. Identical repeated records at different positions remain separate events. Retries of the same record retain the same ID.

The returned cursor is a proposed checkpoint, not an acknowledgement. A collector must send all batch items, wait for successful server acknowledgements, then persist the cursor atomically. If it crashes between server acknowledgement and checkpoint persistence, it replays the same IDs and relies on server deduplication. It must never advance the checkpoint on a timeout or failed event. This reader does not itself persist checkpoints or send requests.

A poll processes at most 512 records and 4 MiB by default. Incomplete newline or UTF-8 records stay behind the checkpoint. A malformed complete record, oversized record, replacement inode, truncation, or changed checkpoint anchor produces an explicit source error. Recovery requires reconciling the source; it must not silently reset to zero and claim continuity. The anchor checks the last 256 consumed bytes, not the entire previously consumed file. Parent readers exclude Claude sidechains; child sessions need their own identities and readers.

## Implemented delivery

`observation_delivery.deliver_observation_once` sends a bounded batch through an authenticated HTTP client to an existing Omnigent session. It disables model-generated background titles, posts only `external_conversation_item` events, requires a nonempty server item ID for each acknowledgement, and does not create or launch a session. The caller must supply the correct authorized session and client; automatic discovery and provisioning are not enabled yet.

Each server/session/source target has a versioned checkpoint bound to that exact connection key. A nonblocking file lock prevents concurrent collectors from reading the same checkpoint. Checkpoints use private files, atomic replacement and fsync; credentials and transcript bodies are not stored in them. Failed, ambiguous or malformed acknowledgements leave the checkpoint unchanged. A retry resends the same IDs so Omnigent's existing store deduplicates records already accepted. Corrupt, mismatched or unknown-version checkpoints fail rather than silently replaying. Transcript parsing runs outside the asynchronous event loop. The small checkpoint write stays synchronous while the lock is held, so cancellation cannot release ownership before replacement finishes.

The real session-API integration test deliberately loses an acknowledgement after the server commits. Retrying leaves exactly two ordered messages, with no runner bound. This proves acknowledged item delivery and replay, not source provisioning, passive capability enforcement or the user-facing Connections workflow.

## Required transport and controls

The existing authenticated `external_conversation_item` event accepts `item_type`, `item_data`, `response_id` and `source_id` and provides retry deduplication. `external_session_todos` persists reported task snapshots. Reuse those paths rather than a separate event database. Do not use force-import to synchronize: it replaces the conversation.

Before enabling the collector, implement all of these together:

1. Server-side connection identity and explicit source health, with owned-host discovery and scheduling. Local cursor storage and delivery locks are implemented; they are not a connection registry.
2. Idempotent observed-session creation scoped to the authenticated owner, machine and harness. Do not overload the raw native session ID with a collector namespace; native resume semantics use that field.
3. An observation-only marker enforced at every server path that can start, bind, resume, steer, change permissions, or otherwise control the external session. UI controls must derive from the same capability contract. Passive connection is not an editable imported native session.
4. Bounded discovery and polling through the existing owned host, with restart recovery, backoff, explicit disconnect and no live status inferred from old files.
5. Tasks from supplied plan events, source freshness, and child relationships. A tool call or reported completion is not a verified saved revision or passing check.
6. Connections UI in the existing shadcn app, truthful fleet source/status labels, and the same session workbench. One-time imports remain labelled imports.
7. A generic normalized adapter accepting the same identity, event and capability semantics, with authorization and payload-size limits.

## Verification

`tests/test_session_observation.py` covers incomplete UTF-8 writes, replay after cursor serialization, distinct repeated events, cross-machine namespaces, bounded batches, turn continuity, Claude tool/result pairing, Codex reasoning filtering, web observations, and source rewrite failures. These are reader tests, not proof of a running collector or a visible UI connection. `tests/test_observation_delivery.py` additionally covers acknowledgement loss, authorization rejection, target isolation, private checkpoint files, competing collectors and corrupted state. `tests/server/integration/test_observation_delivery.py` exercises the real session API. Server-side authorization across users, observation-only enforcement, connection provisioning and end-to-end latency still require tests when wired.
