# Plan 006 — Planning Loop (MIN-21 / MIN-22 / MIN-33 / MIN-23)

> Theme: the **plan → approve → execute** loop. Moving a ticket to *plannable* now
> auto-starts a Claude planning run; a finished plan becomes a durable, versioned
> **plan artifact**; the user **approves or sends back** the plan from an **Attention**
> item; an approved plan unlocks *executable*.
>
> Spans four tickets across three themes:
> - **MIN-21** [claude-runtime] start planning run when ticket becomes plannable
> - **MIN-22** [claude-runtime] parse planning results → plan artifacts
> - **MIN-33** [docs-artifacts] plan artifact storage + Docs view
> - **MIN-23** [ticket-core] plan approval flow + Attention
>
> Also absorbs deferred **D-002-1** (wire the `planApproved` lifecycle guard).
>
> Actor pattern: orchestrator freezes the contracts below; 4 implementors build in
> parallel against them, coordinating over
> `channels/006-planning-loop-channel.log`. Verification cites code evidence.

---

## 0. Decisions locked with the user (deliberate discovery)

1. **Planning output contract** = JSON header + delimited markdown body (see §2.4).
2. **Auto-plan trigger** = ANY entry into `plannable` starts planning if no active
   planning run exists; a **send-back re-plans** (feedback flows into the next
   context). The "make auto-replan a project setting" toggle is **deferred**.
3. **Execution-report artifacts** are **out of scope** → deferred under **MIN-46**.
   Build the generic writer + Docs over **plan** artifacts only.
4. **Attention** = a **persisted `attention_item` table** (not derived).

---

## 1. Current state (verified by reading the code)

- `plan` table exists (`0001_init.sql`: id, ticket_id, status, content, timestamps) but
  has **no version column and no repository**. No attention persistence anywhere.
- `planApproved` lifecycle guard is the **permissive MVP stub** (`lifecycle.ts`): gates
  `→executable`/`→in_progress` but only blocks when explicitly `false`. The transition
  route never sets it (D-002-1).
- Runs are started **manually** via `POST /api/runs/:id/start`. The runner
  (`claude/runner.ts`) already: streams `output_delta`, records the final `result` as a
  `note{kind:"structured_result", value}`, records `claude.session_detected` as a
  `note{kind:"claude_session"}`, and drives status to a terminal state.
- `EVENT_TYPES` already includes `attention_item_created` / `attention_item_resolved`;
  `CHANNELS.attention` / `CHANNELS.approvals` exist. `AttentionCard`, `ApprovalCard`,
  `PlanCard` UI primitives exist. `paths.plans` / `paths.executionReports` dirs exist.
- The event bus is created in `server.ts`; routes only receive `emit` (publish). The
  orchestrator needs **`bus.subscribe`**, so `server.ts` wiring changes (Impl-B).

### Payload wrinkle (do not "fix" the frozen contract — read DB instead)
`run_status_changed` is broadcast with **two different payload shapes**:
- route `emitRun`: `{ id: <runId>, status, type, ticketId }`
- runner `broadcastStatus`: `{ id: <eventId>, runId, seq }`

The orchestrator MUST resolve the run id as `payload.runId ?? payload.id` and then read
authoritative `status`/`type`/`ticketId` from `runs.get(runId)` (persist-before-broadcast
guarantees the row is current). Do not change the frozen payloads.

---

## 2. FROZEN CONTRACTS (orchestrator-owned — implementors build against these)

### 2.1 Migration `0004_planning_approval.sql` (ADDITIVE ONLY)

```sql
-- Plan versioning + provenance (MIN-22). Additive columns on the existing plan table.
ALTER TABLE plan ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE plan ADD COLUMN title TEXT NOT NULL DEFAULT '';
ALTER TABLE plan ADD COLUMN run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL;
ALTER TABLE plan ADD COLUMN artifact_path TEXT;          -- relative path under data dir
-- plan.status values used going forward: 'proposed' | 'approved' | 'sent_back' | 'superseded'
-- At most ONE approved plan per ticket:
CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_one_approved
  ON plan(ticket_id) WHERE status = 'approved';

-- Ticket points at its approved plan (MIN-23 invariant: executable requires approved plan id).
ALTER TABLE ticket ADD COLUMN approved_plan_id TEXT REFERENCES plan(id) ON DELETE SET NULL;

-- Attention queue (MIN-23). MVP kind = 'plan_approval'; schema generalizes.
CREATE TABLE IF NOT EXISTS attention_item (
  id          TEXT PRIMARY KEY,
  ticket_id   TEXT REFERENCES ticket(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',     -- 'open' | 'resolved'
  ref_id      TEXT,                             -- e.g. the plan id awaiting decision
  detail      TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_attention_ticket ON attention_item(ticket_id);
-- At most ONE open attention item per (ticket, kind):
CREATE UNIQUE INDEX IF NOT EXISTS idx_attention_one_open
  ON attention_item(ticket_id, kind) WHERE status = 'open';
```

