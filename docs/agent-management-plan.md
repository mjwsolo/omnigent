# Agent management: product, implementation, and verification plan

Status: active implementation; completion unproven. This is the authoritative plan for the requested product. Last inspected baseline: branch visual-dynamics-observatory, commit 38306ea. The preceding conversational turn was a status correction, not implementation progress. This execution starts by inspecting source and retaining the full scope.

## Product contract

One agent management application in the Omnigent fork. A daily Codex/Claude developer and an engineering lead must be able to discover work, understand tasks and activity, inspect concrete file changes, respond through supported controls, and review outcomes across harnesses and machines. Existing workflows connect without a compulsory relaunch. Real shadcn components and consistent theme tokens are mandatory. The initial supported external adapters are Codex and Claude Code; other harnesses use a documented adapter contract rather than a claim of automatic universal compatibility.

The source of truth is this fork's runtime, stores, and authenticated APIs. The agent-hub and root standalone apps are migration inputs, not alternate completed products. A single documented start command and URL must lead to the integrated product. No port may silently serve the wrong app. Private hidden reasoning cannot be recovered; exposed reasoning and summaries retain source labels. File references, proposed edits, saved revisions, and verified outcomes are distinct facts.

## MECE responsibility map

Each requirement belongs to exactly one domain below. Other domains consume its contract; they do not duplicate ownership. A task describes intended work; an observation describes something emitted; a file revision describes disk state; a review describes a human decision. This separation prevents tool activity from being presented as completed work.

| ID / owner domain | Required scope | Acceptance evidence |
| --- | --- | --- |
| A. Product shell and navigation | One fork, one launch path, fleet home, session workbench, projects and connections. Stable direct links and browser navigation. Existing Chat/Terminal remain reachable. | Clean checkout launch; route tests; keyboard and narrow-screen journeys; source/URL identifies fork. |
| B. Connections and identity | Source, harness, machine, project, agent/session/subagent IDs, capability discovery, connection health. Native Omnigent plus externally launched Codex/Claude and generic adapter protocol. | Simultaneous independently launched Codex and Claude appear once; ID collision, reconnect and capability contract tests; known limits visible. |
| C. Event transport and storage | Normalize, deduplicate, order, persist and replay observations. Bound payloads, avoid full-fleet history broadcasts, survive reconnect/restart, disclose gaps. | Duplicate/out-of-order/partial records; disconnect recovery; restart replay; large session fixtures and measured payload sizes. |
| D. Fleet operations | Cross-session search, harness/project/owner filters, current status with evidence, attention queue, archive, deep-link to work. Lead can triage multiple agents without opening every transcript. | Multi-session fixture with working, blocked, disconnected, failed, completed; all filter combinations and stale status tests. |
| E. Task and plan tracking | Actual task/plan items and status transitions, parent/subtask relationships where reported, current step and completion counts; labels/owners are separate metadata. | Stream a plan and changes through pending/in-progress/completed; reload; malformed/absent plans; distinguish reported completion from verification. |
| F. Activity and reasoning | Live calls/arguments/results, command output, web searches/sources, messages, exposed reasoning; stable selection, search/filter, pause and history. | Native and managed fixtures, result correlation, partial output, missing result, safe links, reasoning unavailable; selection persists across updates. |
| G. File evidence and map | Added/modified/deleted/renamed files, before/after and line diffs, latest revision, action-to-file graph and selection. Explicitly mark incomplete attribution and unsupported workspaces. | Real file edits/deletes; diff API compared with disk; graph links to same artifact; no claimed write from a path argument; oversized/binary/deleted states. |
| H. Agent controls | Launch, send instruction, respond to approval/question, interrupt/stop/resume where supported. Existing permissions, request acknowledgements and error recovery. | Capability-matrix tests; permitted and denied actions; lost acknowledgement; controls never enabled for observe-only connections. |
| I. Review and handoff | Checks tied to revision when known, unresolved evidence gaps, review markers invalidated by change, lead handoff with provenance and scope. | Edit→test→review→edit invalidation journey; failed/unknown checks; safe export and cross-user authorization. |
| J. Design and accessibility | Shared shadcn components/tokens, readable hierarchy, restrained motion, responsive layout, accessible names, focus/keyboard, loading/empty/error/offline states. | Rendered desktop/mobile/light/dark inspection; keyboard flow; accessibility checks; no mock metrics or dead controls. |
| K. Trust and isolation | Authentication, project/session authorization, local-source consent, no accidental telemetry/raw payload export, hostile strings/path boundaries, retention and secret handling. | Cross-session/user isolation, malicious payload/path fixtures, endpoint authorization, inspect persisted/exported data. |
| L. Delivery and quality | Repeatable setup, diagnostics, docs, automated tests, runtime/visual evidence, performance budgets, migration/deprecation and upstream maintenance. | Clean startup, meaningful unit/integration/E2E suites, launch/health probe, evidence ledger and completion audit. |

