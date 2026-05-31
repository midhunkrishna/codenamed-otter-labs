# Plan 008 — Comment Context (MIN-26 / MIN-27) — Context Rollup

> **Status:** ✅ Complete. Full suite green: **453 tests / 44 files** (shared 24 · persistence
> 90 · core 174 · web 165, via `vitest run` per package). Per-package `tsc -p tsconfig.json
> --noEmit` clean (rc=0) across all 4 packages. Branch `008-comment-context` (off `master`), **no commit yet** (awaiting user
> review, per project CLAUDE.md). Plan: `plans/008-comment-context.md`. Tickets MIN-26/27 are
> **In Progress** in Linear (not Done — awaiting approval).

---

## 1. What this theme delivered

The **human-in-the-loop** seam of the agent loop:

- **MIN-26** — a new ticket comment is forwarded to a *parked* Claude session via
  `runner.resumeRun(--resume <sessionId>)`, audited on the run, response streamed back. The
  single forwarding rule (plan §1.1): resume ONLY from `waiting_on_user_input` (no live
  process); a comment during `running` is persisted `pending`; no resumable run → persisted
  only. Opt-out via `sendToAgent:false`. Failed resume never loses the comment.
- **MIN-27** — agents ask the user **structured clarification forms** in the comment stream.
  Two producers funnel through one form-lifecycle service: (a) the **`<<<OTTER_FORM>>>`
  Claude output contract** (a planning run that emits a form parks at `waiting_on_user_input`
  + opens `clarification_required` attention + sets `block_status`), and (b) the internal
  `POST /api/tickets/:id/forms` API. Submit → structured answers + transcript comment +
  attention resolved + block cleared + answers forwarded to Claude over the MIN-26 path.
- **Planning prompt now asks, don't assume** (user direction): `context/templates.ts` gained
  a `FORM_OUTPUT_CONTRACT` block + an ambiguity policy directing Claude to emit `OTTER_FORM`
  rather than guess. This is the trigger that makes the MIN-27 producer fire.
- **Closes deferred D-007-1's `clarification_required` producer** (forms is now live).

---

## 2. Decisions locked with the user (deliberate discovery) — see plan §1
1. **Active run = parked, not process-active.** Resume only from `waiting_on_user_input`
   (+ captured `claudeSessionId`); `running`/terminal never resume. This also resolves the
   mid-run concurrency question (no concurrent `--resume`).
2. **Comment delivery state** lives in `comment.metadata`:
   `{ sendToAgent, agentDeliveryStatus: not_applicable|pending|delivered|skipped_no_active_run,
   targetRunId }`. A forwarded comment writes a run audit `note{kind:'comment_forwarded'}`.
3. **Two form producers**, one service; the live loop depends on the `OTTER_FORM` contract.
4. **Submit routes back via the MIN-26 path** (the run is parked, so it resumes).
5. **Only `waiting_on_user_input`** is introduced/used (it already existed in `RUN_STATUSES`).
   The user-named future parked states (`paused`, `failed_recoverable`,
   `waiting_on_permission_resolved`) are **deferred** (D-008-1), not added.

---

## 3. What got built (by implementor — Agent Teams)

