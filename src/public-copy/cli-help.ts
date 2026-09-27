/**
 * CLI help lint: checks captured `--help` and bare-invocation output against the Hraness CLI style
 * contract (CLI_MENU_STYLE.md in hraness/.github): line budgets, sentence case in headings and
 * one-line summaries, and internal vocabulary without a gloss on the same line.
 * Pure: takes text, returns findings.
 */
import { definedTerms, excerptAt, INTERNAL_VOCABULARY, lintCopy, termPattern } from "./rules.js";
import type { CopyConfig, CopyFinding, CopySeverity } from "./types.js";

/** Which output a golden holds. The kind decides the budget. */
export type CliHelpKind = "bare" | "help" | "command";

export const CLI_HELP_KINDS: readonly CliHelpKind[] = ["bare", "help", "command"];

/** Line and column budgets per kind. `columnsSeverity` is how hard the column budget is. */
export const CLI_HELP_BUDGETS: Readonly<Record<CliHelpKind, { lines: number; linesSeverity: CopySeverity; columns: number; columnsSeverity: CopySeverity }>> = {
  bare: { lines: 25, linesSeverity: "error", columns: 80, columnsSeverity: "error" },
  help: { lines: 60, linesSeverity: "error", columns: 100, columnsSeverity: "warn" },
  command: { lines: 60, linesSeverity: "warn", columns: 100, columnsSeverity: "warn" },
};

/**
 * Words the CLI style contract bans from help and errors unless glossed on the same line.
 * The rest of INTERNAL_VOCABULARY is a warning in CLI text.
 */
export const CLI_JARGON: readonly string[] = [
  "admission", "admitted", "qualification", "qualified", "custody", "receipt", "lane", "gate",
  "surface", "projection", "habitat", "organism",
];

/** Also banned by the contract, but common as a plain verb ("pin a chat"), so only a warning. */
const CLI_JARGON_WARN_ONLY: readonly string[] = ["pin"];

/**
 * Names help text may capitalize mid-sentence. Mixed-case names (macOS, GitHub, iTerm) and
 * all-capital words pass without a list entry.
 */
export const CLI_PROPER_NOUNS: readonly string[] = [
  "Mac", "Messages", "Chrome", "Safari", "Firefox", "Edge", "Brave", "Arc", "Finder", "System Settings",
  "Keychain Access", "Privacy & Security", "Full Disk Access", "Automation", "Contacts", "Accessibility",
  "Screen & System Audio Recording", "Camera", "Microphone", "Local Network", "Firewall", "Notifications",
  "Login Items & Extensions", "Login Items", "Settings", "Enter", "Return", "Escape", "Option", "Command",
  "Control", "Shift", "Always Allow", "Allow", "Don't Allow", "Apple", "Apple Intelligence", "Xcode", "Terminal", "Ghostty",
  "Zed", "Warp", "WezTerm", "Visual Studio Code", "Windows", "Linux", "Homebrew", "Bun", "Node", "Deno",
  "Rust", "Swift", "Python", "Markdown", "Git", "Google", "Slack", "Stripe", "Vercel", "Cloudflare",
  "Claude", "Claude Code", "Codex", "Devin", "Cursor", "Gemini", "OpenAI", "Anthropic", "Ollama",
  "Hraness", "Textbutler", "Ghostget", "Wordcell", "Sponge", "PeopleBlade", "AI Charts", "Slopcamera",
  "Valhalla", "Soundfish", "Gobstopper", "Morphogen", "Lifecharts", "System One",
  "January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
  "November", "December", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "English",
];

export interface CliHelpOptions {
  readonly kind: CliHelpKind;
  /** Where the text came from, such as `test/golden/help.txt`. Findings add `:line`. */
  readonly location: string;
  readonly config?: CopyConfig;
  /** Extra names that may be capitalized. `config.properNouns` and `config.brand` are added too. */
  readonly properNouns?: readonly string[];
}

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function columns(line: string): number {
  return [...line].length;
}

/** Lines of captured output: ANSI removed, CRLF folded, trailing blank lines dropped. */
export function helpLines(text: string): string[] {
  const lines = text.replace(ANSI, "").replace(/\r\n?/g, "\n").split("\n");
  while (lines.length && !lines[lines.length - 1]!.trim()) lines.pop();
  return lines;
}

