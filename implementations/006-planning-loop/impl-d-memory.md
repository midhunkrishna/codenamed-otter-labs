# Impl-D memory — web frontend (MIN-23 plan tab/Attention + MIN-33 Docs)

## Scope
Web UI only (`packages/web/src/**`). Built against FROZEN §2.6 HTTP shapes; tests
mock fetch (no dependency on B/C runtime).

## What I built
### API mirrors (node-free, mirror `api/runs.ts`)
- `api/plans.ts` — `Plan`/`PlanStatus` mirror + `PlanDecisionResult{ticket,plan}`;
  `getTicketPlans`, `getPlan`, `approvePlan`, `sendBackPlan(planId, feedback)`.
- `api/attention.ts` — `AttentionItem` mirror; `listAttention(status='open')`.
- `api/docs.ts` — `ArtifactSummary` + `ArtifactContent`; `listArtifacts`, `getArtifact(name)`.
- `api/client.ts` — added `approvedPlanId: string | null` to the `Ticket` mirror.

### UI
- `components/TicketDetail.tsx` — Plan section (`region` name "Plan"): loads
  `getTicketPlans` in `load()`, renders latest plan (version DESC = `plans[0]`) with
  `PlanCard` + `CodeBlock(content)`. When ticket `needs_user_approval` && latest plan
  `proposed`: Approve button + required-feedback textarea + Send back button (disabled
  until feedback non-empty). Both refetch via `load()` + `onMutated()`. Decision visibility
  follows ticket.status + plan.status (no invented lifecycle). Comment stream unchanged
  (send-back feedback surfaces there as a backend comment).
- `components/AttentionPage.tsx` — lists `listAttention('open')` via `AttentionCard`
  (type="plan", priority="high"); click opens ticket in a Drawer + TicketDetail (resolve
  flow). Empty state when none.
- `components/DocsPage.tsx` — lists `listArtifacts()`; click opens `getArtifact(name).content`
  in a Drawer via `CodeBlock`. Empty state when none.
- `App.tsx` — wired `attention`→AttentionPage, `docs`→DocsPage (replaced placeholders).

### Tests (Vitest + RTL, mock fetch)
- `TicketDetail.plan.test.tsx` (5): renders proposed plan; shows Approve/Send back;
  approve POSTs; send-back requires feedback + POSTs body.feedback; controls hidden when
  not proposed.
- `AttentionPage.test.tsx` (3): lists items; click opens ticket detail; empty state.
- `DocsPage.test.tsx` (3): lists artifacts; opens content; empty state.
- `Board.test.tsx` — added `approvedPlanId:null` to fixture + `/plans` → `[]` handler
  (TicketDetail now fetches plans).

## §2.6 response fields consumed (verify vs B/C real responses)
- `GET /api/tickets/:id/plans` → `Plan[]`: id, ticketId, runId, version, title, status,
  content, artifactPath, createdAt, updatedAt. Ordering assumed version DESC (uses [0]).
- `POST /api/plans/:id/approve` → `{ticket, plan}`. Body not read on success; refetch via load().
- `POST /api/plans/:id/send-back` body `{feedback}` → `{ticket, plan}`. Same.
- `GET /api/attention?status=open` → `AttentionItem[]`: id, ticketId, detail used (+ kind/status/refId present).
- `GET /api/docs/artifacts` → `ArtifactSummary[]`: name, relPath, modifiedAt, ticketId?, version? used.
- `GET /api/docs/artifacts/plan/:name` → `{name, content}`: content used.
- `Ticket.approvedPlanId` consumed on the type level; status drives decision visibility.

## Status
Full suite green: 329 (baseline 306). `npm -w @otter/web run build` passes.
All visuals via design-system primitives (PlanCard/AttentionCard/CodeBlock/Drawer/Button/
EmptyState/PageHeader) — no raw colors, no primitive restyling.
