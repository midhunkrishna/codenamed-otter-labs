# Runtime Foundations — Orchestrator Context

Rollup of sub-agent progress for plan `004-runtime-foundations.md`
(MIN-45, MIN-17, MIN-18, MIN-19, MIN-20, MIN-32). Updated by the Orchestrator.
Builds on `001-foundations` + `002-ticket-core` + `003-design-system`.

## Status — COMPLETE ✅
- [x] Phase 1: deliberate discovery (4 Qs resolved), plan written, branch
      `runtime-foundations`, frozen shared contracts published, channel/context scaffolded
- [x] Phase 2: MIN-45/17/18/19/20/32 → In Progress
- [x] Phase 3 Wave 1: Impl-A (runs+project persistence) · Impl-D (context packet) — parallel
- [x] Phase 3 Wave 2: Impl-B (event bus + WS gateway) · Impl-C (runs API + claude + bootstrap) — parallel
- [x] Phase 3 Wave 3: Impl-E (Runs console UI)
- [x] Phase 4: verification — **256/256 tests**, 4 packages tsc clean, `vite build` clean,
      live boot + WS broadcast + restart-durability verified; 1 orchestrator tie-up applied

## Decisions (deliberate discovery, resolved with user)
1. **Substrate only** — the real `claude` subprocess driver is deferred to **MIN-44**
   (recorded in `deferred.md` as D-004-1). Plan 004 leaves the append+broadcast seam.
2. **MIN-45 pulled in** — explicit seeded `project` table, stable default id
   `local-project`; backs MIN-19's per-project run invariant.
3. **Branch `runtime-foundations`, no auto-commit** (matches 002/003).
4. **Claude detection** = `claude --version` on PATH + env/config override.

## Frozen contracts (orchestrator-owned — already written)
- `@otter/shared/src/runs.ts` — `DEFAULT_PROJECT_ID`, `Project`, `RUN_TYPES`,
  `RUN_STATUSES`, `TERMINAL_RUN_STATUSES`, `AgentRun`, `RUN_EVENT_KINDS`,
  `AgentRunEvent`, `RunListFilter` + guards. Re-exported from `shared/src/index.ts`.
- `@otter/shared/src/events.ts` — `CHANNELS`, `STATIC_CHANNELS`, `EVENT_TYPES`,
  `EventEnvelope`, `WsClientMessage` + `isWsClientMessage`. Re-exported.
- Plan §3 holds the migration, repo, route, bus, gateway, detection, bootstrap, and
  web-client seams each implementer fills.

