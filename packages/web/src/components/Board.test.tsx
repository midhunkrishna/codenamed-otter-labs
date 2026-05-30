import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Board } from "./Board";
import type { Comment, Ticket, TransitionsResponse } from "../api/client";

/**
 * Tests use a tiny in-memory fake backend wired through a mocked `fetch`.
 * No real network. Covers the MIN-16 / §6-C cases:
 *  - board renders a created ticket
 *  - creating a ticket adds it to the board
 *  - adding a comment updates the comment stream (oldest first)
 *  - an invalid transition action is NOT shown (only `next` buttons appear)
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
    title: "First ticket",
    description: "",
    status: "created",
    blockStatus: "none",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

interface FakeState {
  tickets: Ticket[];
  comments: Comment[];
  transitions: TransitionsResponse;
}

/** Installs a fetch mock that serves from the given mutable state. */
function installFetch(state: FakeState) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.replace(/^https?:\/\/[^/]+/, "");

    // GET /api/tickets
    if (path === "/api/tickets" && method === "GET") {
      return Promise.resolve(jsonResponse(state.tickets));
    }
    // POST /api/tickets
    if (path === "/api/tickets" && method === "POST") {
      const body = JSON.parse(String(init?.body)) as { title: string };
      const created = ticket({
        id: `t${state.tickets.length + 1}`,
        title: body.title,
      });
      state.tickets.push(created);
      return Promise.resolve(jsonResponse(created, 201));
    }
    // GET /api/tickets/:id
    const idMatch = path.match(/^\/api\/tickets\/([^/]+)$/);
    if (idMatch && method === "GET") {
      const found = state.tickets.find((t) => t.id === idMatch[1]);
      return Promise.resolve(
        found ? jsonResponse(found) : jsonResponse({ error: "not found" }, 404),
      );
    }
    // GET/POST comments
    const commentsMatch = path.match(/^\/api\/tickets\/([^/]+)\/comments$/);
    if (commentsMatch && method === "GET") {
      return Promise.resolve(jsonResponse(state.comments));
    }
    if (commentsMatch && method === "POST") {
      const body = JSON.parse(String(init?.body)) as { body: string };
      const created: Comment = {
        id: `c${state.comments.length + 1}`,
        ticketId: commentsMatch[1] as string,
        author: "user",
        body: body.body,
        metadata: {},
        createdAt: `2026-01-0${state.comments.length + 1}T00:00:00.000Z`,
      };
      state.comments.push(created);
      return Promise.resolve(jsonResponse(created, 201));
    }
    // GET transitions
    const transitionsMatch = path.match(/^\/api\/tickets\/([^/]+)\/transitions$/);
    if (transitionsMatch && method === "GET") {
      return Promise.resolve(jsonResponse(state.transitions));
    }

    return Promise.resolve(jsonResponse({ error: `unhandled ${path}` }, 500));
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Board", () => {
  it("renders a created ticket in its status column", async () => {
    installFetch({
      tickets: [ticket()],
      comments: [],
      transitions: { current: "created", next: [] },
    });

    render(<Board />);

    const card = await screen.findByTestId("ticket-card-t1");
    expect(card).toHaveTextContent("First ticket");
    // It lives under the "Created" column.
    const createdColumn = screen.getByRole("region", { name: "Created" });
    expect(within(createdColumn).getByTestId("ticket-card-t1")).toBeInTheDocument();
  });

  it("creating a ticket via the quick-capture composer adds it to the board", async () => {
    installFetch({
      tickets: [],
      comments: [],
      transitions: { current: "created", next: [] },
    });

    render(<Board />);

    // The composer is on-demand: open it, then capture a title and add.
    fireEvent.click(await screen.findByTestId("board-new-ticket"));
    fireEvent.change(screen.getByLabelText("New ticket title"), {
      target: { value: "Brand new" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add ticket" }));

    await waitFor(() => {
      expect(screen.getByText("Brand new")).toBeInTheDocument();
    });
  });

  it("column header shows status dot, count, owner pill, and hint", async () => {
    installFetch({
      tickets: [
        ticket({ id: "t1", title: "A", status: "created" }),
        ticket({ id: "t2", title: "B", status: "created" }),
        ticket({ id: "t3", title: "C", status: "plannable" }),
      ],
      comments: [],
      transitions: { current: "created", next: [] },
    });

    render(<Board />);
    // Wait for the board to render at least one card.
    await screen.findByTestId("ticket-card-t1");

    const created = screen.getByRole("region", { name: "Created" });
    expect(
      created.querySelector('[data-status-dot="created"]'),
    ).toBeInTheDocument();
    // count badge + owner pill
    expect(within(created).getByText("2")).toBeInTheDocument();
    expect(within(created).getByText("YOU")).toBeInTheDocument();
    expect(within(created).getByText("Drafted by you")).toBeInTheDocument();
    // "+ New ticket" affordance lives only in the Created column
    expect(within(created).getByTestId("board-new-ticket")).toBeInTheDocument();

    const plannable = screen.getByRole("region", { name: "Plannable" });
    expect(
      plannable.querySelector('[data-status-dot="plannable"]'),
    ).toBeInTheDocument();
    expect(within(plannable).getByText("1")).toBeInTheDocument();
    expect(within(plannable).getByText("AGENT")).toBeInTheDocument();
    expect(
      within(plannable).getByText("Ready for agent planning"),
    ).toBeInTheDocument();
    expect(within(plannable).queryByTestId("board-new-ticket")).toBeNull();
  });

  it("renders a derived phase chip on each card (YOUR TURN / AGENT QUEUED)", async () => {
    installFetch({
      tickets: [
        ticket({ id: "t1", title: "Draft me", status: "created" }),
        ticket({ id: "t2", title: "Run me", status: "plannable" }),
        ticket({
          id: "t3",
          title: "Stuck",
          status: "in_progress",
          blockStatus: "blocked",
        }),
      ],
      comments: [],
      transitions: { current: "created", next: [] },
    });

    render(<Board />);
    await screen.findByTestId("ticket-card-t1");

    expect(
      within(screen.getByTestId("ticket-card-t1")).getByText("YOUR TURN"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("ticket-card-t2")).getByText("AGENT QUEUED"),
    ).toBeInTheDocument();
    // Blocked overrides status → CLARIFICATION NEEDED
    expect(
      within(screen.getByTestId("ticket-card-t3")).getByText(
        "CLARIFICATION NEEDED",
      ),
    ).toBeInTheDocument();
  });

  it("'+ New ticket' opens the composer and focuses the title input", async () => {
    installFetch({
      tickets: [],
      comments: [],
      transitions: { current: "created", next: [] },
    });
    render(<Board />);
    // Wait for first paint then click the trigger.
    const trigger = await screen.findByTestId("board-new-ticket");
    fireEvent.click(trigger);
    const input = screen.getByLabelText("New ticket title");
    expect(input).toBeInTheDocument();
    expect(input).toHaveFocus();
  });
});

describe("TicketDetail (via Board)", () => {
  async function openDetail(state: FakeState) {
    installFetch(state);
    render(<Board />);
    const firstId = state.tickets[0]?.id ?? "";
    const card = await screen.findByTestId(`ticket-card-${firstId}`);
    fireEvent.click(card);
    // Wait for detail to load.
    await screen.findByRole("region", { name: "Comments" });
  }

  it("shows comments oldest first and updates the stream after adding one", async () => {
    const state: FakeState = {
      tickets: [ticket()],
      comments: [
        {
          id: "c0",
          ticketId: "t1",
          author: "alice",
          body: "first comment",
          metadata: {},
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      transitions: { current: "created", next: [] },
    };
    await openDetail(state);

    let items = within(screen.getByTestId("comment-stream")).getAllByRole(
      "listitem",
    );
    expect(items[0]).toHaveTextContent("first comment");

    // Add a comment -> POST then refetch.
    fireEvent.change(screen.getByLabelText("New comment"), {
      target: { value: "second comment" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add comment" }));

    await waitFor(() => {
      items = within(screen.getByTestId("comment-stream")).getAllByRole(
        "listitem",
      );
      expect(items).toHaveLength(2);
    });
    // Oldest first: first comment precedes the second.
    expect(items[0]).toHaveTextContent("first comment");
    expect(items[1]).toHaveTextContent("second comment");
  });

  it("renders only backend `next` transitions; an invalid action is NOT shown", async () => {
    const state: FakeState = {
      tickets: [ticket({ status: "created" })],
      comments: [],
      // Backend says only `plannable` and `canceled` are valid from `created`.
      transitions: { current: "created", next: ["plannable", "canceled"] },
    };
    await openDetail(state);

    const actions = screen.getByRole("region", { name: "Transitions" });
    expect(within(actions).getByRole("button", { name: "Plannable" })).toBeInTheDocument();
    expect(within(actions).getByRole("button", { name: "Canceled" })).toBeInTheDocument();
    // `executable` is NOT in `next`, so the UI must not offer it.
    expect(
      within(actions).queryByRole("button", { name: "Executable" }),
    ).not.toBeInTheDocument();
    expect(
      within(actions).queryByRole("button", { name: "In Progress" }),
    ).not.toBeInTheDocument();
  });

  it("opens the detail as a drawer; expand toggles full mode and Escape closes it", async () => {
    await openDetail({
      tickets: [ticket()],
      comments: [],
      transitions: { current: "created", next: [] },
    });

    // Detail renders inside an overlay dialog (board stays mounted behind it).
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("region", { name: "Comments" }),
    ).toBeInTheDocument();
    expect(dialog.querySelector('[data-mode="side"]')).toBeInTheDocument();

    // Expand to full, then collapse back to the side panel.
    fireEvent.click(
      screen.getByRole("button", { name: "Expand to full screen" }),
    );
    expect(dialog.querySelector('[data-mode="full"]')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Collapse to side panel" }),
    );
    expect(dialog.querySelector('[data-mode="side"]')).toBeInTheDocument();

    // Escape closes the drawer.
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});
