# Plan 008 — Comment Context (MIN-26 / MIN-27) + closes D-007-1 (clarification producer)

> **Theme:** `comment-context`. Branch `008-comment-context` (off `master`), **no commit
> until user approval** (project CLAUDE.md). Builds on plan 005 (claude-runtime), 006
> (planning-loop), 007 (attention). Actor pattern: `/.claude/agent-patterns/actor.agent`.
> Channel: `channels/008-comment-context-channel.log`. Per-agent memory:
> `implementations/008-comment-context/impl-{a,b,c,d}-memory.md`.

---

## 0. Goal

Close the **human-in-the-loop** seam of the agent loop:

- **MIN-26** — new ticket comments are forwarded to a *parked* Claude session via
  `resumeRun(--resume <sessionId>)`, audited on the run, response streamed back.
- **MIN-27** — agents ask the user **structured clarification forms** that live in the
  comment stream; answers are stored, transcribed, fed into future context, and routed
  back to Claude over the MIN-26 path. Closes **D-007-1**'s `clarification_required`
  live producer (forms source).

---

## 1. Decisions locked with the user (deliberate discovery — 2026-05-30)

### 1.1 What is an "active run" for MIN-26 (the runtime contract)
`claude -p` is **one-shot**: it runs a turn and exits. "Running" means a subprocess is
**alive right now**. "Waiting" means **no process alive, a `claudeSessionId` exists, user
input is needed**. Comments resume Claude **only from a waiting state**:

| Comment arrives while run is… | Action |
|---|---|
| `waiting_on_user_input` (+ sessionId) | persist comment → **resume** `--resume <sessionId>` → run → `running` |
| `running` (subprocess alive) | persist comment only, mark **pending**; do NOT spawn a 2nd process |
| no active/waiting run, or terminal (`completed`/`failed`/`canceled`) | persist comment only; future context builder includes it |

This single rule also resolves the mid-run concurrency question (no concurrent `--resume`).
**Only `waiting_on_user_input` is introduced/used by this theme** (it already exists in
`RUN_STATUSES`). The user named other future parked states (`paused`,
`failed_recoverable`, `waiting_on_permission_resolved`) — **not added now**, out of scope.

### 1.2 Comment delivery state (auditable forwarding)
Stored in **comment `metadata`** (no new column needed; `comment.metadata` is JSON):
```jsonc
{ "sendToAgent": true,
  "agentDeliveryStatus": "pending" | "delivered" | "skipped_no_active_run" | "not_applicable",
  "targetRunId": "run_123" | null }
```
- `sendToAgent` defaults **true when the ticket has a waiting/active run**, else false.
- A forwarded comment also writes a **run audit event** (`note { kind:"comment_forwarded",
  commentId, runId }`) — persist-before-broadcast. "All forwarded comments are auditable."

### 1.3 Forms have TWO producers; the live loop depends on the Claude output contract
1. **Claude output contract** `<<<OTTER_FORM>>> … <<<OTTER_FORM_END>>>` (mirrors
   `<<<OTTER_PLAN>>>`). A planning/execution run that emits a form block →
   parse → create form → form comment → `clarification_required` attention →
   `ticket.block_status = waiting_on_user` (if `blocksTicket`) → **run →
   `waiting_on_user_input`**.
2. **Internal API** `POST /api/tickets/:id/forms` (system / tests / future manual tools).

Both funnel through ONE form-lifecycle service so behavior is identical.

### 1.4 Form submission → routes back to Claude via the MIN-26 path
On `POST /api/forms/:id/submit`: validate → store structured answers → create
**`form_answer` transcript comment** → resolve `clarification_required` attention → clear
`block_status` (if no other open blocking forms) → **forward via the MIN-26 forwarding
service** (the run is `waiting_on_user_input`, so this resumes Claude). Idempotent: a
non-`open` form rejects re-submission (409).

