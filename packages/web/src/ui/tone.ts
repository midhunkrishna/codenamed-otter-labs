/**
 * Internal helper (Impl-B). Resolves a `ToneSelector` string from the frozen
 * `ui/types.ts` API into a concrete `{ fg, soft }` pair of contract-var
 * references via the semantic accessors in `design/tokens`.
 *
 * Selector grammar (frozen): `status.<TicketStatus>` | `risk.<Risk>` |
 * `attention.<AttentionType>` | `owner.<Owner>` | "neutral" | "accent".
 *
 * NOTE: not re-exported from the barrel — purely an implementation detail of
 * the core primitives. No raw colors here; only contract vars via accessors.
 */
import { vars } from "../design/contract.css";
import {
  attentionTone,
  ownerTone,
  riskTone,
  statusTone,
  type AttentionType,
  type Owner,
  type Risk,
  type TicketStatus,
  type Tone,
} from "../design/tokens";
import type { ToneSelector } from "./types";

/**
 * Build a React inline-style object that assigns concrete values to one or more
 * `createVar()` references. vanilla-extract's `createVar()` returns the
 * *consumption* form `var(--name [, fallback])`; to *set* the custom property
 * via React's `style` prop the key must be the bare `--name`. We unwrap it here.
 *
 * (This is the job `@vanilla-extract/dynamic`'s `assignInlineVars` does — that
 * package isn't installed in this workspace, so we inline the same behavior.)
 */
export function inlineVars(
  entries: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [ref, value] of Object.entries(entries)) {
    out[unwrapVar(ref)] = value;
  }
  return out;
}

/** `var(--name)` / `var(--name, fallback)` → `--name`. */
function unwrapVar(ref: string): string {
  const m = /^var\(\s*(--[^,)\s]+)/.exec(ref);
  return m?.[1] ?? ref;
}

const NEUTRAL: Tone = { fg: vars.color.textMuted, soft: vars.color.surface2 };
const ACCENT: Tone = { fg: vars.color.accent, soft: vars.color.accentSoft };

/**
 * Parse a `ToneSelector` into a resolved tone. Splits on the first `.` to pick
 * the semantic family, then keys the matching accessor. Bare "neutral" /
 * "accent" map to the chrome vars.
 */
export function resolveTone(selector: ToneSelector | undefined): Tone {
  if (!selector || selector === "neutral") return NEUTRAL;
  if (selector === "accent") return ACCENT;

  const dot = selector.indexOf(".");
  const family = selector.slice(0, dot);
  const key = selector.slice(dot + 1);

  switch (family) {
    case "status":
      return statusTone[key as TicketStatus] ?? NEUTRAL;
    case "risk":
      return riskTone[key as Risk] ?? NEUTRAL;
    case "attention":
      return attentionTone[key as AttentionType] ?? NEUTRAL;
    case "owner":
      return ownerTone[key as Owner] ?? NEUTRAL;
    default:
      return NEUTRAL;
  }
}
