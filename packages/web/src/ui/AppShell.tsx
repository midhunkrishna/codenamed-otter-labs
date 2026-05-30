import type { AppShellProps } from "./types";
import * as styles from "./AppShell.css";

/**
 * AppShell — CSS grid with a sidebar column and a main area that stacks an
 * optional topbar over scrollable content. Chrome colors from contract vars.
 */
export function AppShell({ sidebar, topbar, className, children }: AppShellProps) {
  const cls = className ? `${styles.shell} ${className}` : styles.shell;
  return (
    <div className={cls}>
      {sidebar}
      <div className={styles.main}>
        {topbar ? <div className={styles.topbar}>{topbar}</div> : null}
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
