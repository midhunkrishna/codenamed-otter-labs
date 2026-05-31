# Plan 007 — Attention (MIN-36 / MIN-37 / MIN-38)

> Theme: the **unified user action queue**. Backend canonical model + APIs (MIN-36),
> the Attention page with sibling filters + live queue (MIN-37), and expandable
> in-place cards with per-type expanded content (MIN-38).
> Branch `007-attention` (off `master`). Actor pattern: orchestrator + 4 implementors.

---

## 0. Decisions locked with the user (deliberate discovery)

1. **Data model = new canonical table + repoint.** Plan 006 shipped a *minimal*
   `attention_item` (singular) table (`kind='plan_approval'` only, status open/resolved).
   MIN-36 supersedes it with a canonical `attention_items` (plural) table. We create the
   new table in migration `0005`, **backfill** the open/resolved rows from the legacy
   table, and **repoint** the shipped 006 producers/consumers (orchestrator, plan-approval
   routes, AttentionPage) onto the new model. Migration stays **additive** — the legacy
   `attention_item` table is left dormant (not dropped; no data loss).
2. **Producer scope = `plan_approval` only (live).** All 6 canonical `attention_type`
   values are fully modeled, API-backed, UI-rendered (per-type cards), and tested. But the
   **only live auto-producer** is `plan_approval` (the orchestrator, existing behavior).
   The other 5 producers are **deferred to their owning tickets** and recorded in
   `contexts/deferred.md` (D-007-1). Items of those types can still be created via the
   repository/API (and are, in tests).

### Orchestrator-decided minor points (non-blocking, documented here)

- **Expiry = lazy.** No background sweeper/timer. `list()`/`get()` mark any `open`/`focused`
  item whose `expires_at` is in the past as `expired` on read (deterministic, testable).
- **Events = additive.** `EVENT_TYPES` gains `attention_item_updated` (focus/dismiss/
  expire/supersede). `attention_item_created` fires on `open`; `attention_item_resolved`
  fires on `resolve`. Channel `attention` already exists.
- **Frontend `attention_type` alignment.** The plan-003 design tokens used a 5-value
  presentational `AttentionType` (`permission|plan|question|verification|failure`). It is
  re-keyed to the **6 canonical backend values** (`run_stalled` shares the `failure` tone).
  The frontend MUST consume the backend enum — it does not invent types (MIN-37/38 invariant).

---

## 1. Frozen contracts (orchestrator-owned — build against these)

### 1.1 `@otter/shared/src/attention.ts` (REWRITE — canonical)

```ts
export const ATTENTION_TYPES = [
  "permission_request",
  "plan_approval",
  "clarification_required",
  "verification_review",
  "execution_failed",
  "run_stalled",
] as const;
export type AttentionType = (typeof ATTENTION_TYPES)[number];

export const ATTENTION_SOURCE_TYPES = [
  "permission_request", "plan", "form", "verification_packet", "agent_run", "ticket",
] as const;
export type AttentionSourceType = (typeof ATTENTION_SOURCE_TYPES)[number];

export const ATTENTION_STATUSES = [
  "open", "focused", "resolved", "dismissed", "expired", "superseded",
] as const;
export type AttentionStatus = (typeof ATTENTION_STATUSES)[number];

export const ATTENTION_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type AttentionPriority = (typeof ATTENTION_PRIORITIES)[number];

/** Open statuses an item can be acted on in (drives the at-most-one-open index). */
export const ATTENTION_ACTIVE_STATUSES = ["open", "focused"] as const;

export interface AttentionItem {
  id: string;
  projectId: string;
  attentionType: AttentionType;
  sourceType: AttentionSourceType;
  sourceId: string;
  ticketId: string | null;
  runId: string | null;
  status: AttentionStatus;
  priority: AttentionPriority;
  title: string;
  summary: string;
  requiredAction: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  dismissedAt: string | null;
  expiresAt: string | null;
}

export interface OpenAttentionInput {
  projectId?: string;                 // default DEFAULT_PROJECT_ID ('local-project')
  attentionType: AttentionType;
  sourceType: AttentionSourceType;
  sourceId: string;
  ticketId?: string | null;
  runId?: string | null;
  priority?: AttentionPriority;       // default 'normal'
  title: string;
  summary?: string;
  requiredAction: string;
  metadata?: Record<string, unknown>;
  expiresAt?: string | null;
}

export interface AttentionListFilter {
  status?: AttentionStatus;
  attentionType?: AttentionType;
  projectId?: string;
  ticketId?: string;
}
```