## Implementor summaries
(agents' own notes under `implementations/004-runtime-foundations/impl-*-memory.md`.)

**A · runs+project persistence (MIN-19 data + MIN-45)** — migration `0003_runtime.sql`
(additive: `project` table seeded `local-project`, `ticket.project_id` default col,
`agent_runs`, `agent_run_events` UNIQUE(run_id,seq); legacy `run` table untouched).
Repos `createProjectRepository` (getDefault/get/upsertDefault), `createAgentRunRepository`
(create→queued/default-project/validates type; list newest-first; setStatus stamps
startedAt-on-first-running + finishedAt-on-terminal; cancel throws if missing/terminal),
`createAgentRunEventRepository` (append→next per-run seq from 1; list seq-asc). +17 tests.

**D · context packet (MIN-20)** — `core/src/context/packet.ts`
`buildTicketContext(db, ticketId, {mode, projectRoot, constraints?})→markdown`. Read-only,
deterministic (order by created_at,rowid; single trailing newline). Comments oldest-first;
form answers = comments with `metadata.kind==="form"` `{question,answer}`; approved plan =
oldest `plan` row status `approved`. Planning mode emits "do NOT edit files" + excludes
execution instructions; execution mode surfaces approved plan. +7 tests.

**B · event bus + WS gateway (MIN-17)** — bus is orchestrator-owned (`events/bus.ts`); B
hardened `events/gateway.ts` (per-connection `Set` state only, OPEN-guarded sends, close+
error teardown — stateless ⇒ reconnect can't corrupt). Web `ws/events.ts` `connectEvents()`
→ `{subscribe(channel,handler), close()}` with auto-reconnect + auto re-subscribe; delivers
data only (never scroll/focus). +13 core tests (bus + gateway e2e) +8 web tests.

**C · runs API + Claude readiness + project bootstrap (MIN-19 API + MIN-18 + MIN-45)** —
`runtime/routes.ts` (GET/POST `/runs`, `/runs/:id`, `/runs/:id/events`, `/runs/:id/cancel`
409-on-terminal, `/claude/status`, `/project`), `claude/detect.ts` (`<bin> --version` via
execFile, override `OTTER_CLAUDE_BIN`, never throws, cached+re-probe), `project/bootstrap.ts`
(idempotent upsertDefault). Run-creation guard: planning/execution + Claude-not-ready ⇒ run
created then `failed` + actionable `log` event (still 201). +14 +4 tests.

**E · Runs console UI (MIN-32)** — `api/runs.ts` mirror, `components/RunsConsole.tsx` +
`RunDetail.tsx` + `runStatus.ts` + token-only css. List grouped by status (running/waiting
top), detail in `Drawer`, linked ticket, live output via `CodeBlock` from concatenated
`output_delta.payload.text` (deduped by seq), ordered timeline, explicit cancel (409
surfaced), distinct waiting banners. Recovery-first: HTTP-load list/events THEN subscribe.
Wired `runs` nav. +10 tests; `vite build` clean; no-raw-colors holds.

## Channel verification (acks confirmed by code evidence)
- **A→B/C:** A posted exact repo factory signatures; C's `runtime/routes.ts` imports the real
  `@otter/persistence` run/project repos; B's emit points sit on the documented write paths.
  Evidence: live boot created `agent_runs`/`agent_run_events` rows; 256/256 tests green.
- **B→E:** B posted the `connectEvents()` signature; E consumes it verbatim in `RunDetail`/
  `RunsConsole`. Evidence: web suite 130 green; live deltas dedupe by seq.
- **C→E:** C posted the `/api/runs*` + `/claude/status` + `/project` contract; E's `api/runs.ts`
  mirrors it. Evidence: live verification hit every route with the expected shapes.
- B flagged a transient `Ticket.projectId` tsc error in C's test during parallel edits → did
  not reproduce; orchestrator `tsc -p core` is clean.

## Orchestrator verification & tie-ups (Phase 4)
- Independently ran: `vitest` **256/256**, `tsc --noEmit` exit 0 for all 4 packages,
  `vite build` clean. Live boot (real socket + temp SQLite): `/project` seeded with real
  root/dataDir; `/claude/status` ready (claude v2.1.157 on PATH); WS subscriber received
  `comment_created` + `run_created` (persist-before-broadcast); list/cancel/409-terminal;
  **restart → run + events persist** (durable).
- **Tie-up 1 (MIN-19 "record run status changes as events"):** cancel + guard-fail changed run
  status but recorded **0 run events**. Added a `status_changed` `agent_run_event` append (then
  broadcast) on both paths in `runtime/routes.ts`. Re-verified: cancel now yields a durable,
  seq-ordered event; core suite still 69 green.

## Adversarial review + hardening (post-implementation)
Three read-only analyses (inversion / adversary / edge-case) → `analysis-synthesis.md`.
**Fixed this round** (full suite 266 green): B1 `POST /api/runs` bad/empty ticketId now
404 `{error}` (was raw 500 FK) + masking test fixed; S1 WS `Origin` allowlist (CSWSH guard,
1008 on cross-origin); L1 froze `RunEventPayload {id,seq}` + dedupe-by-id in the console;
L2 fenced untrusted text in the context packet + authoritative-instruction guard.
**Still open** (candidates for Linear issues, mostly latent until MIN-44): subprocess
PATH/env trust, HTTP refetch on WS reconnect, sticky Claude guard re-probe + `/claude/status`
coalescing, `setStatus` transition legality + terminal timestamps, pagination/payload caps,
WS subscription validation.

## Loose ends / follow-ups
- **D-004-1 (deferred → MIN-44):** no `run_output_delta` *producer* exists yet (the Claude
  subprocess driver). The Runs console live-output path + event-append seam are ready; MIN-44
  plugs in via `runEvents.append(runId,'output_delta',{text})` + bus broadcast on `run:<id>`.
- **Health endpoint:** Claude/project exposure is via dedicated `GET /api/claude/status` +
  `GET /api/project` (MIN-18/45 allow "health OR settings API"); `/api/health` left unchanged
  to avoid touching the frozen `HealthResponse` shape + web mirror.
- **D-002-1:** plan-approval guard still permissive; context packet reads approved plans if present.
- Tickets MIN-45/17/18/19/20/32 left **In Progress** (no commit — awaiting user review, per decision 3).
