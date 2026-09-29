/**
 * CLI golden checks for Hraness command-line tools: run a built CLI the ways the CLI style guide
 * names and judge the output. `evaluate` and the `check*` functions are pure; `GoldenRunner` spawns.
 */
export {
  CONTRACT_SYMBOLS,
  checkBare,
  checkCommandHelp,
  checkDumb,
  checkHelp,
  checkHelpCopy,
  checkJsonError,
  checkNoColor,
  checkNonTty,
  checkPipe,
  checkShared,
  checkUnknown,
  checkVersion,
  evaluate,
  sharedVerbs,
} from "./cli-golden/checks.js";
export type { CapturedRun, CheckResult, CheckStatus, GoldenRuns, SharedContext, SharedRuns } from "./cli-golden/checks.js";
export { countLine, goldenFiles, renderAnnotations, renderMarkdown, renderText, useAscii } from "./cli-golden/report.js";
export { AUDIENCE_VARIABLES, defaultName, GoldenRunner, shellQuote, splitCommand } from "./cli-golden/runner.js";
export type { RunnerOptions } from "./cli-golden/runner.js";
