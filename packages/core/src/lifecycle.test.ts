import { describe, expect, it } from "vitest";
import { TICKET_STATUSES, type BlockStatus, type TicketStatus } from "@otter/shared";
import { TRANSITIONS, canTransition, nextTransitions } from "./lifecycle.js";

const none: { blockStatus: BlockStatus } = { blockStatus: "none" };
const blocked: { blockStatus: BlockStatus } = { blockStatus: "blocked" };

describe("TRANSITIONS map (plan §4)", () => {
  it("covers every status and matches the structural map exactly", () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...TICKET_STATUSES].sort());
    expect(TRANSITIONS).toEqual({
      created: ["plannable", "canceled"],
      plannable: ["needs_user_approval", "canceled"],
      needs_user_approval: ["executable", "plannable", "canceled"],
      executable: ["in_progress", "plannable", "canceled"],
      in_progress: ["needs_user_review", "failed", "canceled"],
      needs_user_review: ["done", "in_progress", "failed", "canceled"],
      failed: ["plannable", "canceled"],
      done: [],
      canceled: [],
    });
  });

  it("done and canceled are terminal", () => {
    expect(nextTransitions("done", none)).toEqual([]);
    expect(nextTransitions("canceled", none)).toEqual([]);
  });
});

describe("canTransition — MIN-15 cases (plan §6)", () => {
  it("created → plannable ✓", () => {
    expect(canTransition("created", "plannable", none)).toBe(true);
  });

  it("created → executable ✗ (not structurally allowed)", () => {
    expect(canTransition("created", "executable", none)).toBe(false);
  });

  it("needs_user_approval → {executable, plannable} ✓", () => {
    expect(canTransition("needs_user_approval", "executable", none)).toBe(true);
    expect(canTransition("needs_user_approval", "plannable", none)).toBe(true);
  });

  it("executable → in_progress ✓ when blockStatus is none", () => {
    expect(canTransition("executable", "in_progress", none)).toBe(true);
  });

  it("→ in_progress ✗ when blockStatus is blocked", () => {
    expect(canTransition("executable", "in_progress", blocked)).toBe(false);
    expect(canTransition("needs_user_review", "in_progress", blocked)).toBe(false);
  });

  it("unknown / unlisted transitions are rejected", () => {
    expect(canTransition("done", "plannable", none)).toBe(false);
    expect(canTransition("created", "in_progress", none)).toBe(false);
  });
});

describe("planApproved guard — DEFERRED, permissive for MVP", () => {
  it("allows plan-gated targets when planApproved is undefined (MVP default)", () => {
    expect(canTransition("needs_user_approval", "executable", none)).toBe(true);
    expect(canTransition("executable", "in_progress", none)).toBe(true);
  });

  it("allows when planApproved is explicitly true", () => {
    expect(canTransition("needs_user_approval", "executable", { ...none, planApproved: true })).toBe(
      true,
    );
  });

  it("only blocks plan-gated targets when planApproved is explicitly false", () => {
    expect(
      canTransition("needs_user_approval", "executable", { ...none, planApproved: false }),
    ).toBe(false);
    expect(canTransition("executable", "in_progress", { ...none, planApproved: false })).toBe(
      false,
    );
    // non-plan-gated targets are unaffected by planApproved
    expect(canTransition("executable", "plannable", { ...none, planApproved: false })).toBe(true);
  });
});

describe("nextTransitions — only currently-allowed targets", () => {
  it("filters out in_progress when blocked", () => {
    expect(nextTransitions("executable", blocked)).toEqual(["plannable", "canceled"]);
    expect(nextTransitions("executable", none)).toEqual(["in_progress", "plannable", "canceled"]);
  });

  it("filters plan-gated targets when planApproved is explicitly false", () => {
    expect(nextTransitions("needs_user_approval", { ...none, planApproved: false })).toEqual([
      "plannable",
      "canceled",
    ]);
  });

  it("returns every structural target for created (no guards apply)", () => {
    expect(nextTransitions("created", none)).toEqual(["plannable", "canceled"]);
  });

  const allStatuses: TicketStatus[] = [...TICKET_STATUSES];
  it("never returns a target outside the structural map", () => {
    for (const from of allStatuses) {
      for (const to of nextTransitions(from, none)) {
        expect(TRANSITIONS[from]).toContain(to);
      }
    }
  });
});
