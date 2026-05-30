# Plan 004 — Adversarial Analysis Synthesis

Three independent read-only reviews of the uncommitted `runtime-foundations` branch:
**inversion**, **adversary**, **deep edge-case/bug**. (Agents' own report writes were
harness-blocked; consolidated here by the orchestrator.) Full suite was **256/256** green
during review — several findings are *masked by tests* or *latent until MIN-44*.

Convergence is high: **all three independently found and reproduced the same #1 bug.**

## What's solid (verified-good by ≥1 reviewer)
- SQL is **parameterized everywhere** (incl. the dynamic `runs.list()` filter) — no injection.
- Subprocess uses `execFile` (no shell) + fixed `["--version"]` — no argv/shell injection.
- WS teardown hardened: OPEN-guarded sends, single `subscribeAll`, torn down on close+error.
- Migration 0003 additive + idempotent; `ticket.project_id` backfills; seed ordering valid.
- Context packet (MIN-20) determinism holds (byte-identical for identical state).

---

## CONFIRMED BUG (reachable today)

### B1 · `POST /api/runs` with bad/empty `ticketId` → raw 500 `FOREIGN KEY constraint failed`
Found independently by **all three** reviewers; reproduced via the real route.
- `runtime/routes.ts:87` `runs.create(...)` has no try/catch → `repositories/runs.ts:104-107`
  INSERT trips the `agent_runs.ticket_id REFERENCES ticket(id)` FK (enforcement ON).
- Violates the documented `{error}` 400/404/409 contract; leaks the SQLite error.
- `""` also slips through: route validation only rejects a *non-string* ticketId, and
  `?? null` doesn't catch empty string → `WHERE`/INSERT with `""`.
- **Masked by a vacuous test:** `runtime.test.ts:133` POSTs `ticketId:"t-1"` (no such ticket),
  ignores the status, then asserts `.every()` on the (empty) list — vacuously true.
- **Fix:** coerce `""`→null; verify ticket exists (400/404) or wrap create in try/catch
  mapping FK→400; add a real assertion. *This is the exact seam MIN-44 hits first.*

---

## SECURITY (local threat model; high-leverage before MIN-44)

