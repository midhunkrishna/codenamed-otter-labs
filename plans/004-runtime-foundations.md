# Plan 004 — Runtime Foundations (MIN-45 / MIN-17 / MIN-18 / MIN-19 / MIN-20 / MIN-32)

Orchestrator-owned plan (actor pattern). Builds on completed `001-foundations`,
`002-ticket-core`, `003-design-system`. Theme branch: `runtime-foundations`.

## 1. Tickets in scope

| Ticket | Theme | Title | Layer |
|---|---|---|---|
| MIN-45 | nodejs-setup | Bootstrap default local project entity | persistence + core |
| MIN-17 | runtime-events | Add live event bus | core + web |
| MIN-18 | claude-runtime | Detect Claude Code install & readiness | core |
| MIN-19 | claude-runtime | Agent run persistence + run console API | persistence + shared + core |
| MIN-20 | claude-runtime | Build ticket context packet | core |
| MIN-32 | ui-ux | Build Agent Runs console | web |

> **MIN-45 pulled in (user direction):** MIN-19's "every run belongs to a project"
> needs an explicit project entity; MIN-45 provides it, so it is a hard prerequisite
> and is implemented here.

## 2. What we are building (and explicitly NOT)

These tickets are the **runtime substrate**: the default project entity, plus how
runs are *persisted*, *queried*, *broadcast live*, *gated on Claude readiness*, and
*rendered* — plus the canonical *context packet* a run is fed. They **NOT** include
the actual Claude-Code subprocess driver that spawns `claude` and streams its stdout
— **that is MIN-44, explicitly deferred** (user direction). We expose a clean append
seam (`runEvents.append(...)` + bus broadcast) where MIN-44's executor plugs in. The
Runs console proves "live output" through that same seam.

> Deliberate-discovery decisions (§7) are RESOLVED — see answers inline.

## 3. Frozen contracts (orchestrator-owned — implementers build against these)

### 3a. Run domain types — `@otter/shared/src/runs.ts` (NEW, frozen)
```
RUN_TYPES   = ["planning","execution","manual","review"]
RUN_STATUSES= ["queued","running","waiting_on_permission",
               "waiting_on_user_input","completed","failed","canceled"]
TERMINAL_RUN_STATUSES = ["completed","failed","canceled"]   // cannot be canceled
AgentRun     { id, projectId, ticketId|null, type, status, title,
               createdAt, updatedAt, startedAt|null, finishedAt|null }
AgentRunEvent{ id, runId, seq, kind, payload(JSON obj), createdAt }
  kind ∈ ["status_changed","output_delta","log","permission_requested",
          "user_input_requested","note"]
```
Re-exported from `@otter/shared/src/index.ts`. Web keeps its own mirror (node-free
bundle convention, same as ticket-core).

### 3b. Migration `0003_runtime.sql` (NEW, additive — 0001/0002 untouched) — MIN-45 + MIN-19
- `project` table (id, name, root, data_dir, created_at, updated_at). Seeded with one
  default row `INSERT OR IGNORE` id = `local-project` (stable constant, MIN-45-allowed).
  Schema permits multiple projects later (no single-row constraint).
- `ticket.project_id TEXT NOT NULL DEFAULT 'local-project'` (additive column; backfills
  existing rows + new rows via the default ⇒ "ticket creation uses default project id"
  needs no ticket-repo change).
- `agent_runs` (project_id FK NOT NULL DEFAULT `local-project`, ticket_id FK NULL,
  type, status, title, timestamps). Index on (project_id, status).
- `agent_run_events` (run_id FK NOT NULL, seq INTEGER, kind, payload TEXT(JSON),
  created_at). Append-only. Unique(run_id, seq). Index on run_id.
- The legacy `run` table from 0001 is left intact and unused (no destructive change).

### 3c. Run + project repositories — `@otter/persistence` (factories, frozen signatures)
```
createProjectRepository(db)        -> { getDefault(), get(id),
                                        upsertDefault({name,root,dataDir}) }  // idempotent bootstrap
createAgentRunRepository(db)       -> { create(input), get(id), list(filter), setStatus(id,status), cancel(id) }
createAgentRunEventRepository(db)  -> { append(runId, kind, payload) -> AgentRunEvent (assigns next seq),
                                        list(runId) -> AgentRunEvent[] (seq asc) }
```
`cancel(id)` throws if status ∈ TERMINAL_RUN_STATUSES. `setStatus` bumps updatedAt
(+ finishedAt on terminal). `create` defaults projectId to `getDefault().id`.
`upsertDefault` reuses the stable id, updates root/dataDir/updatedAt (idempotent
across restarts — MIN-45 "second startup reuses same project id").

