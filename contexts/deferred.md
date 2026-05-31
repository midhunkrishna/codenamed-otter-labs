# Deferred Items

Cross-session backlog of work explicitly deferred during planning/execution
(actor pattern §4). The Orchestrator checks this file when planning a new theme
to see whether the new plan can absorb any of these. Remove an entry when it
lands.

---

## From plan 002 — ticket-core (MIN-15)

### D-002-1 · Plan-approval lifecycle guard
- **What:** MIN-15 invariants "executable requires approved plan" and "in_progress
  requires approved plan and no block". The state machine exposes a typed
  `planApproved` guard hook that is **permissive for MVP (always returns true)**.
- **Why deferred:** the plan-approval workflow doesn't exist yet (separate theme).
- **Wire when:** the plan-approval theme lands (MIN-23 `[ticket-core] Add plan
  approval flow`). Point `planApproved` at "an approved `plan` row exists for the
  ticket" and remove the permissive stub. Until then `→ executable` / `→ in_progress`
  are NOT gated on a plan.
- **Landed in:** plan 006 (planning-loop, MIN-23). `routes/transitions.ts` now sets
  `ctx.planApproved = plans.getApproved(ticket.id) !== undefined` in both the GET
  (nextTransitions) and POST handlers, so `→ executable` is hidden/blocked without an
  approved plan. The permissive default in `lifecycle.ts` is retained but the real
  value is always passed now. Test: "executable transition fails without approved plan".
- **status:** ✅ Done (plan 006)

---

## From plan 003 — design-system (MIN-43)

### D-003-1 · Non-default theme visual refinement (Notion / Jira / Celebration)
- **What:** all 4 themes are selectable and complete, but per invariant 2 the three
  non-Linear themes are "less visually refined" — their non-anchored palette values
  (surfaces, borders, muted text, `*Soft` alphas) were derived, not hand-tuned.
- **Why deferred:** MVP requires multi-theme *architecture* from day one, not polish.
- **Do when:** a design-polish pass is scheduled. Linear (default) is the refined one.
- **status:** Pending

### D-003-2 · Real pages behind the nav placeholders
- **What:** Attention / Runs / Approvals / Docs / Settings nav destinations currently
  render `<EmptyState>` placeholders in `App.tsx`.
- **Why deferred:** out of scope for the design-system foundation — these are their
  own tracked tickets.
- **Do when:** building those tickets — they MUST consume the new primitives
  (`AttentionCard`, `ApprovalCard`, `VerificationPacketTabs`, `Drawer`, etc.):
  Attention MIN-37/38, Approvals MIN-31, Runs MIN-32, Docs MIN-33, Settings MIN-34,
  Verification MIN-39/40/41/42, Forms MIN-27.
- **Landed so far:** Runs (plan 004, MIN-32), Docs (plan 006, MIN-33), **Attention (plan 007,
  MIN-37/38)** — `AttentionPage` now replaces the placeholder, consuming `AttentionCard`/
  `ExpandedAttentionCard` (+ the new `AttentionItemCard`). Still placeholders: Approvals
  (MIN-31), Settings (MIN-34).
- **status:** Pending (Approvals + Settings remain)

---

## From plan 004 — runtime-foundations (MIN-17/18/19/20/32/45)

### D-004-1 · Claude Code subprocess driver (the real executor) → MIN-44
- **What:** plan 004 builds the runtime *substrate* (project entity, run persistence,
  run API, event bus + WS gateway, Claude readiness detection, context packet, Runs
  console) but NOT the Node subprocess driver that actually spawns `claude`, streams
  stdout, normalizes output into `agent_run_events`, captures the Claude session id,
  and supports cancel/resume.
- **Why deferred:** user direction — this is its own ticket **MIN-44** `[claude-runtime]
  Implement Claude Code subprocess driver`.
- **Landed in:** plan 005 (claude-runtime, MIN-44). `claude/runner.ts`
  (`createClaudeCodeSubprocessRunner`, execa, stream-json, persist-before-broadcast,
  cancel via process-group kill, session note for resume) + `claude/streamParser.ts` +
  `POST /api/runs/:id/start`. The auto-trigger on plannable remains MIN-21.
- **status:** ✅ Done (plan 005)

