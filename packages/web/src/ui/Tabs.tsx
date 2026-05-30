import type { TabsProps } from "./types";
import * as styles from "./Tabs.css";

/** Tabs — a horizontal tablist driving an external `activeId` / `onSelect`. */
export function Tabs({ tabs, activeId, onSelect, className }: TabsProps) {
  const cls = className ? `${styles.tablist} ${className}` : styles.tablist;
  return (
    <div className={cls} role="tablist">
      {tabs.map((t) => {
        const active = t.id === activeId;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={[styles.tab, active ? styles.tabActive : ""]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onSelect(t.id)}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
