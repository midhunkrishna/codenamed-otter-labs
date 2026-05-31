import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  ATTENTION_PRIORITIES,
  ATTENTION_SOURCE_TYPES,
  ATTENTION_TYPES,
  DEFAULT_PROJECT_ID,
  type AttentionItem,
  type AttentionListFilter,
  type AttentionPriority,
  type AttentionSourceType,
  type AttentionStatus,
  type AttentionType,
  type OpenAttentionInput,
} from "@otter/shared";

/** Raw snake_case attention_items row as stored in SQLite. */
interface AttentionItemRow {
  id: string;
  project_id: string;
  attention_type: string;
  source_type: string;
  source_id: string;
  ticket_id: string | null;
  run_id: string | null;
  status: string;
  priority: string;
  title: string;
  summary: string;
  required_action: string;
  metadata_json: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  dismissed_at: string | null;
  expires_at: string | null;
}

/** Map a snake_case DB row to the camelCase {@link AttentionItem} domain object. */
function rowToAttentionItem(row: AttentionItemRow): AttentionItem {
  let metadata: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row.metadata_json) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      metadata = parsed as Record<string, unknown>;
    }
  } catch {
    metadata = {};
  }
  return {
    id: row.id,
    projectId: row.project_id,
    attentionType: row.attention_type as AttentionType,
    sourceType: row.source_type as AttentionSourceType,
    sourceId: row.source_id,
    ticketId: row.ticket_id ?? null,
    runId: row.run_id ?? null,
    status: row.status as AttentionStatus,
    priority: row.priority as AttentionPriority,
    title: row.title,
    summary: row.summary,
    requiredAction: row.required_action,
    metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at ?? null,
    dismissedAt: row.dismissed_at ?? null,
    expiresAt: row.expires_at ?? null,
  };
}

function assertAttentionType(value: string): asserts value is AttentionType {
  if (!(ATTENTION_TYPES as readonly string[]).includes(value)) {
    throw new Error(`unknown attention_type "${value}"`);
  }
}

function assertSourceType(value: string): asserts value is AttentionSourceType {
  if (!(ATTENTION_SOURCE_TYPES as readonly string[]).includes(value)) {
    throw new Error(`unknown source_type "${value}"`);
  }
}

function assertPriority(value: string): asserts value is AttentionPriority {
  if (!(ATTENTION_PRIORITIES as readonly string[]).includes(value)) {
    throw new Error(`unknown priority "${value}"`);
  }
}

export interface AttentionRepository {
  /**
   * Open an attention item. Idempotent per (sourceType, sourceId, attentionType)
   * while the existing item is still `open`: returns that active item as-is (no
   * duplicate, no mutation), else inserts a new one. Backed by the partial unique
   * index `idx_attn_items_one_open`.
   */
  open(input: OpenAttentionInput): AttentionItem;
  /** Get by id. Lazy-expires the row first (open past expires_at -> expired). */
  get(id: string): AttentionItem | undefined;
  /** List newest-first, narrowed by any present filter. Lazy-expires before reading. */
  list(filter?: AttentionListFilter): AttentionItem[];
  /** Move an item to `dismissed` + dismissed_at. Does NOT touch the source object. */
  dismiss(id: string): AttentionItem;
  /** Move an item to `resolved` + resolved_at. */
  resolve(id: string): AttentionItem;
  /**
   * Resolve the active (`open`) item for a source, optionally narrowed by
   * attentionType. Returns the resolved item, or undefined if none was active.
   */
  resolveBySource(
    sourceType: AttentionSourceType,
    sourceId: string,
    attentionType?: AttentionType,
  ): AttentionItem | undefined;
}

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

/**
 * Canonical attention-queue persistence (MIN-36). Enforces at most one active
 * (`open`) item per (source_type, source_id, attention_type) via an idempotent
 * `open` (partial unique index). Expiry is lazy: any open row whose `expires_at`
 * is in the past is flipped to `expired` on read. Focus is client-side only and
 * never persisted.
 */
