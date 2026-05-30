/**
 * Claude readiness probe tests (MIN-18, plan §3h + §5 "C").
 *
 * Does NOT depend on a real `claude` install: the "available" case writes a tiny
 * executable shell script to a temp dir that prints a version, and passes it via
 * `binPath` (mirroring the env override). The "missing" case points at a path
 * that does not exist. The probe must NEVER throw — it resolves a structured
 * { ready, version?, error? }.
 */
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { detectClaude } from "./claude/detect.js";

describe("detectClaude (MIN-18)", () => {
  let dir: string;
  let fakeBin: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "otter-claude-"));
    fakeBin = join(dir, "claude");
    // A fake `claude` that prints a version when called with --version.
    await writeFile(fakeBin, '#!/bin/sh\necho "1.2.3 (Claude Code)"\n', "utf8");
    await chmod(fakeBin, 0o755);
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("missing binary → ready:false with an actionable setup error (never throws)", async () => {
    const status = await detectClaude({ binPath: "/no/such/claude" });
    expect(status.ready).toBe(false);
    expect(typeof status.error).toBe("string");
    expect(status.error!.length).toBeGreaterThan(0);
    expect(status.version).toBeUndefined();
  });

  it("available binary → ready:true with parsed version", async () => {
    const status = await detectClaude({ binPath: fakeBin });
    expect(status.ready).toBe(true);
    expect(status.version).toBe("1.2.3");
    expect(status.error).toBeUndefined();
  });

  it("non-zero exit → ready:false with an error", async () => {
    const failBin = join(dir, "claude-fail");
    await writeFile(failBin, '#!/bin/sh\necho "boom" >&2\nexit 3\n', "utf8");
    await chmod(failBin, 0o755);
    const status = await detectClaude({ binPath: failBin });
    expect(status.ready).toBe(false);
    expect(typeof status.error).toBe("string");
  });

  it("honours OTTER_CLAUDE_BIN when no explicit binPath is given", async () => {
    const prev = process.env.OTTER_CLAUDE_BIN;
    process.env.OTTER_CLAUDE_BIN = fakeBin;
    try {
      const status = await detectClaude();
      expect(status.ready).toBe(true);
      expect(status.version).toBe("1.2.3");
    } finally {
      if (prev === undefined) delete process.env.OTTER_CLAUDE_BIN;
      else process.env.OTTER_CLAUDE_BIN = prev;
    }
  });
});
