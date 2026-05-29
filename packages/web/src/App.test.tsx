import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, NAV_ITEMS } from "./App";

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ status: "ok", uptimeMs: 1, dataDir: "/tmp" })),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App shell", () => {
  it("renders the app shell heading", async () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Otter Labs" }),
    ).toBeInTheDocument();
    // let the async HealthBadge state update settle
    await waitFor(() =>
      expect(screen.getByTestId("health-badge")).toHaveTextContent("ok"),
    );
  });

  it("renders all five nav links", async () => {
    render(<App />);
    for (const label of ["Board", "Runs", "Approvals", "Docs", "Settings"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(NAV_ITEMS).toHaveLength(5);
    await waitFor(() =>
      expect(screen.getByTestId("health-badge")).toHaveTextContent("ok"),
    );
  });
});
