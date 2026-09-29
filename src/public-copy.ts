/**
 * Public-copy lint for Hraness repositories. The rules follow the canonical STYLE.md in hraness/.github.
 * Pure checks take strings; `checkGuides` and `runPublicCopy` read files.
 */
export type {
  CopyConfig,
  CopyField,
  CopyCliEntry,
  CopyFinding,
  CopyFormat,
  CopyControlConfig,
  CopyJsonEntry,
  CopyRule,
  CopySeverity,
  CopySurface,
  CopyTextEntry,
  CopyTrayConfig,
  ExtractedText,
} from "./public-copy/types.js";
export { COPY_SURFACES } from "./public-copy/types.js";
export {
  INTERNAL_VOCABULARY,
  PRECISION_WORDS,
  PUBLIC_COPY_RULES_VERSION,
  RETIRED_NAMES,
  SELF_CERTIFICATION,
  definedTerms,
  lintCopy,
} from "./public-copy/rules.js";
export type { LintCopyOptions } from "./public-copy/rules.js";
export { decodeEntities, extractHtml } from "./public-copy/html.js";
export { extractMarkdown, inlineText, lintMarkdown, tableCells } from "./public-copy/markdown.js";
export type { MarkdownKind, MarkdownOptions } from "./public-copy/markdown.js";
export { checkInstallPins, compareVersions, findInstallPins } from "./public-copy/pins.js";
export type { PackageIdentity, TextSource } from "./public-copy/pins.js";
export { SYNCED_GUIDES, checkGuideText, guideCanonicalHash, readGuideStamp } from "./public-copy/guides.js";
export {
  compareBaseline,
  countFindings,
  fileOfLocation,
  lowerBaseline,
  normalizeCounts,
  parseBaseline,
  serializeBaseline,
} from "./public-copy/baseline.js";
export type { BaselineComparison, CopyBaseline, CopyCounts, CountChange } from "./public-copy/baseline.js";
export { DEFAULT_BASELINE_FILE, DEFAULT_CONFIG_FILE, parseCopyConfig } from "./public-copy/config.js";
export { selectJsonPath } from "./public-copy/json-path.js";
export { COPY_SECTIONS, TRAY_ALWAYS_EXCLUDED, checkGuides, loadCopyConfig, readBaseline, runPublicCopy, writeBaseline } from "./public-copy/files.js";
export type { CopySection, GuideCheckOptions, PublicCopyResult, RunPublicCopyOptions } from "./public-copy/files.js";
export {
  CLI_HELP_BUDGETS,
  CLI_HELP_KINDS,
  CLI_JARGON,
  CLI_PROPER_NOUNS,
  helpLines,
  lintCliHelp,
  sentenceCaseBreak,
} from "./public-copy/cli-help.js";
export type { CliHelpKind, CliHelpOptions } from "./public-copy/cli-help.js";
export {
  COMMANDS_SCHEMA,
  CONTROL_CONTRACT_VERSION,
  ERROR_SCHEMA,
  GATE_TIERS,
  GRAMMAR,
  OP_CLASSES,
  RETIRED_VERBS,
  SHARED_ERROR_CODES,
  checkCommands,
  checkEnvelope,
  checkTuiMatchesStatus,
  envelopeProblems,
} from "./public-copy/control.js";
export type { CommandsCheck } from "./public-copy/control.js";
export { TRAY_ALLOW_MARKER, TRAY_PATTERNS, TRAY_SOURCE_EXTENSIONS, trayHelpFindings, trayPathFindings, trayTextFindings } from "./public-copy/tray.js";
export { annotation } from "./public-copy/annotations.js";
export {
  CopyAssertionError,
  expectCountAgreement,
  expectInstallPinsMatch,
  expectNoInternalVocabulary,
  expectRealRunUrl,
} from "./public-copy/expect.js";
export type { InstallPinOptions } from "./public-copy/expect.js";
