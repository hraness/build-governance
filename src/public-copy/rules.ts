import type {
  CopyConfig,
  CopyField,
  CopyFinding,
  CopyFormat,
  CopyRule,
  CopySeverity,
  CopySurface,
} from "./types.js";
import { splitTitle } from "./scanners.js";

/** Bump when a rule or list changes, so a pin bump names the lint version it brings. */
export const PUBLIC_COPY_RULES_VERSION = "hraness-public-copy/v0";

/**
 * Internal vocabulary from the canonical STYLE.md section "Write for the reader, not the build".
 * `owns` is omitted: it is internal only when used for a source or record, which a word match cannot tell.
 */
export const INTERNAL_VOCABULARY: readonly string[] = [
  "admission", "admitted", "qualification", "qualified", "custody", "settlement", "settled",
  "receipt", "attest", "attested", "evidence-backed", "provenance", "bounded", "boundary",
  "typed", "contract", "fenced", "lease", "manifest", "promoted", "gate", "lane", "workstream",
  "surface", "projection", "foundation", "substrate", "authority", "inert", "canonical",
  "retained", "source pilot", "source-bound", "steel thread",
];

/** Two or more of these in one sentence form a precision stack. */
export const PRECISION_WORDS: readonly string[] = [
  "exact", "explicit", "full", "complete", "retained", "independently",
];

export const SELF_CERTIFICATION: readonly string[] = [
  "honest", "honestly", "honesty", "said plainly", "factual proof", "checked product",
];

interface NamePattern {
  readonly pattern: RegExp;
  readonly hint: string;
}

/** Retired product names and misspellings. A retired name may follow "formerly". */
export const RETIRED_NAMES: readonly NamePattern[] = [
  { pattern: /(?<![\w.-])atet(?![\w-])/gi, hint: "Atet is retired. Mention it only in a redirect, a changelog, or a “formerly” note." },
  { pattern: /(?<![\w.-])message[ -]like[ -]me(?![\w-])/gi, hint: "Message Like Me is retired. Mention it only in a redirect, a changelog, or a “formerly” note." },
  { pattern: /(?<![\w.-])life ?days ?left(?![\w-])/gi, hint: "Life Days Left is retired. Mention it only in a redirect, a changelog, or a “formerly” note." },
  { pattern: /(?<![\w.-])platonik(?![\w-])/gi, hint: "Platonik is retired. Mention it only in a redirect, a changelog, or a “formerly” note." },
  { pattern: /(?<![\w./-])hra\.sh(?![\w-])/gi, hint: "hra.sh is retired. Mention it only in a redirect, a changelog, or a “formerly” note." },
  { pattern: /(?<![\w-])Oompa(?![\w-])/g, hint: "Oompa is a retired product name. Name what the reader uses today." },
  { pattern: /(?<![\w-])Wrench(?![\w-])/g, hint: "Wrench is a retired product name. Name what the reader uses today." },
  { pattern: /(?<![\w-])Aicharts(?![\w-])/g, hint: "Write “AI Charts”, as the portfolio registry spells it." },
  { pattern: /(?<![\w-])TextButler(?![\w-])/g, hint: "Write “Textbutler”, as the portfolio registry spells it." },
  { pattern: /(?<![\w-])XCB(?![\w-])/g, hint: "Write “xcb”, as the portfolio registry spells it." },
  { pattern: /(?<![\w-])Sound\.fish(?![\w-])/g, hint: "The product is Soundfish. Write sound.fish only for the web address." },
];

const SIGNIFICANCE_CLOSER = /\b(?:signals|underscores|highlights|reflects|represents|marks)\b|\braises questions\b/gi;
const PROCESS_WORDS = /\b403\b|\bCloudflare\b|\bat clip time\b|\bthis digest\b|\bcandidate pool\b|\bsupplied evidence\b|\bshould not be selected\b|\bfetched for this draft\b/gi;
const RELATIVE_DATES = /\b(?:today|yesterday|this week)\b/gi;
const GOVERNING_CLAIM = /\bgoverning claim\b/gi;

