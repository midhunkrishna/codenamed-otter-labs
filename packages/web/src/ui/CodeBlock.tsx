import type { CodeBlockProps } from "./types";
import * as styles from "./CodeBlock.css";

/**
 * CodeBlock — renders `code` verbatim in the mono font. `inline` yields a
 * single inline <code>; otherwise a <pre><code> block. Never paraphrased.
 */
export function CodeBlock({ code, inline, className }: CodeBlockProps) {
  if (inline) {
    const cls = className ? `${styles.inline} ${className}` : styles.inline;
    return <code className={cls}>{code}</code>;
  }
  const cls = className ? `${styles.block} ${className}` : styles.block;
  return (
    <pre className={cls}>
      <code>{code}</code>
    </pre>
  );
}
