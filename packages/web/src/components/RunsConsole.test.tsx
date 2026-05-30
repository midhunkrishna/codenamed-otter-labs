import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RunsConsole } from "./RunsConsole";
import type { AgentRun, AgentRunEvent } from "../api/runs";

/**
 * Runs console tests (MIN-32 / §5-E). A mocked `fetch` serves a tiny in-memory
 * runs backend (mirrors Board.test.tsx), and a controllable FakeWebSocket drives
 * the live-events client so we can assert:
 *  - a running run appears in the list (grouped by status)
 *  - a live `run_output_delta` envelope appends to the shown output
 *  - opening detail reloads the persisted output history over HTTP
 *  - cancel POSTs to `/runs/:id/cancel` and surfaces a 409 `{error}`
 *  - waiting_on_permission / waiting_on_user_input render distinctly
 */

// ── Fake WebSocket (mirrors ws/events.test.ts) ──────────────────────────────

interface Listener {
  type: string;
  fn: (ev: unknown) => void;
}

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readonly OPEN = 1;
  url: string;
  readyState = 0;
  sent: string[] = [];
  private listeners: Listener[] = [];

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }
  addEventListener(type: string, fn: (ev: unknown) => void): void {
    this.listeners.push({ type, fn });
  }
  removeEventListener(type: string, fn: (ev: unknown) => void): void {
    this.listeners = this.listeners.filter((l) => !(l.type === type && l.fn === fn));
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.readyState = 3;
    this.emit("close", {});
  }
  emitOpen(): void {
    this.readyState = 1;
    this.emit("open", {});
  }
  emitMessage(payload: unknown): void {
    this.emit("message", { data: JSON.stringify(payload) });
  }
  private emit(type: string, ev: unknown): void {
    for (const l of [...this.listeners]) if (l.type === type) l.fn(ev);
  }
}

const latestSocket = (): FakeWebSocket =>
  FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;

// ── Fake REST backend ───────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function run(over: Partial<AgentRun> = {}): AgentRun {
  return {
    id: "r1",
    projectId: "local-project",
    ticketId: null,
    type: "manual",
    status: "running",
    title: "Run one",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: null,
    ...over,
  };
}

function ev(over: Partial<AgentRunEvent> = {}): AgentRunEvent {
  return {
    id: "e1",
    runId: "r1",
    seq: 1,
    kind: "output_delta",
    payload: { text: "" },
    createdAt: "2026-01-01T00:00:01.000Z",
    ...over,
  };
}

interface FakeState {
  runs: AgentRun[];
  events: Record<string, AgentRunEvent[]>;
  /** When set, cancel returns this status with the message (e.g. 409 terminal). */
  cancelError?: { status: number; error: string };
}

