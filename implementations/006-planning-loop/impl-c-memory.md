# Impl-C memory — MIN-23 (approval + Attention) + MIN-33 (artifacts + Docs) + D-002-1

Branch `006-planning-loop`. Scope: backend approval/lifecycle/artifacts. Owned files:
`artifacts/writer.ts`, `routes/plans.ts`, `routes/docs.ts`, `routes/transitions.ts`,
`routes/index.ts`, plus `planApproval.test.ts`.

## What landed
- **`artifacts/writer.ts`** — `writeArtifact({dataDir, kind:'plan', name, content})`. Total
  (never throws). Path-safety: `isSafeSegment` (no `/`,`\`,`..`,absolute,empty,`.`/`..`) +
  defence-in-depth `relative(plansDir, abs)` escape check. Returns `relPath` relative to
  `dataDir`. Writes under `<dataDir>/artifacts/plans`. (B imports this.)
- **`routes/plans.ts`** — `registerPlanApprovalRoutes(app, db, emit?)`; builds plan/attention/
  comment/ticket repos from db.
  - `GET /api/tickets/:id/plans` (version DESC | 404), `GET /api/plans/:id` (| 404).
  - `POST /api/plans/:id/approve`: guards plan==='proposed' (409), ticket==='needs_user_approval'
    (409), canTransition→executable w/ planApproved=true (409). Effect: plans.approve →
    tickets.setApprovedPlan → applyTransition(needs_user_approval→executable) →
    attention.resolveByTicketKind. Persist THEN emit ticket_transitioned + attention_item_resolved.
  - `POST /api/plans/:id/send-back {feedback}`: guards feedback non-empty (400), proposed (409),
    needs_user_approval (409). Effect: plans.sendBack → comment(author 'user',
    metadata{kind:'plan_feedback', planId}) → applyTransition(→plannable) → resolve attention →
    emit. The →plannable transition on CHANNELS.project is what re-triggers B's orchestrator.
  - `GET /api/attention?status=open` → newest first (repo already orders).
  - Registered from `routes/index.ts`.
- **`routes/docs.ts`** — `registerDocsRoutes(app, db:unknown, paths:{dataDir})`. Reads disk
  (db unused). Lists `<dataDir>/artifacts/plans/*.md`, parses `<ticketId>-v<version>.md`.
  Viewer `GET /api/docs/artifacts/plan/:name` path-safe (same rules as writer) | 404.
  **B wires this into server.ts** — I do NOT edit server.ts.
- **`routes/transitions.ts`** (D-002-1) — build plan repo once; set
  `planApproved: plans.getApproved(ticket.id) !== undefined` in BOTH GET + POST ctx.
  lifecycle.ts untouched (permissive default stays; real value passed here).

## Gotchas
- `attention.list({status})` needs literal-narrowed status; an inline `?:` lost the narrowing
  (TS2345) — used explicit `if (status==='open'||status==='resolved')` branch.
- The blockStatus guard in canTransition fires before the planApproved guard, so the existing
  "in_progress blocked when blocked" route test keeps its `/blocked/` message. Good.
- Fastify decodes `%2f` so traversal in `:name` either fails isSafeSegment or 404s at router.

## Tests / state
- `planApproval.test.ts`: 12 tests (writer write+traversal; list/get plans; approve happy+409;
  send-back happy+400; D-002-1 exec blocked w/o plan + offered after approve; attention list;
  docs list+view+traversal). Registers registerDocsRoutes itself since server.ts (B) wires it.
- Full suite: **329 passed / 32 files** (green). `events.test.ts` + `claude.test.ts` flake under
  max parallelism (WS/fake-binary timing) — pass in isolation and on re-run; NOT my code.

## Channel
- Posted "writer ready" + `registerDocsRoutes` signature + ack of A's repos. B consumes both.
