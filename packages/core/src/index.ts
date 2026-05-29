export { createServer } from "./server.js";
export { startApp, main } from "./cli.js";
export type { StartAppDeps, RunningApp, InitPersistence } from "./cli.js";
export {
  TRANSITIONS,
  canTransition,
  nextTransitions,
  type TransitionContext,
} from "./lifecycle.js";
