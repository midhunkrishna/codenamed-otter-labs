import { describe, expect, it } from "vitest";
import { invocationRoot } from "./cli.js";

describe("invocationRoot", () => {
  it("uses INIT_CWD when set (the dir npx/npm was invoked from)", () => {
    expect(invocationRoot({ INIT_CWD: "/home/me/project" }, "/some/pkg/dir")).toBe(
      "/home/me/project",
    );
  });

  it("falls back to cwd when INIT_CWD is absent", () => {
    expect(invocationRoot({}, "/home/me/elsewhere")).toBe("/home/me/elsewhere");
  });
});
