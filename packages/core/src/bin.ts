// Executable entrypoint for the Otter Labs CLI.
//
// This is the ONLY module that runs `main()` as a side effect — `cli.ts` stays a
// side-effect-free module (tests import its functions). esbuild bundles this file
// into `dist/cli.js` (with a `#!/usr/bin/env node` banner); `npm start` runs it via
// tsx. Running `main()` unconditionally avoids the `import.meta.url === argv[1]`
// self-run guard, which silently fails when npx invokes the bin through a symlink.
import { main } from "./cli.js";

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