## Existing evidence and gaps

- Omnigent fork is clean at baseline and contains a session-header Observatory with shadcn activity/map. Seven focused tests and an earlier build passed, but this does not prove the new requirements.
- chatStore.todos already receives native Claude session snapshots and session.todos updates. Tool/native events can carry plans from other harnesses. Scheduled tasks at /tasks are recurring automations and must not be confused with in-session work plans.
- useWorkspaceChangedFiles, useFileDiff and the existing workspace UI provide saved-change infrastructure. Read and reuse their environment/permission handling.
- useConversations and session update providers already supply fleet-level session data; build management navigation on these contracts.
- agent-hub has passive adapters and useful dashboard concepts but runs separately and is not integrated. Its in-memory history and local metadata do not meet persistence/team requirements.
- Prior browser/GUI access was denied by environment policy. Do not bypass that restriction with another browser automation path. Record visual proof as missing until permitted verification is available; continue source, API, component and runtime work meanwhile.
- Public research from ../PLAN.md is directional evidence, not participant validation. No interviews, professional design endorsements, or usability outcomes have occurred.

## Architecture and invariants

Omnigent owns identity, projects, sessions, permissions, runtime commands, stored history, runner routing, and event fan-out. Frontend reads its existing query/store contracts. An adapter maps external observations into a namespaced source/session model with explicit capabilities and source provenance. Passive adapters cannot mint control privileges. External collector transport belongs inside the authenticated server/runner architecture, not an unauthenticated second browser origin.

A session workbench exposes Overview, Tasks, Activity, Files/Map and Review. The fleet page opens that same workbench. It must not require a separate app or collector UI. Responses include bounded summary data for lists; detailed payloads load for the selected session. Session selection keys every cache, paused snapshot, diff and review record. A disconnected source has an unknown/currently-unconfirmed status rather than fabricated liveness.

Plans use stable source and response identity; snapshots replace only their own plan, not another subagent's. Tool result arrival cannot change the tool identity. A changed-file endpoint establishes workspace change, but attribution to a particular tool requires evidence. Diff revisions and checks carry provenance; without a matching revision, show unknown association.

## Implementation sequence and dependency gates

1. Establish this plan and baseline ledger. Inspect upstream reuse surfaces. Keep one active implementation path.
2. Complete session evidence in the fork: actual task progress, file list and before/after diffs, map navigation, exposed reasoning, clear session scoping. Unit/component tests before broader runtime checks.
3. Add fleet management route/navigation using Omnigent session providers. Search/filter/attention/projects and native controls route into the shared workbench. Test lead triage, authorization and navigation.
4. Integrate external source adapters into the fork's runner/server contracts. Preserve existing standalone readers only as test/migration inputs. Test independently launched Codex/Claude plus generic harness fixture, disconnect and deduplication.
5. Persist normalized event/review state and complete revision-aware review/handoff. Add restart, retention, provenance, and replay tests.
6. Consolidate launch into one command; bring up an isolated instance and validate real APIs and streamed events. Provider-cost runs need deliberate test tasks; mock fixtures remain clearly identified.
7. Run repeated product/design/engineering passes against all A–L requirements. Fix discovered issues and repeat only affected tests, then the cross-cutting release gate. Do not declare completion because a slice passes.

