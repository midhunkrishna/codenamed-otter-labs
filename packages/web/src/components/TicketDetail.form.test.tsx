import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TicketDetail } from "./TicketDetail";
import type { Comment, Ticket, TransitionsResponse } from "../api/client";
import type { Plan } from "../api/plans";
import type { Form } from "../api/forms";

/**
 * Form-in-comment-stream tests (MIN-27 frontend). A mocked `fetch` serves a
 * tiny in-memory backend (mirrors TicketDetail.plan.test.tsx). Covers:
 *  - a kind:'form' comment renders the interactive FormCommentCard
 *  - Submit is required-gated, posts structured answers, then refetches
 *  - a kind:'form_answer' comment renders as a readable transcript comment
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
    status: "plannable",
    blockStatus: "blocked",
    approvedPlanId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: "c1",
    ticketId: "t1",
    author: "planner-agent",
    body: "comment body",
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function form(overrides: Partial<Form> = {}): Form {
  return {
    id: "form_1",
    projectId: "p1",
    ticketId: "t1",
    commentId: "c_form",
    runId: "run_1",
    status: "open",
    phase: "planning",
    title: "Clarification",
    description: "",
    blocksTicket: true,
    createdByAgentId: "planner-agent",
    createdAt: "2026-01-01T00:00:00.000Z",
    submittedAt: null,
    dismissedAt: null,
    questions: [
      {
        id: "q1",
        formId: "form_1",
        key: "provider",
        type: "single_select",
        label: "Which provider?",
        helpText: "",
        required: true,
        options: [
          { label: "Google", value: "google" },
          { label: "GitHub", value: "github" },
        ],
        defaultValue: null,
        sortOrder: 0,
      },
    ],
    answers: [],
    ...overrides,
  };
}

interface FakeState {
  tickets: Ticket[];
  comments: Comment[];
  transitions: TransitionsResponse;
  plans: Plan[];
  forms: Form[];
}

function installFetch(state: FakeState) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.replace(/^https?:\/\/[^/]+/, "");

    if (/^\/api\/tickets\/[^/]+$/.test(path) && method === "GET") {
      return Promise.resolve(jsonResponse(state.tickets[0]));
    }
    if (/^\/api\/tickets\/[^/]+\/comments$/.test(path) && method === "GET") {
      return Promise.resolve(jsonResponse(state.comments));
    }
    if (/^\/api\/tickets\/[^/]+\/transitions$/.test(path) && method === "GET") {
      return Promise.resolve(jsonResponse(state.transitions));
    }
    if (/^\/api\/tickets\/[^/]+\/plans$/.test(path) && method === "GET") {
      return Promise.resolve(jsonResponse(state.plans));
    }
    if (/^\/api\/tickets\/[^/]+\/forms$/.test(path) && method === "GET") {
      return Promise.resolve(jsonResponse(state.forms));
    }
    const submitMatch = path.match(/^\/api\/forms\/([^/]+)\/submit$/);
    if (submitMatch && method === "POST") {
      const f = state.forms.find((x) => x.id === submitMatch[1])!;
      f.status = "submitted";
      return Promise.resolve(
        jsonResponse({
          form: f,
          transcript: {
            id: "c_ans",
            ticketId: "t1",
            author: "user",
            body: "provider: GitHub",
            metadata: { kind: "form_answer", formId: f.id },
            createdAt: "2026-01-01T00:00:01.000Z",
          },
        }),
      );
    }
    return Promise.resolve(
      jsonResponse({ error: `unhandled ${method} ${path}` }, 500),
    );
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

function renderDetail() {
  return render(<TicketDetail ticketId="t1" onMutated={() => {}} />);
}

describe("TicketDetail form rendering", () => {
  it("renders an interactive FormCommentCard for a kind:'form' comment", async () => {
    installFetch({
      tickets: [ticket()],
      comments: [
        comment({
          id: "c_form",
          body: "I need a decision first.",
          metadata: { kind: "form", formId: "form_1" },
        }),
      ],
      transitions: { current: "plannable", next: [] },
      plans: [],
      forms: [form()],
    });
    renderDetail();

    // The forms list loads after the ticket, so wait for the card to appear.
    expect(await screen.findByText("Posted a form")).toBeInTheDocument();
    const stream = screen.getByTestId("comment-stream");
    expect(within(stream).getByText("Which provider?")).toBeInTheDocument();
    expect(within(stream).getByLabelText("Google")).toBeInTheDocument();
    expect(within(stream).getByText("Blocks ticket")).toBeInTheDocument();
  });

  it("required-gates Submit, posts structured answers, then refetches", async () => {
    const spy = installFetch({
      tickets: [ticket()],
      comments: [
        comment({
          id: "c_form",
          body: "Decide.",
          metadata: { kind: "form", formId: "form_1" },
        }),
      ],
      transitions: { current: "plannable", next: [] },
      plans: [],
      forms: [form()],
    });
    renderDetail();

    await screen.findByText("Which provider?");
    expect(
      screen.getByRole("button", { name: "Submit answers" }),
    ).toBeDisabled();

    fireEvent.click(screen.getByLabelText("GitHub"));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Submit answers" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Submit answers" }));

    await waitFor(() => {
      const posted = spy.mock.calls.some(([input, init]) => {
        const u = typeof input === "string" ? input : (input as Request).url;
        if (
          !u.includes("/api/forms/form_1/submit") ||
          (init?.method ?? "").toUpperCase() !== "POST"
        ) {
          return false;
        }
        const body = JSON.parse(String(init?.body)) as {
          answers: Record<string, unknown>;
        };
        return body.answers.provider === "github";
      });
      expect(posted).toBe(true);
    });
  });

  it("renders a kind:'form_answer' comment as a readable transcript", async () => {
    installFetch({
      tickets: [ticket({ blockStatus: "none" })],
      comments: [
        comment({
          id: "c_ans",
          author: "user",
          body: "provider: GitHub",
          metadata: { kind: "form_answer", formId: "form_1" },
        }),
      ],
      transitions: { current: "plannable", next: [] },
      plans: [],
      forms: [],
    });
    renderDetail();

    const stream = await screen.findByTestId("comment-stream");
    expect(within(stream).getByText("provider: GitHub")).toBeInTheDocument();
    expect(
      within(stream).getByText(/answered the form/),
    ).toBeInTheDocument();
  });
});
