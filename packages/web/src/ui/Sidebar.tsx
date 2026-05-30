import type { SidebarProps } from "./types";
import { Badge } from "./Badge";
import * as styles from "./Sidebar.css";

/**
 * Sidebar — brand, titled nav sections with optional count badges, an
 * active-item highlight, a collapsed (56px) icon rail, and a bottom-pinned
 * footer slot.
 */
export function Sidebar({
  brand,
  sections,
  activeId,
  onNavigate,
  collapsed,
  footer,
  className,
}: SidebarProps) {
  const cls = [styles.sidebar, collapsed ? styles.collapsed : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <nav className={cls} aria-label="Primary">
      {brand ? <div className={styles.brand}>{brand}</div> : null}
      <div className={styles.sections}>
        {sections.map((sec, i) => (
          <div className={styles.section} key={sec.title ?? i}>
            {sec.title && !collapsed ? (
              <div className={styles.sectionTitle}>{sec.title}</div>
            ) : null}
            {sec.items.map((entry) => {
              const active = entry.id === activeId;
              return (
                <button
                  key={entry.id}
                  type="button"
                  className={[styles.item, active ? styles.itemActive : ""]
                    .filter(Boolean)
                    .join(" ")}
                  aria-current={active ? "page" : undefined}
                  onClick={() => onNavigate(entry.id)}
                  title={collapsed ? undefined : undefined}
                >
                  {entry.icon ? (
                    <span className={styles.icon}>{entry.icon}</span>
                  ) : null}
                  {!collapsed ? (
                    <span className={styles.itemLabel}>{entry.label}</span>
                  ) : null}
                  {entry.badge !== undefined && !collapsed ? (
                    <Badge tone={entry.badgeTone ?? "neutral"} count={entry.badge} />
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </nav>
  );
}
