import type { ReactNode } from "react";
import type {
  VerificationPacketTabsProps,
  VerificationTab,
} from "./types";
import { VERIFICATION_TABS } from "./types";
import * as css from "./VerificationPacketTabs.css";

/** The four Diátaxis-inspired lenses, in the canonical order + display labels. */
const TAB_LABELS: Record<VerificationTab, string> = {
  walkthrough: "Walkthrough",
  verify: "Verify",
  facts: "Facts",
  why: "Why",
};

/**
 * Verification packet review surface. Renders the FOUR lenses as tabs in order
 * (Walkthrough · Verify · Facts · Why from VERIFICATION_TABS) and shows the
 * active lens's node. Self-contained tablist (not B's generic Tabs) because the
 * prop shape is verification-specific (activeTab: VerificationTab); still themed
 * purely via contract vars.
 */
export function VerificationPacketTabs({
  activeTab,
  onSelect,
  walkthrough,
  verify,
  facts,
  why,
  className,
}: VerificationPacketTabsProps) {
  const content: Record<VerificationTab, ReactNode> = {
    walkthrough,
    verify,
    facts,
    why,
  };
  return (
    <div
      className={[css.root, className].filter(Boolean).join(" ")}
      data-verification-tabs
    >
      <div className={css.tablist} role="tablist">
        {VERIFICATION_TABS.map((t) => {
          const active = t === activeTab;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active}
              className={[css.tab, active ? css.tabActive : ""]
                .filter(Boolean)
                .join(" ")}
              data-tab={t}
              data-active={active ? "true" : undefined}
              onClick={() => onSelect(t)}
            >
              {TAB_LABELS[t]}
            </button>
          );
        })}
      </div>
      <div className={css.panel} role="tabpanel" data-active-tab={activeTab}>
        {content[activeTab]}
      </div>
    </div>
  );
}
