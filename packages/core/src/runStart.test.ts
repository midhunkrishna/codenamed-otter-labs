/**
 * `POST /api/runs/:id/start` route tests (MIN-44, plan §3e) — Impl-B.
 *
 * Real temp SQLite + a bare Fastify app. The subprocess runner is FAKE (injected
 * via `registerRuntimeRoutes`'s `runner` arg) so we assert the route's contract —
 * 404 / 409 / 202, readiness guard, fire-and-forget kickoff, context wiring —
 * without spawning a real (or even fake-binary) Claude. The runner itself is
 * covered end-to-end by claudeRunner.test.ts.
 */
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePaths, type OtterPaths } from "@otter/shared";
import {
  initPersistence,
  createAgentRunRepository,
  createTicketRepository,
  type Database,
} from "@otter/persistence";
import { registerRuntimeRoutes, bootstrapDefaultProject } from "./runtime/index.js";
import { resetClaudeStatusCache } from "./claude/detect.js";
import type { ClaudeRunner } from "./claude/types.js";

type Emit = (channel: string, type: string, payload?: Record<string, unknown>) => void;

/** A fake runner that records its calls instead of spawning anything. */
function makeFakeRunner(): ClaudeRunner & {
  planningCalls: { runId: string; projectRoot: string; contextMarkdown: string }[];
  executionCalls: { runId: string; projectRoot: string; contextMarkdown: string }[];
} {
  const planningCalls: { runId: string; projectRoot: string; contextMarkdown: string }[] = [];
  const executionCalls: { runId: string; projectRoot: string; contextMarkdown: string }[] = [];
  return {
    planningCalls,
    executionCalls,
    async startPlanningRun(input) {
      planningCalls.push(input);
    },
    async startExecutionRun(input) {
      executionCalls.push(input);
    },
    async resumeRun() {
      /* unused here */
    },
    async cancelRun() {
      /* unused here */
    },
  };
}

