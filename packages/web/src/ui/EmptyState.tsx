import type { EmptyStateProps } from "./types";
import * as styles from "./EmptyState.css";

/** EmptyState — centered icon / title / description / action stack. */
export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: EmptyStateProps) {
  const cls = className ? `${styles.empty} ${className}` : styles.empty;
  return (
    <div className={cls}>
      {icon ? <div className={styles.icon}>{icon}</div> : null}
      <h2 className={styles.title}>{title}</h2>
      {description ? (
        <p className={styles.description}>{description}</p>
      ) : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
