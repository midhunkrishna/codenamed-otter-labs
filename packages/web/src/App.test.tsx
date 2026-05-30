import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, NAV_ITEMS } from "./App";
import { ThemeProvider } from "./design";
import { themeClasses } from "./design/themes";

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ status: "ok", uptimeMs: 1, dataDir: "/tmp" })),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.className = "";
});

/** The app is always mounted inside its ThemeProvider (as in main.tsx). */
function renderApp() {
  return render(
    <ThemeProvider>
      <App />
    </ThemeProvider>,
  );
}

describe("App shell", () => {
  it("renders the app shell heading inside the ThemeProvider", async () => {
    renderApp();
    expect(
      screen.getByRole("heading", { level: 1, name: "Otter Labs" }),
    ).toBeInTheDocument();
    // ThemeProvider applied the default (linear) theme class to <html>.
    await waitFor(() =>
      expect(document.documentElement.className).toContain(themeClasses.linear),
    );
    // let the async HealthBadge state update settle
    await waitFor(() =>
      expect(screen.getByTestId("health-badge")).toHaveTextContent("ok"),
    );
  });

  it("renders every nav destination", async () => {
    renderApp();
    const nav = screen.getByRole("navigation", { name: "Primary" });
    for (const { label } of NAV_ITEMS) {
      expect(
        within(nav).getByRole("button", { name: label }),
      ).toBeInTheDocument();
    }
    expect(NAV_ITEMS).toHaveLength(7);
    // The original MIN-13 destinations are all still present.
    for (const label of ["Board", "Runs", "Approvals", "Docs", "Settings"]) {
      expect(within(nav).getByRole("button", { name: label })).toBeInTheDocument();
    }
    await waitFor(() =>
      expect(screen.getByTestId("health-badge")).toHaveTextContent("ok"),
    );
  });

  it("theme picker switches the root theme class without crashing", async () => {
    renderApp();
    await waitFor(() =>
      expect(document.documentElement.className).toContain(themeClasses.linear),
    );

    const themeSelect = screen.getAllByLabelText("Theme")[0] as HTMLSelectElement;
    fireEvent.change(themeSelect, { target: { value: "notion" } });

    await waitFor(() =>
      expect(document.documentElement.className).toContain(themeClasses.notion),
    );
    // App still mounted (no crash, no remount loss): heading is present.
    expect(
      screen.getByRole("heading", { level: 1, name: "Otter Labs" }),
    ).toBeInTheDocument();
  });

  it("navigates to the Components preview route", async () => {
    renderApp();
    const nav = screen.getByRole("navigation", { name: "Primary" });
    fireEvent.click(within(nav).getByRole("button", { name: "Components" }));
    expect(await screen.findByTestId("preview-route")).toBeInTheDocument();
  });
});
