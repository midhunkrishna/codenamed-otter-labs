import type { PageHeaderProps } from "./types";
import * as styles from "./PageHeader.css";

/** PageHeader — eyebrow / title / description on the left, actions on the right. */
export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  className,
  children,
}: PageHeaderProps) {
  const cls = className ? `${styles.header} ${className}` : styles.header;
  return (
    <header className={cls}>
      <div className={styles.titleBlock}>
        {eyebrow ? <div className={styles.eyebrow}>{eyebrow}</div> : null}
        <h1 className={styles.title}>{title}</h1>
        {description ? (
          <div className={styles.description}>{description}</div>
        ) : null}
        {children}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
