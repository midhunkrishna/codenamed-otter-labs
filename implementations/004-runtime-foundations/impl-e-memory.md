# Impl-E memory — MIN-32 Agent Runs console (Wave 3)

## Files read / written

| File | R/W | Note |
|---|---|---|
| plans/004-runtime-foundations.md | R | §3g, Wave-3 Impl-E scope, §5-E tests |
| channels/004-runtime-foundations-channel.log | R/W | consumed C's routes + B's client contracts; announced scope + READY |
| .claude/agent-patterns/actor.agent | R | Actor 2 conventions |
| packages/web/src/api/client.ts | R | reused `request`; mirror style |
| packages/web/src/ws/events.ts | R | `connectEvents`/`CHANNELS`/`EventEnvelope` (Impl-B) |
| packages/web/src/ws/client.ts, events.test.ts | R | FakeWebSocket driver pattern |
| packages/web/src/components/Board.tsx, TicketDetail.tsx, status.ts, Board.test.tsx | R | component + fetch-mock patterns |
| packages/web/src/ui/* (Drawer, CodeBlock, Pill, Badge, Tabs, MetadataRow, PageHeader, SectionHeader, EmptyState, Button, types.ts, index.ts) | R | primitive prop shapes |
| packages/web/src/design/tokens.ts, contract.css.ts, no-raw-colors.test.ts | R | tone selectors + colour invariant |
| packages/web/src/app/App.css.ts | R | shared `pageBody` + token usage |
| packages/web/src/App.tsx | R/W | wired `runs` nav -> RunsConsole |
| packages/web/src/api/runs.ts | W | REST mirror + run/project/claude types |
| packages/web/src/components/runStatus.ts | W | run status/type/event labels + tone selectors + group order |
| packages/web/src/components/RunsConsole.css.ts | W | vanilla-extract styles (contract vars only) |
| packages/web/src/components/RunsConsole.tsx | W | list grouped by status + Drawer + shared events client |
| packages/web/src/components/RunDetail.tsx | W | recovery + live output + timeline + cancel + waiting banners |
| packages/web/src/components/RunsConsole.test.tsx | W | 10 tests |

## Summary

- `api/runs.ts`: `listRuns/getRun/getRunEvents/createRun/cancelRun/getClaudeStatus/getProject`
  built on `client.request`. Local mirror types `AgentRun`, `AgentRunEvent`, `RunStatus`,
  `RunType`, `Project`, `ClaudeStatus` + helpers `isTerminalRun`/`isWaitingRun`/`TERMINAL_RUN_STATUSES`.
- `RunsConsole`: HTTP-load runs (newest-first), group by status (running/waiting on top via
  `RUN_STATUS_ORDER`), drop empty groups, render each as a clickable row, open detail in the
  `Drawer` primitive. Owns ONE shared `connectEvents()` client; subscribes `project` channel and
  refetches the authoritative list on `run_created` / `run_status_changed`. EmptyState when no runs.
- `RunDetail`: recovery-first — `Promise.all([getRun, getRunEvents])` hydrates run + full event
  history, THEN subscribes `run:<id>`. Appends live `run_output_delta` (deduped by seq) and applies
  `run_status_changed` (+ refetch). Output rendered from concatenated `output_delta.payload.text`
  via `CodeBlock` (raw). Timeline = all events in order. Cancel button (danger) disabled for terminal
  runs; on 409 surfaces backend `{error}` in a role=alert. Waiting banner (role=status,
  data-waiting=<status>) for waiting_on_permission / waiting_on_user_input. UI owns scroll (auto-
  scrolls output to bottom); the events client only delivers data.
- `App.tsx`: `runs` nav branch now renders `<RunsConsole/>` (other branches untouched).

## Gist / learnings

- Web stays node-free: mirror run types locally, never import `@otter/shared`.
- no-raw-colors test only scans `ui/`, but I kept `components/RunsConsole.css.ts` token-only anyway;
  run statuses reuse existing `status.*` tone selectors (no new design tokens).
- Live recovery contract: persist-before-broadcast means refetching on a lifecycle envelope is the
  correct, simplest path; output deltas dedupe by `seq` so a late HTTP history + early live delta
  never double-count.
- A single shared `connectEvents()` socket for console + detail avoids multiple sockets; closed on
  console unmount.
- Verified: `tsc -p packages/web` = 0; `vitest run packages/web` = 130 passed (120 prior + 10 new);
  `vite build` clean.
