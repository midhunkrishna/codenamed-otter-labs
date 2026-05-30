import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig, resolvePaths } from "@otter/shared";
import { createServer } from "./server.js";
import { startApp } from "./cli.js";

const config = loadConfig({}, "/srv/app");
const paths = resolvePaths("/srv/app");

describe("createServer", () => {
  it("health endpoint responds 200 with the contract shape", async () => {
    const app = await createServer(config, paths);
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(typeof body.uptimeMs).toBe("number");
    expect(body.dataDir).toBe(paths.dataDir);
    await app.close();
  });
});

describe("startApp", () => {
  afterEach(() => vi.restoreAllMocks());

  it("respects the configured port and calls init exactly once", async () => {
    // Startup now bootstraps the default project (MIN-45) via `db.prepare(...)`, so the
    // injected fake db must tolerate a prepare()→run()/get() call. We keep persistence
    // mocked out — this test only asserts port handling + init-call-count in isolation.
    const fakeDb = {
      prepare: () => ({
        run: () => ({}),
        get: () => ({
          id: "local-project",
          name: "Local Project",
          root: "/srv/app",
          data_dir: "/srv/app/.otter-labs",
          created_at: "t",
          updated_at: "t",
        }),
        all: () => [],
      }),
    };
    const init = vi.fn(async () => ({ db: fakeDb, applied: [] }));
    const cfg = loadConfig({ OTTER_PORT: "5051" }, "/srv/app");
    const app = await startApp(cfg, paths, { init });
    expect(app.port).toBe(5051);
    expect(app.url).toBe("http://localhost:5051");
    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith(paths);
    await app.close();
  });
});