`@otter/shared/src/events.ts` — additive only: append `"attention_item_updated"` to
`EVENT_TYPES`.

### 1.2 `AttentionRepository` (persistence)

```ts
export interface AttentionRepository {
  /** Idempotent per (sourceType, sourceId, attentionType) while status is open|focused:
   *  returns the existing active item if present (no dup, no mutation), else inserts. */
  open(input: OpenAttentionInput): AttentionItem;
  get(id: string): AttentionItem | undefined;                       // lazy-expires on read
  list(filter?: AttentionListFilter): AttentionItem[];              // newest first; lazy-expires
  focus(id: string): AttentionItem;     // -> 'focused'
  dismiss(id: string): AttentionItem;   // -> 'dismissed' + dismissed_at; does NOT touch source
  resolve(id: string): AttentionItem;   // -> 'resolved'  + resolved_at
  /** Resolve the active item for a source (optionally narrowed by type); returns it or undefined. */
  resolveBySource(sourceType: AttentionSourceType, sourceId: string,
                  attentionType?: AttentionType): AttentionItem | undefined;
}
export function createAttentionRepository(db: Database.Database): AttentionRepository;
```

Unknown `attentionType`/`sourceType`/`priority` → repo throws (validated against the enums).

### 1.3 Migration `0005_attention.sql` (additive + backfill)

```sql
CREATE TABLE IF NOT EXISTS attention_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  attention_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  ticket_id TEXT REFERENCES ticket(id) ON DELETE CASCADE,
  run_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal',
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  required_action TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  resolved_at TEXT,
  dismissed_at TEXT,
  expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_attn_items_project ON attention_items(project_id, status);
CREATE INDEX IF NOT EXISTS idx_attn_items_ticket  ON attention_items(ticket_id);
-- At most ONE active (open|focused) item per (source_type, source_id, attention_type):
CREATE UNIQUE INDEX IF NOT EXISTS idx_attn_items_one_active
  ON attention_items(source_type, source_id, attention_type)
  WHERE status IN ('open','focused');

-- Backfill legacy plan-006 rows (kind was always 'plan_approval', source = plan).
INSERT OR IGNORE INTO attention_items
  (id, project_id, attention_type, source_type, source_id, ticket_id, status,
   priority, title, summary, required_action, metadata_json, created_at, updated_at, resolved_at)
SELECT id, 'local-project', 'plan_approval', 'plan', COALESCE(ref_id, id), ticket_id,
       status, 'high', 'Plan awaiting approval', COALESCE(detail, ''),
       'Approve plan or send back with feedback.', '{}', created_at, updated_at, resolved_at
FROM attention_item;
```

### 1.4 HTTP API (`core/src/routes/attention.ts`)

- `GET  /api/attention` — query: `status`, `attention_type`, `project`, `ticket` (all
  optional). Returns `AttentionItem[]` newest-first. (The legacy `GET /attention` in
  `routes/plans.ts` is REMOVED and re-homed here.)
- `POST /api/attention/:id/focus`   → `{ item }` · 404 if missing.
- `POST /api/attention/:id/dismiss` → `{ item }` · 404 if missing.
- `POST /api/attention/:id/resolve` → `{ item }` · 404 if missing.
- Each mutation persists, THEN emits (`attention_item_resolved` for resolve;
  `attention_item_updated` for focus/dismiss) on channels `attention` + `project`.

### 1.5 Web mirror + card contract (node-free bundle)

`web/src/api/attention.ts` (Impl-C owns) exports the local VM mirror + calls:

