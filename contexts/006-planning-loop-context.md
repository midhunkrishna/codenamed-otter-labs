# Plan 006 — Planning Loop (MIN-21 / MIN-22 / MIN-33 / MIN-23) — Context Rollup

> **Status:** ✅ Complete. Branch `006-planning-loop` (off `master`), **no commit yet**
> (awaiting user review, per project CLAUDE.md). Full suite green: **346 tests / 34 files**
> (was 293). Plan: `plans/006-planning-loop.md`. Tickets are **In Progress** in Linear
> (not moved to Done — awaiting approval).

---

## 1. What this theme delivered

The **plan → approve → execute** loop on top of the plan-005 Claude runtime:

- Moving a ticket to **`plannable`** now auto-starts a Claude **planning run** (MIN-21).
- A finished planning run is parsed for a **`<<<OTTER_PLAN>>>` block** (JSON header +
  markdown body); a valid `PLAN_READY` becomes a durable, **versioned `plan` row** + a
  **markdown artifact**, and the ticket moves `plannable → needs_user_approval` (MIN-22).
- The user **approves** (→ `executable`) or **sends back with feedback** (→ `plannable`,
  which auto-re-plans) from a **Plan tab** and an **Attention** queue; an approved plan
  unlocks `executable` (MIN-23). This also resolved deferred **D-002-1** (the
  `planApproved` lifecycle guard is now real, not permissive).
- **Plan artifacts** are written under `<dataDir>/artifacts/plans` and browsable from a
  new **Docs** page (MIN-33). Execution-report artifacts are deferred (MIN-46).

---

## 2. Decisions locked with the user (deliberate discovery)

1. **Planning output contract** = JSON header + delimited markdown body:
   `<<<OTTER_PLAN>>>` `{"status":"PLAN_READY","title":"…"}` `---` `<markdown>`
   `<<<OTTER_PLAN_END>>>` (or `PLAN_BLOCKED`). Chosen over full JSON/TOON because the plan
   body is prose, not tabular data, and JSON headers are the most reliable LLM output.
