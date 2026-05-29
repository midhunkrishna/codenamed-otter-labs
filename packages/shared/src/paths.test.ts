import { isAbsolute } from "node:path";
import { describe, expect, it } from "vitest";
import { DATA_DIR_NAME, DB_FILE_NAME } from "./constants.js";
import { layoutDirectories, resolveDataDir, resolvePaths } from "./paths.js";

describe("resolveDataDir", () => {
  it("defaults to <root>/.otter-labs", () => {
    expect(resolveDataDir("/srv/app")).toBe(`/srv/app/${DATA_DIR_NAME}`);
  });

  it("uses an absolute override verbatim", () => {
    expect(resolveDataDir("/srv/app", "/var/data/otter")).toBe("/var/data/otter");
  });

  it("resolves a relative override against root", () => {
    expect(resolveDataDir("/srv/app", "custom-data")).toBe("/srv/app/custom-data");
  });

  it("always returns an absolute path", () => {
    expect(isAbsolute(resolveDataDir("relative/root"))).toBe(true);
  });
});

describe("resolvePaths", () => {
  const p = resolvePaths("/srv/app");

  it("anchors db file under the data dir", () => {
    expect(p.dbFile).toBe(`/srv/app/${DATA_DIR_NAME}/${DB_FILE_NAME}`);
  });

  it("nests plan/report/diff artifacts under artifacts/", () => {
    expect(p.plans).toBe(p.artifacts + "/plans");
    expect(p.executionReports).toBe(p.artifacts + "/execution-reports");
    expect(p.diffs).toBe(p.artifacts + "/diffs");
  });

  it("keeps every path under the data dir", () => {
    for (const dir of layoutDirectories(p)) {
      expect(dir.startsWith(p.dataDir)).toBe(true);
    }
  });
});
