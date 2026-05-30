import type { SectionHeaderProps } from "./types";
import * as styles from "./SectionHeader.css";

/** SectionHeader — title with an optional uppercase tag, plus actions. */
export function SectionHeader({
  title,
  tag,
  actions,
  className,
}: SectionHeaderProps) {
  const cls = className ? `${styles.header} ${className}` : styles.header;
  return (
    <div className={cls}>
      <h2 className={styles.title}>{title}</h2>
      {tag ? <span className={styles.tag}>{tag}</span> : null}
      <span className={styles.spacer} />
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
