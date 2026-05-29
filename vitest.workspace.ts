import { defineWorkspace } from "vitest/config";

// Each package owns its own vitest config; this aggregates them so the
// root `npm test` runs the whole monorepo suite.
export default defineWorkspace([
  "packages/shared",
  "packages/persistence",
  "packages/core",
  "packages/web",
]);