/** Spans of `text` that hold commands, placeholders, flags, quotes, or code, which sentence case skips. */
function literalSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const patterns = [
    /`[^`]*`/g, /"[^"]*"/g, /“[^”]*”/g, /'[^'\s][^']*'/g, /<[^>]*>/g, /\[[^\]]*\]/g, /\{[^}]*\}/g,
    /(?<!\S)--?[A-Za-z][\w-]*(?:[= ]<[^>]*>)?/g, /\S*[/\\~@]\S*/g, /\S+\.\S+/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) spans.push([match.index, match.index + match[0].length]);
  }
  return spans;
}

/**
 * The first word that breaks sentence case: a Titlecase word (one capital, then lowercase) that
 * does not start a sentence or segment and is not part of a proper noun or a literal.
 */
export function sentenceCaseBreak(text: string, nouns: readonly string[]): { word: string; index: number } | undefined {
  const exempt = literalSpans(text);
  for (const noun of nouns) {
    for (const match of text.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(noun)}(?![\\p{L}\\p{N}])`, "gu"))) {
      exempt.push([match.index, match.index + noun.length]);
    }
  }
  for (const match of text.matchAll(/\S+/g)) {
    const before = text.slice(0, match.index);
    // A new sentence or segment starts after terminal punctuation, a colon, a middle dot, a bar, or a dash.
    if (!before.trim() || /(?:[.!?:·|•]|\s[-–]|\()\s*$/.test(before)) continue;
    const lead = match[0].search(/[\p{L}\p{N}]/u);
    if (lead === -1) continue;
    const start = match.index + lead;
    if (exempt.some(([from, to]) => start >= from && start < to)) continue;
    const bare = match[0].replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (!/^\p{Lu}\p{Ll}+(?:'\p{Ll}+)?$/u.test(bare)) continue;
    return { word: bare, index: start };
  }
  return undefined;
}

interface HelpText {
  readonly text: string;
  readonly offset: number;
  readonly role: "heading" | "summary" | "prose";
}

/** The parts of one help line that read as prose: a heading, a one-line summary after a gap, or a sentence. */
export function proseOf(line: string, index: number): HelpText | undefined {
  if (!line.trim()) return undefined;
  const indent = /^\s*/.exec(line)![0].length;
  if (indent === 0) {
    if (/^usage:/i.test(line)) return undefined;
    // "Start here", "Options:", "All commands: x --help · Topics: x help <topic>"
    const gap = /\S( {2,}|\t)\S/.exec(line);
    if (gap) return { text: line.slice(gap.index + 1 + gap[1]!.length), offset: gap.index + 1 + gap[1]!.length, role: "summary" };
    return { text: line, offset: 0, role: index === 0 ? "prose" : "heading" };
  }
  const gap = /\S( {2,}|\t)(?=\S)/.exec(line.slice(indent));
  if (gap) {
    const offset = indent + gap.index + 1 + gap[1]!.length;
    return { text: line.slice(offset), offset, role: "summary" };
  }
  // An indented line without a column gap is an example, a synopsis, or a wrapped summary.
  const trimmed = line.trim();
  if (/^[$>#]/.test(trimmed) || /^[a-z0-9][\w.-]*(\s|$)/.test(trimmed) && !/[.!?]$/.test(trimmed)) return undefined;
  return { text: trimmed, offset: indent, role: "prose" };
}

function glossed(line: string, term: string): boolean {
  if (definedTerms(line, [term]).size) return true;
  return new RegExp(`\\((?:an?\\s+|the\\s+)?${termPattern(term)}\\)`, "i").test(line);
}

/** Check one captured help or bare-invocation output. */
export function lintCliHelp(text: string, options: CliHelpOptions): CopyFinding[] {
  const findings: CopyFinding[] = [];
  const { kind, location, config } = options;
  const lines = helpLines(text);
  const budget = CLI_HELP_BUDGETS[kind];
  const add = (rule: CopyFinding["rule"], severity: CopySeverity, line: number, excerpt: string, hint: string): void => {
    findings.push({ rule, severity, surface: "body", location: `${location}:${line}`, excerpt, hint });
  };

  // cli-budget
  if (lines.length > budget.lines) {
    const what = kind === "bare" ? "A bare invocation" : kind === "help" ? "Root help" : "Command help";
    add("cli-budget", budget.linesSeverity, budget.lines + 1, `${lines.length} lines`,
      `${what} prints ${lines.length} lines. Keep it to ${budget.lines}${kind === "help" ? "; move advanced verbs to `help advanced`" : kind === "bare" ? ": a one-line description, 3 to 5 starter commands, and the help pointer" : ""}.`);
  }
  lines.forEach((line, index) => {
    const width = columns(line);
    if (width > budget.columns) {
      add("cli-budget", budget.columnsSeverity, index + 1, excerptAt(line, budget.columns - 20, 20),
        `Line is ${width} columns. Keep ${kind === "bare" ? "a bare invocation" : "help"} to ${budget.columns}; wrap the summary or shorten it.`);
    }
  });

  const nouns = [...new Set([...CLI_PROPER_NOUNS, ...(config?.properNouns ?? []), ...(options.properNouns ?? []), ...(config?.brand ? [config.brand] : [])])]
    .sort((a, b) => b.length - a.length);
  const added = (config?.vocabulary?.add ?? []).map(term => term.toLowerCase());
  const errorTerms = [...new Set([...CLI_JARGON, ...added])];
  const warnTerms = [...new Set([...CLI_JARGON_WARN_ONLY, ...INTERNAL_VOCABULARY.map(term => term.toLowerCase())])].filter(term => !errorTerms.includes(term));

  lines.forEach((line, index) => {
    const prose = proseOf(line, index);
    const lineNo = index + 1;

    // cli-case
    if (prose) {
      const broken = sentenceCaseBreak(prose.text, nouns);
      if (broken) {
        add("cli-case", "error", lineNo, excerptAt(prose.text, broken.index, broken.word.length),
          `“${broken.word}” is capitalized mid-sentence. Use sentence case, or add the name to properNouns.`);
      }
    }

    // cli-jargon: the whole line, including command names, unless the same line glosses the word.
    for (const [terms, severity] of [[errorTerms, "error"], [warnTerms, "warn"]] as const) {
      for (const term of terms) {
        for (const match of line.matchAll(new RegExp(termPattern(term), "gi"))) {
          if (glossed(line, term)) continue;
          add("cli-jargon", severity, lineNo, excerptAt(line, match.index, match[0].length),
            `“${match[0]}” is internal vocabulary. Say what the person gets, or gloss it on the same line, as in “${match[0]} (what it means)”.`);
        }
      }
    }

    // Shared public-copy rules that apply to terminal text.
    if (prose) {
      for (const finding of lintCopy(prose.text, { surface: "body", location: `${location}:${lineNo}`, ...(config ? { config } : {}) })) {
        if (finding.rule === "emdash" || finding.rule === "selfcert" || finding.rule === "retired") findings.push(finding);
      }
    }
  });
  return findings;
}