### 3d. Event bus — `@otter/core/src/events/bus.ts` (frozen envelope + channels)
```
Envelope { channel, type, seq, ts, payload }
channels: "project" | "ticket:<id>" | "run:<id>" | "attention" | "approvals"
EventBus { publish(channel,type,payload), subscribe(channel,fn)->unsub, subscribeAll(fn) }
event types (examples from MIN-17): ticket_updated, comment_created,
  ticket_transitioned, run_created, run_status_changed, run_output_delta,
  permission_requested, attention_item_created, attention_item_resolved
```
**Invariant:** persist-before-broadcast. The bus is NOT source of truth; UI
recovers via HTTP. Emits are wired into the existing ticket/comment/transition
mutation paths and the run repo writes.

### 3e. WS gateway — replaces the `/ws` echo stub in `server.ts`
- Client → server message `{ "subscribe": "<channel>" }` / `{ "unsubscribe": "<channel>" }`.
- Server → client: bus envelopes for subscribed channels (JSON). No historical
  replay over WS (recovery is HTTP). Multiple channels per socket.
- `reconnect does not corrupt state`: server is stateless per-connection; client
  re-subscribes + refetches HTTP on open.

### 3f. HTTP — Runs + Claude (NEW routes, registered via a runtime aggregator)
```
GET  /api/runs?projectId=&ticketId=&status=   -> AgentRun[]   (newest first)
POST /api/runs            { type, ticketId?, title? }  -> AgentRun  (creation guard: §3h)
GET  /api/runs/:id                              -> AgentRun
GET  /api/runs/:id/events                       -> AgentRunEvent[] (seq asc)
POST /api/runs/:id/cancel                       -> AgentRun  (409 if terminal)
GET  /api/claude/status   -> { ready:boolean, version?:string, error?:string }
```
`GET /api/health` extended with `claude: { ready, version? }` (non-breaking add).
Errors keep the `{error}` shape (400/404/409). Status changes on a run go through
the repo, which emits `run_status_changed`.

### 3g. Web clients (frozen signatures)
- `web/src/api/runs.ts`: `listRuns/getRun/getRunEvents/createRun/cancelRun`,
  `getClaudeStatus`. Local mirror of run types.
- `web/src/ws/events.ts`: `connectEvents()` → `{ subscribe(channel,fn), close() }`
  built on the existing `ws/client.ts` connect(), with auto-reconnect + re-subscribe.

### 3h. Claude readiness + run guard (MIN-18)
- `core/src/claude/detect.ts`: `detectClaude(opts?) -> { ready, version?, error? }`.
  Probes the `claude` binary on PATH (or configured override) via
  `claude --version` with a timeout. Cached at boot; re-probed on `/api/claude/status`.
