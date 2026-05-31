# Impl-B memory — plan 007 attention (core API + producer repoint)

## Files read / written

| File | R/W | Note |
|---|---|---|
| plans/007-attention.md | R | frozen contracts §1, scope §2 Impl-B |
| channels/007-attention-channel.log | R/W | read C↔D handshake; appended my ACK to A |
| packages/shared/src/attention.ts | R | canonical types (Impl-A, matches §1.1) |
| packages/shared/src/events.ts | R | confirmed `attention_item_updated` present in EVENT_TYPES |
| packages/persistence/src/repositories/attention.ts | R | repo signatures (Impl-A, matches §1.2) |
| packages/persistence/src/migrations/0005_attention.sql | R(listed) | exists; ticket_id has FK to ticket(id) |
| packages/core/src/events/bus.ts | R | Emit type; publish(channel,type,payload) |
| packages/core/src/routes/plans.ts | R/W | repoint resolveBySource; removed GET /attention; header |
| packages/core/src/runtime/orchestrator.ts | R/W | repoint open(); emitAttentionCreated payload |
| packages/core/src/routes/index.ts | R/W | register registerAttentionRoutes |
| packages/core/src/routes/docs.ts | R | house style reference |
| packages/core/src/runtime/routes.ts | R | house style reference |
| packages/core/src/server.ts | R | confirmed no edit needed (wired via routes/index) |
| packages/core/src/routes/attention.ts | W (new) | the §1.4 API |
| packages/core/src/planApproval.test.ts | R/W | new open() shapes; assert attentionType/sourceType |
| packages/core/src/orchestrator.test.ts | R/W | assert attentionType/sourceType/sourceId (was kind/refId) |
| packages/core/src/attentionApi.test.ts | W (new) | GET filters, focus/dismiss/resolve, 404s, emits |

## What I implemented
- `routes/attention.ts`: GET /api/attention (filters status, attention_type, project, ticket — invalid status/type silently ignored, project→projectId, ticket→ticketId) returns AttentionItem[] newest-first via repo.list(). POST :id/{focus,dismiss,resolve} → `{item}`, 404 if `get(id)` misses BEFORE mutating (repo methods throw on missing). Persist THEN emit: resolve→`attention_item_resolved`, focus/dismiss→`attention_item_updated`, on channels attention+project. Payload {id,ticketId,attentionType,sourceType,sourceId,status}.
- Registered in routes/index.ts after registerPlanApprovalRoutes (server.ts unchanged — it calls registerTicketCoreRoutes).
- orchestrator.ts: replaced `attention.open({kind,ticketId,refId})` with canonical open({attentionType:'plan_approval',sourceType:'plan',sourceId:plan.id,ticketId,priority:'high',title:`Plan v${plan.version} awaiting approval`,summary:result.title||fallback,requiredAction}). emitAttentionCreated now carries attentionType/sourceType/sourceId (was kind/refId). Persist-before-broadcast kept.
- plans.ts: both approve + send-back now `attention.resolveBySource("plan", plan.id, "plan_approval")` (was resolveByTicketKind). Removed legacy GET /api/attention block (re-homed to routes/attention.ts). attention_item_resolved emits kept.

## Gist learned
- Impl-A landed the full canonical contract (shared types, repo, migration 0005, events) matching plan §1 exactly — zero deviations. ACKed with import evidence.
- Repo focus/dismiss/resolve THROW on missing id (don't return undefined) — routes 404 via get() first.
- `attention_items.ticket_id` has FK → ticket(id); tests must use real ticket ids (sourceId/projectId are free text, ticketId is not).
- Tests before (stale baseline): 130 pass / 4 fail. After: 143 pass / 0 fail (16 files). Added 10 attentionApi tests; repointed 3 (2 planApproval open shapes + 1 GET assertion, 1 orchestrator assertion). tsc -b core clean.
- Stray untracked pnpm-workspace.yaml/pnpm-lock.yaml at repo root (broken placeholder) — this is an npm-workspaces repo; run tests with `npx vitest run --root packages/core`, not `pnpm test`.
