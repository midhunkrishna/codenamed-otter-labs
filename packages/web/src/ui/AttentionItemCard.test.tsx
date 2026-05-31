/**
 * MIN-38 — AttentionItemCard (expandable in-place cards).
 *
 * Covers the plan §2 Impl-D test list: collapsed expands in place; the plan item
 * can approve / send back (the one fully-wired live path); each attentionType
 * renders its dedicated expanded body; execution_failed / run_stalled expose a
 * run link; unknown type → generic fallback (never throws); a live `item` update
 * does NOT auto-collapse an expanded card.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { AttentionItemCard } from "./AttentionItemCard";
import type { AttentionItemVM, AttentionType } from "../api/attention";

// ── Mock the source APIs (the card's only side-effects) ─────────
const approvePlan = vi.fn();
const sendBackPlan = vi.fn();
const resolveAttention = vi.fn();
const dismissAttention = vi.fn();

vi.mock("../api/plans", () => ({
  approvePlan: (...a: unknown[]) => approvePlan(...a),
  sendBackPlan: (...a: unknown[]) => sendBackPlan(...a),
}));
vi.mock("../api/attention", async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)();
  return {
    ...actual,
    resolveAttention: (...a: unknown[]) => resolveAttention(...a),
    dismissAttention: (...a: unknown[]) => dismissAttention(...a),
  };
});

/** Click the collapsed card's clickable shell (its accessible name combines the
 * title + summary + required action, so match by the title prefix). */
function expandCard(title: string) {
  // The collapsed card is one big <button>; its accessible name concatenates the
  // type label, priority, ticket key, title, summary + required action — so match
  // on the title as a substring.
  const re = new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  fireEvent.click(screen.getByRole("button", { name: re }));
}

function item(over: Partial<AttentionItemVM> = {}): AttentionItemVM {
  return {
    id: "a1",
    projectId: "local-project",
    attentionType: "plan_approval",
    sourceType: "plan",
    sourceId: "plan-1",
    ticketId: "MIN-9",
    runId: null,
    status: "open",
    priority: "high",
    title: "Plan awaiting approval",
    summary: "A short summary.",
    requiredAction: "Approve plan or send back with feedback.",
    metadata: {},
    createdAt: "2026-05-30T00:00:00.000Z",
    updatedAt: "2026-05-30T00:00:00.000Z",
    resolvedAt: null,
    dismissedAt: null,
    expiresAt: null,
    ...over,
  };
}

/** Stateful harness mirroring the page: parent owns `expanded`. */
function Harness({
  initial,
  onResolved = () => {},
}: {
  initial: AttentionItemVM;
  onResolved?: () => void;
}) {
  const [it, setIt] = useState(initial);
  const [expanded, setExpanded] = useState(false);
  // Expose a refetch hook for the live-update test.
  (Harness as unknown as { _set?: (v: AttentionItemVM) => void })._set = setIt;
  return (
    <AttentionItemCard
      item={it}
      expanded={expanded}
      onToggleExpand={() => setExpanded((v) => !v)}
      onResolved={onResolved}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  approvePlan.mockResolvedValue({});
  sendBackPlan.mockResolvedValue({});
  resolveAttention.mockResolvedValue({});
  dismissAttention.mockResolvedValue({});
});

describe("AttentionItemCard — collapse/expand", () => {
  it("renders collapsed by default and expands in place on title click", () => {
    render(<Harness initial={item()} />);
    const card = screen.getByTestId("attention-card-a1");
    expect(card).toHaveAttribute("data-expanded", "false");
    expect(screen.queryByTestId("attention-card-body-a1")).toBeNull();

    expandCard("Plan awaiting approval");
    expect(screen.getByTestId("attention-card-a1")).toHaveAttribute(
      "data-expanded",
      "true",
    );
    expect(screen.getByTestId("attention-card-body-a1")).toBeInTheDocument();
  });

  it("collapses again via the Collapse button", () => {
    render(<Harness initial={item()} />);
    expandCard("Plan awaiting approval");
    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    expect(screen.getByTestId("attention-card-a1")).toHaveAttribute(
      "data-expanded",
      "false",
    );
  });
});

describe("AttentionItemCard — plan_approval (fully wired)", () => {
  function expand() {
    render(<Harness initial={item({ attentionType: "plan_approval" })} />);
    expandCard("Plan awaiting approval");
  }

  it("approves the plan via the existing endpoint then resolves", async () => {
    const onResolved = vi.fn();
    render(<Harness initial={item()} onResolved={onResolved} />);
    expandCard("Plan awaiting approval");
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(approvePlan).toHaveBeenCalledWith("plan-1"));
    expect(onResolved).toHaveBeenCalled();
  });

  it("sends the plan back with required feedback then resolves", async () => {
    const onResolved = vi.fn();
    render(<Harness initial={item()} onResolved={onResolved} />);
    expandCard("Plan awaiting approval");
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    const ta = screen.getByLabelText("Send-back feedback");
    // Empty feedback keeps the send-back disabled.
    expect(screen.getByRole("button", { name: "Send back with feedback" })).toBeDisabled();
    fireEvent.change(ta, { target: { value: "Please narrow the scope." } });
    fireEvent.click(screen.getByRole("button", { name: "Send back with feedback" }));
    await waitFor(() =>
      expect(sendBackPlan).toHaveBeenCalledWith("plan-1", "Please narrow the scope."),
    );
    expect(onResolved).toHaveBeenCalled();
  });
});

