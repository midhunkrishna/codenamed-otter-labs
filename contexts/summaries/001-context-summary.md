# Otter — Context Summary (Agent Handoff)

A consolidated history of the project so far, built by reading every context file in
`contexts/`. Hand this to a new agent to get oriented fast: what's been built, where
the implementations live, what the modules are, what's deferred, and the conventions
the team works by.

> **As of:** plan 004 (runtime-foundations) complete. Branch `runtime-foundations`,
> no commit yet (awaiting user review). Builds 001→002→003→004 are all green.

---

## 1. What Otter is

A local-first, single-binary orchestration app: a Fastify backend + React web UI +
SQLite persistence, organized as an npm/TypeScript **monorepo** (`packages/*`). It
manages **tickets** through a lifecycle, runs **agent runs** (planning/execution) that
will eventually drive a real `claude` subprocess, and streams live events to the UI over
WebSockets. The CLI ships as `npx otter-labs` and writes its data into `.otter-labs/`
in the directory it was invoked from.

---

## 2. Monorepo layout

```
packages/
  shared/       @otter/shared      — frozen contracts/types (node-free, browser-safe)
  persistence/  @otter/persistence — SQLite (better-sqlite3), migrations, repositories
  core/         @otter/core        — Fastify server, CLI, routes, event bus, WS gateway, claude detect, context packet
  web/          @otter/web         — React UI (Vite), design system, Board/Runs consoles
```

- **Toolchain:** TypeScript (strict, `noUncheckedIndexedAccess`), Vitest, `tsx` runtime
  (no build step needed today — packages run from `src`), Vite for web, `mise` for env.
- **Run it:** `npm start` → backend on **:4873**, Vite dev on **:5873** (proxies `/api`
  + `/ws` → :4873). `GET /api/health` → `{status, uptimeMs, dataDir}`.
- **Data dir:** `.otter-labs/` (logs, artifacts/{plans,execution-reports,diffs},
  session-meta, `otter.db`). Anchored to the **invocation cwd** via
  `invocationRoot(env, cwd) = env.INIT_CWD ?? cwd`.
- **Test totals climb per plan:** foundations 28 → ticket-core 78 → design-system 108 →
  runtime-foundations 256 (266 after adversarial round).

---

## 3. Themes / plans completed (chronological history)

Each "plan" is a theme of work executed by an orchestrator + parallel implementor
sub-agents, coordinated over a per-plan channel log, with a rollup context file.

### Plan 001 — Foundations ✅ (`contexts/foundations-context.md`)
The workspace skeleton. Three implementors:
- **core (MIN-11):** Fastify `createServer`, `startApp` (DI seam `init`), `main` CLI,
  `GET /api/health`, `/ws` stub, idempotent startup.
- **persistence (MIN-12):** `ensureLayout`, `openDatabase` (WAL, FK on), `runMigrations`
  (tx per file, `migrations` table, skip-applied). Migration `0001_init.sql` →
  tables: ticket, comment, plan, run, permission, audit. `initPersistence`.
- **web (MIN-13):** React shell, `NAV_ITEMS`, `api/client.ts` (`getHealth`),
  `ws/client.ts` stub, `HealthBadge`.
- **CLI packaging:** bin is **`otter-labs`** (shebang `node --import tsx`), runs from
  `src`. Not yet published.

### Plan 002 — Ticket Core ✅ (`contexts/ticket-core-context.md`)
The ticket domain + lifecycle. MIN-14/15/16.
- **Domain contract:** `@otter/shared/src/domain.ts` — statuses, block statuses,
  `Ticket`/`Comment`/`TicketEvent`.
- **persistence (MIN-14):** migration `0002_ticket_core.sql` (additive: `ticket.block_status`,
  `comment.metadata`, new `ticket_event` table). Repos under
  `persistence/src/repositories/{tickets,comments,events,transitions}.ts`:
  `createTicketRepository`, `createCommentRepository`, `createTicketEventRepository`,
  transactional `applyTransition(db, …)` (atomic status+updatedAt+one event).
- **api (MIN-14/15):** `core/src/lifecycle.ts` (TRANSITIONS map, `canTransition`,
  `nextTransitions`; `→in_progress` requires `blockStatus==='none'`). Routes under
  `core/src/routes/{tickets,comments,transitions,index}.ts`. **Status changes ONLY via
  `POST /api/tickets/:id/transitions`** — PATCH never touches status (backend authority).
- **web (MIN-16):** `Board`/`TicketCard`/`CreateTicketForm`/`TicketDetail`. 7 columns
  (Created…Done). **Transition buttons rendered ONLY from `GET /transitions.next`** — UI
  invents no rules. Every mutation refetches.
- **Notable fix:** `npm start` boot bug — a tsx 4.22.3 `transformDynamicImport` bug
  choked on `import type`; fixed by making the persistence import in `cli.ts` static.

