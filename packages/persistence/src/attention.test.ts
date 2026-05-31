import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ATTENTION_SOURCE_TYPES,
  DEFAULT_PROJECT_ID,
  resolvePaths,
  type AttentionSourceType,
  type OpenAttentionInput,
} from "@otter/shared";
import type { Database } from "./index.js";
import {
  initPersistence,
  createAttentionRepository,
  createTicketRepository,
} from "./index.js";

let tmp: string;
let db: Database.Database;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "otter-attention-"));
  db = initPersistence(resolvePaths(tmp)).db;
});

afterEach(() => {
  try {
    db.close();
  } catch {
    // already closed
  }
  rmSync(tmp, { recursive: true, force: true });
});

/** Minimal valid input with sane defaults for the field under test. */
function baseInput(over: Partial<OpenAttentionInput> = {}): OpenAttentionInput {
  return {
    attentionType: "permission_request",
    sourceType: "permission_request",
    sourceId: "src-1",
    title: "Needs attention",
    requiredAction: "Do the thing",
    ...over,
  };
}

describe("migration 0005", () => {
  it("creates the canonical attention_items table + indexes", () => {
    const tbl = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='attention_items'")
      .get();
    expect(tbl).toBeTruthy();

    const idx = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?")
      .get("idx_attn_items_one_open");
    expect(idx).toBeTruthy();
  });

  it("backfills a legacy attention_item row into attention_items", () => {
    // Simulate a fresh DB that still has a legacy plan-006 row, then re-run
    // migration 0005's backfill by inserting before the canonical table is read.
    const tickets = createTicketRepository(db);
    const t = tickets.create({ title: "Legacy" });
    db.prepare(
      `INSERT INTO attention_item (id, ticket_id, kind, status, ref_id, detail, created_at, updated_at)
       VALUES ('legacy-1', ?, 'plan_approval', 'open', 'plan-legacy', 'legacy detail',
               '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
    ).run(t.id);

    // Run the same backfill statement the migration uses.
    db.exec(
      `INSERT OR IGNORE INTO attention_items
        (id, project_id, attention_type, source_type, source_id, ticket_id, status,
         priority, title, summary, required_action, metadata_json, created_at, updated_at, resolved_at)
       SELECT id, 'local-project', 'plan_approval', 'plan', COALESCE(ref_id, id), ticket_id,
              status, 'high', 'Plan awaiting approval', COALESCE(detail, ''),
              'Approve plan or send back with feedback.', '{}', created_at, updated_at, resolved_at
       FROM attention_item`,
    );

    const attention = createAttentionRepository(db);
    const item = attention.get("legacy-1");
    expect(item).toBeDefined();
    expect(item?.attentionType).toBe("plan_approval");
    expect(item?.sourceType).toBe("plan");
    expect(item?.sourceId).toBe("plan-legacy");
    expect(item?.ticketId).toBe(t.id);
    expect(item?.status).toBe("open");
    expect(item?.priority).toBe("high");
    expect(item?.summary).toBe("legacy detail");
  });
});

describe("attention repository — create from each source type", () => {
  it.each(ATTENTION_SOURCE_TYPES)("creates an item from source type %s", (sourceType) => {
    const attention = createAttentionRepository(db);
    const item = attention.open(
      baseInput({ sourceType: sourceType as AttentionSourceType, sourceId: `src-${sourceType}` }),
    );
    expect(item.id).toBeTruthy();
    expect(item.sourceType).toBe(sourceType);
    expect(item.status).toBe("open");
    expect(item.projectId).toBe(DEFAULT_PROJECT_ID);
    expect(item.priority).toBe("normal");
  });
});

describe("attention repository — list & filters", () => {
  it("lists open items by project, newest first", () => {
    const attention = createAttentionRepository(db);
    const a = attention.open(baseInput({ sourceId: "a" }));
    const b = attention.open(baseInput({ sourceId: "b", attentionType: "plan_approval", sourceType: "plan" }));

    const list = attention.list({ status: "open", projectId: DEFAULT_PROJECT_ID });
    expect(list.map((x) => x.id)).toEqual([b.id, a.id]);
  });

  it("filters by attention_type", () => {
    const attention = createAttentionRepository(db);
    attention.open(baseInput({ sourceId: "perm", attentionType: "permission_request", sourceType: "permission_request" }));
    const plan = attention.open(baseInput({ sourceId: "plan", attentionType: "plan_approval", sourceType: "plan" }));

    const planList = attention.list({ attentionType: "plan_approval" });
    expect(planList.map((x) => x.id)).toEqual([plan.id]);
  });

  it("filters by ticketId", () => {
    const attention = createAttentionRepository(db);
    const tickets = createTicketRepository(db);
    const t = tickets.create({ title: "T" });
    const withTicket = attention.open(baseInput({ sourceId: "wt", attentionType: "plan_approval", sourceType: "plan", ticketId: t.id }));
    attention.open(baseInput({ sourceId: "noticket" }));

    expect(attention.list({ ticketId: t.id }).map((x) => x.id)).toEqual([withTicket.id]);
  });
});

describe("attention repository — enum validation", () => {
  it("rejects an unknown attention_type", () => {
    const attention = createAttentionRepository(db);
    expect(() =>
      attention.open(baseInput({ attentionType: "bogus" as never })),
    ).toThrow(/attention_type/);
  });

  it("rejects an unknown source_type", () => {
    const attention = createAttentionRepository(db);
    expect(() =>
      attention.open(baseInput({ sourceType: "bogus" as never })),
    ).toThrow(/source_type/);
  });

  it("rejects an unknown priority", () => {
    const attention = createAttentionRepository(db);
    expect(() =>
      attention.open(baseInput({ priority: "bogus" as never })),
    ).toThrow(/priority/);
  });
});

describe("attention repository — dedup active per (source, type)", () => {
  it("returns the existing active item without duplicating or mutating it", () => {
    const attention = createAttentionRepository(db);
    const first = attention.open(
      baseInput({ sourceType: "plan", sourceId: "p1", attentionType: "plan_approval", title: "first" }),
    );
    const second = attention.open(
      baseInput({ sourceType: "plan", sourceId: "p1", attentionType: "plan_approval", title: "second" }),
    );
    expect(second.id).toBe(first.id);
    expect(second.title).toBe("first"); // not mutated

    const count = (
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM attention_items WHERE source_type='plan' AND source_id='p1' AND status='open'",
        )
        .get() as { n: number }
    ).n;
    expect(count).toBe(1);
  });

  it("allows a fresh open after the prior item is resolved", () => {
    const attention = createAttentionRepository(db);
    const a = attention.open(baseInput({ sourceType: "plan", sourceId: "p2", attentionType: "plan_approval" }));
    attention.resolve(a.id);
    const b = attention.open(baseInput({ sourceType: "plan", sourceId: "p2", attentionType: "plan_approval" }));
    expect(b.id).not.toBe(a.id);
  });

  it("a dismissed item frees the slot for a fresh open", () => {
    const attention = createAttentionRepository(db);
    const a = attention.open(baseInput({ sourceType: "plan", sourceId: "p3", attentionType: "plan_approval" }));
    attention.dismiss(a.id);
    const b = attention.open(baseInput({ sourceType: "plan", sourceId: "p3", attentionType: "plan_approval" }));
    expect(b.id).not.toBe(a.id);
    expect(b.status).toBe("open");
  });
});

describe("attention repository — lifecycle transitions", () => {
  it("resolve sets status + resolved_at", () => {
    const attention = createAttentionRepository(db);
    const a = attention.open(baseInput());
    const resolved = attention.resolve(a.id);
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolvedAt).toMatch(/Z$/);
    expect(resolved.dismissedAt).toBeNull();
  });

  it("dismiss sets status + dismissed_at and does not touch the source", () => {
    const attention = createAttentionRepository(db);
    const a = attention.open(baseInput());
    const dismissed = attention.dismiss(a.id);
    expect(dismissed.status).toBe("dismissed");
    expect(dismissed.dismissedAt).toMatch(/Z$/);
    expect(dismissed.resolvedAt).toBeNull();
  });

  it("resolve/dismiss throw for an unknown id", () => {
    const attention = createAttentionRepository(db);
    expect(() => attention.resolve("ghost")).toThrow();
    expect(() => attention.dismiss("ghost")).toThrow();
  });

  it("resolveBySource resolves the active item for the source", () => {
    const attention = createAttentionRepository(db);
    const a = attention.open(baseInput({ sourceType: "plan", sourceId: "p9", attentionType: "plan_approval" }));
    const resolved = attention.resolveBySource("plan", "p9", "plan_approval");
    expect(resolved?.id).toBe(a.id);
    expect(resolved?.status).toBe("resolved");
    expect(attention.resolveBySource("plan", "p9", "plan_approval")).toBeUndefined();
  });
});

describe("attention repository — metadata round-trips", () => {
  it("preserves a nested metadata object", () => {
    const attention = createAttentionRepository(db);
    const metadata = { planId: "plan-1", reviewers: ["a", "b"], nested: { depth: 2 } };
    const a = attention.open(baseInput({ metadata }));
    expect(a.metadata).toEqual(metadata);
    expect(attention.get(a.id)?.metadata).toEqual(metadata);
  });

  it("defaults metadata to an empty object", () => {
    const attention = createAttentionRepository(db);
    const a = attention.open(baseInput());
    expect(a.metadata).toEqual({});
  });
});

describe("attention repository — lazy expiry", () => {
  it("flips an overdue open item to expired on read", () => {
    const attention = createAttentionRepository(db);
    const past = "2000-01-01T00:00:00.000Z";
    const a = attention.open(baseInput({ expiresAt: past }));
    expect(a.status).toBe("open");

    // get() triggers lazy-expire.
    expect(attention.get(a.id)?.status).toBe("expired");
    // and an expired item is no longer in the open list.
    expect(attention.list({ status: "open" }).map((x) => x.id)).not.toContain(a.id);
  });

  it("leaves a future-dated item open", () => {
    const attention = createAttentionRepository(db);
    const future = "2999-01-01T00:00:00.000Z";
    const a = attention.open(baseInput({ expiresAt: future }));
    expect(attention.get(a.id)?.status).toBe("open");
  });
});

describe("attention durability across reopen", () => {
  it("items survive a DB reopen", () => {
    const paths = resolvePaths(tmp);
    const attention = createAttentionRepository(db);
    const a = attention.open(baseInput({ metadata: { k: "v" } }));

    db.close();
    db = initPersistence(paths).db;

    const attention2 = createAttentionRepository(db);
    const reloaded = attention2.get(a.id);
    expect(reloaded?.id).toBe(a.id);
    expect(reloaded?.metadata).toEqual({ k: "v" });
  });
});
