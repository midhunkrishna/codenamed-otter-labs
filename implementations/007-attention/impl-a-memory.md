# Impl-A memory — plan 007 attention (backend foundation)

## Files read / written

| File | R/W | Note |
|---|---|---|
| plans/007-attention.md | R | §0–§4; §1 frozen contracts authoritative |
| packages/shared/src/attention.ts | W | rewrote to canonical §1.1 |
| packages/shared/src/events.ts | W | appended `attention_item_updated` (additive) |
| packages/shared/src/index.ts | R | already re-exports attention.js |
| packages/shared/src/runs.ts | R | DEFAULT_PROJECT_ID='local-project' lives here |
| packages/persistence/src/migrations/0005_attention.sql | W | new canonical table + 3 indexes + backfill |
| packages/persistence/src/migrations/0004_planning_approval.sql | R | legacy attention_item (singular) schema |
| packages/persistence/src/migrations.ts | R | discovers *.sql lexically; 0005 sorts after 0004 |
| packages/persistence/src/repositories/attention.ts | W | rewrote to AttentionRepository §1.2 |
| packages/persistence/src/repositories/events.ts | R | house style (rowTo… mapper) |
| packages/persistence/src/attention.test.ts | W | NEW — MIN-36 test list (27 tests) |
| packages/persistence/src/planning.test.ts | W | removed obsolete legacy-attention describe + import + durability assertion |
| packages/persistence/src/index.ts | R | exports createAttentionRepository (name kept) |
| channels/007-attention-channel.log | W | posted frozen sigs + migration name to Impl-B |

## What I implemented

- **shared/attention.ts**: ATTENTION_TYPES (6), ATTENTION_SOURCE_TYPES (6), ATTENTION_STATUSES (6),
  ATTENTION_PRIORITIES (4), ATTENTION_ACTIVE_STATUSES (open|focused), AttentionItem, OpenAttentionInput,
  AttentionListFilter. Node-free.
- **events.ts**: additive append of `attention_item_updated`. Existing entries untouched/in order.
- **0005_attention.sql**: `attention_items` (plural) + idx_attn_items_project / _ticket / _one_active
  (partial unique on (source_type,source_id,attention_type) WHERE status IN (open,focused)). INSERT OR
  IGNORE backfill from legacy `attention_item` (singular) -> attention_type/source_type='plan'/'plan_approval',
  priority 'high', literal title/required_action. Legacy table left dormant.
- **repositories/attention.ts** (createAttentionRepository kept): open (enum-validates type/source/priority,
  THROWS unknown; idempotent via findActiveBySource on open|focused; defaults project='local-project',
  priority='normal', metadata={} JSON-serialized), get/list (lazy-expire: UPDATE open|focused past expires_at
  -> expired before read; list newest-first, filters status/attentionType/projectId/ticketId), focus/dismiss/
  resolve (setStatus; dismiss stamps dismissed_at and NEVER touches source; resolve stamps resolved_at; THROW
  on unknown id), resolveBySource(sourceType, sourceId, attentionType?).
- **Tests**: create from each of 6 source types, list-by-project, filter-by-type, filter-by-ticket,
  reject unknown type/source/priority, dedup active per source+type (no dup, no mutation, re-open after
  resolve, focused counts as active), resolve/dismiss/focus + unknown-id throws, resolveBySource, metadata
  round-trip (nested) + default {}, lazy-expire (past->expired, future stays open), backfill round-trip,
  durability across reopen.

## Gist / learnings

- `@otter/shared` resolves from `src/index.ts` (package main = ./src/index.ts), so edits are live for all
  consumers with NO rebuild; stale dist/ is irrelevant for ts/vitest.
- The legacy plan-006 `attention_item` (SINGULAR) table and the new `attention_items` (PLURAL) coexist.
  Migration 0004 is untouched (additive rule). 006's repo API (open({ticketId,kind,refId}),
  resolveByTicketKind) was fully replaced — its persistence-package tests lived in planning.test.ts and were
  removed there (canonical coverage now in attention.test.ts). Impl-B must repoint orchestrator.ts +
  routes/plans.ts (core package, their lane), or core tests will fail to compile.
- Migration runner = lexical sort of *.sql; numeric prefix ordering is what makes 0005 apply after 0004.
- Baseline persistence tests 59 -> 82 (planning 13->9 after removing 4 obsolete legacy-attention tests; +27 new).
