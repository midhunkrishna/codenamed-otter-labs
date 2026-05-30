# Impl-B memory — MIN-17 (live event bus + WS gateway + web client)

## Files read / written

| File | R/W | Note |
|---|---|---|
| plans/004-runtime-foundations.md | R | spec §3d/3e + Wave-2 Impl-B + §5 |
| packages/shared/src/events.ts | R | FROZEN contract (EventEnvelope, CHANNELS, EVENT_TYPES, WsClientMessage) |
| packages/core/src/events/bus.ts | R | orchestrator-owned bus (not modified) |
| packages/core/src/events/gateway.ts | W | hardened (stateless per-conn, OPEN-guarded send, close+error teardown) |
| packages/core/src/server.ts | R | confirmed bus/emit/gateway wiring (not modified) |
| packages/core/src/routes.test.ts | R | test ergonomics reference |
| packages/web/src/ws/client.ts | R | base connect() built upon |
| packages/web/src/api/client.ts | R | local-mirror convention reference |
| packages/web/src/test/setup.ts | R | jsdom setup |
| packages/web/src/components/HealthBadge.test.tsx | R | web test pattern |
| packages/web/src/ws/events.ts | W | connectEvents() live-events client |
| packages/core/src/events.test.ts | W | bus unit + gateway e2e (real WS + real SQLite) |
| packages/web/src/ws/events.test.ts | W | client tests with FakeWebSocket |
| channels/004-runtime-foundations-channel.log | W (>>) | start + READY announcements |

## Summary
- **gateway.ts**: per-connection `Set<string>` subscribed channels is the only state;
  one `bus.subscribeAll` per socket, filtered by that set; sends guarded on
  `readyState===OPEN`; teardown on both `close` and `error` unsubscribes the bus reg
  and clears the set. Multi-channel per socket; reconnect = fresh socket starts empty
  (stateless ⇒ cannot corrupt). Exported signature unchanged:
  `registerEventGateway(app: FastifyInstance, bus: EventBus): void`.
- **web/ws/events.ts**: `connectEvents(options?) -> { subscribe(channel, handler) => () => void; close() }`.
  Auto-(re)connect via setTimeout (reconnectDelayMs, default 1000); on each `open` it
  re-sends `{subscribe:<channel>}` for every channel with handlers (resubscribeAll);
  per-channel handler registry; JSON envelope parse + structural guard (drops the
  `{type:"hello"}` greeting). Local mirror of EventEnvelope/EVENT_TYPES/CHANNELS
  (web does NOT import @otter/shared). Delivers data ONLY — never scrolls/focuses
  (MIN-32/Attention constraint).
- **Tests**: core 13 (3 bus unit, 6 gateway transport via standalone bus incl. attention
  transport + multi-channel + unsubscribe + no-ghost-after-close + reconnect, 4 e2e via
  real ticket-core server: comment_created, ticket_transitioned, project ticket_updated,
  reconnect). web 8 (subscribe dispatch, hello/non-envelope ignored, per-channel routing,
  unsubscribe frame, keep-while-others, re-subscribe on reconnect, close stops reconnect,
  handler-exception isolation).

## Gist
Attention channel has no persistence yet (MIN-37/38), so its test publishes directly on
the bus and asserts a subscribed client receives `attention_item_created` — proves the
TRANSPORT, documented in the test. Node 24 global `WebSocket` used for real ws clients in
core tests (no new dep). Verified: tsc core 0, tsc web 0; vitest core 69, web 120, all green.
A transient tsc error surfaced once in Impl-C's runtime.test.ts (Ticket.projectId) during
parallel edits; cleared on re-run, not in my scope.