Earlier migrations are never edited. Existing `plan.status` default stays `'draft'`; new
rows are inserted as `'proposed'`.

### 2.2 Shared types (`@otter/shared`)

`packages/shared/src/plans.ts`:
```ts
export const PLAN_STATUSES = ['proposed','approved','sent_back','superseded'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export interface Plan {
  id: string;
  ticketId: string;
  runId: string | null;
  version: number;          // per-ticket, 1-based, increments
  title: string;
  status: PlanStatus;
  content: string;          // plan markdown of record
  artifactPath: string | null;  // relative to data dir, when written
  createdAt: string;
  updatedAt: string;
}

// --- Planning output contract (MIN-22) ---
export const PLAN_MARKER_START = '<<<OTTER_PLAN>>>';
export const PLAN_MARKER_END   = '<<<OTTER_PLAN_END>>>';
export type PlanResultStatus = 'PLAN_READY' | 'PLAN_BLOCKED';
export interface PlanResultHeader { status: PlanResultStatus; title?: string }
export type ParsedPlanResult =
  | { kind: 'ready';   title: string; markdown: string }
  | { kind: 'blocked'; reason: string }
  | { kind: 'error';   raw: string };   // markers absent/malformed; raw preserved
```

`packages/shared/src/attention.ts`:
```ts
export const ATTENTION_KINDS = ['plan_approval'] as const;
export type AttentionKind = (typeof ATTENTION_KINDS)[number];
export const ATTENTION_STATUSES = ['open','resolved'] as const;
export type AttentionStatus = (typeof ATTENTION_STATUSES)[number];
export interface AttentionItem {
  id: string;
  ticketId: string | null;
  kind: AttentionKind;
  status: AttentionStatus;
  refId: string | null;
  detail: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}
```

`domain.ts`: add `approvedPlanId: string | null` to `Ticket`. Re-export the two new
modules from `index.ts`.

### 2.3 Persistence repositories

`createPlanRepository(db)` (`repositories/plans.ts`):
```ts
createProposed(input: { ticketId: string; runId: string | null; title: string; content: string }): Plan;
// version = (max version for ticket) + 1; status 'proposed'
get(id: string): Plan | undefined;
listByTicket(ticketId: string): Plan[];          // version DESC
getLatest(ticketId: string): Plan | undefined;
getApproved(ticketId: string): Plan | undefined; // status 'approved' or undefined
approve(id: string): Plan;            // throws unless status 'proposed'; supersedes any prior approved
sendBack(id: string): Plan;           // throws unless status 'proposed'; sets 'sent_back'
setArtifactPath(id: string, relPath: string): Plan;
```
Invariants enforced in repo: version increments per ticket; `approve` is the ONLY writer
of `'approved'`; content/version immutable after creation (no content update method).

`createAttentionRepository(db)` (`repositories/attention.ts`):
```ts
open(input: { ticketId: string; kind: AttentionKind; refId?: string|null; detail?: string }): AttentionItem;
   // idempotent: if an open item for (ticketId, kind) exists, returns it (no dup)
get(id: string): AttentionItem | undefined;
list(filter?: { status?: AttentionStatus; ticketId?: string }): AttentionItem[]; // newest first
resolve(id: string): AttentionItem;                       // sets resolved + resolved_at
resolveByTicketKind(ticketId: string, kind: AttentionKind): AttentionItem | undefined; // resolves the open one if any
```

Ticket repo (`repositories/tickets.ts`): map `approved_plan_id` → `approvedPlanId`; add
`setApprovedPlan(ticketId: string, planId: string | null): Ticket | undefined`.

### 2.4 Planning output contract (what Claude emits / what we parse)

Claude's FINAL message ends with:
```
<<<OTTER_PLAN>>>
{"status":"PLAN_READY","title":"<short title>"}
---
# <title>

## Summary
...
## Steps
1. ...
## Risks / Open questions
- ...
<<<OTTER_PLAN_END>>>
```
or, when it cannot plan:
```
<<<OTTER_PLAN>>>
{"status":"PLAN_BLOCKED"}
---
<reason it is blocked>
<<<OTTER_PLAN_END>>>
```

`parsePlanResult(text: string): ParsedPlanResult` (pure, `claude/planResult.ts`):
- Find the LAST `PLAN_MARKER_START … PLAN_MARKER_END` region (tolerant of surrounding
  whitespace / stray backticks). Split header line(s) from body on the first `---`.
