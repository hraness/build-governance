/**
 * Public-copy lint for Hraness repositories. The rules follow the canonical STYLE.md in hraness/.github.
 * Pure checks take strings; `checkGuides` and `runPublicCopy` read files.
 */
export type {
  CopyConfig,
  CopyField,
  CopyFinding,
  CopyFormat,
  CopyJsonEntry,
  CopyRule,
  CopySeverity,
  CopySurface,
  CopyTextEntry,
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
export { checkGuides, loadCopyConfig, readBaseline, runPublicCopy, writeBaseline } from "./public-copy/files.js";
export type { GuideCheckOptions, PublicCopyResult } from "./public-copy/files.js";
export {
  CopyAssertionError,
  expectCountAgreement,
  expectInstallPinsMatch,
  expectNoInternalVocabulary,
  expectRealRunUrl,
} from "./public-copy/expect.js";
export type { InstallPinOptions } from "./public-copy/expect.js";
