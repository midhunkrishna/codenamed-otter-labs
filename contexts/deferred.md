# Deferred Items

Cross-session backlog of work explicitly deferred during planning/execution
(actor pattern §4). The Orchestrator checks this file when planning a new theme
to see whether the new plan can absorb any of these. Remove an entry when it
lands.

---

## From plan 002 — ticket-core (MIN-15)

### D-002-1 · Plan-approval lifecycle guard
- **What:** MIN-15 invariants "executable requires approved plan" and "in_progress
  requires approved plan and no block". The state machine exposes a typed
  `planApproved` guard hook that is **permissive for MVP (always returns true)**.
- **Why deferred:** the plan-approval workflow doesn't exist yet (separate theme).
- **Wire when:** the plan-approval theme lands (MIN-23 `[ticket-core] Add plan
  approval flow`). Point `planApproved` at "an approved `plan` row exists for the
  ticket" and remove the permissive stub. Until then `→ executable` / `→ in_progress`
  are NOT gated on a plan.
- **status:** Pending

---

## From plan 003 — design-system (MIN-43)

### D-003-1 · Non-default theme visual refinement (Notion / Jira / Celebration)
- **What:** all 4 themes are selectable and complete, but per invariant 2 the three
  non-Linear themes are "less visually refined" — their non-anchored palette values
  (surfaces, borders, muted text, `*Soft` alphas) were derived, not hand-tuned.
- **Why deferred:** MVP requires multi-theme *architecture* from day one, not polish.
- **Do when:** a design-polish pass is scheduled. Linear (default) is the refined one.
- **status:** Pending

### D-003-2 · Real pages behind the nav placeholders
- **What:** Attention / Runs / Approvals / Docs / Settings nav destinations currently
  render `<EmptyState>` placeholders in `App.tsx`.
- **Why deferred:** out of scope for the design-system foundation — these are their
  own tracked tickets.
- **Do when:** building those tickets — they MUST consume the new primitives
  (`AttentionCard`, `ApprovalCard`, `VerificationPacketTabs`, `Drawer`, etc.):
  Attention MIN-37/38, Approvals MIN-31, Runs MIN-32, Docs MIN-33, Settings MIN-34,
  Verification MIN-39/40/41/42, Forms MIN-27.
- **status:** Pending

### D-003-3 · Adopt `@vanilla-extract/dynamic` (optional)
- **What:** dynamic per-instance tone vars are applied via a local `inlineVars()`
  shim in `ui/tone.ts` (unwraps `createVar()`'s `var(--x)` → bare `--x`).
- **Why deferred:** `@vanilla-extract/dynamic` wasn't installed; the shim is the
  documented equivalent of `assignInlineVars` and works.
- **Do when:** convenient — install the package and replace `inlineVars()` with
  `assignInlineVars` for a smaller maintenance surface. Pure cleanup; no behavior change.
- **status:** Pending
