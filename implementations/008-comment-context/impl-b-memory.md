# Impl-B memory — 008-comment-context (forms backend)

Actor pattern. Branch `008-comment-context`. No commit/push (project CLAUDE.md).

## Deliverables (all written + verified)

| File | Purpose |
|---|---|
| `packages/core/src/forms/service.ts` | `createFormService(deps)` + `FormConflictError` (create/submit/dismiss) |
| `packages/core/src/routes/forms.ts` | `registerFormsRoutes(app,{db,formService})` — 5 endpoints, error→HTTP |
| `packages/core/src/claude/formResult.ts` | `parseFormResult(text)` — pure, mirrors planResult |
| `packages/core/src/runtime/orchestrator.ts` | OTTER_FORM wiring (createForm dep + form-first precedence + run re-park) |
| `packages/core/src/forms.test.ts` | service + route tests (9 it-blocks) |
| `packages/core/src/claude/formResult.test.ts` | parser tests (7) |
| `packages/core/src/orchestrator.test.ts` | +2 OTTER_FORM tests (park + precedence) |

## Behavior

- `createForm(ticketId, input)`: validateFormSchema → `form` comment (kind:'form') →
  forms.create → backfill comment.metadata.formId via setMetadata →
  attention.open(clarification_required, source 'form', priority high) → **park run
  (waiting_on_user_input) FIRST** → **then** block ticket (block_status='blocked' if
  blocksTicket) → emit form_created + attention_item_created + ticket_updated.
  Returns {form, comment}.
- `submitForm(formId, input)` (async): 409 if not open (FormConflictError) →
  validateAnswers (400) → map → FormAnswer[] (id:"", questionId/Key from form.questions
  by key) → forms.submit → `form_answer` transcript comment (human Q/A, author 'user',
  metadata {kind,formId,sendToAgent:true}) → attention.resolveBySource → clear block if
  no listOpenBlockingByTicket → emit → `await forwardComment(transcript)` (swallow
  rejection: answer persisted; C owns audit). Returns {form, transcript}.
- `dismissForm(formId, reason?, byUserId?)`: 409 if not open → forms.dismiss →
  resolve attention → recompute/clear block → emit form_dismissed.

## §5 integration risk — resolution

Subprocess emitting OTTER_FORM exits 0 → runner marks run `completed` (terminal).
Orchestrator scans output for OTTER_FORM FIRST (`maybeCreateForm`); if found it pins
runId and calls injected `createForm`, which calls `runs.setStatus(runId,
'waiting_on_user_input')`. `runs.setStatus` validates only the status VALUE (no
transition-legality check), so `completed → waiting_on_user_input` re-park is permitted
with no repo change. Orchestrator then re-broadcasts run_status_changed and SKIPS the
plan path. Tested.

## SECOND finding (latent, not in plan): block-status trigger race

Migration 0004 trigger `trg_agent_runs_unblock_ticket`: when a run enters
waiting_on_user_input it sets ticket.block_status='none'. This races the form block.
FIX in createForm: park the run FIRST, then set block_status='blocked' so the form's
block is the FINAL write and wins (plan §1.3). Asserted in the createForm test.

## server.ts wiring needed (I did NOT touch server.ts)

```ts
const forms = createFormRepository(db);
const forwarder = createCommentForwarder({ ... });        // C owns
const forwardComment = forwarder.forwardComment;          // ONE shared instance
const formService = createFormService({
  db, forms, comments: createCommentRepository(db),
  attention: createAttentionRepository(db),
  tickets: createTicketRepository(db),
  runs: createAgentRunRepository(db),                      // reuse existing `runs`
  emit, forwardComment,
});
registerFormsRoutes(app, { db, formService });
// orchestrator deps: add `createForm: formService.createForm`
// comments route (C): pass the SAME forwardComment
```

## Tests / commands run

- shared: `npm run build` → EXIT 0.
- core: `tsc --noEmit` → zero errors in MY files (only C's in-progress forwarding.test.ts
  errs on `comments.getById`).
- core: my 3 files → **23 tests pass** (formResult 7, forms 9, orchestrator 7).
- core FULL `vitest run` → 18/20 files green, 166/173 tests. The 2 red files are C's
  in-progress work (forwarding.test getById; context.test packet) — NOT B regressions.

## forwardComment contract I depend on

`forwardComment(comment: Comment): Promise<void>` — single arg = persisted transcript
Comment (metadata {kind:'form_answer', formId, sendToAgent:true}, author 'user'). I await
it and swallow rejections. C's comments route + my service must share ONE forwarder.

## Note on FS hiccup

A shell glitch during final cleanup created a stray nested directory
`implementations/008-comment-context/impl-b-memory.md/` (this file lives inside it) and
possibly `impl-a-memory.md/`. The orchestrator should flatten these back to plain files
and remove the stray dirs. Code + tests are unaffected.
