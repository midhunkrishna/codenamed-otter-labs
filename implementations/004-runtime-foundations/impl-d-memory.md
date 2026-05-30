# Impl-D memory — MIN-20 ticket context packet

## 1. Files read / written

| File | R/W | Why |
|---|---|---|
| plans/004-runtime-foundations.md | R | Spec (§3i, §5 D, §8 assumptions) |
| .claude/CLAUDE.md | R | Project instructions |
| channels/004-runtime-foundations-channel.log | R/W | Coordination (start + READY) |
| packages/shared/src/domain.ts | R | Ticket/Comment types, metadata shape |
| packages/persistence/src/repositories/comments.ts | R | Comment ordering (created_at ASC, rowid ASC) + metadata JSON parse |
| packages/persistence/src/repositories/tickets.ts | R | Ticket row mapping |
| packages/persistence/src/repositories/events.ts | R | Ordering convention reference |
| packages/persistence/src/index.ts | R | Exports / Database type |
| packages/persistence/src/database.ts | R | `Database` type re-export |
| packages/persistence/src/migrations/0001_init.sql | R | `plan` table columns (id, ticket_id, status, content, created_at, updated_at) |
| packages/persistence/src/migrations/0002_ticket_core.sql | R | comment.metadata + block_status columns |
| packages/core/src/routes/comments.ts | R | listComments semantics |
| packages/core/src/routes/index.ts | R | How core imports `Database` from @otter/persistence |
| packages/core/src/routes.test.ts | R | Test bootstrap to mirror (mkdtemp + resolvePaths + initPersistence) |
| **packages/core/src/context/packet.ts** | **W** | Deliverable |
| **packages/core/src/context.test.ts** | **W** | Tests (§5 D) |
| implementations/004-runtime-foundations/impl-d-memory.md | W | This file |

## 2. Summary

Implemented `buildTicketContext(db, ticketId, { mode, projectRoot, constraints? }) -> string`
(Markdown) in `packages/core/src/context/packet.ts`. Pure, read-only, no network/fs
side effects. Reads ticket + comment + plan tables directly from SQLite. Plans read
via inline SQL (no plan repository exists yet) — oldest approved plan is the canonical
approved plan. Comments and plans ordered `created_at ASC, rowid ASC` → deterministic.

Sections: title header + id/status/block status; Description; Comments (oldest-first,
form comments excluded from the conversation list); Form answers (Q&A, omitted when
none); Plans (planning mode = status-only list, no plan content; execution mode =
approved plan content prominent under "### Approved plan" + other plans listed);
Project root + constraints; mode-specific Instructions. Planning mode emits an explicit
"Do NOT edit files..." instruction and excludes execution instructions + approved-plan
content. Execution mode includes "Execute the approved plan" + "Mode: execution.".

Output ends with exactly one trailing newline (determinism). Unknown ticket returns a
`# Ticket not found: <id>` doc rather than throwing.

7 new tests in `context.test.ts` against real temp SQLite + real migrations (mirrors
routes.test.ts bootstrap; probe-skips if persistence not importable). Covers: new
comments included; form Q&A; execution includes approved plan; planning excludes
execution instructions + contains do-not-edit; project root/constraints; determinism
(called twice, byte-identical); not-found.

Done criteria met: `tsc -p packages/core` exit 0; `vitest run packages/core` → 38/38.

## 3. Gist

Form-answer source convention (documented assumption, §8): comments with
`metadata.kind === "form"` carrying `{ question, answer }`. Such comments are pulled
OUT of the normal Comments list and rendered only under "## Form answers". The approved
plan is `plan.status === "approved"` (oldest if multiple). No schema or cross-package
source was modified.
