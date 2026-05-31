import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, NAV_ITEMS } from "../App";
import { ThemeProvider } from "../design";
import { AttentionPage } from "./AttentionPage";
import type { AttentionItemVM, AttentionType } from "../api/attention";
import {
  CHANNELS,
  type EventEnvelope,
  type EnvelopeHandler,
} from "../ws/events";

/**
 * Attention page tests (MIN-37). A mocked `fetch` serves the attention list and
 * a stubbed `connectEvents` lets a test push a live envelope. Covers the MIN-37
 * list:
 *  - the Attention sidebar link appears (App shell)
 *  - "All" shows every item; each sibling filter shows its attention_type(s)
 *  - "Failures" shows BOTH execution_failed and run_stalled
 *  - an unknown attention_type renders without crashing (card's generic fallback)
 *  - a new WS item appears WITHOUT moving or collapsing the focused card
 *
 * This is a UNIT test of the page's filtering + live-queue-stability logic, so we
 * mock `AttentionItemCard` (Impl-D / MIN-38, separately tested) with a tiny test
 * double that honours the frozen §1.5 prop contract — the page only depends on
 * those props, not the card's per-type rendering.
 */

// ── AttentionItemCard test double — keep the rest of the ui barrel real. ──────
vi.mock("../ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ui")>();
  return {
    ...actual,
    AttentionItemCard: ({
      item,
      expanded,
      onToggleExpand,
    }: {
      item: AttentionItemVM;
      expanded: boolean;
      onToggleExpand(): void;
      onResolved(): void;
    }) => (
      <div data-testid={`attention-card-${item.id}`} data-expanded={String(expanded)}>
        <button type="button" onClick={onToggleExpand}>
          {item.title}
        </button>
      </div>
    ),
  };
});

// ── connectEvents stub — capture the attention-channel handler so a test can
//    push a live envelope deterministically. ──────────────────────────────────
let attentionHandler: EnvelopeHandler | null = null;
const closeSpy = vi.fn();

vi.mock("../ws/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ws/events")>();
  return {
    ...actual,
    connectEvents: () => ({
      subscribe: (channel: string, handler: EnvelopeHandler) => {
        if (channel === actual.CHANNELS.attention) attentionHandler = handler;
        return () => {
          attentionHandler = null;
        };
      },
      close: closeSpy,
    }),
  };
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let counter = 0;
function item(over: Partial<AttentionItemVM> = {}): AttentionItemVM {
  counter += 1;
  return {
    id: `a${counter}`,
    projectId: "local-project",
    attentionType: "plan_approval",
    sourceType: "plan",
    sourceId: `p${counter}`,
    ticketId: "t1",
    runId: null,
    status: "open",
    priority: "high",
    title: `Item ${counter}`,
    summary: "summary",
    requiredAction: "do the thing",
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    resolvedAt: null,
    dismissedAt: null,
    expiresAt: null,
    ...over,
  };
}

/** Serves whatever the `current` ref points at for `GET /api/attention*`. */
function installFetch(current: { items: AttentionItemVM[] }) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    if (path.startsWith("/api/attention")) {
      return Promise.resolve(jsonResponse(current.items));
    }
    if (path.startsWith("/api/health")) {
      return Promise.resolve(jsonResponse({ status: "ok", uptimeMs: 1, dataDir: "/tmp" }));
    }
    return Promise.resolve(jsonResponse({ error: `unhandled ${path}` }, 500));
  });
}

function envelope(type: EventEnvelope["type"]): EventEnvelope {
  return {
    channel: CHANNELS.attention,
    type,
    seq: 1,
    ts: "2026-01-01T00:00:01.000Z",
    payload: {},
  };
}

beforeEach(() => {
  counter = 0;
  attentionHandler = null;
  closeSpy.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.className = "";
});

