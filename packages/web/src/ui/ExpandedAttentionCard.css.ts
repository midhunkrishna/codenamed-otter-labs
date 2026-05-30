/**
 * ExpandedAttentionCard reuses AttentionCard's stylesheet for the header + shell
 * (same accent/priority tones, same structure). This sibling file exists per the
 * frozen one-pair-per-component convention; it simply re-exports the shared
 * styles so the expanded variant stays visually identical to the collapsed one.
 */
export * from "./AttentionCard.css";