- Parse the header JSON. `PLAN_READY` → `{kind:'ready', title, markdown=body.trim()}`
  (title falls back to first `# ` heading, then to ''). `PLAN_BLOCKED` →
  `{kind:'blocked', reason=body.trim()}`.
- Missing region / bad JSON / empty body → `{kind:'error', raw=<tail of input, ≤4000 chars>}`.
- NEVER throws.

The orchestrator feeds `parsePlanResult` the concatenation of (a) the run's
`structured_result` note value (stringified) and (b) all `output_delta` text, newest
context last.

### 2.5 Artifact writer (MIN-33)

`writeArtifact(input)` (`core/src/artifacts/writer.ts`):
```ts
interface WriteArtifactInput { dataDir: string; kind: 'plan'; name: string; content: string }
interface WriteArtifactResult { ok: true; relPath: string; absPath: string }
                             | { ok: false; error: string }   // never throws
function writeArtifact(input): WriteArtifactResult;
```
- Target dir: `kind==='plan'` → `<dataDir>/artifacts/plans`. (execution-reports dir is
  reserved but unused this theme — MIN-46.)
- **Path-safety (invariant):** sanitize `name` to a single path segment; reject if it
  contains `/`, `\`, `..`, is absolute, or if the resolved absolute path does not stay
  under the artifacts dir → `{ok:false}`. mkdir -p, write utf8.
- Returns `relPath` **relative to `dataDir`** (e.g. `artifacts/plans/<ticket>-v2.md`) for
  storage on `plan.artifact_path` and for the Docs API.

### 2.6 HTTP API (all under `/api`, errors keep `{error}` shape)

Plans / approval (MIN-23):
```
GET  /api/tickets/:id/plans                 -> Plan[]            (version DESC) | 404
GET  /api/plans/:id                         -> Plan | 404
POST /api/plans/:id/approve                 -> { ticket, plan }
     guards: plan.status==='proposed'; ticket in needs_user_approval
     effect: plan->approved; ticket.approved_plan_id=plan.id;
             applyTransition needs_user_approval->executable (planApproved=true);
             resolve plan_approval attention item; emit ticket_transitioned +
             attention_item_resolved.  409 on guard failure.
POST /api/plans/:id/send-back  { feedback }  -> { ticket, plan }
     guards: plan.status==='proposed'; ticket in needs_user_approval; feedback non-empty
     effect: plan->sent_back; store feedback as a comment (author 'user',
             metadata{kind:'plan_feedback', planId}); applyTransition
             needs_user_approval->plannable; resolve attention item; emit.
             (The ->plannable transition triggers the orchestrator to re-plan.)
GET  /api/attention?status=open             -> AttentionItem[]   (newest first)
```
Docs / artifacts (MIN-33):
```
GET  /api/docs/artifacts                    -> ArtifactSummary[]
     ArtifactSummary = { kind:'plan'; name; relPath; size; modifiedAt; ticketId?; planId?; version? }
GET  /api/docs/artifacts/plan/:name         -> { name; content } | 404
     path-safe: :name is a single segment; traversal rejected.
