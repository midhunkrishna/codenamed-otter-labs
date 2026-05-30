/**
 * ThemeProvider behavior tests (Impl-A). Asserts:
 *  - default theme/density classes land on <html>.
 *  - setTheme / setDensity swap the class on the SAME root element with NO
 *    React remount (a child mount-counter ref must not increment).
 *  - hooks throw outside the provider.
 */
import { render, act } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { describe, it, expect, vi } from "vitest";
import {
  ThemeProvider,
  useTheme,
  useDensity,
  useThemeContext,
} from "./theme";
import { themeClasses } from "./themes";
import { densityClasses } from "./density.css";

function rootClasses() {
  return document.documentElement.className;
}

describe("ThemeProvider", () => {
  it("applies default linear + regular classes to <html>", () => {
    render(
      <ThemeProvider>
        <div>hi</div>
      </ThemeProvider>,
    );
    expect(rootClasses()).toContain(themeClasses.linear);
    expect(rootClasses()).toContain(densityClasses.regular);
  });

  it("honors defaultTheme / defaultDensity props", () => {
    render(
      <ThemeProvider defaultTheme="jira" defaultDensity="compact">
        <div>hi</div>
      </ThemeProvider>,
    );
    expect(rootClasses()).toContain(themeClasses.jira);
    expect(rootClasses()).toContain(densityClasses.compact);
  });

  it("setTheme('notion') swaps the theme class WITHOUT remounting children", () => {
    const mountSpy = vi.fn();
    let setThemeRef: (t: "notion") => void = () => {};

    function Controller() {
      const { setTheme } = useTheme();
      setThemeRef = setTheme;
      return null;
    }
    function Child() {
      // Increments exactly once per mount.
      useEffect(() => {
        mountSpy();
      }, []);
      return <div data-testid="child" />;
    }

    const { getByTestId } = render(
      <ThemeProvider>
        <Controller />
        <Child />
      </ThemeProvider>,
    );
    const nodeBefore = getByTestId("child");
    expect(rootClasses()).toContain(themeClasses.linear);
    expect(mountSpy).toHaveBeenCalledTimes(1);

    act(() => {
      setThemeRef("notion");
    });

    const nodeAfter = getByTestId("child");
    expect(rootClasses()).toContain(themeClasses.notion);
    expect(rootClasses()).not.toContain(themeClasses.linear);
    // No remount: same DOM node identity + mount effect did not re-run.
    expect(nodeAfter).toBe(nodeBefore);
    expect(mountSpy).toHaveBeenCalledTimes(1);
  });

  it("setDensity('compact') swaps the density class on <html>", () => {
    let setDensityRef: (d: "compact") => void = () => {};
    function Controller() {
      const { setDensity } = useDensity();
      setDensityRef = setDensity;
      return null;
    }
    render(
      <ThemeProvider>
        <Controller />
      </ThemeProvider>,
    );
    expect(rootClasses()).toContain(densityClasses.regular);

    act(() => {
      setDensityRef("compact");
    });
    expect(rootClasses()).toContain(densityClasses.compact);
    expect(rootClasses()).not.toContain(densityClasses.regular);
  });

  it("keeps the theme class when density changes (both coexist on root)", () => {
    let setDensityRef: (d: "comfy") => void = () => {};
    function Controller() {
      const { setDensity } = useDensity();
      setDensityRef = setDensity;
      return null;
    }
    render(
      <ThemeProvider defaultTheme="celebration">
        <Controller />
      </ThemeProvider>,
    );
    act(() => {
      setDensityRef("comfy");
    });
    expect(rootClasses()).toContain(themeClasses.celebration);
    expect(rootClasses()).toContain(densityClasses.comfy);
  });

  it("useThemeContext exposes full value shape", () => {
    let captured: ReturnType<typeof useThemeContext> | null = null;
    function Probe() {
      captured = useThemeContext();
      return null;
    }
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(captured).toMatchObject({
      theme: "linear",
      density: "regular",
    });
    expect(typeof captured!.setTheme).toBe("function");
    expect(typeof captured!.setDensity).toBe("function");
  });
});

describe("hooks outside provider", () => {
  // Silence the expected React error-boundary console noise.
  const consoleError = vi
    .spyOn(console, "error")
    .mockImplementation(() => {});

  it("useTheme throws outside a ThemeProvider", () => {
    function Bare() {
      useTheme();
      return null;
    }
    expect(() => render(<Bare />)).toThrow(/ThemeProvider/);
  });

  it("useDensity throws outside a ThemeProvider", () => {
    function Bare() {
      useDensity();
      return null;
    }
    expect(() => render(<Bare />)).toThrow(/ThemeProvider/);
  });

  consoleError.mockRestore?.();
});
