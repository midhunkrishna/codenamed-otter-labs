import { useEffect, useState } from "react";
import { getHealth } from "../api/client";

type State =
  | { kind: "loading" }
  | { kind: "ok"; status: string }
  | { kind: "error" };

/** Calls the backend health endpoint and shows its status. */
export function HealthBadge() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    getHealth()
      .then((res) => {
        if (active) setState({ kind: "ok", status: res.status });
      })
      .catch(() => {
        if (active) setState({ kind: "error" });
      });
    return () => {
      active = false;
    };
  }, []);

  const label =
    state.kind === "loading"
      ? "checking…"
      : state.kind === "ok"
        ? state.status
        : "unreachable";

  return (
    <span data-testid="health-badge" className="health-badge">
      backend: {label}
    </span>
  );
}