const TIGHT_SURFACES: ReadonlySet<CopySurface> = new Set(["title", "description", "social", "alt", "heading"]);
const METADATA_SURFACES: ReadonlySet<CopySurface> = new Set(["title", "description", "social", "alt"]);

/** Nouns ending in "s" that are singular, so "1 series" is correct. */
const SINGULAR_S = new Set([
  "series", "news", "species", "yes", "gas", "lens", "always", "perhaps", "its", "has", "was",
  "does", "as", "canvas", "alias", "atlas", "whereas", "sometimes", "hers", "ours", "yours", "theirs",
]);

/** "Step 1 runs…": the number labels an item instead of counting a noun. */
const ORDINAL_LABEL = /\b(?:rank|step|phase|level|tier|version|chapter|part|wave|day|week|stage|option|page|section|figure|table|round|slot|item|no\.)\s+$/i;

export interface LintCopyOptions {
  readonly surface: CopySurface;
  readonly location: string;
  readonly config?: CopyConfig;
  readonly field?: CopyField;
  readonly format?: CopyFormat;
  /** Internal terms the page defines. Reference pages and `allowWithDefinition` terms may use them. */
  readonly definedTerms?: ReadonlySet<string>;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A whole-word pattern for a vocabulary term, including its plural. */
export function termPattern(term: string): string {
  const words = term.trim().toLowerCase().split(/\s+/).map(escapeRegExp);
  const last = words.pop() ?? "";
  const plural = last.endsWith("y") ? `${last.slice(0, -1)}(?:y|ies)` : `${last}(?:s|es)?`;
  return `(?<![\\w-])${[...words, plural].join("\\s+")}(?![\\w-])`;
}

const termRegexCache = new Map<string, RegExp>();
function termRegex(term: string): RegExp {
  let regex = termRegexCache.get(term);
  if (!regex) {
    regex = new RegExp(termPattern(term), "gi");
    termRegexCache.set(term, regex);
  }
  regex.lastIndex = 0;
  return regex;
}

/** Terms from `terms` that `pageText` defines, as in “a lease is…” or “**lease**: …”. */
export function definedTerms(pageText: string, terms: readonly string[]): Set<string> {
  const found = new Set<string>();
  for (const term of terms) {
    const definition = new RegExp(
      `${termPattern(term)}\\s*(?:\\*\\*|\\*|_|”|"|\`)?\\s*(?::|\\(|\\bis\\b|\\bare\\b|\\bmeans\\b|\\brefers to\\b)`,
      "i",
    );
    if (definition.test(pageText)) found.add(term.toLowerCase());
  }
  return found;
}

export function vocabularyFor(config: CopyConfig | undefined): readonly string[] {
  const added = config?.vocabulary?.add ?? [];
  return [...new Set([...INTERNAL_VOCABULARY, ...added.map(term => term.toLowerCase())])];
}

/** A short excerpt around a match, on one line. */
export function excerptAt(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 30);
  const end = Math.min(text.length, index + length + 30);
  const body = text.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${body}${end < text.length ? "…" : ""}`;
}

/** Replace URLs with spaces so that offsets stay stable. */
export function maskUrls(text: string): string {
  return text.replace(/\bhttps?:\/\/[^\s)>\]]+|\bwww\.[^\s)>\]]+/g, match => " ".repeat(match.length));
}

/** Sentence spans, split after terminal punctuation followed by space. */
export function sentenceSpans(text: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  const boundary = /[.!?]["”’)]*\s+/g;
  let start = 0;
  for (const match of text.matchAll(boundary)) {
    const end = match.index + match[0].length;
    if (text.slice(start, end).trim()) spans.push({ start, end });
    start = end;
  }
  if (text.slice(start).trim()) spans.push({ start, end: text.length });
  return spans;
}

function isAfterFormerly(text: string, index: number): boolean {
  const before = text.slice(Math.max(0, index - 60), index);
  const sentence = before.split(/[.!?]\s/).pop() ?? "";
  return /\bformerly\b/i.test(sentence);
}

function codePointLength(text: string): number {
  return [...text].length;
}

function titleSegments(title: string): string[] {
  return splitTitle(title).map(part => part.trim().toLowerCase()).filter(Boolean);
}

/** Lint one piece of text for one surface. */
export function lintCopy(text: string, opts: LintCopyOptions): CopyFinding[] {
  const findings: CopyFinding[] = [];
  const { surface, location } = opts;
  const format = opts.format ?? "text";
  const add = (rule: CopyRule, severity: CopySeverity, index: number, length: number, hint: string, source = text): void => {
    findings.push({ rule, severity, surface, location, excerpt: excerptAt(source, index, length), hint });
  };
  const masked = maskUrls(text);

  // emdash
  for (const match of masked.matchAll(/\u2014/g)) {
    add("emdash", "error", match.index, 1, "Rewrite the sentence without an em dash. Do not substitute a spaced hyphen.");
  }
  for (const match of masked.matchAll(/ \u2013 | -- /g)) {
    add("emdash", "error", match.index, match[0].length, "A spaced en dash or double hyphen stands in for an em dash. Rewrite the sentence.");
  }

  // vocab
  const allowWithDefinition = new Set((opts.config?.vocabulary?.allowWithDefinition ?? []).map(term => term.toLowerCase()));
  const defined = opts.definedTerms ?? new Set<string>();
  for (const term of vocabularyFor(opts.config)) {
    let severity: CopySeverity | undefined;
    if (TIGHT_SURFACES.has(surface)) severity = "error";
    else if (surface === "reference") severity = defined.has(term) ? undefined : "warn";
    else severity = allowWithDefinition.has(term) && defined.has(term) ? undefined : "warn";
    if (!severity) continue;
    for (const match of masked.matchAll(termRegex(term))) {
      add("vocab", severity, match.index, match[0].length,
        `“${match[0]}” is internal vocabulary. Say what the reader gets, or define the term where it first appears.`);
    }
  }
  const precision = new RegExp(`\\b(?:${PRECISION_WORDS.join("|")})\\b`, "gi");
  for (const span of sentenceSpans(masked)) {
    const sentence = masked.slice(span.start, span.end);
    const words = [...sentence.matchAll(precision)];
    const distinct = new Set(words.map(word => word[0].toLowerCase()));
    if (distinct.size >= 2 && words[0]) {
      const severity: CopySeverity = TIGHT_SURFACES.has(surface) ? "error" : "warn";
      add("vocab", severity, span.start + words[0].index, sentence.length - words[0].index,
        `Precision stack (${[...distinct].join(", ")}). Keep a precision word only where it changes the meaning.`);
    }
  }

  // selfcert
  const selfcert = new RegExp(`\\b(?:${SELF_CERTIFICATION.map(escapeRegExp).map(term => term.replace(/ /g, "\\s+")).join("|")})\\b`, "gi");
  for (const match of masked.matchAll(selfcert)) {
    add("selfcert", "error", match.index, match[0].length,
      "Do not call the page, product, or caveat honest, plain, factual, or checked. Show the evidence.");
  }

  // retired
  for (const { pattern, hint } of RETIRED_NAMES) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      if (isAfterFormerly(text, match.index)) continue;
      add("retired", "error", match.index, match[0].length, hint);
    }
  }

  // meta
  const field = opts.field;
  const trimmed = text.trim();
  const isDescription = field === "description" || (surface === "description" && field === undefined);
  const isTitle = field === "title" || (surface === "title" && field === undefined);
  const isAlt = field === "alt" || (surface === "alt" && field === undefined);
  if (isDescription && trimmed) {
    const length = codePointLength(trimmed);
    if (length < 70 || length > 160) {
      add("meta", "error", 0, trimmed.length, `Description is ${length} characters. Write one or two complete sentences of 70 to 160 characters.`, trimmed);
    }
    if (/(?:…|\.\.\.)$/.test(trimmed)) {
      add("meta", "error", trimmed.length - 3, 3, "Description ends in an ellipsis. Write a complete sentence that fits instead of truncating.", trimmed);
    } else if (!/[.!?)"”’']$/.test(trimmed)) {
      add("meta", "error", Math.max(0, trimmed.length - 20), 20, "Description stops mid-sentence. End it with a complete sentence.", trimmed);
    }
  }
  if (isTitle && trimmed) {
    const length = codePointLength(trimmed);
    if (length > 65) add("meta", "error", 0, trimmed.length, `Title is ${length} characters. Keep it to 65 or fewer.`, trimmed);
    const brand = opts.config?.brand?.trim();
    const brandCount = brand ? [...trimmed.matchAll(new RegExp(`(?<![\\w-])${escapeRegExp(brand)}(?![\\w-])`, "gi"))].length : 0;
    const segments = titleSegments(trimmed);
    if (brandCount > 1 || new Set(segments).size < segments.length) {
      add("meta", "error", 0, trimmed.length, "The title repeats a name. Name the brand once.", trimmed);
    }
  }
  if (isAlt && trimmed) {
    const length = codePointLength(trimmed);
    if (length > 125) add("meta", "error", 0, trimmed.length, `Alt text is ${length} characters. Describe the image in 125 or fewer.`, trimmed);
    if (/^(?:an?\s+)?(?:image|picture|photo|screenshot)\s+of\b/i.test(trimmed)) {
      add("meta", "error", 0, 12, "Describe what the image shows. Do not start with “Image of”.", trimmed);
    }
    if (/\s[—–|]\s|\s-\s/.test(trimmed)) {
      add("meta", "error", 0, trimmed.length, "Alt text reads as a title and tagline. Describe what the image shows.", trimmed);
    }
  }

  // render
  if (format === "html" || METADATA_SURFACES.has(surface)) {
    for (const match of text.matchAll(/`|\*\*/g)) {
      add("render", "error", match.index, match[0].length, "Markdown syntax renders literally here. Use markup, or write the command in prose.");
    }
  }
  if (format !== "markdown") {
    for (const match of text.matchAll(/&(?:apos|quot|amp|lt|gt|#39|#x27);/g)) {
      add("render", "error", match.index, match[0].length, "An HTML entity renders literally. Escape it once.");
    }
  }
  for (const match of masked.matchAll(/[a-z]\.[A-Z][a-z]/g)) {
    add("render", "error", match.index, match[0].length, "Two sentences are glued together. Add a space after the period.");
  }
  for (const match of masked.matchAll(/(?<![\w.,#-])1 ([a-z]+s)\b/g)) {
    const noun = match[1] ?? "";
    if (SINGULAR_S.has(noun) || /(?:ss|us|is|ics)$/.test(noun)) continue;
    if (ORDINAL_LABEL.test(masked.slice(Math.max(0, match.index - 12), match.index))) continue;
    add("render", "warn", match.index, match[0].length, "The count does not agree with its noun. Test zero, one, and several.");
  }

  // generated
  if (surface === "generated") {
    const spans = sentenceSpans(masked);
    const last = spans[spans.length - 1];
    if (last) {
      const sentence = masked.slice(last.start, last.end);
      for (const match of sentence.matchAll(SIGNIFICANCE_CLOSER)) {
        add("generated", "error", last.start + match.index, match[0].length,
          "The text ends on a significance claim. End on the last supported fact.");
      }
    }
    for (const match of masked.matchAll(PROCESS_WORDS)) {
      add("generated", "error", match.index, match[0].length, "Do not describe how the text was made or what was fetched.");
    }
    for (const match of masked.matchAll(RELATIVE_DATES)) {
      add("generated", "error", match.index, match[0].length, "Write dates as dates in text that stays published.");
    }
    for (const match of masked.matchAll(GOVERNING_CLAIM)) {
      add("generated", "error", match.index, match[0].length, "Name the speaker and role without paraphrasing the quote in the attribution.");
    }
  }

  return findings;
}