function installFetch(state: FakeState) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.replace(/^https?:\/\/[^/]+/, "");

    if (path === "/api/runs" && method === "GET") {
      return Promise.resolve(jsonResponse(state.runs));
    }
    const eventsMatch = path.match(/^\/api\/runs\/([^/]+)\/events$/);
    if (eventsMatch && method === "GET") {
      const id = eventsMatch[1] as string;
      return Promise.resolve(jsonResponse(state.events[id] ?? []));
    }
    const cancelMatch = path.match(/^\/api\/runs\/([^/]+)\/cancel$/);
    if (cancelMatch && method === "POST") {
      const id = cancelMatch[1] as string;
      if (state.cancelError) {
        return Promise.resolve(
          jsonResponse({ error: state.cancelError.error }, state.cancelError.status),
        );
      }
      const found = state.runs.find((r) => r.id === id);
      if (!found) return Promise.resolve(jsonResponse({ error: "not found" }, 404));
      found.status = "canceled";
      return Promise.resolve(jsonResponse(found));
    }
    const idMatch = path.match(/^\/api\/runs\/([^/]+)$/);
    if (idMatch && method === "GET") {
      const found = state.runs.find((r) => r.id === idMatch[1]);
      return Promise.resolve(
        found ? jsonResponse(found) : jsonResponse({ error: "not found" }, 404),
      );
    }
    return Promise.resolve(jsonResponse({ error: `unhandled ${method} ${path}` }, 500));
  });
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("RunsConsole", () => {
  it("renders a running run in the Running group", async () => {
    installFetch({ runs: [run({ id: "r1", title: "Build", status: "running" })], events: {} });
    render(<RunsConsole />);

    const row = await screen.findByTestId("run-row-r1");
    expect(row).toHaveTextContent("Build");
    const group = screen.getByRole("region", { name: "Running" });
    expect(within(group).getByTestId("run-row-r1")).toBeInTheDocument();
  });

  it("appends a live run_output_delta to the shown output after recovery", async () => {
    installFetch({
      runs: [run({ id: "r1", status: "running" })],
      events: { r1: [ev({ id: "e1", seq: 1, payload: { text: "hello " } })] },
    });
    render(<RunsConsole />);
    latestSocket().emitOpen();

    // Open detail -> recovers persisted output history over HTTP.
    fireEvent.click(await screen.findByTestId("run-row-r1"));
    const output = await screen.findByTestId("run-output");
    await waitFor(() => expect(output).toHaveTextContent("hello"));

    // Live delta on the run:<id> channel appends to the output. Per the frozen
    // RunEventPayload contract the envelope carries the persisted event `id` (the
    // dedupe key) + per-run `seq`; the bus `seq` (envelope.seq) is NOT used.
    latestSocket().emitMessage({
      channel: "run:r1",
      type: "run_output_delta",
      seq: 2,
      ts: "2026-01-01T00:00:02.000Z",
      payload: { id: "e2", runId: "r1", seq: 2, text: "world" },
    });

    await waitFor(() => expect(output).toHaveTextContent("hello world"));
  });

  it("drops a live delta missing the persisted id (dedupe-safe; HTTP recovers it)", async () => {
    installFetch({
      runs: [run({ id: "r1", status: "running" })],
      events: { r1: [ev({ id: "e1", seq: 1, payload: { text: "hello " } })] },
    });
    render(<RunsConsole />);
    latestSocket().emitOpen();
    fireEvent.click(await screen.findByTestId("run-row-r1"));
    const output = await screen.findByTestId("run-output");
    await waitFor(() => expect(output).toHaveTextContent("hello"));

    // No `id` in payload → cannot be deduped against HTTP history → dropped.
    latestSocket().emitMessage({
      channel: "run:r1",
      type: "run_output_delta",
      seq: 2,
      ts: "2026-01-01T00:00:02.000Z",
      payload: { seq: 2, text: "world" },
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(output).not.toHaveTextContent("world");
  });

  it("reloads historical output from GET /runs/:id/events on open (recovery)", async () => {
    const spy = installFetch({
      runs: [run({ id: "r1", status: "running" })],
      events: { r1: [ev({ id: "e1", seq: 1, payload: { text: "persisted output" } })] },
    });
    render(<RunsConsole />);
    latestSocket().emitOpen();

    fireEvent.click(await screen.findByTestId("run-row-r1"));
    const output = await screen.findByTestId("run-output");
    await waitFor(() => expect(output).toHaveTextContent("persisted output"));

    // The events endpoint was hit during recovery.
    const calledEvents = spy.mock.calls.some(([input]) => {
      const u = typeof input === "string" ? input : (input as Request).url;
      return u.includes("/api/runs/r1/events");
    });
    expect(calledEvents).toBe(true);
  });

  it("cancel button POSTs to /runs/:id/cancel for a non-terminal run", async () => {
    const spy = installFetch({
      runs: [run({ id: "r1", status: "running" })],
      events: { r1: [] },
    });
    render(<RunsConsole />);
    latestSocket().emitOpen();

    fireEvent.click(await screen.findByTestId("run-row-r1"));
    const cancelBtn = await screen.findByRole("button", { name: "Cancel run" });
    expect(cancelBtn).not.toBeDisabled();
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      const posted = spy.mock.calls.some(([input, init]) => {
        const u = typeof input === "string" ? input : (input as Request).url;
        return u.includes("/api/runs/r1/cancel") && (init?.method ?? "").toUpperCase() === "POST";
      });
      expect(posted).toBe(true);
    });
  });

  it("surfaces the {error} message when cancel returns 409 (terminal)", async () => {
    installFetch({
      runs: [run({ id: "r1", status: "running" })],
      events: { r1: [] },
      cancelError: { status: 409, error: "run is already terminal" },
    });
    render(<RunsConsole />);
    latestSocket().emitOpen();

    fireEvent.click(await screen.findByTestId("run-row-r1"));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel run" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("run is already terminal");
  });

  it("disables cancel for a terminal run", async () => {
    installFetch({
      runs: [run({ id: "r1", status: "completed", finishedAt: "2026-01-02T00:00:00.000Z" })],
      events: { r1: [] },
    });
    render(<RunsConsole />);
    latestSocket().emitOpen();

    fireEvent.click(await screen.findByTestId("run-row-r1"));
    expect(await screen.findByRole("button", { name: "Cancel run" })).toBeDisabled();
  });

  it("renders waiting_on_permission distinctly", async () => {
    installFetch({
      runs: [run({ id: "r1", status: "waiting_on_permission" })],
      events: { r1: [] },
    });
    render(<RunsConsole />);
    latestSocket().emitOpen();

    fireEvent.click(await screen.findByTestId("run-row-r1"));
    const banner = await screen.findByTestId("run-waiting");
    expect(banner).toHaveAttribute("data-waiting", "waiting_on_permission");
    expect(banner).toHaveTextContent("waiting for permission");
  });

  it("renders waiting_on_user_input distinctly", async () => {
    installFetch({
      runs: [run({ id: "r1", status: "waiting_on_user_input" })],
      events: { r1: [] },
    });
    render(<RunsConsole />);
    latestSocket().emitOpen();

    fireEvent.click(await screen.findByTestId("run-row-r1"));
    const banner = await screen.findByTestId("run-waiting");
    expect(banner).toHaveAttribute("data-waiting", "waiting_on_user_input");
    expect(banner).toHaveTextContent("waiting on your input");
  });

  it("adds a newly created run to the list on a project run_created envelope", async () => {
    const state: FakeState = {
      runs: [run({ id: "r1", status: "running", title: "First" })],
      events: { r1: [] },
    };
    installFetch(state);
    render(<RunsConsole />);
    latestSocket().emitOpen();
    await screen.findByTestId("run-row-r1");

    // Backend persisted a new run; broadcast on the project channel.
    state.runs = [run({ id: "r2", status: "queued", title: "Second" }), ...state.runs];
    latestSocket().emitMessage({
      channel: "project",
      type: "run_created",
      seq: 5,
      ts: "2026-01-01T00:00:05.000Z",
      payload: { id: "r2" },
    });

    await waitFor(() => expect(screen.getByTestId("run-row-r2")).toBeInTheDocument());
    expect(screen.getByText("Second")).toBeInTheDocument();
  });

  it("shows an empty state when there are no runs", async () => {
    installFetch({ runs: [], events: {} });
    render(<RunsConsole />);
    expect(await screen.findByText("No runs yet")).toBeInTheDocument();
  });
});
