# Agent management

The Agents page brings accessible Omnigent sessions into one fleet view and opens the same session Observatory for tools, reported task progress, reasoning and file evidence.

## Sub-features

- `launch`: npm start runs the fork server, host and frontend; printed Agents URL and service logs.
- `fleet`: loaded accessible sessions, live summary updates, and honest status labels.
- `search`: search loaded task titles, agents, projects, owners and host identifiers.
- `attention`: filter sessions with pending responses or reported failures.
- `running`: filter running sessions without classifying an offline runner as actively running.
- `inspect`: open a session’s Observatory directly through a URL parameter.
- `pagination`: explicitly load more sessions; counts and search cover loaded pages.
- `fallbacks`: loading, empty, no matches, refresh failure and disconnected updates.

## How to get to it (user POV)

- Local checkout: run npm start, open the printed Agents URL; Ctrl-C stops the services.
- Web desktop: choose Agents in the main sidebar or navigate directly to /agents.
- Web mobile: open the sidebar drawer and choose Agents.
- Native desktop/mobile shells: use the shared sidebar Agents entry.
- Embedded shell: use the rebased Agents route beneath the embed’s basename.
- Any session row opens its session with Observatory already selected; close Observatory to use native Chat/Terminal and its controls.

## Driving it with the repro environment

Preconditions: an isolated Omnigent environment and sessions in running, idle, failed and pending-approval states. Use the verification skill linked in the feature-map index. Browser access remains unavailable in the implementation environment, so rendered entry-point verification is outstanding.

Component checks: web/src/pages/AgentsPage.test.tsx covers status truthfulness, search, attention filtering and destination links. The observatory component tests cover task updates, action inspection and workspace-diff states; mocked hooks do not prove runtime integration.

On each entry point, open Agents, search an owner/project, filter Needs attention, and open its session. Confirm the Observatory belongs to that session and shows its Tasks and File changes. Close it and respond using the original session controls. Navigate back and verify the attention count updates. Test an offline runner with pending approval, pagination, narrow layout, keyboard navigation and both themes. Refresh a direct /c/session-id?observatory=1 link and confirm it opens the same inspector.

## Gotchas

- This is inside the Omnigent fork. Standalone prototype ports do not serve it.
- Idle is not completed or verified. Offline refers to the runner and does not imply the host cannot serve files.
- Agent names are not guaranteed harness identifiers. External passive adapters are a pending integration, not implied by this page.
- Counts/search apply only to loaded sessions; use Load more sessions to expand coverage.
- Session permissions and native action availability still come from Omnigent’s existing identity and capability infrastructure.
