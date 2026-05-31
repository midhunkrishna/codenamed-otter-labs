# Impl-C memory — 008-comment-context (MIN-26 forwarding + context)

## Files read / written

| File | R/W | Note |
|---|---|---|
| `plans/008-comment-context.md` | R | scope §1.1/§1.2/§1.7/§2.4/§2.5/§2.6 |
| `channels/008-comment-context-channel.log` | R/W | read A+B contracts; posted forwarder sig + server wiring |
| `packages/core/src/claude/runner.ts` | R | `resumeRun({runId,projectRoot,claudeSessionId,promptMarkdown})`; session persisted as `note{kind:'claude_session',claudeSessionId}` |
| `packages/shared/src/runs.ts` | R | `RUN_STATUSES`, `TERMINAL_RUN_STATUSES`, `AgentRun`, `AgentRunEvent`, `RunStatus`, `RunEventKind` |
| `packages/shared/src/domain.ts` | R | `Comment`, `AgentDeliveryStatus`, `CommentKind` (metadata-based) |
| `packages/shared/src/forms.ts` | R | `Form`, `FormQuestion`, `FormAnswer`, `FORM_MARKER_START/END`, field types |
| `packages/persistence/src/repositories/comments.ts` | R | repo has `create/listByTicket/getById/setMetadata` (NOTE: `getById`, not `get`) |
| `packages/persistence/src/repositories/forms.ts` | R | `listByTicket(ticketId): Form[]` hydrated (questions sortOrder ASC, answers createdAt ASC); returns `[]` when none |
| `packages/core/src/forwarding/forwarder.ts` | **W** | `createCommentForwarder(deps)` |
| `packages/core/src/routes/comments.ts` | **W** | added optional `sendToAgent` + injected `forwardComment` |
| `packages/core/src/routes/index.ts` | **W** | thread optional `forwardComment` through `registerTicketCoreRoutes` |
| `packages/core/src/context/packet.ts` | **W** | `## Clarification Forms` from form tables; removed legacy `meta.kind==='form'` Q&A reader; `fenceUntrusted` exported |
| `packages/core/src/context/templates.ts` | **W** | `FORM_OUTPUT_CONTRACT` + ask-don't-assume policy in `PLANNING_INSTRUCTIONS` |
| `packages/core/src/forwarding.test.ts` | **W** | 7 tests (4 §1.1 branches + failed-resume + incremental packet + prefers-waiting) |
| `packages/core/src/context.forms.test.ts` | **W** | 7 tests (Clarification Forms section + planning template) |
| `packages/core/src/context.test.ts` | **W** | updated 2 legacy tests (removed `## Form answers` expectation) |
| `README.md` | **W** | added project README (user request mid-task) |

## Summary
- `createCommentForwarder(deps)` returns `{ forwardComment, findResumableRun, readSessionId, buildIncrementalCommentPacket }`. Fully DI'd (runs/events/comments repos + `resumeRun` + projectRoot + emit) — unit-tested with a fake `resumeRun` over real SQLite, no server.ts.
- §1.1 rule implemented exactly: waiting+sessionId → audit note (persist-first) → status→running (persist+broadcast) → `resumeRun(packet)` → mark delivered; running/queued → pending (no 2nd process); no resumable run → skipped_no_active_run; `sendToAgent===false` → not_applicable. Failed resume records a `log` error event, re-parks the run to `waiting_on_user_input`, and leaves the comment `pending` (never lost).
- `sendToAgent` default (§1.2): explicit boolean wins; else true iff a resumable run exists.
- Incremental packet: pending+targeted comments (oldest-first), each body `fenceUntrusted`, under a "New comments added since the run started" header.
- Context `## Clarification Forms`: built from `createFormRepository(db).listByTicket()` (reversed → oldest-first), per-form status line + per-question `key (required) [type]` + fenced Q + fenced A (or `_(unanswered)_`). Byte-deterministic. Legacy `meta.kind==='form'` {question,answer} reader removed.
- Templates: `FORM_OUTPUT_CONTRACT` (markers from shared, 5 field types, OAuth example) appended to planning; ask-don't-assume + EITHER-PLAN-OR-FORM mutual exclusion added to `PLANNING_INSTRUCTIONS`.

## Tests (final)
`npx vitest run packages/core/src/{context,context.forms,forwarding,routes}.test.ts` → **35 passed (4 files)**:
forwarding.test.ts 8/8, context.forms.test.ts 6/6, context.test.ts 10/10 (2 legacy tests updated), routes.test.ts 11/11.
Full `@otter/core` suite: **all passing** (B's forms.test.ts was fixed by B in the meantime — 0 failing files).
`tsc -p packages/core/tsconfig.json --noEmit` → clean.

## Real bug found+fixed during TDD
The incremental packet filter requires `metadata.sendToAgent` truthy, but `setDelivery` only wrote
`agentDeliveryStatus`+`targetRunId`. A user comment with no explicit flag (default-true via a waiting run)
got `pending` but no `sendToAgent`, so it was dropped from the resume packet. Fix: `setDelivery` now also
persists `sendToAgent: true` for the `pending`/`delivered` states.

## Gist / open items
- **B**: matched `forwardComment(comment: Comment): Promise<void>`; transcript comment must carry `metadata.sendToAgent:true` so it delivers (the parked run resumes). Posted full `createCommentForwarder` dep shape to channel.
- **server.ts wiring (orchestrator)**: build ONE `createCommentForwarder({ runs: createAgentRunRepository(db), events: createAgentRunEventRepository(db), comments: createCommentRepository(db), projectRoot: paths.root, resumeRun: runner.resumeRun, emit })`; pass `forwarder.forwardComment` to BOTH `registerTicketCoreRoutes(app, db, emit, forwardComment)` AND B's `createFormService`.
- B's `forms/service.ts` needs `CreateFormInput` + `FormAnswer` added to its `@otter/shared` import (its own tsc/test fix — not mine).
