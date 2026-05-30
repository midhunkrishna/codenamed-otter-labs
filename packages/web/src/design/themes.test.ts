/**
 * Theme + density registry tests (Impl-A). Asserts each registry covers every
 * enum member with non-empty, distinct vanilla-extract class strings.
 */
import { describe, it, expect } from "vitest";
import { THEMES, DENSITIES } from "./tokens";
import { themeClasses } from "./themes";
import { densityClasses } from "./density.css";

describe("themeClasses registry", () => {
  it("covers all four themes with non-empty strings", () => {
    for (const name of THEMES) {
      expect(typeof themeClasses[name]).toBe("string");
      expect(themeClasses[name].length).toBeGreaterThan(0);
    }
  });

  it("produces a distinct class per theme", () => {
    const values = THEMES.map((t) => themeClasses[t]);
    expect(new Set(values).size).toBe(THEMES.length);
  });

  it("has no extra keys beyond THEMES", () => {
    expect(Object.keys(themeClasses).sort()).toEqual([...THEMES].sort());
  });
});

describe("densityClasses registry", () => {
  it("covers all three densities with non-empty strings", () => {
    for (const d of DENSITIES) {
      expect(typeof densityClasses[d]).toBe("string");
      expect(densityClasses[d].length).toBeGreaterThan(0);
    }
  });

  it("produces a distinct class per density", () => {
    const values = DENSITIES.map((d) => densityClasses[d]);
    expect(new Set(values).size).toBe(DENSITIES.length);
  });
});
