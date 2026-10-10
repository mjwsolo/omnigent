# Visual Dynamics in the Omnigent fork

The active implementation is the `visual-dynamics-observatory` branch of the Omnigent fork. The earlier standalone viewer is a prototype; it is not the runtime for this integration.

The implementation and verification contract is [the MECE agent-management plan](agent-management-plan.md). The separate `agent-hub` app is a migration prototype, not this product’s runtime.

## Integration

The Agents sidebar entry opens `/agents`, a fleet page backed by the existing authenticated session list and update stream. It supports loaded-session search, attention/running filters, and direct links to the shared Observatory. Counts are explicitly scoped to loaded pages. The session header opens Observatory in both Chat and Terminal modes. The view reads Omnigent's existing `useChatStore` blocks and session status. Omnigent continues owning authentication, permissions, session routing, stream reconnection, and history hydration. No second stream, transcript reader, or model request is introduced.

The current integrated work provides live native task progress, saved workspace change inspection through the existing diff API/viewer, and tool/input/output inspection, search, provider-native web observations and links, exposed reasoning, pause/resume, and an action-to-file reference map. It uses the shared shadcn Radix Nova components configured in `web/components.json`: Dialog, Button, Card, Badge, Input, and Tabs. Layout and colors use existing semantic theme tokens; no standalone stylesheet or duplicate component system is imported.

## Run and inspect

Use Node 22.13 or newer, pnpm 11.15.1, and Python 3.12 or newer. Follow CONTRIBUTING.md for an isolated Omnigent development environment. Build the UI with `pnpm --filter web run build`, then open an existing session in that environment and select Observatory in the header. In a narrow window the trigger is the activity icon with the accessible name Open session observatory.

Ask the agent to read or edit a small file, select that action, and compare its arguments/result with the transcript. Open File map, select the file, pause the action view, and resume after more output arrives. Check light/dark themes and keyboard dismissal. UI entry points and remaining manual verification are recorded in `feature-map/observatory.md`.

## Validation and remaining migration

Focused tests cover stream projection, reused call IDs across agents/responses, missing versus empty results, explicit file paths, safe links/text, session isolation, selection, and pause/resume. Type checking, lint, and the production build run against the upstream web project.

This is an integrated fleet/task/file pass, not a completed product. Next: connect external passive adapters to Omnigent; link particular file revisions and checks to observations; add revision-bound review markers and lead handoffs; and validate the rendered workflow with developers and engineering leads. Do not infer a verified file write from a successful-looking tool output. The standalone prototype's local-storage labels and hashes are not automatically migrated into Omnigent sessions.
