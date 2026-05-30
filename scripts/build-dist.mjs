// Assemble a self-contained, npx-runnable `otter-labs` package into ./dist (D-PKG-1).
//
// Output layout (this IS the publishable package — `npm pack ./dist`):
//   dist/
//     package.json   generated manifest: bin -> cli.js, real runtime deps, files
//     cli.js         esbuild bundle of core+shared+persistence (ESM, node shebang)
//     migrations/    *.sql copied verbatim (migrations.ts resolves them via import.meta.url)
//     web/           built web UI (served same-origin by @fastify/static)
//
// Native/runtime deps stay EXTERNAL so `npm install` (run by npx) fetches the correct
// prebuilt better-sqlite3 for the user's platform — see D-PKG-2 in contexts/deferred.md.
import { build } from "esbuild";
import { rmSync, mkdirSync, cpSync, writeFileSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist");
const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));

const rootPkg = read("package.json");
const corePkg = read("packages/core/package.json");
const persistencePkg = read("packages/persistence/package.json");

// Deps the bundle requires at runtime (kept external; declared in the manifest so npm
// installs them — including the native better-sqlite3, with its per-platform prebuild).
const EXTERNAL = [
  "better-sqlite3",
  "fastify",
  "@fastify/websocket",
  "@fastify/static",
  "execa",
];
const depVersion = (name) =>
  corePkg.dependencies?.[name] ?? persistencePkg.dependencies?.[name];

console.log("[build-dist] cleaning dist/");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

console.log("[build-dist] building web UI (vite)…");
execSync("npm -w @otter/web run build", { cwd: root, stdio: "inherit" });

console.log("[build-dist] bundling server (esbuild)…");
await build({
  entryPoints: [join(root, "packages/core/src/bin.ts")],
  outfile: join(out, "cli.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  banner: { js: "#!/usr/bin/env node" },
  external: EXTERNAL,
  logLevel: "info",
});

console.log("[build-dist] copying migrations + web assets…");
cpSync(join(root, "packages/persistence/src/migrations"), join(out, "migrations"), {
  recursive: true,
});
cpSync(join(root, "packages/web/dist"), join(out, "web"), { recursive: true });

const manifest = {
  name: "otter-labs",
  version: rootPkg.version,
  description: "Local-first agent orchestration app — single-command local server + UI.",
  type: "module",
  bin: { "otter-labs": "cli.js" },
  files: ["cli.js", "migrations", "web"],
  // Relaxed from the dev repo's >=24: this range has solid better-sqlite3 prebuild
  // coverage (D-PKG-2 option A). Bump if you adopt a newer-only Node feature.
  engines: { node: ">=20" },
  dependencies: Object.fromEntries(EXTERNAL.map((n) => [n, depVersion(n)])),
};
writeFileSync(join(out, "package.json"), JSON.stringify(manifest, null, 2) + "\n");

console.log("[build-dist] done → dist/");
console.log("  pack:  npm run pack:app   (→ otter-labs-" + rootPkg.version + ".tgz)");
console.log("  run:   npx ./otter-labs-" + rootPkg.version + ".tgz   (from any directory)");
