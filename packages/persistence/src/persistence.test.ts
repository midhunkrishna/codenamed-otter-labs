import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { layoutDirectories, resolvePaths, type OtterPaths } from "@otter/shared";
import { ensureLayout, initPersistence, runMigrations, openDatabase } from "./index.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "otter-persist-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("ensureLayout", () => {
  it("creates the full directory tree", () => {
    const paths = resolvePaths(tmp);
    ensureLayout(paths);
    for (const dir of layoutDirectories(paths)) {
      expect(existsSync(dir), `expected ${dir} to exist`).toBe(true);
    }
  });

  it("is idempotent (safe to run repeatedly)", () => {
    const paths = resolvePaths(tmp);
    ensureLayout(paths);
    expect(() => ensureLayout(paths)).not.toThrow();
    for (const dir of layoutDirectories(paths)) {
      expect(existsSync(dir)).toBe(true);
    }
  });
});

describe("initPersistence", () => {
  it("opens the database on startup and applies migrations once", () => {
    const paths = resolvePaths(tmp);
    const { db, applied } = initPersistence(paths);
    expect(existsSync(paths.dbFile)).toBe(true);
    expect(applied.length).toBeGreaterThan(0);
    expect(applied).toContain("0001_init.sql");

    // tables from the initial migration exist
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name);
    for (const t of ["ticket", "comment", "plan", "run", "permission", "audit", "migrations"]) {
      expect(tables).toContain(t);
    }
    db.close();
  });

  it("skips already-applied migrations on a second run", () => {
    const paths = resolvePaths(tmp);
    const first = initPersistence(paths);
    first.db.close();
    expect(first.applied.length).toBeGreaterThan(0);

    const second = initPersistence(paths);
    expect(second.applied.length).toBe(0);
    second.db.close();
  });

  it("never deletes an existing otter.db (data survives re-init)", () => {
    const paths = resolvePaths(tmp);
    const a = initPersistence(paths);
    a.db.prepare("INSERT INTO ticket (id, title) VALUES (?, ?)").run("t1", "hello");
    a.db.close();

    const b = initPersistence(paths);
    const row = b.db.prepare("SELECT title FROM ticket WHERE id = ?").get("t1") as
      | { title: string }
      | undefined;
    expect(row?.title).toBe("hello");
    b.db.close();
  });
});

describe("runMigrations error handling", () => {
  it("throws a useful error on a corrupt/garbage migration", () => {
    const paths = resolvePaths(tmp);
    ensureLayout(paths);
    const db = openDatabase(paths);

    const badDir = join(tmp, "bad-migrations");
    mkdirSync(badDir, { recursive: true });
    writeFileSync(join(badDir, "0001_garbage.sql"), "this is not valid sql ;;;", "utf8");

    expect(() => runMigrations(db, badDir)).toThrow(/0001_garbage\.sql/);
    db.close();
  });

  it("rolls back a failed migration so nothing is half-recorded", () => {
    const paths = resolvePaths(tmp);
    ensureLayout(paths);
    const db = openDatabase(paths);

    const badDir = join(tmp, "bad-migrations2");
    mkdirSync(badDir, { recursive: true });
    writeFileSync(join(badDir, "0001_bad.sql"), "CREATE TABLE oops (;", "utf8");

    expect(() => runMigrations(db, badDir)).toThrow();
    const recorded = db.prepare("SELECT COUNT(*) AS n FROM migrations").get() as { n: number };
    expect(recorded.n).toBe(0);
    db.close();
  });
});

describe("data-dir path forms", () => {
  it("works with a relative data-dir override", () => {
    // relative override is resolved against the project root (tmp)
    const paths: OtterPaths = resolvePaths(tmp, "relative-data");
    expect(paths.dataDir).toBe(join(tmp, "relative-data"));
    const { db, applied } = initPersistence(paths);
    expect(existsSync(paths.dbFile)).toBe(true);
    expect(applied.length).toBeGreaterThan(0);
    db.prepare("INSERT INTO ticket (id, title) VALUES (?, ?)").run("r1", "rel");
    expect((db.prepare("SELECT COUNT(*) AS n FROM ticket").get() as any).n).toBe(1);
    db.close();
  });

  it("works with an absolute data-dir override", () => {
    const abs = join(tmp, "abs-data");
    const paths: OtterPaths = resolvePaths(tmp, abs);
    expect(paths.dataDir).toBe(abs);
    const { db, applied } = initPersistence(paths);
    expect(existsSync(paths.dbFile)).toBe(true);
    expect(applied.length).toBeGreaterThan(0);
    db.close();
  });
});
