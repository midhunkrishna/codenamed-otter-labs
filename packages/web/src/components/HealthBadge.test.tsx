import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HealthBadge } from "./HealthBadge";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HealthBadge", () => {
  it("calls the health API and shows the status", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ status: "ok", uptimeMs: 1, dataDir: "/tmp" }),
        ),
      );

    render(<HealthBadge />);

    await waitFor(() =>
      expect(screen.getByTestId("health-badge")).toHaveTextContent(
        "backend: ok",
      ),
    );
    expect(fetchSpy).toHaveBeenCalledWith("/api/health", expect.anything());
  });
});