No phase narrows the end state. Work left in later phases remains required.

## Iteration rubric

Every iteration records: user journey, observed failure or gap, change, evidence, remaining risk. Evaluate utility (can the user decide/act?), information truth (can every label be traced?), interaction quality (selection/focus/state continuity), design consistency (shared primitives/tokens), operational reliability (errors/reconnect/restart), and implementation maintainability (reuse/localized changes). Aesthetic quality is verified by rendered inspection and user input, not self-awarded scores.

Target budgets to measure, not claim without measurements: <250 ms local selection/filter response for 200 sessions; visible live event within 2 seconds after receipt; no unbounded DOM/history growth; fleet summary under 250 KiB for 200 sessions excluding requested detail; keyboard-operable core flows; no horizontal page overflow at 390 px except intentional code/map scrollers. Adjust only with measured justification and preserve usable behavior.

## Verification matrix and completion audit

Each A–L row needs source/API evidence and relevant behavior tests; J also requires rendered evidence. Launch tests must inspect the actual fork's UI and server rather than the old port 4310/4320 prototypes. Tests with mocked stores prove rendering/projection, not full native-stream integration. API fixtures prove transport, not provider authentication. Report these scopes separately.

Final audit enumerates every named deliverable and invariant above, links its current evidence, and labels it proved, contradicted, incomplete, weak, or missing. Only all-proved requirements permit completion. Dependencies on visual access or real-user feedback stay explicit; they do not prevent independent implementation progress or justify substituting an easier product.

## Evidence ledger

| Iteration | Result | Remaining |
| --- | --- | --- |
| 4: external reader foundation | Added bounded incremental Codex/Claude transcript normalization, stable replay IDs, serializable proposed checkpoints and explicit source-rewrite failures. Details and remaining transport gates: [external observation contract](external-observation-contract.md). | No collector is enabled yet; durable connection state, authenticated transport, observation-only enforcement and UI remain required. |
| 3: consolidated launch | npm start now delegates to the fork’s existing supervisor with headless lifecycle, no browser opening and no example seeding. Actual server health, Agents HTML, sessions API and connected host confirmed; SIGTERM stopped the owned supervisor and listening ports. All 72 Rust checks passed serially (parallel port-allocation test race documented). | External adapters, rendered inspection and revision-aware reviews remain required. |
| 2: interaction review | Found and removed nonfunctional comment affordances from the inspection-only diff surface, while retaining permission-gated comments in the full workspace. All 29 affected diff/viewer tests passed. | Rendered review still required; no quality endorsement claimed. |
| 1: integrated fleet/task/file pass | Added /agents and sidebar navigation, direct Observatory links, live native task progress, workspace file list and shared Monaco diff. 159 existing/new component/navigation tests passed; two additional navigation/deep-link regressions passed; the server-process restart persistence test passed, plus lint, type check, production build and 216 feature-map contract checks. Isolated HTTP runtime confirmed fleet membership, task transitions, session isolation and external-item deduplication using scripted fixtures. | External adapters, review/revision linkage, consolidated user launch and rendered verification remain open. |
| 0: current-state inspection | Confirmed clean fork, existing Observatory, todo store, workspace/diff hooks and session providers. Plan created. | Implementation and verification for all A–L remain open; existing coverage is only a baseline. |


Runtime note: the existing authenticated `external_conversation_item` endpoint supports source-ID deduplication, and `external_session_todos` persists plans and publishes session.todos. Reuse these for external adapters rather than introducing a second event database. Runtime fixture evidence is at `/private/tmp/agent-management-runtime-evidence.json`; it proves HTTP behavior only. The isolated server at launch was `http://127.0.0.1:57137`, with a 90-minute lease and private state under `/private/tmp/verify-omnigent.LMJtGk`.

External-connection reuse: `routes/imports.py` and `ImportSessionsPanel` already import multiple harness transcripts through an authenticated host. Existing imports skip already-imported sessions; continuous tailing and ongoing updates still need implementation and proof. Do not label one-time import as a live connection.