describe("POST /api/runs/:id/start (real SQLite, fake runner)", () => {
  let dir: string;
  let paths: OtterPaths;
  let db: Database.Database;
  let app: FastifyInstance;
  let emit: ReturnType<typeof vi.fn>;
  let runner: ReturnType<typeof makeFakeRunner>;

  let readyBin: string;
  const missingBin = "/no/such/otter-claude";
  let prevEnv: string | undefined;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "otter-runstart-"));
    paths = resolvePaths(dir, join(dir, ".otter-labs"));
    ({ db } = initPersistence(paths));

    readyBin = join(dir, "claude");
    await writeFile(readyBin, '#!/bin/sh\necho "9.9.9 (Claude Code)"\n', "utf8");
    await chmod(readyBin, 0o755);

    prevEnv = process.env.OTTER_CLAUDE_BIN;
    bootstrapDefaultProject(db, { root: paths.root, dataDir: paths.dataDir });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prevEnv === undefined) delete process.env.OTTER_CLAUDE_BIN;
    else process.env.OTTER_CLAUDE_BIN = prevEnv;
    await rm(dir, { recursive: true, force: true });
  });

  async function withClaude(ready: boolean): Promise<void> {
    if (app) await app.close();
    process.env.OTTER_CLAUDE_BIN = ready ? readyBin : missingBin;
    resetClaudeStatusCache();
    emit = vi.fn();
    runner = makeFakeRunner();
    app = Fastify({ logger: false });
    registerRuntimeRoutes(
      app,
      db,
      emit as unknown as Emit as never,
      { projectRoot: paths.root, dataDir: paths.dataDir },
      runner,
    );
    await app.ready();
  }

  beforeEach(async () => {
    await withClaude(true);
  });

  /** Helper: create a run via the API. */
  async function createRun(payload: Record<string, unknown>): Promise<{ id: string; status: string }> {
    const res = await app.inject({ method: "POST", url: "/api/runs", payload });
    return res.json();
  }

  it("404 when the run does not exist", async () => {
    const res = await app.inject({ method: "POST", url: "/api/runs/nope/start" });
    expect(res.statusCode).toBe(404);
    expect(typeof res.json().error).toBe("string");
  });

  it("202 + fires startPlanningRun for a queued planning run (with built context)", async () => {
    const ticket = createTicketRepository(db).create({ title: "Start me", description: "do the thing" });
    const run = await createRun({ type: "planning", ticketId: ticket.id });
    expect(run.status).toBe("queued");

    const res = await app.inject({ method: "POST", url: `/api/runs/${run.id}/start` });
    expect(res.statusCode).toBe(202);
    expect(res.json().id).toBe(run.id);

    // Fire-and-forget kicked the planning path exactly once with cwd=projectRoot.
    expect(runner.planningCalls.length).toBe(1);
    expect(runner.executionCalls.length).toBe(0);
    const call = runner.planningCalls[0]!;
    expect(call.runId).toBe(run.id);
    expect(call.projectRoot).toBe(paths.root);
    // Context was built from the ticket (planning mode → "Mode: planning").
    expect(call.contextMarkdown).toContain("Start me");
    expect(call.contextMarkdown).toContain("Mode: planning");
  });

  it("202 + fires startExecutionRun for an execution run (execution-mode context)", async () => {
    const ticket = createTicketRepository(db).create({ title: "Exec ticket" });
    const run = await createRun({ type: "execution", ticketId: ticket.id });

    const res = await app.inject({ method: "POST", url: `/api/runs/${run.id}/start` });
    expect(res.statusCode).toBe(202);
    expect(runner.executionCalls.length).toBe(1);
    expect(runner.planningCalls.length).toBe(0);
    expect(runner.executionCalls[0]!.contextMarkdown).toContain("Mode: execution");
  });

  it("409 when the run is already terminal (e.g. canceled)", async () => {
    const run = await createRun({ type: "manual" });
    // Cancel it → terminal.
    await app.inject({ method: "POST", url: `/api/runs/${run.id}/cancel` });
    const res = await app.inject({ method: "POST", url: `/api/runs/${run.id}/start` });
    expect(res.statusCode).toBe(409);
    expect(typeof res.json().error).toBe("string");
    expect(runner.planningCalls.length).toBe(0);
  });

  it("409 when the run is already running", async () => {
    const run = await createRun({ type: "manual" });
    // Force it to running via the repo (simulating an in-flight run).
    createAgentRunRepository(db).setStatus(run.id, "running");
    const res = await app.inject({ method: "POST", url: `/api/runs/${run.id}/start` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/already running/i);
  });

  it("readiness guard: planning run with Claude unavailable → failed + log, 409, no kickoff", async () => {
    // Create the run while Claude IS ready (so create doesn't pre-fail it)...
    const run = await createRun({ type: "planning" });
    expect(run.status).toBe("queued");
    // ...then make Claude unavailable and start.
    await app.close();
    process.env.OTTER_CLAUDE_BIN = missingBin;
    resetClaudeStatusCache();
    emit = vi.fn();
    runner = makeFakeRunner();
    app = Fastify({ logger: false });
    registerRuntimeRoutes(
      app,
      db,
      emit as unknown as Emit as never,
      { projectRoot: paths.root, dataDir: paths.dataDir },
      runner,
    );
    await app.ready();

    const res = await app.inject({ method: "POST", url: `/api/runs/${run.id}/start` });
    expect(res.statusCode).toBe(409);
    expect(res.json().status).toBe("failed");
    expect(runner.planningCalls.length).toBe(0);

    const events = (await app.inject({ method: "GET", url: `/api/runs/${run.id}/events` })).json();
    const log = events.find((e: { kind: string }) => e.kind === "log");
    expect(log).toBeDefined();
    expect(String(log.payload.message).toLowerCase()).toContain("claude");
  });

  it("manual run with no ticket still starts (minimal context, planning path)", async () => {
    const run = await createRun({ type: "manual" });
    const res = await app.inject({ method: "POST", url: `/api/runs/${run.id}/start` });
    expect(res.statusCode).toBe(202);
    expect(runner.planningCalls.length).toBe(1);
    // Minimal context references the run + project root (no ticket to build from).
    expect(runner.planningCalls[0]!.contextMarkdown).toContain(paths.root);
  });
});