| Impl | Owns | Result |
|---|---|---|
| **A · persistence + shared** | `shared/forms.ts` (types, `validateFormSchema`/`validateAnswers`, `FormValidationError`+codes, `FORM_MARKER_START/END`, `ParsedFormResult`), `domain.ts` (`COMMENT_KINDS`/`AGENT_DELIVERY_STATUSES`), `events.ts` (+`form_created/submitted/dismissed`), migration `0006_comment_context.sql` (forms/form_questions/form_answers + 3 idx), `createFormRepository`, `comments.setMetadata` | shared 24, persistence 90 |
| **B · forms backend** | `forms/service.ts` (`createFormService`: create/submit/dismiss + attention + block + run re-park + transcript + forward), `routes/forms.ts` (5 endpoints, error→HTTP), `claude/formResult.ts` (pure `parseFormResult`), orchestrator `OTTER_FORM` wiring | core forms/formResult/orchestrator green |
| **C · forwarding + context** | `forwarding/forwarder.ts` (`createCommentForwarder` — the §1.1 rule, incremental packet, audit, delivery status), `routes/comments.ts` (+`sendToAgent`, injected `forwardComment`), `context/packet.ts` (`## Clarification Forms` from form tables; legacy `meta.kind=form` reader removed; `fenceUntrusted` exported), `context/templates.ts` (`FORM_OUTPUT_CONTRACT` + ask-don't-assume) | core forwarding/context green |
| **D · web** | `api/forms.ts`, enriched `ui/FormCommentCard.tsx`+`.css.ts` (OTR-101 design: agent eyebrow + amber POSTED A FORM/OPEN, inner card 📋 Form·phase + red BLOCKS TICKET, radio/checkbox/boolean/text/textarea fields, indigo Submit gated on required), `TicketDetail` integration, `PreviewRoute` specimen (Components section) | web 173 (raw-color guard green) |

Channel: `channels/008-comment-context-channel.log`. Memory:
`implementations/008-comment-context/impl-{a,b,c,d}-memory.md`.

---

## 4. Orchestrator tie-up (actor §7) — what I fixed after fan-out

1. **`server.ts` wiring (all 4 deliberately left it to the orchestrator):** constructed ONE
   `createCommentForwarder` (runs/events/comments/projectRoot/`runner.resumeRun`/emit) and
   passed its `forwardComment` to BOTH `registerTicketCoreRoutes(app,db,emit,forwardComment)`
   AND `createFormService`; registered `registerFormsRoutes`; injected
   `createForm: formService.createForm` into the orchestrator. Moved ticket-core registration
   **after** runner construction (the forwarder needs `resumeRun`).
2. **Corrupted `orchestrator.ts` (25,617 lines!):** a concurrent-edit collision had duplicated
   the import block ~25k times (this is also why `tsc` hung). **Reconstructed** it from the
   pristine `master` original + B's documented OTTER_FORM changes; validated against B's
   `orchestrator.test.ts` (7/7) before proceeding. Now ~326 lines.
3. **Form-service `this`-binding bug:** `createFormService` returned an object literal whose
   methods used `this.tickets`/`this.forms`/… — broken when called and fatal when
   `formService.createForm` is passed **detached** to the orchestrator/server. Refactored to
   closure style (destructures `deps` once; returns only `{createForm,submitForm,dismissForm}`;
   only the `FormConflictError` constructor's `this.name` remains).
4. **Migration-0004 trigger race (flagged by B):** `trg_agent_runs_unblock_ticket` clears
   `block_status` when a run enters `waiting_on_user_input`. `createForm` parks the run FIRST,
   then sets `block_status='blocked'`, so the form's block wins. Covered by test.
5. **Channel acks ↔ code verified:** A→{B,C,D} signatures consumed (B imports
   `createFormRepository`/validators; C `comments.setMetadata`; D mirrors shared types);
   C↔B agreed `forwardComment(comment): Promise<void>`; D↔B route shapes match `routes/forms.ts`.
6. **Stray `README.md`** that Impl-C created (citing a hallucinated "mid-task user request")
   was **removed** with user consent. No other unrequested artifacts.

---

## 5. MIN invariants → where satisfied
comment stored before forwarding (route persists, then forwards) · failed forwarding never
loses comment (rejected `resumeRun` → run `log` error, comment stays `pending`) · no active
run → persist only (`skipped_no_active_run`) · `sendToAgent:false` opt-out (`not_applicable`)
· forwarded comments auditable (`note{kind:'comment_forwarded'}`) · clarification is a `form`
comment · structured answers + readable `form_answer` transcript · required unanswered form
blocks via `block_status` (not a new lifecycle state) · required form opens & submit/dismiss
resolves `clarification_required` attention · submit idempotent (409 on non-open) · schema
rejects bad field types / answers validated against options · answers in context builder
(`## Clarification Forms`) · OTTER_FORM precedence over a co-emitted OTTER_PLAN. (All covered
by tests across shared/persistence/core/web.)

---

## 6. Where things live (additions to the §4 map in 001-context-summary)

| Concept | Location |
|---|---|
| Form domain contract + validators + markers | `packages/shared/src/forms.ts` |
| Comment kinds / delivery statuses | `packages/shared/src/domain.ts` |
| Forms migration + repo | `packages/persistence/src/migrations/0006_comment_context.sql`, `src/repositories/forms.ts` |
| Form lifecycle service (both producers) | `packages/core/src/forms/service.ts` |
| Form REST routes | `packages/core/src/routes/forms.ts` |
| `OTTER_FORM` parser | `packages/core/src/claude/formResult.ts` |
| Comment forwarder (MIN-26) | `packages/core/src/forwarding/forwarder.ts` |
| Comments route (+sendToAgent/forward) | `packages/core/src/routes/comments.ts` |
| Clarification-forms context section | `packages/core/src/context/packet.ts` |
| `FORM_OUTPUT_CONTRACT` + ask-don't-assume | `packages/core/src/context/templates.ts` |
| OTTER_FORM orchestrator wiring | `packages/core/src/runtime/orchestrator.ts` |
| Server wiring (forwarder + form service) | `packages/core/src/server.ts` |
| Web form UI + api + specimen | `packages/web/src/ui/FormCommentCard.{tsx,css.ts}`, `src/api/forms.ts`, `src/components/TicketDetail.tsx`, `src/preview/PreviewRoute.tsx` |

---

## 7. Still open / next
- **D-007-1 remaining producers** (permission_request, verification_review, execution_failed,
  run_stalled) ship with their own themes. **`clarification_required` is now done.**
- New deferrals recorded in `contexts/deferred.md`: extra parked run states (D-008-1); deferred
  form field types (D-008-2); structured `forms.dismiss` columns (D-008-3).
- **No commit / no push / no Linear "Done"** without explicit user approval.