### 1.5 UI direction (OTR-101 screenshot)
Enrich `FormCommentCard` to the screenshot: agent eyebrow (teal diamond avatar · name ·
amber `POSTED A FORM` · `· <phase> · <relative time>` · right amber `OPEN` status pill);
inner form card with `📋 Form · <phase>` header + red `BLOCKS TICKET` pill; per-question
`Q1/Q2/Q3` eyebrow + white label + red `REQUIRED` tag; `single_select`→radio rows,
`multi_select`→checkbox rows, `boolean`→two-option radio, `short_text`→input,
`long_text`→textarea; footer helper `Answering unblocks the ticket and notifies <agent>.`
+ indigo `Submit answers` button (disabled until required answered). Tokens: amber=agent/
open, red=`risk.critical`, indigo=primary. Add a specimen to the **Components** preview.

### 1.6 Identity (no auth yet)
Free-string author, as today. Agent author = the run title's agent or `"spec-runner"`;
user author = `"user"`. `answered_by_user_id` / `created_by_agent_id` stored when known,
else null.

### 1.7 Planning prompt: ask, don't assume (the producer's trigger)
The `OTTER_FORM` contract is inert unless Claude is *told* to use it. Update the planning
instructions (`context/templates.ts` `PLANNING_INSTRUCTIONS`) so the model is **explicitly
directed to ask a structured clarification form instead of assuming** whenever it hits a
genuine ambiguity, missing decision, or fork that materially changes the plan. Concretely:
- Add a **`FORM_OUTPUT_CONTRACT`** prose block (sibling of `PLAN_OUTPUT_CONTRACT`) appended
  to the planning packet, documenting the `<<<OTTER_FORM>>> … <<<OTTER_FORM_END>>>` JSON
  shape + the 5 MVP field types, with the OAuth example.
- Add an **"ambiguity policy"** line to `PLANNING_INSTRUCTIONS`: *prefer asking over
  assuming* — if a decision would change the plan and isn't answerable from the ticket /
  comments / prior answers, emit `OTTER_FORM` (status stays plannable, run parks
  `waiting_on_user_input`) rather than guessing or emitting `PLAN_BLOCKED` with prose.
- Keep mutual exclusion explicit: a final message emits **either** `OTTER_PLAN` **or**
  `OTTER_FORM`, not both (parser precedence documented in §2.5 / formResult).
This mirrors the deliberate-discovery principle the team itself works by (actor §1.2).

---

## 2. Frozen contracts (orchestrator-frozen — implementors build against these)

### 2.1 `@otter/shared/src/forms.ts` (NEW, node-free)
```ts
export const FORM_FIELD_TYPES = ["short_text","long_text","single_select","multi_select","boolean"] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export const FORM_STATUSES = ["open","submitted","dismissed","expired","superseded"] as const;
export type FormStatus = (typeof FORM_STATUSES)[number];

export const FORM_PHASES = ["planning","execution","verification","manual"] as const;
export type FormPhase = (typeof FORM_PHASES)[number];

export interface FormOption { label: string; value: string }

export interface FormQuestion {
  id: string; formId: string; key: string; type: FormFieldType;
  label: string; helpText: string; required: boolean;
  options: FormOption[]; defaultValue: unknown | null; sortOrder: number;
}
export interface FormAnswer {
  id: string; formId: string; questionId: string; questionKey: string;
  answeredByUserId: string | null; value: unknown; createdAt: string;
}
export interface Form {
  id: string; projectId: string; ticketId: string; commentId: string;
  runId: string | null; status: FormStatus; phase: FormPhase;
  title: string; description: string; blocksTicket: boolean;
  createdByAgentId: string | null; createdAt: string;
  submittedAt: string | null; dismissedAt: string | null;
  questions: FormQuestion[]; answers: FormAnswer[];   // hydrated on read
}

export interface CreateFormQuestionInput {
  key: string; type: FormFieldType; label: string; helpText?: string;
  required?: boolean; options?: FormOption[]; defaultValue?: unknown;
}
export interface CreateFormInput {
  runId?: string | null; phase: FormPhase; title: string; description?: string;
  blocksTicket?: boolean; commentBody: string; createdByAgentId?: string | null;
  questions: CreateFormQuestionInput[];
}
export interface SubmitFormInput { answers: Record<string, unknown>; answeredByUserId?: string | null }

// Pure validation (shared, throws typed errors caught as 400 by routes)
export function validateFormSchema(input: CreateFormInput): void;        // rejects unsupported field types, dup keys, select w/o options
export function validateAnswers(form: Form, answers: Record<string, unknown>): void; // required present, select ∈ options, multi ⊆ options, boolean is bool

// Claude output contract (mirror of OTTER_PLAN markers)
export const FORM_MARKER_START = "<<<OTTER_FORM>>>";
export const FORM_MARKER_END = "<<<OTTER_FORM_END>>>";
export interface ParsedFormResult {
  found: boolean;
  form?: CreateFormInput;   // normalized from the JSON body
  raw?: string;             // preserved tail on parse failure (≤4000)
  error?: string;
}
```

