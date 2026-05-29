import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig, resolvePaths } from "@otter/shared";
import { startApp } from "./cli.js";

// One integration test exercising the REAL @otter/persistence init against a
// temp data dir. Skips (with a note) if persistence isn't present yet — the
// orchestrator runs the full suite once B has landed.
let init: typeof import("@otter/persistence").initPersistence | undefined;
try {
  ({ initPersistence: init } = await import("@otter/persistence"));
} catch {
  init = undefined;
}

const maybe = init ? describe : describe.skip;

maybe("startApp with real persistence (integration)", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "otter-it-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("creates .otter-labs + otter.db and is safe to start repeatedly", async () => {
    const cfg = loadConfig({ OTTER_PORT: "4899", OTTER_DATA_DIR: ".otter-labs" }, dir);
    const paths = resolvePaths(cfg.projectRoot, ".otter-labs");

    const app1 = await startApp(cfg, paths, { init });
    expect(existsSync(paths.dataDir)).toBe(true);
    expect(existsSync(paths.dbFile)).toBe(true);
    await app1.close();

    // Re-run: reuses existing dir, no throw.
    const app2 = await startApp(cfg, paths, { init });
    expect(existsSync(paths.dbFile)).toBe(true);
    await app2.close();
  });
});
