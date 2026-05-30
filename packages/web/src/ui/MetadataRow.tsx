import type { MetadataRowProps } from "./types";
import * as styles from "./MetadataRow.css";

/** MetadataRow — a label/value facts grid in 1 or 2 columns. */
export function MetadataRow({ items, columns = 2, className }: MetadataRowProps) {
  const cls = [styles.grid, styles.columns[columns], className]
    .filter(Boolean)
    .join(" ");
  return (
    <dl className={cls}>
      {items.map((item, i) => (
        <div className={styles.fact} key={i}>
          <dt className={styles.label}>{item.label}</dt>
          <dd className={styles.value}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
