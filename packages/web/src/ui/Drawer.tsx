import { useEffect } from "react";
import type { DrawerProps } from "./types";
import * as styles from "./Drawer.css";

/**
 * Drawer — overlay panel. `mode="side"` (default) is a 520px right drawer;
 * `mode="full"` is a full-screen inset overlay. Renders nothing when closed.
 * The scrim click, the close button, and the Escape key all invoke `onClose`.
 */
export function Drawer({
  open,
  onClose,
  title,
  mode = "side",
  headerActions,
  className,
  children,
}: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const panelCls = [styles.panel, styles.panelMode[mode], className]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={`${styles.overlay} ${styles.overlayMode[mode]}`} role="dialog" aria-modal="true">
      <div className={styles.scrim} onClick={onClose} data-testid="drawer-scrim" />
      <div className={panelCls} data-mode={mode}>
        <div className={styles.head}>
          {title ? <h2 className={styles.headTitle}>{title}</h2> : <span />}
          <div className={styles.headActions}>
            {headerActions}
            <button
              type="button"
              className={styles.close}
              aria-label="Close"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
