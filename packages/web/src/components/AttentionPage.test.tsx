import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AttentionPage } from "./AttentionPage";
import type { AttentionItem } from "../api/attention";
import type { Ticket } from "../api/client";

/**
 * Attention page tests (MIN-23 frontend). A mocked `fetch` serves a tiny
 * in-memory backend. Covers:
 *  - open attention items are listed
 *  - clicking an item opens its ticket detail (discover + resolve flow)
 *  - the empty state renders when there are no items
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function item(over: Partial<AttentionItem> = {}): AttentionItem {
  return {
    id: "a1",
    ticketId: "t1",
    kind: "plan_approval",
    status: "open",
    refId: "p1",
    detail: "Plan v1 is ready for approval",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    resolvedAt: null,
    ...over,
  };
}

function ticket(over: Partial<Ticket> = {}): Ticket {
  return {
    id: "t1",
    title: "Plannable ticket",
    description: "",
    status: "needs_user_approval",
    blockStatus: "none",
    approvedPlanId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function installFetch(items: AttentionItem[]) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const path = url.replace(/^https?:\/\/[^/]+/, "");

    if (path.startsWith("/api/attention")) {
      return Promise.resolve(jsonResponse(items));
    }
    // The opened ticket's detail loads these.
    if (path === "/api/tickets/t1") return Promise.resolve(jsonResponse(ticket()));
    if (path === "/api/tickets/t1/comments") return Promise.resolve(jsonResponse([]));
    if (path === "/api/tickets/t1/transitions")
      return Promise.resolve(jsonResponse({ current: "needs_user_approval", next: [] }));
    if (path === "/api/tickets/t1/plans") return Promise.resolve(jsonResponse([]));

    return Promise.resolve(jsonResponse({ error: `unhandled ${path}` }, 500));
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AttentionPage", () => {
  it("lists open attention items", async () => {
    installFetch([item()]);
    render(<AttentionPage />);

    const list = await screen.findByTestId("attention-list");
    expect(within(list).getByText("Plan awaiting approval")).toBeInTheDocument();
    expect(within(list).getByText(/Plan v1 is ready/)).toBeInTheDocument();
  });

  it("opens the ticket detail when an item is clicked", async () => {
    installFetch([item()]);
    render(<AttentionPage />);

    const list = await screen.findByTestId("attention-list");
    fireEvent.click(within(list).getByText("Plan awaiting approval"));

    // The ticket detail drawer loads (Comments region is part of TicketDetail).
    await screen.findByRole("region", { name: "Comments" });
  });

  it("shows an empty state when there is nothing to attend to", async () => {
    installFetch([]);
    render(<AttentionPage />);
    await waitFor(() =>
      expect(screen.getByText("Nothing needs your attention")).toBeInTheDocument(),
    );
  });
});