export function createAttentionRepository(db: Database.Database): AttentionRepository {
  /** Flip any overdue open rows to 'expired'. Called before every read. */
  const lazyExpire = (): void => {
    db.prepare(
      `UPDATE attention_items
       SET status = 'expired', updated_at = ${NOW}
       WHERE status = 'open'
         AND expires_at IS NOT NULL
         AND expires_at <= ${NOW}`,
    ).run();
  };

  const getRaw = (id: string): AttentionItem | undefined => {
    const row = db.prepare("SELECT * FROM attention_items WHERE id = ?").get(id) as
      | AttentionItemRow
      | undefined;
    return row ? rowToAttentionItem(row) : undefined;
  };

  const get = (id: string): AttentionItem | undefined => {
    lazyExpire();
    return getRaw(id);
  };

  const findActiveBySource = (
    sourceType: AttentionSourceType,
    sourceId: string,
    attentionType?: AttentionType,
  ): AttentionItem | undefined => {
    const clauses = ["source_type = ?", "source_id = ?", "status = 'open'"];
    const params: string[] = [sourceType, sourceId];
    if (attentionType !== undefined) {
      clauses.push("attention_type = ?");
      params.push(attentionType);
    }
    const row = db
      .prepare(
        `SELECT * FROM attention_items WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC, rowid DESC LIMIT 1`,
      )
      .get(...params) as AttentionItemRow | undefined;
    return row ? rowToAttentionItem(row) : undefined;
  };

  const setStatus = (
    id: string,
    status: AttentionStatus,
    stamp?: "resolved_at" | "dismissed_at",
  ): AttentionItem => {
    const existing = getRaw(id);
    if (!existing) {
      throw new Error(`attention item "${id}" not found`);
    }
    const stampClause = stamp ? `, ${stamp} = ${NOW}` : "";
    db.prepare(
      `UPDATE attention_items
       SET status = ?, updated_at = ${NOW}${stampClause}
       WHERE id = ?`,
    ).run(status, id);
    return getRaw(id)!;
  };

  return {
    open(input) {
      assertAttentionType(input.attentionType);
      assertSourceType(input.sourceType);
      const priority = input.priority ?? "normal";
      assertPriority(priority);

      // Idempotent: an existing active item for this source+type wins as-is.
      const existing = findActiveBySource(
        input.sourceType,
        input.sourceId,
        input.attentionType,
      );
      if (existing) return existing;

      const id = randomUUID();
      db.prepare(
        `INSERT INTO attention_items
           (id, project_id, attention_type, source_type, source_id, ticket_id, run_id,
            status, priority, title, summary, required_action, metadata_json, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        input.projectId ?? DEFAULT_PROJECT_ID,
        input.attentionType,
        input.sourceType,
        input.sourceId,
        input.ticketId ?? null,
        input.runId ?? null,
        priority,
        input.title,
        input.summary ?? "",
        input.requiredAction,
        JSON.stringify(input.metadata ?? {}),
        input.expiresAt ?? null,
      );
      return getRaw(id)!;
    },

    get,

    list(filter) {
      lazyExpire();
      const clauses: string[] = [];
      const params: string[] = [];
      if (filter?.status !== undefined) {
        clauses.push("status = ?");
        params.push(filter.status);
      }
      if (filter?.attentionType !== undefined) {
        assertAttentionType(filter.attentionType);
        clauses.push("attention_type = ?");
        params.push(filter.attentionType);
      }
      if (filter?.projectId !== undefined) {
        clauses.push("project_id = ?");
        params.push(filter.projectId);
      }
      if (filter?.ticketId !== undefined) {
        clauses.push("ticket_id = ?");
        params.push(filter.ticketId);
      }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
      const rows = db
        .prepare(`SELECT * FROM attention_items ${where} ORDER BY created_at DESC, rowid DESC`)
        .all(...params) as AttentionItemRow[];
      return rows.map(rowToAttentionItem);
    },

    dismiss(id) {
      return setStatus(id, "dismissed", "dismissed_at");
    },

    resolve(id) {
      return setStatus(id, "resolved", "resolved_at");
    },

    resolveBySource(sourceType, sourceId, attentionType) {
      assertSourceType(sourceType);
      if (attentionType !== undefined) assertAttentionType(attentionType);
      const active = findActiveBySource(sourceType, sourceId, attentionType);
      if (!active) return undefined;
      return setStatus(active.id, "resolved", "resolved_at");
    },
  };
}