```ts
export type AttentionType = /* 6 canonical values (string union, mirror) */;
export interface AttentionItemVM { /* camelCase mirror of AttentionItem */ }
export function listAttention(filter?: { status?; attentionType?; project? }): Promise<AttentionItemVM[]>;
export function focusAttention(id): Promise<AttentionItemVM>;
export function dismissAttention(id): Promise<AttentionItemVM>;
export function resolveAttention(id): Promise<AttentionItemVM>;
```

`web/src/ui` card contract (Impl-D owns) — the feature card the page renders:

```ts
interface AttentionItemCardProps {
  item: AttentionItemVM;
  expanded: boolean;
  onToggleExpand(): void;
  onResolved(): void;   // called after a source action mutates+resolves -> page refetches
}
export function AttentionItemCard(props: AttentionItemCardProps): JSX.Element;
```

`AttentionItemCard` renders collapsed by default; when `expanded`, renders the
`ExpandedAttentionCard` (sticky) with per-`attentionType` body. Unknown type → generic
fallback (never throws).

### 1.6 attention_type → tone/label/filter map (frontend, Impl-D owns design/tokens)

| attention_type | tone | label | filter group |
|---|---|---|---|
| permission_request | amber | "Permission required" | Permissions |
| plan_approval | blue | "Plan approval required" | Plans |
| clarification_required | violet | "Clarification required" | Questions |
| verification_review | orange | "Verification required" | Verification |
| execution_failed | red | "Execution failed" | Failures |
| run_stalled | red | "Run stalled" | Failures |

Sibling filters (MIN-37): `All` (everything), `Permissions`, `Plans`, `Questions`,
`Verification`, `Failures` (= execution_failed ∪ run_stalled).

---

## 2. Work split — 4 parallel implementors (Agent Teams)

Backend lane (A→B) and frontend lane (C↔D) are largely independent; producer/consumer
pairs coordinate via `channels/007-attention-channel.log`.

### Impl-A · Persistence + shared contract (backend foundation)
- `shared/src/attention.ts` (rewrite to §1.1) + `shared/src/events.ts` (+`attention_item_updated`).
- `persistence/src/migrations/0005_attention.sql` (§1.3).
- `persistence/src/repositories/attention.ts` (rewrite to §1.2; lazy-expire; enum validation).
  Keep the export name `createAttentionRepository`.
- Tests `persistence/src/attention.test.ts` — MIN-36 test list (create from each source type,
  list by project, filter by type, reject unknown type, dedup active per source+type, resolve,
  dismiss, metadata preserved, backfill round-trips). Red-green-refactor.
- **Post the frozen repo signatures + migration filename to the channel; Impl-B consumes.**

### Impl-B · Core API + producer repoint (backend routes/orchestrator)
- `core/src/routes/attention.ts` (§1.4) + register in `routes/index.ts`/`server.ts`.
- Repoint `runtime/orchestrator.ts`: replace `attention.open({kind:'plan_approval',ticketId,
  refId:plan.id})` with the canonical `open({attentionType:'plan_approval', sourceType:'plan',
  sourceId:plan.id, ticketId, priority:'high', title, summary, requiredAction})`.
- Repoint `routes/plans.ts` approve + send-back: `attention.resolveBySource('plan', plan.id,
  'plan_approval')` (was `resolveByTicketKind`); REMOVE the old `GET /attention` block.
- Update `core/src/planApproval.test.ts` expectations for the new shapes; add
  `core/src/attentionApi.test.ts` (GET filters, focus/dismiss/resolve, 404s, emits).
- **ACK Impl-A's contract on the channel (cite the import).** Depends on A's repo.

### Impl-C · Web Attention page + filters + live (MIN-37)
- `web/src/api/attention.ts` (rewrite to §1.5 — canonical VM + calls).
- `web/src/components/AttentionPage.tsx` (rewrite): sibling filter row (All/Permissions/
  Plans/Questions/Verification/Failures) with **live count badges**; HTTP load then
  `connectEvents` subscribe to `CHANNELS.attention` (refetch on `attention_item_*`);
  render `AttentionItemCard` list; **queue stability** — new live items append without
  collapsing/scrolling the currently-expanded card (track expanded id; new items don't
  reset it). Generic fallback handled inside the card.
