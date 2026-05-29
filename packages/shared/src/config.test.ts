import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";
import { DEFAULT_PORT } from "./constants.js";

describe("loadConfig", () => {
  it("defaults the port to 4873", () => {
    expect(loadConfig({}, "/srv/app").port).toBe(DEFAULT_PORT);
  });

  it("respects OTTER_PORT", () => {
    expect(loadConfig({ OTTER_PORT: "9999" }, "/srv/app").port).toBe(9999);
  });

  it("rejects an invalid OTTER_PORT", () => {
    expect(() => loadConfig({ OTTER_PORT: "0" }, "/srv/app")).toThrow();
    expect(() => loadConfig({ OTTER_PORT: "nope" }, "/srv/app")).toThrow();
  });

  it("honors an OTTER_DATA_DIR override", () => {
    expect(loadConfig({ OTTER_DATA_DIR: "/var/otter" }, "/srv/app").dataDir).toBe(
      "/var/otter",
    );
  });
});
