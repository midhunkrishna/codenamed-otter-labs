# Impl-A memory — persistence + domain (006 planning-loop)

Scope: plan §2.1, §2.2, §2.3 — migration 0004, shared `plans`/`attention` types,
`Ticket.approvedPlanId`, plan + attention repositories, ticket `setApprovedPlan`, tests.

## 1. Files read / written

| File | R/W | Note |
|---|---|---|
| plans/006-planning-loop.md | R | frozen contracts §0–§5 |
| channels/006-planning-loop-channel.log | R/W | read orchestrator freeze; posted "repos ready" |
| packages/persistence/src/migrations/0001_init.sql | R | existing `plan` table shape |
| packages/persistence/src/migrations/0002_ticket_core.sql | R | migration style |
| packages/persistence/src/migrations/0003_runtime.sql | R | migration style |
| packages/persistence/src/migrations.ts | R | lexical discovery, per-file txn |
| packages/persistence/src/repositories/{runs,tickets,transitions}.ts | R | repo style, row→camelCase |
| packages/persistence/src/runtime.test.ts | R | temp-db test helper pattern |
| packages/shared/src/{runs,domain,index}.ts | R | shared-type style |
| packages/persistence/src/migrations/0004_planning_approval.sql | W | §2.1 verbatim intent |
| packages/shared/src/plans.ts | W | §2.2 Plan + planning-output contract types |
| packages/shared/src/attention.ts | W | §2.2 AttentionItem types |
| packages/shared/src/domain.ts | W | added `approvedPlanId: string \| null` to Ticket |
| packages/shared/src/index.ts | W | re-export plans + attention |
| packages/persistence/src/repositories/plans.ts | W | createPlanRepository |
| packages/persistence/src/repositories/attention.ts | W | createAttentionRepository |
| packages/persistence/src/repositories/tickets.ts | W | map approved_plan_id; setApprovedPlan |
| packages/persistence/src/index.ts | W | export both new factories |
| packages/persistence/src/planning.test.ts | W | 13 repo/migration tests |

## 2. What I implemented

- **Migration 0004** (additive): plan `version`/`title`/`run_id`/`artifact_path` columns;
  partial unique index `idx_plan_one_approved` (one approved plan per ticket);
  `ticket.approved_plan_id`; `attention_item` table + `idx_attention_ticket` and partial
  unique `idx_attention_one_open` (one open per ticket+kind).
- **Shared types**: `Plan`/`PLAN_STATUSES`, planning-output contract markers/types
  (`PLAN_MARKER_START/END`, `ParsedPlanResult`, …); `AttentionItem`/`ATTENTION_KINDS`/
  `ATTENTION_STATUSES`; `Ticket.approvedPlanId`.
- **Plan repo**: version = max(version)+1 per ticket; `approve` is the only writer of
  `'approved'` and supersedes the prior approved row (inside a txn, so the partial unique
  index never sees two approved rows); no content/version updater (immutable).
- **Attention repo**: idempotent `open` (returns existing open item per ticket+kind, no
  mutation); `resolve`, `resolveByTicketKind`, `list(status/ticket)` newest-first.
- **Ticket repo**: `approved_plan_id`→`approvedPlanId`; `setApprovedPlan(id, planId|null)`.

## 3. Gotchas for B / C / D (gist)

- **`approve` supersedes**: approving plan v2 sets any prior `approved` plan to
  `superseded`. The repo handles this atomically; callers (C's approve route) just call
  `plans.approve(id)`. It THROWS if the plan isn't `proposed` — guard in the route first
  and translate to 409.
- **`open` is idempotent, NOT an upsert**: calling `open` again with a new `refId` returns
  the *existing* open item unchanged. To rotate the ref, `resolve` then `open`.
- **Partial unique indexes** only constrain `status='open'` / `status='approved'`. After
  `resolve`/`supersede` you may open/approve again freely.
- **Legacy `plan.status` default is still `'draft'`** (0001). New rows are inserted as
  `'proposed'` via `createProposed`. `PLAN_STATUSES` does NOT include `'draft'`; any legacy
  draft row would map to a PlanStatus outside the union — none exist in fresh DBs, ignore.
- **`approvedPlanId` is required on the shared `Ticket`** now. `@otter/web` keeps its own
  node-free mirror — D must add `approvedPlanId` to that mirror separately (client.ts).
- `runId` on `createProposed` is `string | null` (planning runs pass the run id; tests
  pass null). `setArtifactPath` is the only post-creation plan mutator besides approve/sendBack.

## 4. Test delta

293 → 306 (13 new tests in `packages/persistence/src/planning.test.ts`). Full suite green.