2. **Auto-plan trigger** = any entry into `plannable` (dedup'd); send-back re-plans with
   feedback. The "auto-replan as a project setting" toggle is **deferred → D-006-1**.
3. **Execution-report artifacts** = out of scope → **deferred → MIN-46**.
4. **Attention** = a **persisted `attention_item` table**.

---

## 3. What got built (by implementor)

### Impl-A · persistence + domain (foundation, 293→306)
- Migration `0004_planning_approval.sql` (additive): `plan.version/title/run_id/
  artifact_path`, partial-unique `idx_plan_one_approved`, `ticket.approved_plan_id`,
  `attention_item` table + `idx_attention_one_open` (one open per ticket+kind).
- Shared `plans.ts` (`Plan`, `PlanStatus`, `PLAN_MARKER_START/END`, `ParsedPlanResult`) +
  `attention.ts` (`AttentionItem`, kinds/statuses); `Ticket.approvedPlanId`.
- `createPlanRepository` (version increments per ticket; `approve` is the ONLY writer of
  `'approved'` + supersedes prior; content/version immutable) and
  `createAttentionRepository` (`open` idempotent per ticket+kind; `resolve` /
  `resolveByTicketKind`). Ticket repo `setApprovedPlan`.
- Tests: `packages/persistence/src/planning.test.ts` (13).

### Impl-B · planning orchestrator + result parser (MIN-21/22)
- `claude/planResult.ts` — pure `parsePlanResult(text): ParsedPlanResult` (last marker
  region wins; header JSON split on first `---`; ready/blocked/error; never throws; raw
  tail preserved ≤4000).
- `runtime/orchestrator.ts` — `createPlanningOrchestrator(deps){ start() }`, DI'd
  (`{db,bus,emit,runner,projectRoot,dataDir,writeArtifact,isClaudeReady?}`). Subscribes
  `CHANNELS.project`: `→plannable` → dedup (one active planning run/ticket) → create run →
  Claude-readiness guard → `buildTicketContext(planning)` → fire-and-forget
  `startPlanningRun`. `run_status_changed` → resolve `runId = payload.runId ?? payload.id`
  → authoritative `runs.get` → planning+completed → parse → ready: `createProposed` +
  `writeArtifact` + `setArtifactPath` + `attention.open` + `applyTransition(plannable→
  needs_user_approval)` + emit; blocked/error → run `note`. Persist before broadcast.
- `context/packet.ts` — planning mode now appends the `<<<OTTER_PLAN>>>` Output contract.
- `server.ts` — subprocess runner constructed **once**, shared as `runnerOverride` to the
  runtime routes **and** as `runner` to the orchestrator; `orchestrator.start()`.
- Tests: `claude/planResult.test.ts` (11) + `orchestrator.test.ts` (5) + `context` (+1).

### Impl-C · approval + lifecycle + artifacts (MIN-23/33 backend)
- `artifacts/writer.ts` — `writeArtifact({dataDir,kind:'plan',name,content})` → path-safe
  (single segment; rejects `..`/absolute/escape), never throws, returns `relPath`.
- `routes/plans.ts` — `GET /tickets/:id/plans`, `GET /plans/:id`,
  `POST /plans/:id/approve` (→executable, sets `approved_plan_id`, resolves attention),
  `POST /plans/:id/send-back {feedback}` (→plannable, stores feedback comment, resolves
  attention), `GET /attention?status=open`. Repo guard-throws wrapped as 409/400.
- `routes/docs.ts` — `GET /docs/artifacts` (lists plan dir), `GET /docs/artifacts/plan/:name`
  (path-safe viewer).
- `routes/transitions.ts` — **D-002-1**: `planApproved = plans.getApproved(id) !== undefined`
  in both GET (nextTransitions) and POST. `lifecycle.ts` untouched (permissive default
  stays; the real value is now passed).
- Tests: `packages/core/src/planApproval.test.ts` (12).

### Impl-D · web UI (MIN-23/33 frontend, 306→329)
- API mirrors `api/{plans,attention,docs}.ts`; `Ticket.approvedPlanId` in `api/client.ts`.
- `TicketDetail.tsx` — **Plan section**: latest plan (PlanCard + CodeBlock); Approve +
  required-feedback Send-back shown only when `needs_user_approval` + latest plan
  `proposed`; refetch on mutation (backend stays the lifecycle authority).
- `AttentionPage.tsx` (replaces placeholder) — open attention items via `AttentionCard`;
  click opens the ticket in a Drawer. `DocsPage.tsx` (replaces placeholder) — artifact
  list + content viewer.
- Tests: `TicketDetail.plan` (5) + `AttentionPage` (3) + `DocsPage` (3).

---

## 4. Orchestrator tie-up (actor §7) — what I fixed after fan-out

- **Docs double-registration:** `planApproval.test.ts` manually called `registerDocsRoutes`
  *and* `createServer` now registers it → "GET already declared". Removed the manual call
  (test-only).
- **`claude.test.ts` flake:** the fake-bin readiness probe used the snappy 3s production
  default; under the larger 34-file parallel suite the spawn occasionally exceeded it →
  false `ready:false`. Gave that test probe `timeoutMs: 15000` (production default
  unchanged). Verified passing in isolation + full runs.
- **`GET /tickets/:id/plans` shape** (Impl-D's open question): confirmed it 404s only on a
  missing ticket and returns `[]` for an existing ticket with no plans — matches the UI's
  "empty array = no plan yet". No change needed.
- Verified the wiring seams: same `runner` instance → start route + orchestrator;
  `writeArtifact` + `bus` injected; `planApproved` in both transition handlers.

Channel `channels/006-planning-loop-channel.log`: every ack is backed by code (A's exported
symbols, C's `writeArtifact`/`registerDocsRoutes` signatures, B's server wiring, D's §2.6
field usage all match disk).

---

## 5. MIN invariants — where satisfied

| Invariant | Evidence |
|---|---|
| One active planning run per ticket (MIN-21) | orchestrator dedup before create; test "repeated plannable does not duplicate" |
| Planning run must not edit files (MIN-21) | planning context packet's read-only Output-contract instruction |
| Ticket cannot reach needs_user_approval without a plan (MIN-22) | only `processPlanningResult` `ready` branch transitions it |
| Plan versions immutable, increment (MIN-22) | repo has no content/version updater; `createProposed` = max+1; test |
| Parse failure preserves raw output (MIN-22) | `note{kind:'plan_parse_error', raw}`; ticket stays plannable; test |
| Artifact paths stay under data dir (MIN-33) | `writeArtifact` + Docs viewer reject `..`/absolute/escape; test |
| Only proposed plans approved; one approved/ticket (MIN-23) | repo `approve` throws unless proposed; partial-unique index; tests |
| executable requires approved plan id (MIN-23 / D-002-1) | `planApproved` from `getApproved`; test "executable fails without approved plan" |
| Plan approval appears in / resolves Attention (MIN-23) | `attention.open` on PLAN_READY; `resolveByTicketKind` on approve/send-back; tests |

---

## 6. Still open / next

- **D-006-1** auto-replan-as-project-setting (toggle). **D-006-2 → MIN-46** execution-report
  artifacts (writer dir + producer + Docs section) — no execution-run producer exists yet.
- **Resume forwarding:** the Claude session id is still persisted as a `note`; reading it
  back to drive `resumeRun` (e.g. continue a sent-back plan in the same session instead of
  a fresh run) remains future work.
- Rare async-leak in `App.test`/HealthBadge under peak cross-package parallelism printed an
  uncaught `useTheme` once; non-reproducing (pre-existing test hygiene, not plan-006 code).
- **No commit / no push / no Linear "Done"** without explicit user approval.