- Guard: `POST /api/runs` for a `planning`/`execution` type when Claude is NOT
  ready → creates a run row in status `failed` with an explanatory
  `agent_run_event` (kind `log`) and returns it (acceptance: "fail gracefully with
  actionable error"). Ticket CRUD is untouched by readiness.

### 3i. Context packet (MIN-20) — `core/src/context/packet.ts`
- `buildTicketContext(db, ticketId, { mode: "planning"|"execution", projectRoot })`
  → markdown string. Rebuilt purely from SQLite (deterministic: same state ⇒ same
  output). Sections: ticket title/description/status/metadata; comments oldest-first;
  form answers as Q&A pairs (source = comments whose `metadata.kind==="form"` with
  `{question,answer}`); plans + approved plan when present; execution mode line;
  project root + constraints. **Planning mode** includes a "do NOT edit files"
  instruction and excludes execution instructions; **execution mode** includes the
  approved plan.

### 3j. Project bootstrap + exposure (MIN-45)
- `core/src/project/bootstrap.ts`: on startup (`startApp` after `initPersistence`),
  call `projects.upsertDefault({ name, root: paths.root, dataDir: paths.dataDir })`.
  Idempotent; never silently changes root without writing the record.
- `GET /api/project` → current default project `{ id, name, root, dataDir, ... }`.
  `GET /api/health` also gains a `project: { id, name }` summary (non-breaking add).
- `getCurrentProjectId()` helper so services/repos resolve the id reliably.

## 4. Parallel execution split (waves + implementers)

Dependency DAG → 3 waves. Each implementer = one teammate sub-agent (actor Actor 2),
writes `implementations/004-runtime-foundations/<impl>-memory.md`, coordinates via
`channels/004-runtime-foundations-channel.log`, follows red-green-refactor.

**Wave 1 (parallel):**
- **Impl-A · Runs + project persistence** (MIN-19 data + MIN-45 persistence): shared
  `runs.ts` types, migration `0003` (project seed + ticket.project_id + agent_runs +
  agent_run_events), project + agent-run + agent-run-event repositories + tests.
  Owns §3a/3b/3c.
- **Impl-D · Context packet** (MIN-20): `context/packet.ts` + tests. Fully
  independent (reads existing tables); owns §3i.

**Wave 2 (parallel, depend on A's run types/repo):**
- **Impl-B · Event bus + WS gateway** (MIN-17): `events/bus.ts`, WS gateway
  replacing the echo stub, emit wiring into ticket/comment/transition + run writes,
  web `ws/events.ts` client + tests. Owns §3d/3e + web events client.
- **Impl-C · Runs API + Claude readiness + project bootstrap** (MIN-19 API + MIN-18 +
  MIN-45 startup/expose): `routes/runs.ts`, `routes/claude.ts`, `claude/detect.ts`,
  `project/bootstrap.ts`, run-creation guard, health extension (claude + project),
  `GET /api/project`, runtime route aggregator + tests. Owns §3f/3h/3j.

**Wave 3:**
- **Impl-E · Runs console UI** (MIN-32): Runs page (list grouped by status), run
  detail drawer, live output via `ws/events.ts`, run timeline, linked ticket, cancel
  action, waiting-on-permission / waiting-on-user-input states. Consumes C's API +
  B's event client. Wires the `runs` nav in `App.tsx` (replaces placeholder). Owns §3g UI.

Orchestrator pre-scaffolds: the frozen type/interface/migration files as stubs, a
`registerRuntimeRoutes(app, db, bus)` aggregator wired into `createServer`, and the
channel/context/memory files — so B and C edit *separate* route files and never collide.

## 5. Test matrix (acceptance → owner)
- A: create planning run; append run event; list runs by project; cancel running run;
  completed run cannot be canceled; run state durable across restart; project repo
  getDefault returns seeded row; upsertDefault is idempotent (same id) + stores
  root/dataDir.
- C (MIN-45): first startup creates/updates default project; second startup reuses
  same id; `GET /api/project` + health return current project; ticket creation uses
  default project id.
- B: subscribe ticket channel; subscribe attention channel; comment creation emits;
  ticket transition emits; attention item creation emits; reconnect does not corrupt.
- C: missing binary → setup error; available binary → ready; ticket creation works
  with Claude missing; agent run without Claude → failed run w/ message; list/read/cancel.
- D: context includes new comments; includes form answers; execution context includes
  approved plan; planning context excludes execution instructions; deterministic.
- E: running run appears in list; output delta appears live; refresh reloads history;
  cancel calls backend; waiting states render clearly.

## 6. Orchestrator verification (Phase 4)
Run full `vitest`, `tsc --noEmit` (all packages), `vite build`. Live boot: create a
run via API, append events, confirm WS broadcast in a second connection, confirm
`/api/claude/status`, restart → runs persist. Verify channel acks against code
evidence. Update `004-runtime-foundations-context.md`; move resolved deferred items.

## 7. Deliberate discovery — RESOLVED (user answers)
1. **Execution-engine scope** → **Substrate only.** The real `claude` subprocess
   driver is **deferred to MIN-44** (recorded in `deferred.md`). This plan exposes the
   append seam MIN-44 plugs into.
2. **Project entity** → **Pull in MIN-45** and model an explicit seeded `project`
   table with a stable default id `local-project`. MIN-45 is now in scope (§3b/3c/3j).
3. **Branch & commit** → **Branch `runtime-foundations`, no auto-commit.** Leave the
   working tree for user review (matches 002/003).
4. **Claude detection** → **PATH probe + override.** `claude --version` on PATH, with
   an env/config override of the binary path.

## 8. Assumptions (stated, not blocking — correct me if wrong)
- Form answers source = comments with `metadata.kind==="form"` carrying
  `{question, answer}` (no Forms feature exists yet; degrades to empty gracefully).
- New tables named `agent_runs` / `agent_run_events` per ticket text (plural),
  despite existing singular `ticket`/`run` convention.
- Plan-approval remains the deferred permissive guard (D-002-1); context packet just
  reads any `plan` rows with status `approved` if present.