### 2.2 Comment metadata contract `@otter/shared/src/domain.ts` (additive helpers)
```ts
export const COMMENT_KINDS = ["user","agent","form","form_answer","system"] as const;
export type CommentKind = (typeof COMMENT_KINDS)[number];
export const AGENT_DELIVERY_STATUSES = ["not_applicable","pending","delivered","skipped_no_active_run"] as const;
export type AgentDeliveryStatus = (typeof AGENT_DELIVERY_STATUSES)[number];
// Reads off Comment.metadata: { kind?, formId?, sendToAgent?, agentDeliveryStatus?, targetRunId? }
```

### 2.3 Persistence repo signatures (`@otter/persistence`)
```ts
createFormRepository(db): {
  create(input: CreateFormInput & { ticketId: string; commentId: string; projectId?: string }): Form; // tx: form+questions
  get(id): Form | undefined;                       // hydrated (questions+answers)
  getByComment(commentId): Form | undefined;
  listByTicket(ticketId): Form[];
  listOpenBlockingByTicket(ticketId): Form[];      // status='open' AND blocks_ticket=1
  submit(id, answers: FormAnswer[]): Form;         // tx: insert answers + status=submitted+submitted_at; throws if not 'open'
  dismiss(id, reason?: string, byUserId?: string): Form; // throws if not 'open'
}
```
Comment repo gains: `setMetadata(commentId, metadata)` (merge) for delivery-status updates.

### 2.4 Backend service seams (`@otter/core`)
```ts
// forms lifecycle (Impl-B) — used by route AND orchestrator
createFormService(deps): {
  createForm(ticketId, input: CreateFormInput): { form: Form; comment: Comment };
  submitForm(formId, input: SubmitFormInput): { form: Form; transcript: Comment };
  dismissForm(formId, reason?, byUserId?): Form;
}
// On create: form comment(kind:'form',formId) → attention.open(clarification_required, source 'form')
//   → block_status=waiting_on_user (if blocksTicket) → if runId set: runs.setStatus(runId,'waiting_on_user_input')
// On submit: validateAnswers → repo.submit → transcript comment(kind:'form_answer') → attention.resolveBySource('form',formId,'clarification_required')
//   → clear block_status if no other open blocking forms → forwardComment(transcript)

// comment forwarding (Impl-C) — MIN-26
createCommentForwarder(deps): {
  forwardComment(comment: Comment): Promise<void>; // §1.1 rule; resume on waiting+sessionId; audit note; mark delivery status
  findResumableRun(ticketId): AgentRun | undefined; // latest non-terminal run w/ captured sessionId; prefers waiting_on_user_input
  readSessionId(runId): string | undefined;         // from note{kind:'claude_session'} events
  buildIncrementalCommentPacket(ticketId, runId): string; // pending comments since last resume, fenced
}
```

### 2.5 Context packet (`context/packet.ts` + `context/templates.ts`, Impl-C)
- Add a deterministic **`## Clarification Forms`** section assembled from the forms tables
  (form + Q/A), replacing the legacy inline `meta.kind==='form'` `{question,answer}` reader.
  Keep `fenceUntrusted` on all user/agent text.
- `templates.ts`: add `FORM_OUTPUT_CONTRACT` (the `OTTER_FORM` prose, §1.7) appended to the
  **planning** packet after `PLAN_OUTPUT_CONTRACT`; add the "ask, don't assume" ambiguity
  policy to `PLANNING_INSTRUCTIONS`. Marker/JSON shape comes from `@otter/shared/forms.ts`
  (A); the exact prose is coordinated with B's `formResult` parser over the channel.