describe("AttentionItemCard — per-type expanded bodies", () => {
  function expandType(t: AttentionType, over: Partial<AttentionItemVM> = {}) {
    render(<Harness initial={item({ attentionType: t, title: t, ...over })} />);
    expandCard(t);
  }

  it("permission_request renders an ApprovalCard body", () => {
    expandType("permission_request", { metadata: { command: "rm -rf build" } });
    expect(screen.getByTestId("attention-card-body-a1").querySelector("[data-permission-body]")).toBeTruthy();
    expect(screen.getByText("rm -rf build")).toBeInTheDocument();
  });

  it("verification_review renders the four-lens tabs", () => {
    expandType("verification_review");
    const body = screen.getByTestId("attention-card-body-a1");
    expect(body.querySelector("[data-verification-tabs]")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Walkthrough" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Why" })).toBeInTheDocument();
  });

  it("clarification_required renders a FormCommentCard body", () => {
    expandType("clarification_required", { metadata: { question: "Which env?" } });
    const body = screen.getByTestId("attention-card-body-a1");
    expect(body.querySelector("[data-form-state]")).toBeTruthy();
    expect(screen.getByText("Which env?")).toBeInTheDocument();
  });

  it("execution_failed shows the failed command + output + a run link", () => {
    expandType("execution_failed", {
      runId: "run-7",
      ticketId: null,
      metadata: { command: "pnpm build", lastOutput: "exit 1" },
    });
    const body = screen.getByTestId("attention-card-body-a1");
    expect(body.querySelector("[data-execution-failed-body]")).toBeTruthy();
    expect(screen.getByText("pnpm build")).toBeInTheDocument();
    expect(screen.getByText("exit 1")).toBeInTheDocument();
    expect(body.querySelector("[data-run-link]")).toHaveAttribute(
      "href",
      "#/runs/run-7",
    );
  });

  it("run_stalled shows run status + a run link", () => {
    expandType("run_stalled", {
      runId: "run-9",
      ticketId: null,
      metadata: { runStatus: "stalled", elapsed: "12m" },
    });
    const body = screen.getByTestId("attention-card-body-a1");
    expect(body.querySelector("[data-run-stalled-body]")).toBeTruthy();
    expect(body.querySelector("[data-run-link]")).toHaveAttribute(
      "href",
      "#/runs/run-9",
    );
  });

  it("plan/permission/etc always expose a link to the full ticket/run", () => {
    expandType("permission_request");
    const body = screen.getByTestId("attention-card-body-a1");
    // ticketId set on default item → ticket link
    expect(body.querySelector("[data-ticket-link]")).toHaveAttribute(
      "href",
      "#/tickets/MIN-9",
    );
  });

  it("the 5 deferred types show a stubbed/disabled primary action with a note", () => {
    expandType("permission_request");
    const stub = screen.getByTestId("attention-card-body-a1").querySelector("[data-stub-actions]")!;
    expect(stub).toBeTruthy();
    expect(stub.querySelector("[data-deferred-note]")?.textContent).toMatch(
      /Action available when/i,
    );
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
  });
});

describe("AttentionItemCard — generic affordances", () => {
  it("dismiss + mark-resolved call the generic attention API", async () => {
    const onResolved = vi.fn();
    render(<Harness initial={item({ attentionType: "permission_request" })} onResolved={onResolved} />);
    expandCard("Plan awaiting approval");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(dismissAttention).toHaveBeenCalledWith("a1"));
    fireEvent.click(screen.getByRole("button", { name: "Mark resolved" }));
    await waitFor(() => expect(resolveAttention).toHaveBeenCalledWith("a1"));
  });
});

describe("AttentionItemCard — unknown type fallback", () => {
  it("renders a generic fallback body and never throws", () => {
    const unknown = item({
      // Force an out-of-enum value at the boundary.
      attentionType: "totally_unknown" as AttentionType,
      title: "Mystery",
    });
    render(<Harness initial={unknown} />);
    expandCard("Mystery");
    const body = screen.getByTestId("attention-card-body-a1");
    expect(body.querySelector("[data-generic-fallback]")).toBeTruthy();
    // The raw type is still surfaced for debuggability.
    expect(screen.getByText("totally_unknown")).toBeInTheDocument();
  });
});

describe("AttentionItemCard — live update stability", () => {
  it("does not auto-collapse an expanded card when `item` is refetched", async () => {
    render(<Harness initial={item({ title: "Stay open" })} />);
    expandCard("Stay open");
    expect(screen.getByTestId("attention-card-a1")).toHaveAttribute(
      "data-expanded",
      "true",
    );

    // Simulate a refetch updating the item prop (e.g. summary changed).
    const set = (Harness as unknown as { _set: (v: AttentionItemVM) => void })._set;
    act(() => set(item({ title: "Stay open", summary: "Updated summary." })));

    await waitFor(() =>
      expect(screen.getAllByText("Updated summary.").length).toBeGreaterThan(0),
    );
    // Still expanded — the prop change did NOT reset it.
    expect(screen.getByTestId("attention-card-a1")).toHaveAttribute(
      "data-expanded",
      "true",
    );
  });
});
