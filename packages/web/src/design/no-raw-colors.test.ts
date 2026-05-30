/**
 * Raw-color guard (Impl-A, MIN-43 invariant 1).
 *
 * Components in ui/ must consume ONLY contract vars / semantic accessors — raw
 * color literals (hex, oklch(), rgb()/rgba()) belong exclusively in
 * design/themes/*.css.ts. This test reads every ui/**\/*.{ts,tsx} via fs and
 * asserts none contains such a literal. If ui/ is empty (Wave 1, before Impl-B/C
 * land their files), the test still passes — it's a guard for the final state.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const uiDir = join(here, "..", "ui");

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

// Strip line/block comments so explanatory prose mentioning colors doesn't trip
// the guard — only real code literals matter.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

const RAW_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "hex color", re: /#[0-9a-fA-F]{3,8}\b/ },
  { name: "oklch() literal", re: /\boklch\s*\(/ },
  { name: "rgb()/rgba() literal", re: /\brgba?\s*\(/ },
  { name: "hsl()/hsla() literal", re: /\bhsla?\s*\(/ },
];

describe("ui/ components contain no raw color literals", () => {
  const files = walk(uiDir);

  it("found the ui directory (or it is legitimately absent during Wave 1)", () => {
    // Sanity: just ensure walk() didn't throw; files may be empty.
    expect(Array.isArray(files)).toBe(true);
  });

  for (const file of files) {
    it(`no raw colors in ${file.slice(file.indexOf("/ui/"))}`, () => {
      const src = stripComments(readFileSync(file, "utf8"));
      for (const { name, re } of RAW_PATTERNS) {
        const match = src.match(re);
        expect(
          match,
          `${file} contains a ${name} (${match?.[0]}) — use contract vars / semantic accessors instead`,
        ).toBeNull();
      }
    });
  }
});