- **Parser precedence** (B's `formResult` + orchestrator): a completed planning run is
  scanned for `OTTER_FORM` **first**; if found → form producer path (park
  `waiting_on_user_input`), else fall through to `parsePlanResult` (ready/blocked/error) as
  today. A message containing both markers prefers `OTTER_FORM` (questions outrank a guess).

### 2.6 HTTP routes (`@otter/core`)
```
POST /api/tickets/:ticketId/forms      -> { form }            (201; 400 invalid schema; 404 ticket)
GET  /api/tickets/:ticketId/forms      -> Form[]              (404 ticket only)
GET  /api/forms/:formId                -> Form
POST /api/forms/:formId/submit         -> { form, transcript } (400 invalid answers; 409 not open; 404)
POST /api/forms/:formId/dismiss        -> { form }            (409 not open; 404)
```
`POST /api/tickets/:id/comments` extended: accepts `sendToAgent?: boolean`; after persist
(+ existing broadcast) calls `forwardComment`. Persist-before-broadcast/forward preserved.

### 2.7 Events (`@otter/shared/src/events.ts`, additive)
Add `"form_created"`, `"form_submitted"`, `"form_dismissed"` to `EVENT_TYPES`. Reuse
existing `comment_created`, `run_status_changed`, `attention_item_resolved`,
`attention_item_updated`, `ticket_updated`. Channels: `CHANNELS.ticket(id)` + `project`.

### 2.8 Web API + UI
`web/src/api/forms.ts` mirrors §2.6. `FormCommentCard` enriched (§1.5) + question-field
subcomponents. `TicketDetail` renders form/`form_answer` comments inline + submit. New
`Specimen` in `preview/PreviewRoute.tsx` under **Components**.

---

## 3. Migration `0006_comment_context.sql` (additive — never edit 0001–0005)
```sql
CREATE TABLE forms ( id TEXT PRIMARY KEY, project_id TEXT NOT NULL, ticket_id TEXT NOT NULL,
  comment_id TEXT NOT NULL, run_id TEXT, status TEXT NOT NULL, phase TEXT NOT NULL,
  title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', blocks_ticket INTEGER NOT NULL DEFAULT 1,
  created_by_agent_id TEXT, created_at TEXT NOT NULL, submitted_at TEXT, dismissed_at TEXT );
CREATE TABLE form_questions ( id TEXT PRIMARY KEY, form_id TEXT NOT NULL, question_key TEXT NOT NULL,
  question_type TEXT NOT NULL, label TEXT NOT NULL, help_text TEXT NOT NULL DEFAULT '',
  required INTEGER NOT NULL DEFAULT 1, options_json TEXT NOT NULL DEFAULT '[]',
  default_value_json TEXT, sort_order INTEGER NOT NULL );
CREATE TABLE form_answers ( id TEXT PRIMARY KEY, form_id TEXT NOT NULL, question_id TEXT NOT NULL,
  question_key TEXT NOT NULL, answered_by_user_id TEXT, value_json TEXT NOT NULL, created_at TEXT NOT NULL );
CREATE INDEX idx_forms_ticket ON forms(ticket_id);
CREATE INDEX idx_form_questions_form ON form_questions(form_id);
CREATE INDEX idx_form_answers_form ON form_answers(form_id);
```

---

## 4. Work split (4 implementors — Agent Teams, parallel)

| Impl | Owns | Depends on |
|---|---|---|
| **A · persistence + shared** | `shared/forms.ts` (+ validators, markers), domain helpers, `events.ts` additions; `0006_*.sql`; `createFormRepository`, comment `setMetadata`; persistence tests | — (foundation; posts repo sigs to channel first) |
| **B · forms backend** | `forms/service.ts` (create/submit/dismiss + attention + block + run status), `routes/forms.ts`, `claude/formResult.ts` parser, orchestrator `OTTER_FORM` wiring; core tests | A (repo), C (`forwardComment`) |
| **C · forwarding + context** | `forwarding/forwarder.ts` (MIN-26 service + incremental packet + audit + delivery status), `routes/comments.ts` change, `context/packet.ts` clarification-forms section, `context/templates.ts` (`FORM_OUTPUT_CONTRACT` + "ask, don't assume" policy, §1.7); core tests | A (repo), runner.resumeRun, B (form marker shape) |
| **D · web** | `api/forms.ts`, `FormCommentCard` enrichment + field subcomponents, `TicketDetail` integration, `PreviewRoute` specimen; web tests | A (types), B (routes) |

Channel handshakes to verify at tie-up (actor §7): A→{B,C,D} repo+type sigs; C→B
`forwardComment` signature; B→D route shapes; D→C the comment `metadata.kind` contract.

---

## 5. Phases (execution order)
1. **Foundation** — A freezes & ships shared + migration + repo; posts signatures to channel.
2. **Parallel build** — B, C, D start against §2 frozen contracts (A's real sigs confirmed
   over channel). B's `submitForm` consumes C's `forwardComment`.
3. **Tie-up** — orchestrator (me) reads impl memories, verifies channel acks against code,
   runs the full suite, resolves the one integration risk below, updates context rollup.

### Integration risk to resolve at tie-up
A planning subprocess that emits `OTTER_FORM` exits 0 → the runner marks the run
`completed` (terminal). The orchestrator must instead park it at `waiting_on_user_input`.
**Approach:** orchestrator classifies planning output on completion — if `OTTER_FORM`
found, it creates the form (which sets run → `waiting_on_user_input`) **before/instead of**
the plan path; ensure `runs.setStatus` permits `completed → waiting_on_user_input` for this
internal re-park (or have the orchestrator set status directly). Document the chosen
mechanism and cover it with a test ("planning run emitting OTTER_FORM parks at
waiting_on_user_input and opens a clarification form").

---

## 6. Tests (from both tickets — red→green)
**MIN-26:** comment during waiting run → resume + `comment_forwarded` note; comment with
`sendToAgent:false` → not forwarded; comment with no active run → persisted only, not
forwarded; comment during `running` → persisted `pending`, no 2nd process; failed resume
records error, comment remains.
**MIN-27:** create form comment; render form in stream; reject unsupported question type;
reject submission missing required; reject single_select not in options; reject multi_select
unknown option; submit required answers; create transcript comment; context builder includes
answers; block clears after required answers; required form creates `clarification_required`
attention; submit resolves attention; active run receives submitted answer via MIN-26 path;
`OTTER_FORM` output parsed → form + park; planning packet contains the `FORM_OUTPUT_CONTRACT`
+ "ask, don't assume" policy (template test); `OTTER_FORM` takes precedence over a
co-emitted `OTTER_PLAN`.

---

## 7. Invariants → where satisfied (fill at tie-up)
comment stored before forwarding · failed forwarding never loses comment · no active run →
persist only · `sendToAgent:false` opt-out · forwarded comments auditable (run note) ·
clarification is a form comment · answers structured + readable transcript · required
unanswered forms block (block_status, not a new lifecycle state) · required forms appear in
& resolve Attention · submit idempotent (409 on non-open) · schema rejects bad field types ·
option answers ∈ options · answers in context builder · dismissed blocking forms record who/why.

---

## 8. Deferred (write to `contexts/deferred.md` at tie-up)
- **Closes D-007-1 (clarification_required)** — forms is now a live producer (Claude
  `OTTER_FORM` + API). Other 4 D-007-1 producers (permission_request, verification_review,
  execution_failed, run_stalled) remain with their themes.
- New deferrals likely: extra parked run states (`paused`, `failed_recoverable`,
  `waiting_on_permission_resolved`); deferred field types (file_upload, date, number,
  code_reference, secret_input); a dedicated `comment.agent_delivery_status` column if the
  metadata approach proves limiting.

---

## 9. Process / safety
- Git: working on branch `008-comment-context` off `master`. **No commit / no push / no
  Linear "Done"** without explicit user approval (project CLAUDE.md). Tickets moved to **In
  Progress** at execution start (with user approval).
- Actor pattern: channel log + per-agent memory + this plan file + context rollup.
