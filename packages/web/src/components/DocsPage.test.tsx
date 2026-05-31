import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocsPage } from "./DocsPage";
import type { ArtifactSummary } from "../api/docs";

/**
 * Docs page tests (MIN-33 frontend). A mocked `fetch` serves a tiny in-memory
 * backend. Covers:
 *  - generated artifacts are listed
 *  - selecting one opens its content
 *  - the empty state renders when there are no artifacts
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function artifact(over: Partial<ArtifactSummary> = {}): ArtifactSummary {
  return {
    kind: "plan",
    name: "t1-v1.md",
    relPath: "artifacts/plans/t1-v1.md",
    size: 128,
    modifiedAt: "2026-01-01T00:00:00.000Z",
    ticketId: "t1",
    planId: "p1",
    version: 1,
    ...over,
  };
}

function installFetch(artifacts: ArtifactSummary[], content: string) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const path = url.replace(/^https?:\/\/[^/]+/, "");

    if (path === "/api/docs/artifacts") {
      return Promise.resolve(jsonResponse(artifacts));
    }
    const oneMatch = path.match(/^\/api\/docs\/artifacts\/plan\/([^/]+)$/);
    if (oneMatch) {
      const name = decodeURIComponent(oneMatch[1] as string);
      return Promise.resolve(jsonResponse({ name, content }));
    }
    return Promise.resolve(jsonResponse({ error: `unhandled ${path}` }, 500));
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DocsPage", () => {
  it("lists generated artifacts", async () => {
    installFetch([artifact()], "# Plan body");
    render(<DocsPage />);

    const list = await screen.findByTestId("docs-list");
    expect(within(list).getByTestId("doc-row-t1-v1.md")).toBeInTheDocument();
  });

  it("opens an artifact's content when selected", async () => {
    installFetch([artifact()], "# Plan body\n\nThe full plan text.");
    render(<DocsPage />);

    fireEvent.click(await screen.findByTestId("doc-row-t1-v1.md"));

    const content = await screen.findByRole("region", { name: "Doc content" });
    await waitFor(() =>
      expect(within(content).getByText(/The full plan text/)).toBeInTheDocument(),
    );
  });

  it("shows an empty state when there are no docs", async () => {
    installFetch([], "");
    render(<DocsPage />);
    await waitFor(() =>
      expect(screen.getByText("No docs yet")).toBeInTheDocument(),
    );
  });
});