### Plan 003 — Design System ✅ (`contexts/003-design-system-context.md`)
MIN-43. **vanilla-extract** (typed CSS-in-TS) + **@fontsource** self-hosted fonts +
in-app **"Components" preview route** (no Storybook) + **full adoption** (existing pages
migrated onto primitives).
- **Frozen contracts:** `web/src/design/contract.css.ts` (`vars`, `space`),
  `design/tokens.ts` (semantic tones/enums), `ui/types.ts` (prop API for 20 primitives),
  `vite.config.ts` (`vanillaExtractPlugin()` before `react()`), barrels `design/index.ts`
  + `ui/index.ts`.
- **A · Foundation:** 4 themes (`design/themes/{linear,notion,jira,celebration}.css.ts`),
  density (compact/regular/comfy), `theme.tsx` (`ThemeProvider`/`useTheme`/`useDensity`).
  Theme switch writes classes to `<html>` — **no remount**.
- **B · 13 core primitives:** Card, Pill, Badge, Button, AppShell, Sidebar, PageHeader,
  SectionHeader, Drawer, Tabs, EmptyState, CodeBlock, MetadataRow (+ `ui/tone.ts`).
- **C · 7 domain primitives:** TicketCard, AttentionCard/ExpandedAttentionCard,
  ApprovalCard, PlanCard, FormCommentCard, VerificationPacketTabs.
- **D · Integration:** `main.tsx`, `App.tsx` (AppShell+Sidebar, theme/density pickers),
  migrated Board/CreateTicketForm/TicketDetail, `preview/PreviewRoute.tsx`.
- **Key gotcha (tie-up):** @fontsource imports must live in a plain module
  (`design/fonts.ts`) imported from `main.tsx` — vanilla-extract `.css.ts` files DROP
  plain CSS side-effect imports (was silently falling back to system fonts).

### Plan 004 — Runtime Foundations ✅ (`contexts/004-runtime-foundations-context.md`)
MIN-45/17/18/19/20/32. The runtime **substrate** (NOT the real claude driver — see
D-004-1 / MIN-44).
- **Frozen contracts:** `@otter/shared/src/runs.ts` (`DEFAULT_PROJECT_ID`, `Project`,
  `RUN_TYPES`, `RUN_STATUSES`, `AgentRun`, `AgentRunEvent`, …) and
  `@otter/shared/src/events.ts` (`CHANNELS`, `EVENT_TYPES`, `EventEnvelope`,
  `WsClientMessage`).
- **A · runs+project persistence (MIN-19/45):** migration `0003_runtime.sql` (additive:
  `project` table seeded `local-project`, `ticket.project_id`, `agent_runs`,
  `agent_run_events` UNIQUE(run_id,seq)). Repos `createProjectRepository`,
  `createAgentRunRepository`, `createAgentRunEventRepository`.
- **B · event bus + WS gateway (MIN-17):** `core/src/events/bus.ts` (orchestrator-owned),
  `events/gateway.ts` (stateless per-connection). Web `ws/events.ts` `connectEvents()` →
  `{subscribe, close}` with auto-reconnect + re-subscribe.
- **C · runs API + Claude readiness + bootstrap (MIN-19/18/45):** `core/src/runtime/routes.ts`
  (`/runs`, `/runs/:id`, `/runs/:id/events`, `/runs/:id/cancel` 409-on-terminal,
  `/claude/status`, `/project`), `claude/detect.ts` (`claude --version`, override
  `OTTER_CLAUDE_BIN`), `project/bootstrap.ts`.
- **D · context packet (MIN-20):** `core/src/context/packet.ts`
  `buildTicketContext(db, ticketId, {mode, projectRoot, constraints?})→markdown`.
  Read-only, deterministic. Planning vs execution modes.
- **E · Runs console UI (MIN-32):** `web/src/components/RunsConsole.tsx` + `RunDetail.tsx`,
  `api/runs.ts`. Recovery-first: HTTP-load THEN subscribe; live output via concatenated
  `output_delta` payloads deduped by seq.
- **Adversarial hardening round** (`implementations/004-runtime-foundations/analysis-synthesis.md`):
  fixed WS Origin allowlist (CSWSH guard), bad-ticketId → 404, froze `RunEventPayload`
  + dedupe-by-id, fenced untrusted text in context packet.

---

## 4. Where to find things (quick map)