```

### 2.7 Lifecycle wiring (D-002-1)

`routes/transitions.ts` builds `TransitionContext` with
`planApproved: plans.getApproved(ticket.id) !== undefined` in BOTH the GET (so
`nextTransitions` hides `executable` until approved) and POST handlers. The permissive
stub stays in `lifecycle.ts` (defaults remain safe); we now pass the real value. This
satisfies MIN-23 "executable transition fails without approved plan".

### 2.8 Events (reuse frozen `EVENT_TYPES`)

`attention_item_created` / `attention_item_resolved` on `CHANNELS.attention` (+ project).
`ticket_transitioned` emitted by the orchestrator (mirror the route payload
`{id, from, to}`) on `CHANNELS.ticket(id)` + `CHANNELS.project`. Persist BEFORE broadcast.

---

## 3. Orchestrator runtime design (MIN-21 + MIN-22)

`core/src/runtime/orchestrator.ts` →
`createPlanningOrchestrator({ db, bus, emit, runner, projectRoot, dataDir }) => { start(): () => void }`.

`start()` subscribes to `CHANNELS.project` and returns an unsubscribe fn. Handlers:

- **`ticket_transitioned` with `to === 'plannable'`** → `maybeStartPlanningRun(ticketId)`:
  - Dedup: if any run with `ticketId`, `type==='planning'`, non-terminal status exists →
    skip (MIN-21 invariant: one active planning run per ticket).
  - Else: `runs.create({ type:'planning', ticketId, title:'Planning <ticket>' })`; emit
    `run_created`; build context = `buildTicketContext(db, ticketId, {mode:'planning',
    projectRoot})` (the send-back feedback comment is already included by the packet);
    fire-and-forget `runner.startPlanningRun({ runId, projectRoot, contextMarkdown })`.
- **`run_status_changed`** → resolve `runId = payload.runId ?? payload.id`; `run =
  runs.get(runId)`; if `run.type==='planning'` and `run.status==='completed'` →
  `processPlanningResult(run)`:
  - Concatenate the run's `structured_result` note value + `output_delta` text →
    `parsePlanResult(...)`.
  - `ready` → `plans.createProposed({ticketId, runId, title, content})`; `writeArtifact(
    {dataDir, kind:'plan', name:'<ticketId>-v<version>.md', content})` → on ok
    `plans.setArtifactPath`; open `attention_item{kind:'plan_approval', refId:plan.id}`;
    emit `attention_item_created`; `applyTransition(db, plannable->needs_user_approval)`;
    emit `ticket_transitioned`. (Guard: only if ticket still `plannable`.)
  - `blocked` → `runEvents.append(runId,'note',{kind:'plan_blocked', reason})`; ticket
    stays plannable. (No artifact, no attention.)
  - `error` → `runEvents.append(runId,'note',{kind:'plan_parse_error', raw})`; ticket
    stays plannable (MIN-22: raw Claude output preserved).
  - Idempotency: re-entrancy guarded by the "ticket still plannable" + dedup checks.

`server.ts` change: construct the runner ONCE, pass it to `registerRuntimeRoutes` as
`runnerOverride` AND to `createPlanningOrchestrator`; call `orchestrator.start()`. Tests
inject a fake runner + drive the bus directly.

Planning prompt: `context/packet.ts` planning mode appends the §2.4 **Output contract**
block (the `<<<OTTER_PLAN>>>` instructions). Execution mode unchanged.

---

## 4. Parallel split (4 implementors)

| Impl | Scope | Tickets | Depends on (contract-only) |
|---|---|---|---|
| **A · persistence+domain** | migration 0004; shared `plans.ts`/`attention.ts`; `Ticket.approvedPlanId`; `createPlanRepository`; `createAttentionRepository`; ticket repo `setApprovedPlan`; repo tests | foundation for 22/23 | — (lands first; posts "repos ready") |
| **B · planning orchestrator** | `orchestrator.ts`; `claude/planResult.ts`; packet output-contract block; `server.ts` runner+orchestrator wiring; dedup; tests (fake binary + bus-driven) | MIN-21, MIN-22 | A (plan repo), C (`writeArtifact`) |
| **C · approval+lifecycle+artifacts** | `routes/plans.ts` (approve/send-back/list, attention list); lifecycle `planApproved` wiring in `transitions.ts`; `artifacts/writer.ts`; `routes/docs.ts`; route registration; tests | MIN-23, MIN-33 (backend) | A (plan+attention repos) |
| **D · web UI** | ticket **Plan tab** (PlanCard + approve / send-back w/ feedback); **Attention** page; **Docs** page; `api/plans.ts`,`api/attention.ts`,`api/docs.ts`; Ticket mirror `approvedPlanId`; tests | MIN-23, MIN-33 (frontend) | B/C HTTP shapes (§2.6) |

Build order: **A** starts immediately; **B**, **C** start against A's frozen interfaces
(coordinate `writeArtifact` import B↔C via channel — signature is frozen in §2.5);
**D** builds against the frozen HTTP shapes and integrates last. Orchestrator verifies
integration + loose ends after fan-out.

---

## 5. Tests / acceptance (per ticket)

**MIN-21:** created→plannable creates a planning run · repeated plannable does not create a
dup · missing Claude → failed run w/ useful message (existing start guard) · run output
event persisted + broadcast.
**MIN-22:** valid PLAN_READY creates a plan + transitions to needs_user_approval · invalid
result keeps ticket plannable + records parse error (raw preserved) · second plan
increments version · plan survives restart (it's in SQLite + artifact file).
**MIN-33:** plan artifact file written · path traversal rejected · Docs lists generated
artifacts · artifacts survive restart.
**MIN-23:** approving proposed plan → executable · send-back → plannable (+ feedback
comment) · executable transition fails without approved plan · plan approval creates
Attention item · approve/send-back resolves the Attention item.

Whole suite must stay green (currently 293). Each implementor follows red→green→refactor
and writes `implementations/006-planning-loop/impl-<x>-memory.md`.

---

## 6. Deferred (write to `contexts/deferred.md` on completion)

- **D-006-1** Auto-replan as a **project setting** (toggle whether send-back / plannable
  re-entry auto-starts planning). Default today = always on. Pending.
- **D-006-2 → MIN-46** Execution-report artifacts (writer dir + producer + Docs section).
  No execution-run producer exists yet. Pending.
- Resolve **D-002-1** (planApproved guard) — DONE by this plan (§2.7); mark it landed.