describe("AttentionPage filters + live queue (MIN-37)", () => {
  it("shows the Attention sidebar link in the app shell", () => {
    expect(NAV_ITEMS.some((n) => n.label === "Attention")).toBe(true);
    installFetch({ items: [] });
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).getByRole("button", { name: "Attention" })).toBeInTheDocument();
  });

  it("All shows every item; each filter shows only its attention_type(s)", async () => {
    const items = [
      item({ attentionType: "permission_request", title: "Perm" }),
      item({ attentionType: "plan_approval", title: "Plan" }),
      item({ attentionType: "clarification_required", title: "Question" }),
      item({ attentionType: "verification_review", title: "Verify" }),
      item({ attentionType: "execution_failed", title: "Failed" }),
      item({ attentionType: "run_stalled", title: "Stalled" }),
    ];
    installFetch({ items });
    render(<AttentionPage />);

    const list = await screen.findByTestId("attention-list");
    // All: all six present.
    for (const t of ["Perm", "Plan", "Question", "Verify", "Failed", "Stalled"]) {
      expect(within(list).getByText(t)).toBeInTheDocument();
    }

    const cases: Array<[string, string[]]> = [
      ["permissions", ["Perm"]],
      ["plans", ["Plan"]],
      ["questions", ["Question"]],
      ["verification", ["Verify"]],
    ];
    for (const [filterId, expectedTitles] of cases) {
      fireEvent.click(screen.getByTestId(`attention-filter-${filterId}`));
      const l = screen.getByTestId("attention-list");
      for (const t of ["Perm", "Plan", "Question", "Verify", "Failed", "Stalled"]) {
        if (expectedTitles.includes(t)) {
          expect(within(l).getByText(t)).toBeInTheDocument();
        } else {
          expect(within(l).queryByText(t)).not.toBeInTheDocument();
        }
      }
    }
  });

  it("Failures shows BOTH execution_failed and run_stalled", async () => {
    installFetch({
      items: [
        item({ attentionType: "execution_failed", title: "Failed" }),
        item({ attentionType: "run_stalled", title: "Stalled" }),
        item({ attentionType: "plan_approval", title: "Plan" }),
      ],
    });
    render(<AttentionPage />);
    await screen.findByTestId("attention-list");

    fireEvent.click(screen.getByTestId("attention-filter-failures"));
    const list = screen.getByTestId("attention-list");
    expect(within(list).getByText("Failed")).toBeInTheDocument();
    expect(within(list).getByText("Stalled")).toBeInTheDocument();
    expect(within(list).queryByText("Plan")).not.toBeInTheDocument();
  });

  it("renders an unknown attention_type without crashing", async () => {
    installFetch({
      items: [item({ attentionType: "totally_unknown" as AttentionType, title: "Mystery" })],
    });
    render(<AttentionPage />);
    const list = await screen.findByTestId("attention-list");
    // The card receives it; page passes it through. No throw, item is shown.
    expect(within(list).getByText("Mystery")).toBeInTheDocument();
  });

  it("a new WS item appears without collapsing or moving the focused card", async () => {
    const first = item({ title: "First" });
    const current = { items: [first] };
    installFetch(current);
    render(<AttentionPage />);

    await screen.findByText("First");
    // Expand the first card.
    fireEvent.click(screen.getByRole("button", { name: "First" }));
    const card = screen.getByTestId(`attention-card-${first.id}`);
    expect(card.getAttribute("data-expanded")).toBe("true");

    // A live item arrives: backend list now has the new item appended after.
    const second = item({ title: "Second" });
    current.items = [first, second];
    expect(attentionHandler).not.toBeNull();
    act(() => attentionHandler?.(envelope("attention_item_created")));

    // The new card appears...
    await screen.findByText("Second");
    // ...and the previously-expanded card is STILL expanded (focus preserved)...
    expect(
      screen.getByTestId(`attention-card-${first.id}`).getAttribute("data-expanded"),
    ).toBe("true");
    // ...and still first in document order (didn't move).
    const cards = screen.getAllByTestId(/^attention-card-/);
    expect(cards[0]?.getAttribute("data-testid")).toBe(`attention-card-${first.id}`);
  });

  it("subscribes to live attention events and refetches on update", async () => {
    const current = { items: [item({ title: "Live" })] };
    installFetch(current);
    render(<AttentionPage />);
    await screen.findByText("Live");

    current.items = [...current.items, item({ title: "Resolved-In" })];
    act(() => attentionHandler?.(envelope("attention_item_updated")));
    await waitFor(() => expect(screen.getByText("Resolved-In")).toBeInTheDocument());
  });
});
