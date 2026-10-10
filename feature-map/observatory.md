# Session observatory

The observatory lets a developer or reviewer inspect the active Omnigent session's tool calls, results, exposed reasoning, reported task progress, saved workspace changes, and explicit file references without changing the agent's execution or opening a second collector.

## Sub-features

- `open`: the session header opens a shadcn dialog; closing returns focus to its trigger.
- `activity`: search loaded observations and filter tools, web activity, and reported reasoning.
- `inspect`: select an action to read its input, available output, and observed web links.
- `tasks`: live plan status from the session todo stream, with reported completion counts and an explicit absent-plan state.
- `changes`: saved workspace changes and the shared before/after diff viewer, with offline, unavailable, loading, and error states.
- `file-map`: inspect explicit action-to-file references; no dependency or write-success inference.
- `pause`: freeze the action view while the shared session stream continues, then resume.
- `scope`: show a loading state rather than another session's data during navigation.
- `empty`: explain missing observations and unavailable result payloads.

## How to get to it (user POV)

- Fleet page: open Agents in the sidebar, then choose a session to open its Observatory directly.
- Web desktop: open an existing conversation and choose Observatory in its header.
- Web mobile: open an existing conversation and use the activity icon labeled Open session observatory.
- Native desktop/mobile shells using the shared conversation header: use the same header action.
- Terminal-first sessions: the header action remains available in both Chat and Terminal mode.
- A new session with no conversation ID does not offer the action.

## Driving it with the repro environment

Preconditions: build this checkout; use an isolated environment from the verification skill. Create a session whose mock tool arguments contain a file path and whose result can be delayed. Browser automation was unavailable in the implementation session, so these UI entry points remain manually unverified.

Component checks: `pnpm --filter web test src/components/observatory`. They cover streamed result updates, pause/resume, explicit file selection, HTML escaping, identity matching, and session isolation.

For each header entry point, open Observatory, select the delayed tool, and confirm that No result observed appears. Complete the tool and confirm the selected result updates without another call row. Pause, emit another update, and verify that the display stays frozen until Resume view. Open File map and select the referenced file to inspect its action. Switch sessions and verify that prior session content does not leak. Open Tasks and publish an updated plan: completion counts and current step must update. Open File changes, choose an edited file, and compare both sides with the workspace; publish another saved edit and verify the diff refreshes. Test creation/deletion, no plan, unavailable workspace and offline host. Check narrow layouts, keyboard tab order, Escape dismissal, and both themes.

## Gotchas

- This reads Omnigent's shared hydrated/live block store, not local transcript files or the standalone Visual Dynamics server.
- File paths are explicit tool arguments or patch headers. They do not prove a saved revision or a dependency relationship.
- Tool result presence is not a successful test or a correctness guarantee.
- Only currently loaded history is projected. The activity list shows at most 100 matches and the map uses the latest 12 file-related actions and up to 12 files.
- Reasoning availability depends on what the harness exposes in the transcript. The view does not recover private reasoning.
- Pausing freezes actions only; task plans, workspace changes, current session status and blocking information remain live.