### D-003-3 · Adopt `@vanilla-extract/dynamic` (optional)
- **What:** dynamic per-instance tone vars are applied via a local `inlineVars()`
  shim in `ui/tone.ts` (unwraps `createVar()`'s `var(--x)` → bare `--x`).
- **Why deferred:** `@vanilla-extract/dynamic` wasn't installed; the shim is the
  documented equivalent of `assignInlineVars` and works.
- **Landed in:** plan 005 (claude-runtime). Installed `@vanilla-extract/dynamic@2.1.5`
  (note: independently versioned at 2.x — there is no 4.x); `ui/tone.ts`'s `inlineVars()`
  now delegates to `assignInlineVars`; `unwrapVar` shim deleted; call sites untouched.
- **status:** ✅ Done (plan 005)

---

## From plan 006 — planning-loop (MIN-21/22/33/23)

### D-006-1 · Auto-replan as a project setting
- **What:** today, ANY entry into `plannable` (incl. a MIN-23 send-back) auto-starts a
  planning run if no active one exists (orchestrator). The user wants this to become a
  **per-project setting** (toggle whether send-back / plannable re-entry auto-re-plans).
- **Why deferred:** user direction during plan-006 discovery — the always-on behavior is
  the MVP; the toggle is an enhancement needing a project-settings surface that doesn't
  exist yet (Settings nav is still a placeholder).
- **Do when:** the project-settings theme lands. Gate
  `orchestrator.maybeStartPlanningRun` on a `project.autoReplan` flag.
- **status:** Pending

### D-006-2 · Execution-report artifacts → MIN-46
- **What:** MIN-33's scope also names execution summaries / diff artifacts under
  `artifacts/execution-reports`. Plan 006 built the generic `writeArtifact` helper +
  Docs view over **plan** artifacts only; the execution-report **producer** has no
  source yet (no execution run captures file edits / diffs).
- **Why deferred:** user direction — execution evidence is captured by
  **MIN-46** `[execution] Capture execution workspace changes and diff evidence`;
  execution reports must consume that real evidence, not invent it (MIN-33 invariant).
- **Do when:** MIN-46 lands. Add an execution-report writer (`kind:'execution'`), a Docs
  section listing `artifacts/execution-reports`, and ticket/run links to them.
- **status:** Pending

---

## From plan 007 — attention (MIN-36/37/38)

### D-007-1 · Live producers for the non-plan attention_types
- **What:** plan 007 builds the **canonical** `attention_items` model + APIs (MIN-36), the
  Attention page (MIN-37), and expandable per-type cards (MIN-38) for **all 6** canonical
  `attention_type` values. But the only **live auto-producer** wired is `plan_approval`
  (the planning orchestrator, carried over from plan 006). The other 5 types are fully
  modeled, API-creatable, UI-rendered, and tested — they just have **no source that emits
  them yet**. Each producer belongs to its source's own theme:
  - `permission_request` → a `permission` producer (permissions/approvals theme; `permission`
    table exists since 0001 but nothing writes attention from it).
  - `clarification_required` → **forms** (MIN-27 `[forms] comment-as-form`); on an agent
    question, open a `clarification_required` item over the `form` source. ✅ **DONE (plan
    008).** `createFormService` opens `clarification_required` over `sourceType:'form'` on
    form creation and `resolveBySource('form', formId, 'clarification_required')` on
    submit/dismiss. Live producer: the `<<<OTTER_FORM>>>` Claude output contract (a planning
    run emitting a form) **and** `POST /api/tickets/:id/forms`.
  - `verification_review` → **verification packets** (MIN-39–42); on execution-complete,
    open a `verification_review` item over the `verification_packet` source.
  - `execution_failed` / `run_stalled` → **execution runs** (execution theme + MIN-46). No
    execution-run producer or stall detector exists yet (only planning runs). On a failed
    execution run open `execution_failed`; on no-activity timeout open `run_stalled`.
- **Why deferred:** user direction during plan-007 discovery — model + UI + tests now; the
  producers ship with their owning tickets so attention indexes *real* evidence, not stubs.
- **Do when:** each owning theme lands. The seam is ready: call
  `attention.open({attentionType, sourceType, sourceId, ticketId?, runId?, title,
  summary, requiredAction, priority?})` from the producer, and `attention.resolveBySource(
  sourceType, sourceId, attentionType?)` when the source action completes. Wire the
  expanded-card live actions (MIN-38) to the real source API at the same time (today only
  `plan_approval` has approve/send-back endpoints; other types render context + link).
- **Update (plan 008):** `clarification_required` is now a **live producer** (forms). The
  remaining 4 (permission_request, verification_review, execution_failed, run_stalled) still
  ship with their owning themes.
- **Note (supersedes 006 model):** plan 007 replaced the minimal `attention_item` (singular)
  table from plan 006 with the canonical `attention_items` (plural) table and repointed the
  orchestrator + plan-approval routes onto it (migration `0005`, additive + backfill). The
  legacy `attention_item` table is dormant (not dropped).
- **status:** Pending

---

## Packaging & distribution (from the npm/npx packaging discussion)

### D-PKG-1 · Ship Otter as a single npx-runnable package
- **What:** make `npx otter-labs` (or `npx ./otter-labs-*.tgz`) start the full app from any
  directory. Required pieces (none optional for a self-contained npx package):
  1. **Bundle the monorepo** — the four workspace packages depend on each other via private
     `"*"` versions that won't resolve from a tarball/registry, so esbuild-bundle
     `core + shared + persistence` into `dist/cli.js`; keep real runtime deps declared so
     `npm install` builds them: `better-sqlite3`, `fastify`, `@fastify/websocket`,
     `@fastify/static` (NEW), `execa`.
  2. **Build TS→JS + serve the UI same-origin** — `bin → dist/cli.js` with a plain
     `#!/usr/bin/env node` shebang (drop the tsx-at-runtime shebang); add `@fastify/static`
     to serve the built web bundle so one port serves API + UI. No web-client change needed
     (it already uses relative `/api` and derives `/ws` from `location.host`).
  3. **Ship non-JS assets** — migrations resolve `migrations/*.sql` **relative to the module
     at runtime** (`migrations.ts` uses `import.meta.url`), and the web assets are static
     files; the build must copy `migrations/*.sql` + `web/dist` next to the bundle and list
     them in `files`. `.otter-labs` still anchors to invocation cwd via `INIT_CWD`.
- **Distribution options (identical build, different publish target):**
  - **A · local tarball** (recommended to start): `npm pack` → `npx ./otter-labs-0.1.0.tgz`
    from any dir / `npm i -g ./*.tgz`. No registry/account; private.
  - **B · public npm**: `npm publish` → `npx otter-labs` anywhere. Needs the name + public.
  - **C · private registry / GitHub Packages**: `npx @scope/otter-labs` with auth.
  A→B/C is zero rework. Do A now, B/C later if desired.
- **Landed:** built with **D-PKG-2 option A (better-sqlite3)**. New `bin.ts` entrypoint
  (cli.ts is now side-effect-free — avoids the npx symlink self-run footgun); `server.ts`
  serves the built UI same-origin via `@fastify/static` when a `web/` dir is present (dev
  unaffected — Vite still serves there); `scripts/build-dist.mjs` esbuild-bundles
  core+shared+persistence → `dist/cli.js` (externals: better-sqlite3, fastify,
  @fastify/websocket, @fastify/static, execa), copies `migrations/*.sql` + `web/`, writes a
  publishable manifest (`engines.node >=20`). Root scripts: `build:dist`, `pack:app`.
  **Verified end-to-end:** installed the tarball into a scratch dir (native better-sqlite3
  built, bin linked) and ran it — UI + API + SPA fallback served on one port, ticket
  round-trips, `.otter-labs/otter.db` created in the invocation cwd.
- **Gotchas for whoever publishes/extends this:**
  - `pack:app` packs from **inside** `dist/` (`cd dist && npm pack --pack-destination ..`).
    A bare `npm pack ./dist` run *under `npm run`* is hijacked by the workspace root and
    packs the private root package instead (no bin/deps) — do not "simplify" it back.
  - **Running a LOCAL tarball:** `npx ./otter-labs-*.tgz` does NOT work (npx tries to exec
    the `.tgz`). Use `npm i -g ./otter-labs-*.tgz && otter-labs`, or `npm install
    ./otter-labs-*.tgz` in a project then `npx otter-labs`. Once **published** (B/C),
    `npx otter-labs` works directly.
  - This repo's `node` comes from **mise** (`.mise.toml`); a machine without it just needs
    any Node ≥20 on PATH.
- **status:** ✅ Done (option A). B/C (publish to a registry) remain available with no rework.

### D-PKG-2 · Decide the SQLite driver for distribution (better-sqlite3 native risk)
- **What:** `better-sqlite3` is a **native addon**. On `npm`/`npx` install it normally
  downloads a prebuilt `.node` (smooth on macOS x64/arm64, Linux glibc x64/arm64, Win x64,
  for Node versions the release covers — 11.10 already covers Node 24). It falls back to a
  **source compile** (needs python3 + C++ toolchain) when: (a) the user's Node is newer than
  the better-sqlite3 release's prebuilds — made *more likely* by our `engines: node >=24`
  pin; (b) uncommon platform/arch — Alpine/musl (Docker!), Windows arm64, 32-bit ARM, BSD;
  (c) GitHub Releases unreachable (offline / corporate proxy); (d) slower npx cold start.
- **Usage depth (checked):** better-sqlite3 is imported widely but almost entirely as a
  *type*. API-specific usage is small + contained: `db.pragma(...)` ×2 (`database.ts`),
  `db.transaction(fn)` ×4 (`migrations.ts`, `transitions.ts`, `plans.ts`, `runEvents.ts`);
  everything else is plain `prepare().run/get/all`.
- **Options:**
  - **A · keep better-sqlite3, harden:** stay current (on 11.10) + **relax `engines.node`**
    to a prebuild-covered range and document "needs Node X–Y." Lowest effort; native risk
    remains for the edge cases above. OK if the audience is devs on normal machines.
  - **B · migrate persistence to `node:sqlite`** (SQLite built into Node ≥22.5/24):
    eliminates the native-install failure modes entirely (best for `npx`-to-strangers and
    Docker). Cost: still **experimental** in Node 24 (emits a warning) + a contained refactor
    — no `db.transaction(fn)` helper and no `db.pragma()` (use `db.exec("PRAGMA …")` + manual
    `BEGIN/COMMIT`); `prepare/run/get/all` map ~1:1; the 256+ persistence tests guard it.
  - (Pure-JS/WASM — sql.js / wa-sqlite / @libsql — bigger change, different persistence
    semantics; `node:sqlite` is the natural fit.)
- **Recommendation:** if the goal is "anyone can `npx otter-labs` and it just runs" → **B**.
  If "I + a few devs run it locally" → **A** is fine. A quick spike on B (swap the driver,
  run the suite) would show the real diff before committing.
- **Do when:** before/with D-PKG-1 (it sets the dependency story).
- **Decision:** **A — keep better-sqlite3** (user, packaging session). Manifest
  `engines.node` relaxed to `>=20` for prebuild coverage. Native install verified working
  via npm prebuild on macOS arm64 / Node 24.
- **status:** ✅ Decided (A). **Option B (`node:sqlite`) remains the escape hatch** if
  distribution to strangers/Docker later hits native-install friction — usage is contained
  (`pragma` ×2, `transaction` ×4), so the migration stays small.

---

## From plan 008 — comment-context (MIN-26/27)

### D-008-1 · Extra parked run states
- **What:** plan 008 uses only `waiting_on_user_input` (already in `RUN_STATUSES`) for the
  comment-resume seam. The user named further parked states the runtime should eventually
  model: `paused`, `failed_recoverable`, `waiting_on_permission_resolved`.
- **Do when:** permissions/execution themes land. Add the statuses to `RUN_STATUSES` (additive)
  and extend the forwarder's resumable-state set in `forwarding/forwarder.ts` (`findResumableRun`).
- **status:** Pending

### D-008-2 · Deferred form field types
- **What:** MVP supports `short_text/long_text/single_select/multi_select/boolean`. Deferred:
  `file_upload/date/number/code_reference/secret_input` (MIN-27 explicitly defers these).
- **Do when:** a richer-forms pass is scheduled. Extend `FORM_FIELD_TYPES` + `validateAnswers`
  in `@otter/shared/forms.ts` and add the field renderers in `ui/FormCommentCard.tsx`.
- **status:** Pending

### D-008-3 · Structured form-dismissal columns
- **What:** `forms.dismiss(reason, byUserId)` records who/why by appending an audit note to the
  form `description` (migration `0006` has no dedicated columns).
- **Do when:** dismissal needs structured querying. Add `dismiss_reason` / `dismissed_by`
  columns in a later additive migration and repoint the repo.
- **status:** Pending
