/** Where a piece of text appears. The surface decides which rules apply and how strictly. */
export type CopySurface =
  | "title"
  | "description"
  | "social"
  | "alt"
  | "heading"
  | "body"
  | "generated"
  | "reference"
  | "agent";

export const COPY_SURFACES: readonly CopySurface[] = [
  "title", "description", "social", "alt", "heading", "body", "generated", "reference", "agent",
];

export type CopyRule =
  | "emdash"
  | "vocab"
  | "selfcert"
  | "meta"
  | "retired"
  | "pins"
  | "render"
  | "generated"
  | "guides"
  | "cli-budget"
  | "cli-case"
  | "cli-jargon"
  | "control"
  | "tray";

export type CopySeverity = "error" | "warn";

export interface CopyFinding {
  readonly rule: CopyRule;
  readonly severity: CopySeverity;
  readonly surface: CopySurface;
  /** `file:line`, or `file#selector` for HTML and JSON. */
  readonly location: string;
  readonly excerpt: string;
  readonly hint: string;
}

/**
 * The kind of metadata field a text fills. Social tags carry a field so that
 * `og:description` gets the description checks and `og:image:alt` the alt-text checks.
 */
export type CopyField = "title" | "description" | "alt" | "package";

/** How the text was produced, which decides the markup checks. */
export type CopyFormat = "text" | "html" | "markdown";

export interface CopyTextEntry {
  readonly file: string;
  readonly surface: CopySurface;
}

/** Captured CLI output to lint. `kind` sets the budget: `bare` (25 lines, 80 columns), `help` (60 lines), `command` (per-command help). */
export interface CopyCliEntry {
  /** A file or glob of captured output, such as `test/golden/help.txt`. */
  readonly files: string;
  readonly kind: "bare" | "help" | "command";
}

/**
 * Captured `--json` output checked against desktop-foundation's control grammar and envelope
 * (`contract/envelope.schema.json`). Each field is a file relative to the root.
 */
export interface CopyControlConfig {
  /** Captured `<product> commands --json`. */
  readonly commands?: string;
  /** Captured `<product> status --json`. */
  readonly status?: string;
  /** Captured `<product> tui --json`, which must equal `status` except `generatedAt`. Needs `status`. */
  readonly tui?: string;
  /** Files or globs of other captured envelopes, such as error output. */
  readonly envelopes?: readonly string[];
}

/** The guard against menu bar and tray companions. `true` scans every tracked file with the default exclusions. */
export interface CopyTrayConfig {
  /** Globs the guard skips, on top of `exclude`. */
  readonly exclude?: readonly string[];
}

export interface CopyJsonEntry {
  readonly file: string;
  /** A JSONPath subset: `$`, `.key`, `['key']`, `[n]`, `[*]`, and `.*`. */
  readonly path: string;
  readonly surface: CopySurface;
}

/** The `public-copy.config.json` format. Every field is optional. */
export interface CopyConfig {
  readonly html?: readonly string[];
  readonly markdown?: readonly string[];
  readonly text?: readonly CopyTextEntry[];
  readonly json?: readonly CopyJsonEntry[];
  /** Markdown files that document an interface. Internal terms they define are allowed. */
  readonly reference?: readonly string[];
  /** Markdown files written by a model. The `generated` rule applies to their prose. */
  readonly generated?: readonly string[];
  /** Globs to skip. `node_modules/**` and `.git/**` are always skipped. */
  readonly exclude?: readonly string[];
  readonly vocabulary?: {
    /** Extra internal words for this repository. */
    readonly add?: readonly string[];
    /** Words allowed in body text on a page that defines them. */
    readonly allowWithDefinition?: readonly string[];
  };
  /** Captured `--help` and bare-invocation output. */
  readonly cli?: readonly CopyCliEntry[];
  /** Captured `--json` output for the control grammar and envelope checks. */
  readonly control?: CopyControlConfig;
  /** Fail on menu bar or tray code, such as a menu-kit import or a `menubar.ts` file. */
  readonly tray?: boolean | CopyTrayConfig;
  /** Names that CLI help may capitalize mid-sentence, such as contact or service names. */
  readonly properNouns?: readonly string[];
  /** The product name as the registry spells it. A `<title>` names it once. */
  readonly brand?: string;
  /** Path to `package.json`, for the install-pin check. */
  readonly package?: string;
  /** Path to the ratchet file. Defaults to `.public-copy-baseline.json`. */
  readonly baseline?: string;
  /**
   * `true` (default) checks synced STYLE.md and WRITING.md when they exist,
   * `"required"` also fails when they are missing, and `false` skips the check.
   */
  readonly guides?: boolean | "required";
}

export interface ExtractedText {
  readonly surface: CopySurface;
  readonly text: string;
  readonly location: string;
  readonly field?: CopyField;
}
