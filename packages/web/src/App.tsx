import { useState } from "react";
import { AppShell, EmptyState, Sidebar, type NavSection } from "./ui";
import { Board } from "./components/Board";
import { HealthBadge } from "./components/HealthBadge";
import { ThemeControls } from "./app/ThemeControls";
import { PreviewRoute } from "./preview/PreviewRoute";
import * as css from "./app/App.css";

/** A primary navigation destination in the app shell. */
export interface NavItem {
  id: string;
  label: string;
}

/**
 * Top-level navigation. The original MIN-13 destinations (Board, Runs,
 * Approvals, Docs, Settings) plus Attention (MIN-37/38) and a Components
 * gallery route. Board renders the live board; Components renders the design
 * preview; the rest are placeholders for their own tickets.
 */
export const NAV_ITEMS = [
  { id: "board", label: "Board" },
  { id: "attention", label: "Attention" },
  { id: "runs", label: "Runs" },
  { id: "approvals", label: "Approvals" },
  { id: "docs", label: "Docs" },
  { id: "components", label: "Components" },
  { id: "settings", label: "Settings" },
] as const satisfies readonly NavItem[];

const DEFAULT_NAV: NavItem = NAV_ITEMS[0];

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Workspace",
    items: [
      { id: "board", label: "Board" },
      { id: "attention", label: "Attention" },
      { id: "runs", label: "Runs" },
      { id: "approvals", label: "Approvals" },
      { id: "docs", label: "Docs" },
    ],
  },
  {
    title: "Design",
    items: [{ id: "components", label: "Components" }],
  },
];

/** Footer-pinned nav (Settings) — kept separate so it sits at the bottom. */
const FOOTER_SECTIONS: NavSection[] = [
  { items: [{ id: "settings", label: "Settings" }] },
];

/** Placeholder pages for destinations owned by other tickets. */
function Placeholder({ label }: { label: string }) {
  return (
    <EmptyState
      title={`${label} is coming soon`}
      description="This surface is delivered by a separate ticket. The Board and Components routes are live."
    />
  );
}

export function App() {
  const [active, setActive] = useState<string>(DEFAULT_NAV.id);
  const current = NAV_ITEMS.find((item) => item.id === active) ?? DEFAULT_NAV;

  const sidebar = (
    <Sidebar
      brand={
        <span className={css.brand}>
          <span className={css.brandMark} aria-hidden>
            O
          </span>
          Otter Labs
        </span>
      }
      sections={[...NAV_SECTIONS, ...FOOTER_SECTIONS]}
      activeId={active}
      onNavigate={setActive}
      footer={
        <div className={css.sidebarFooter}>
          <ThemeControls />
        </div>
      }
    />
  );

  const topbar = (
    <div className={css.topbar}>
      <h1>Otter Labs</h1>
      <HealthBadge />
    </div>
  );

  return (
    <AppShell sidebar={sidebar} topbar={topbar}>
      {current.id === "board" ? (
        <Board />
      ) : current.id === "components" ? (
        <PreviewRoute />
      ) : (
        <div className={css.pageBody}>
          <Placeholder label={current.label} />
        </div>
      )}
    </AppShell>
  );
}
