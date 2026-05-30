import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TicketDetail } from "./TicketDetail";
import type { Comment, Ticket, TransitionsResponse } from "../api/client";
import type { Plan } from "../api/plans";

/**
 * Plan-tab tests (MIN-23 frontend). A mocked `fetch` serves a tiny in-memory
 * backend (mirrors Board.test.tsx). Covers:
 *  - the Plan section renders the latest proposed plan
 *  - Approve + Send back render for a needs_user_approval ticket
 *  - Approve POSTs to /plans/:id/approve
 *  - Send back requires feedback and POSTs to /plans/:id/send-back
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function ticket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: "t1",
    title: "Plannable ticket",
    description: "",
    status: "needs_user_approval",
    blockStatus: "none",
    approvedPlanId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: "p1",
    ticketId: "t1",
    runId: "r1",
    version: 1,
    title: "Ship the widget",
    status: "proposed",
    content: "# Ship the widget\n\n## Steps\n1. Do the thing",
    artifactPath: "artifacts/plans/t1-v1.md",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

interface FakeState {
  tickets: Ticket[];
  comments: Comment[];
  transitions: TransitionsResponse;
  plans: Plan[];
}

function installFetch(state: FakeState) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.replace(/^https?:\/\/[^/]+/, "");

    const idMatch = path.match(/^\/api\/tickets\/([^/]+)$/);
    if (idMatch && method === "GET") {
      const found = state.tickets.find((t) => t.id === idMatch[1]);
      return Promise.resolve(
        found ? jsonResponse(found) : jsonResponse({ error: "not found" }, 404),
      );
    }
    const commentsMatch = path.match(/^\/api\/tickets\/([^/]+)\/comments$/);
    if (commentsMatch && method === "GET") {
      return Promise.resolve(jsonResponse(state.comments));
    }
    const transitionsMatch = path.match(/^\/api\/tickets\/([^/]+)\/transitions$/);
    if (transitionsMatch && method === "GET") {
      return Promise.resolve(jsonResponse(state.transitions));
    }
    const plansMatch = path.match(/^\/api\/tickets\/([^/]+)\/plans$/);
    if (plansMatch && method === "GET") {
      return Promise.resolve(jsonResponse(state.plans));
    }
    const approveMatch = path.match(/^\/api\/plans\/([^/]+)\/approve$/);
    if (approveMatch && method === "POST") {
      const p = state.plans.find((pl) => pl.id === approveMatch[1])!;
      p.status = "approved";
      state.tickets[0]!.status = "executable";
      return Promise.resolve(jsonResponse({ ticket: state.tickets[0], plan: p }));
    }
    const sendBackMatch = path.match(/^\/api\/plans\/([^/]+)\/send-back$/);
    if (sendBackMatch && method === "POST") {
      const p = state.plans.find((pl) => pl.id === sendBackMatch[1])!;
      p.status = "sent_back";
      state.tickets[0]!.status = "plannable";
      return Promise.resolve(jsonResponse({ ticket: state.tickets[0], plan: p }));
    }

    return Promise.resolve(jsonResponse({ error: `unhandled ${method} ${path}` }, 500));
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

function renderDetail() {
  return render(<TicketDetail ticketId="t1" onMutated={() => {}} />);
}

describe("TicketDetail plan tab", () => {
  it("renders the latest proposed plan and its content", async () => {
    installFetch({
      tickets: [ticket()],
      comments: [],
      transitions: { current: "needs_user_approval", next: [] },
      plans: [plan()],
    });
    renderDetail();

    const section = await screen.findByRole("region", { name: "Plan" });
    expect(within(section).getByText("Ship the widget")).toBeInTheDocument();
    expect(within(section).getByText("v1")).toBeInTheDocument();
    expect(within(section).getByText(/Do the thing/)).toBeInTheDocument();
  });

  it("shows Approve + Send back for a needs_user_approval proposed plan", async () => {
    installFetch({
      tickets: [ticket()],
      comments: [],
      transitions: { current: "needs_user_approval", next: [] },
      plans: [plan()],
    });
    renderDetail();

    const section = await screen.findByRole("region", { name: "Plan" });
    expect(within(section).getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Send back" })).toBeInTheDocument();
  });

  it("Approve POSTs to /plans/:id/approve", async () => {
    const spy = installFetch({
      tickets: [ticket()],
      comments: [],
      transitions: { current: "needs_user_approval", next: [] },
      plans: [plan()],
    });
    renderDetail();

    const section = await screen.findByRole("region", { name: "Plan" });
    fireEvent.click(within(section).getByRole("button", { name: "Approve" }));

    await waitFor(() => {
      const posted = spy.mock.calls.some(([input, init]) => {
        const u = typeof input === "string" ? input : (input as Request).url;
        return u.includes("/api/plans/p1/approve") &&
          (init?.method ?? "").toUpperCase() === "POST";
      });
      expect(posted).toBe(true);
    });
  });

  it("Send back requires feedback, then POSTs the feedback", async () => {
    const spy = installFetch({
      tickets: [ticket()],
      comments: [],
      transitions: { current: "needs_user_approval", next: [] },
      plans: [plan()],
    });
    renderDetail();

    const section = await screen.findByRole("region", { name: "Plan" });
    const sendBack = within(section).getByRole("button", { name: "Send back" });
    // Disabled until feedback is entered (required).
    expect(sendBack).toBeDisabled();

    fireEvent.change(within(section).getByLabelText("Send-back feedback"), {
      target: { value: "please reconsider the approach" },
    });
    expect(sendBack).not.toBeDisabled();
    fireEvent.click(sendBack);

    await waitFor(() => {
      const posted = spy.mock.calls.some(([input, init]) => {
        const u = typeof input === "string" ? input : (input as Request).url;
        if (
          !u.includes("/api/plans/p1/send-back") ||
          (init?.method ?? "").toUpperCase() !== "POST"
        ) {
          return false;
        }
        const body = JSON.parse(String(init?.body)) as { feedback: string };
        return body.feedback === "please reconsider the approach";
      });
      expect(posted).toBe(true);
    });
  });

  it("hides the decision controls when the latest plan is not proposed", async () => {
    installFetch({
      tickets: [ticket({ status: "executable", approvedPlanId: "p1" })],
      comments: [],
      transitions: { current: "executable", next: [] },
      plans: [plan({ status: "approved" })],
    });
    renderDetail();

    const section = await screen.findByRole("region", { name: "Plan" });
    expect(within(section).queryByRole("button", { name: "Approve" })).toBeNull();
    expect(within(section).queryByRole("button", { name: "Send back" })).toBeNull();
  });
});
