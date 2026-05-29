import { useState } from "react";
import { Board } from "./components/Board";
import { HealthBadge } from "./components/HealthBadge";

/** A primary navigation destination in the app shell. */
export interface NavItem {
  id: string;
  label: string;
}

/** Top-level navigation (MIN-13 scope). */
export const NAV_ITEMS = [
  { id: "board", label: "Board" },
  { id: "runs", label: "Runs" },
  { id: "approvals", label: "Approvals" },
  { id: "docs", label: "Docs" },
  { id: "settings", label: "Settings" },
] as const satisfies readonly NavItem[];

const DEFAULT_NAV: NavItem = NAV_ITEMS[0];

export function App() {
  const [active, setActive] = useState<string>(DEFAULT_NAV.id);
  const current = NAV_ITEMS.find((item) => item.id === active) ?? DEFAULT_NAV;

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Otter Labs</h1>
        <HealthBadge />
      </header>
      <div className="app-body">
        <nav className="app-nav" aria-label="Primary">
          <ul>
            {NAV_ITEMS.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  aria-current={item.id === active ? "page" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    setActive(item.id);
                  }}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <main className="app-content">
          <h2>{current.label}</h2>
          {current.id === "board" ? <Board /> : null}
        </main>
      </div>
    </div>
  );
}