- `App.tsx` — Attention is already in `NAV_ITEMS`; ensure it routes here (sidebar link test).
- Tests `web/src/components/AttentionPage.test.tsx` — MIN-37 list (sidebar link, each filter,
  unknown type fallback, WS item appears without moving focused card).
- **Owns `api/attention.ts` (the VM type Impl-D imports); post it to the channel early.**

### Impl-D · Web expandable cards (MIN-38)
- `web/src/ui/AttentionCard.tsx` + `ExpandedAttentionCard.tsx` — migrate `type:AttentionType`
  to the 6 canonical values; `design/tokens.ts` attention section (§1.6); `ui/types.ts` props.
- `web/src/ui/AttentionItemCard.tsx` (§1.5) — collapsed↔expanded (sticky), per-`attentionType`
  expanded body, generic fallback, "link to full ticket/run" always present. Reuse existing
  primitives: `PlanCard` (plan_approval), `VerificationPacketTabs` (verification_review),
  `FormCommentCard` (clarification_required), `ApprovalCard`/MetadataRow (permission_request),
  `CodeBlock`+run link (execution_failed/run_stalled).
  - **Live actions wired ONLY where a backend exists**: plan_approval → existing approve /
    send-back endpoints (then `onResolved`). The other types render context + "link to full
    ticket/run" + a disabled/stub primary action with a note (their source APIs are deferred,
    D-007-1). The card still calls `resolveAttention`/`dismissAttention` for the generic
    resolve/dismiss affordance.
- Tests `web/src/ui/AttentionItemCard.test.tsx` — MIN-38 list (expand in place, plan approve/
  send-back, each type renders its body, unknown→fallback, live update doesn't auto-collapse).
- **ACK Impl-C's VM type on the channel.** Depends on C's `api/attention.ts` type (frozen here).

---

## 3. Invariants → where satisfied (acceptance map)

| Invariant (ticket) | Where |
|---|---|
| Attention not source of truth; source object authoritative | repo never mutates source; dismiss does not touch source (A) |
| attention_type ∈ canonical enum; reject unknown | repo enum-validates; "reject unknown attention_type" test (A) |
| source_type + source_id required | `OpenAttentionInput` requires them; NOT NULL columns (A) |
| ≤1 open item per (source, type) | partial unique index + idempotent `open` (A) |
| Resolving source resolves matching item | plans.ts approve/send-back → `resolveBySource` (B) |
| Dismiss doesn't mutate source | `dismiss` only flips status (A); UI dismiss calls resolve/dismiss API (D) |
| Expired not actionable | lazy-expire on read; expired filtered from active lists (A) |
| Create/resolve emit events | orchestrator `attention_item_created`; resolve `attention_item_resolved` (B) |
| attention_type drives UI, not invented in FE | FE consumes backend enum; tone/label/filter map (C/D) |
| Live updates don't steal focus | expanded id preserved across refetch; new items append (C) |
| Unknown type → safe generic card | fallback branch in `AttentionItemCard` (D) |
| Expanded action mutates source then resolves | plan_approval path: approve → resolve (D) |
| Uses MIN-43 design primitives | PlanCard/VerificationPacketTabs/FormCommentCard/etc (D) |

---

## 4. Coordination & process (actor pattern)

- **Channel:** `channels/007-attention-channel.log` (`from:`/`to:`/`message:`, `>>`, <4KB).
  Required handshakes: A posts repo sig + migration name → B acks with import evidence;
  C posts `api/attention.ts` VM type → D acks with import evidence.
- **Memory:** each implementor writes `implementations/007-attention/impl-<x>-memory.md`
  (files read/written table · what was implemented · what was learned).
- **TDD:** red-green-refactor; least code. Cite code evidence, not claims.
- **No commit / no push / no Linear "Done"** without explicit user approval (project CLAUDE.md).
  Tickets sit **In Progress**. Orchestrator ties up after fan-out: verify acks have code
  evidence, run the full suite, update `contexts/007-attention-context.md`.