| Concept | Location |
|---|---|
| Shared contracts/types | `packages/shared/src/{domain,runs,events,index}.ts` |
| SQLite layer + migrations | `packages/persistence/src/{layout,database,migrations,index}.ts`, `src/migrations/000{1,2,3}_*.sql` |
| Repositories | `packages/persistence/src/repositories/*.ts` |
| Server + CLI | `packages/core/src/{server,cli,index}.ts` |
| Ticket lifecycle / state machine | `packages/core/src/lifecycle.ts` |
| HTTP routes (tickets/comments/transitions) | `packages/core/src/routes/*.ts` |
| HTTP routes (runs/claude/project) | `packages/core/src/runtime/routes.ts` |
| Event bus + WS gateway | `packages/core/src/events/{bus,gateway}.ts` |
| Claude detection | `packages/core/src/claude/detect.ts` |
| Project bootstrap | `packages/core/src/project/bootstrap.ts` |
| Context packet builder | `packages/core/src/context/packet.ts` |
| Design system (tokens/themes/primitives) | `packages/web/src/{design,ui}/` |
| App shell + theme controls | `packages/web/src/{main.tsx,App.tsx,app/}` |
| Board / ticket UI | `packages/web/src/components/{Board,CreateTicketForm,TicketDetail,status}.tsx` |
| Runs console UI | `packages/web/src/components/{RunsConsole,RunDetail,runStatus}.tsx` |
| Web API + WS clients | `packages/web/src/api/*.ts`, `src/ws/{events,client}.ts` |
| Component preview route | `packages/web/src/preview/PreviewRoute.tsx` |

**Per-plan documentation lives in three parallel trees:**
- `plans/00N-*.md` — the plan (frozen contracts, seams, phases).
- `contexts/*.md` — orchestrator rollup of what got built + verification evidence.
- `implementations/<theme>/impl-*-memory.md` — individual sub-agent working notes.
- `channels/<theme>-channel.log` — inter-agent coordination/ack log for that theme.

---

## 5. Conventions & learnings (how this team works)

- **Frozen contracts first.** The orchestrator freezes shared types + seams before
  implementors start; implementors build against them and ack matches over the channel
  log. Verification cites *code evidence* (which test runs the real impl), not claims.
- **Backend is the authority.** UI never invents rules: ticket transitions come only
  from `GET /transitions.next`; PATCH never changes status.
- **Persist-before-broadcast.** Events are written to SQLite, then broadcast on the bus.
- **`@otter/shared` and web's `components/status.ts` are node-free** (browser-safe);
  web keeps a local mirror of domain types rather than importing node code.
- **Migrations are additive** — earlier migration files are never edited.
- **No raw colors in web** — everything flows through vanilla-extract `vars`/tokens
  (enforced as an invariant/test).
- **Deferred work is tracked**, not dropped — see `contexts/deferred.md`; the
  orchestrator checks it when planning a new theme to absorb pending items.
- **No auto-commit / no Linear auto-transition** unless the user asks. Tickets are left
  "In Progress" pending review (per the project CLAUDE.md: ask before destructive/outward
  actions).

---

## 6. Open / deferred items (see `contexts/deferred.md` for full detail)

- **D-004-1 → MIN-44:** the real **Claude Code subprocess driver** (spawns `claude`,
  streams stdout into `agent_run_events`, captures session id, cancel/resume). The
  append+broadcast seam is ready; plug in via
  `runEvents.append(runId,'output_delta',{text})` + bus broadcast on `run:<id>`. **This
  is the natural next theme.**
- **D-002-1:** plan-approval lifecycle guard still **permissive** (`planApproved` always
  true). Wire to "an approved `plan` row exists" when the plan-approval theme (MIN-23)
  lands.
- **D-003-1:** non-default themes (Notion/Jira/Celebration) less visually refined —
  awaiting a design-polish pass. Linear is the refined default.
- **D-003-2:** Attention/Approvals/Docs/Settings nav still render `<EmptyState>`
  placeholders — real pages are their own tickets (MIN-37/38/31/33/34/39–42), which MUST
  consume the existing primitives.
- **D-003-3:** optional — replace `ui/tone.ts`'s `inlineVars()` shim with
  `@vanilla-extract/dynamic`'s `assignInlineVars` (pure cleanup).
- **Still-open hardening candidates** (mostly latent until MIN-44, from the 004
  adversarial round): subprocess PATH/env trust, HTTP refetch on WS reconnect, sticky
  Claude guard re-probe + `/claude/status` coalescing, `setStatus` transition legality +
  terminal timestamps, pagination/payload caps, WS subscription validation.

---

## 7. Source files used to build this summary

All under `/Users/romeo/freeclaude/workspace/otter/`:

- `contexts/foundations-context.md` — plan 001 rollup
- `contexts/ticket-core-context.md` — plan 002 rollup
- `contexts/003-design-system-context.md` — plan 003 rollup
- `contexts/004-runtime-foundations-context.md` — plan 004 rollup
- `contexts/deferred.md` — cross-session deferred backlog

Cross-referenced for the file map (structure inspected, not re-read in full):
- `packages/{shared,persistence,core,web}/src/**` directory trees
- `plans/00{1,2,3,4}-*.md`, `implementations/**/impl-*-memory.md`,
  `channels/*-channel.log` (existence/role noted in §4)