### S1 · No WebSocket `Origin` check → Cross-Site WebSocket Hijacking  [adversary HIGH]
`events/gateway.ts:26` registers `/ws` with no origin/`verifyClient` gate. The browser will
connect a `127.0.0.1` socket from *any* site the user visits (SOP doesn't gate `WebSocket`);
a hostile tab subscribes to `project`/`attention`/`approvals`/`run:<id>`/`ticket:<id>` and
reads the stream. Today = metadata (ids/status). **After MIN-44 = raw Claude stdout +
permission prompts.** Fix: `Origin` allowlist on the upgrade (localhost/127.0.0.1 only).

### S2 · Subprocess binary is PATH/env/cwd-controlled  [adversary HIGH]
`claude/detect.ts:37` resolves `binPath ?? OTTER_CLAUDE_BIN ?? "claude"` against inherited
PATH + repo cwd. A planted `claude` on PATH / repo-local / hostile `OTTER_CLAUDE_BIN` runs at
boot and on `/claude/status` — and is the trust anchor MIN-44 will *spawn to do work*. Fix:
resolve to an absolute path, ignore cwd-relative PATH entries, refuse a binary inside the
project root, sanitize env/cwd for the MIN-44 spawn; surface the resolved path in status.

---

## LATENT CLIFFS — close before MIN-44 produces real run output

### L1 · `run_output_delta` dedupe relies on an UNFROZEN payload contract  [inversion M2 + edge M3]
`RunDetail.tsx:90-104` dedupes by per-run `seq` but falls back to the **bus-global** `env.seq`
(`bus.ts`), which never equals the HTTP per-run `agent_run_events.seq`. When MIN-44 emits a
delta without a per-run `seq` in `payload`, the `run_status_changed`→`load()` refetch
re-introduces it → **duplicated/reordered output**. Test only passes because it hand-feeds
`payload:{seq:2}`. Fix: freeze the `run_output_delta` payload to carry per-run `seq`+`id`;
dedupe by `id`; drop the bus-seq fallback.

### L2 · Context packet embeds untrusted text verbatim (prompt-injection)  [adversary M4]
`context/packet.ts` concatenates ticket description / comment body / form Q&A / approved plan
straight into Markdown, and appends the planning-mode "do NOT edit files" guard *after* that
attacker-influenceable text with no delimiter. A crafted comment can override the planning
guard. Latent (no model consumer yet) but it's exactly MIN-44's input. Fix: fence/preamble
untrusted sections, bound length, make the mode/guard non-overridable by content.

### L3 · `setStatus` allows illegal transitions; terminal timestamps not maintained  [edge M1/M2]
`runs.ts:75-95` enforces no transition legality and never clears `finished_at`:
`completed→running` leaves `finishedAt` set; canceling a `queued` run sets `finishedAt` with
`startedAt` null. Latent (only guard/cancel drive status today) but MIN-44 will drive arbitrary
status. Fix: validate edges (or clear `finished_at` on leaving terminal) + enforce
`startedAt<=finishedAt`.

### L4 · No pagination / size caps  [adversary M2/M3 + edge]
`GET /runs/:id/events` is `SELECT * ... ORDER BY seq` with no LIMIT; the web client concatenates
**all** `output_delta` text into one `CodeBlock`. Run-event payloads have no byte cap. A long
MIN-44 run materializes its whole history per mount on both ends. Fix: `?afterSeq=&limit=`
cursor + windowed output + per-event byte cap.

### L5 · WS accepts unbounded arbitrary channel subscriptions  [adversary M1]
`gateway.ts:60` `subscribed.add(msg.subscribe)` — no membership check vs `CHANNELS`, no cap.
One tab can loop subscriptions → per-connection `Set` + per-publish CPU growth (DoS). Fix:
validate channel grammar (static set + `run:`/`ticket:` prefixes), cap per socket.

---

## ROBUSTNESS / UX

- **R1 · "UI recovers via HTTP" only partial** [inversion M1]: `ws/events.ts` re-subscribes on
  reconnect but never refetches; an event lost during the WS gap is never recovered until an
  unrelated event/manual refresh. Fix: on reconnect-`open`, trigger an HTTP refetch.
- **R2 · Claude probe is sticky for the run guard** [inversion M3]: the guard reads a cached
  boot probe and never re-probes; a Claude installed after boot keeps failing runs until the
  user opens `/claude/status` (the only re-probe). AND `/claude/status` spawns an uncoalesced
  subprocess per request [edge M4]. Fix: re-probe (TTL) in the guard; coalesce in-flight probes.
- **R3 · `setState` after unmount** [edge L1]: RunDetail `load()`/`handleCancel` lack a
  mounted/AbortController guard (warning, not crash).
- **R4 · Empty-string query params inconsistent** [edge L4]: `status=""`→400 but
  `projectId=""`/`ticketId=""`→silent empty list. Normalize empty→absent.
- **R5 · Guard-fail emits `run_created` already-`failed` then `run_status_changed`** — double
  refetch; harmless today.

## TEST-INTEGRITY NOTES
- Masking vacuous assertion behind B1 (`runtime.test.ts:133`).
- `events.test.ts` + `routes.test.ts` whole-suite `describe.skip` if a persistence factory is
  renamed — emit-wiring tests could silently vanish on a green run.
- Web mirrors (`api/runs.ts`, `ws/events.ts`) hand-redeclare frozen shapes; no test asserts
  mirror == `@otter/shared` source (channel-log/human enforced only).
- `server.test.ts` fake-DB now hand-rolls the bootstrap SQL shape; a broken bootstrap stays
  green there (covered by real-SQLite runtime tests).

## FIXES APPLIED (this pass)
The agreed High-severity set is fixed + tested (full suite **266 green**, 4 pkgs tsc clean,
live boot re-verified):
- **B1 — FK/ticketId** `runtime/routes.ts`: empty/whitespace ticketId → null; unknown ticket
  → **404 `{error}`** (validated before INSERT, no more raw 500). Masking test rewritten to
  use a real ticket + non-vacuous assert; added 404 + empty-string tests.
- **S1 — WS Origin guard** `events/gateway.ts`: cross-origin browser upgrades closed with
  **1008**; localhost/127.0.0.1/::1 + no-Origin (CLI) allowed. `isAllowedOrigin` exported +
  unit-tested; real-socket reject/allow tests via the `ws` client.
- **L1 — output-delta contract** `shared/events.ts`: froze `RunEventPayload {id,runId,seq,text}`;
  `RunDetail.tsx` now dedupes by persisted `id` (drops the bus-seq fallback), orders output by
  per-run `seq`, and drops unkeyed deltas (HTTP recovers). Console tests updated + drop-test added.
- **L2 — context prompt-injection** `context/packet.ts`: untrusted description/comments/form/plan
  text wrapped in a CommonMark-safe `fenceUntrusted()` (fence grows past any backtick run), added
  an untrusted-data preamble + an "authoritative, overrides fenced sections" note on Instructions.
  Injection + fence-breakout tests added.

## STILL OPEN (recommended follow-ups — not in this pass)
- **S2** subprocess PATH/env/cwd trust (needs project-root plumbing); **R1** HTTP refetch on WS
  reconnect; **R2** sticky Claude guard re-probe + coalesce `/claude/status`; **L3** `setStatus`
  transition legality + terminal timestamps; **L4** pagination/payload caps; **L5** WS subscription
  validation/caps; plus the Low/Note nits. Most are latent until MIN-44 — candidates for Linear issues.

## Severity tally (deduped)
Critical 0 · High 3 (B1, S1, S2) · Medium ~6 (L1–L5, R1/R2) · Low/Note: the rest.
**Recommended order:** B1 (real bug + fix masking test) → S1 (WS Origin) → L1 + L2
(freeze MIN-44 input contracts) → S2 / R2 → pagination/caps → robustness nits.
