/**
 * MIN-17 frontend live-events client tests (Impl-B).
 *
 * jsdom has no WebSocket, so we install a controllable FakeWebSocket on the global,
 * matching the surface `ws/client.ts` + `ws/events.ts` use: `readyState`, `OPEN`,
 * `send`, `close`, and `addEventListener("open"|"message"|"close")`. Each instance is
 * tracked so a test can drive open/message/close and inspect sent control frames —
 * this is how we assert subscribe dispatch and re-subscribe on reconnect.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectEvents, type EventEnvelope } from "./events";

interface Listener {
  type: string;
  fn: (ev: unknown) => void;
}

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  url: string;
  readyState = FakeWebSocket.CONNECTING;
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
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close", {});
  }

  // --- test drivers ---
  emitOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open", {});
  }
  emitMessage(payload: unknown): void {
    this.emit("message", { data: JSON.stringify(payload) });
  }
  emitClose(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close", {});
  }
  private emit(type: string, ev: unknown): void {
    for (const l of [...this.listeners]) if (l.type === type) l.fn(ev);
  }

  /** The control frames this socket received, parsed. */
  get frames(): Array<Record<string, unknown>> {
    return this.sent.map((s) => JSON.parse(s) as Record<string, unknown>);
  }
}

const envelope = (over: Partial<EventEnvelope>): EventEnvelope => ({
  channel: "ticket:1",
  type: "comment_created",
  seq: 1,
  ts: new Date().toISOString(),
  payload: {},
  ...over,
});

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
  // ws/client.ts builds the URL from location.protocol/host (jsdom provides these).
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const latest = (): FakeWebSocket =>
  FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;

describe("connectEvents", () => {
  it("sends a subscribe frame and dispatches matching envelopes to the handler", () => {
    const client = connectEvents();
    const sock = latest();
    sock.emitOpen();

    const got: EventEnvelope[] = [];
    client.subscribe("ticket:1", (e) => got.push(e));

    expect(sock.frames).toContainEqual({ subscribe: "ticket:1" });

    sock.emitMessage(envelope({ channel: "ticket:1", payload: { id: "c1" } }));
    sock.emitMessage(envelope({ channel: "ticket:2", payload: { id: "x" } })); // other channel

    expect(got).toHaveLength(1);
    expect(got[0]?.payload).toEqual({ id: "c1" });
    client.close();
  });

  it("ignores the hello greeting and non-envelope frames", () => {
    const client = connectEvents();
    const sock = latest();
    sock.emitOpen();
    const got: EventEnvelope[] = [];
    client.subscribe("ticket:1", (e) => got.push(e));

    sock.emitMessage({ type: "hello" });
    sock.emitMessage("not json envelope");
    sock.emitMessage({ channel: "ticket:1" }); // missing fields

    expect(got).toHaveLength(0);
    client.close();
  });

  it("routes envelopes to the correct per-channel handlers", () => {
    const client = connectEvents();
    const sock = latest();
    sock.emitOpen();

    const a: EventEnvelope[] = [];
    const b: EventEnvelope[] = [];
    client.subscribe("ticket:1", (e) => a.push(e));
    client.subscribe("attention", (e) => b.push(e));

    sock.emitMessage(envelope({ channel: "attention", type: "attention_item_created" }));
    sock.emitMessage(envelope({ channel: "ticket:1", type: "comment_created" }));

    expect(a.map((e) => e.channel)).toEqual(["ticket:1"]);
    expect(b.map((e) => e.channel)).toEqual(["attention"]);
    client.close();
  });

  it("unsubscribe removes the handler and sends an unsubscribe frame for the last one", () => {
    const client = connectEvents();
    const sock = latest();
    sock.emitOpen();

    const got: EventEnvelope[] = [];
    const off = client.subscribe("ticket:1", (e) => got.push(e));
    off();

    expect(sock.frames).toContainEqual({ unsubscribe: "ticket:1" });
    sock.emitMessage(envelope({ channel: "ticket:1" }));
    expect(got).toHaveLength(0);
    client.close();
  });

  it("keeps the subscription while other handlers remain on a channel", () => {
    const client = connectEvents();
    const sock = latest();
    sock.emitOpen();

    const a: EventEnvelope[] = [];
    const b: EventEnvelope[] = [];
    const offA = client.subscribe("ticket:1", (e) => a.push(e));
    client.subscribe("ticket:1", (e) => b.push(e));
    offA();

    // No unsubscribe frame yet — one handler still wants the channel.
    expect(sock.frames).not.toContainEqual({ unsubscribe: "ticket:1" });
    sock.emitMessage(envelope({ channel: "ticket:1" }));
    expect(a).toHaveLength(0);
    expect(b).toHaveLength(1);
    client.close();
  });

  it("re-subscribes all active channels on reconnect", () => {
    vi.useFakeTimers();
    const client = connectEvents({ reconnectDelayMs: 10 });
    const first = latest();
    first.emitOpen();

    const got: EventEnvelope[] = [];
    client.subscribe("ticket:1", (e) => got.push(e));
    client.subscribe("attention", (e) => got.push(e));
    expect(first.frames).toContainEqual({ subscribe: "ticket:1" });
    expect(first.frames).toContainEqual({ subscribe: "attention" });

    // Drop the connection -> the client schedules a reconnect.
    first.emitClose();
    vi.advanceTimersByTime(10);

    const second = latest();
    expect(second).not.toBe(first);
    second.emitOpen(); // on open, the client must re-send all active subscriptions

    expect(second.frames).toContainEqual({ subscribe: "ticket:1" });
    expect(second.frames).toContainEqual({ subscribe: "attention" });

    // Fresh events flow over the new socket.
    second.emitMessage(envelope({ channel: "ticket:1", payload: { fresh: true } }));
    expect(got.at(-1)?.payload).toEqual({ fresh: true });

    client.close();
    vi.useRealTimers();
  });

  it("close() stops reconnecting", () => {
    vi.useFakeTimers();
    const client = connectEvents({ reconnectDelayMs: 10 });
    const sock = latest();
    sock.emitOpen();
    const countBefore = FakeWebSocket.instances.length;

    client.close();
    sock.emitClose();
    vi.advanceTimersByTime(100);

    // No new socket was created after close().
    expect(FakeWebSocket.instances.length).toBe(countBefore);
    vi.useRealTimers();
  });

  it("an exception in one handler does not stop delivery to others", () => {
    const client = connectEvents();
    const sock = latest();
    sock.emitOpen();
    const got: string[] = [];
    client.subscribe("ticket:1", () => {
      throw new Error("boom");
    });
    client.subscribe("ticket:1", () => got.push("ok"));
    sock.emitMessage(envelope({ channel: "ticket:1" }));
    expect(got).toEqual(["ok"]);
    client.close();
  });
});
