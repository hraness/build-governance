/**
 * The CLI golden checks: the Hraness CLI style contract (CLI_MENU_STYLE.md in hraness/.github,
 * sections D2 to D8) turned into pass, warn, fail, or skip results over captured runs.
 * Pure: the runner captures the runs, these functions judge them.
 */
import { helpLines, lintCliHelp } from "../public-copy/cli-help.js";
import type { CliHelpKind } from "../public-copy/cli-help.js";
import { checkCommands, checkTuiMatchesStatus, COMMANDS_SCHEMA, envelopeProblems, ERROR_SCHEMA, nextProblems, SHARED_ERROR_CODES } from "../public-copy/control.js";
import type { CopyConfig, CopyFinding } from "../public-copy/types.js";

export type CheckStatus = "pass" | "warn" | "fail" | "skip";

/** One captured invocation. `signal` is set when the process was killed by one. */
export interface CapturedRun {
  readonly args: readonly string[];
  readonly code: number | null;
  readonly signal?: string | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut?: boolean;
}

export interface CheckResult {
  readonly id: string;
  /** The style contract section the check enforces. */
  readonly rule: string;
  readonly status: CheckStatus;
  readonly detail: string;
}

/** Everything the harness captured. Optional runs are missing when a check could not run. */
export interface GoldenRuns {
  readonly name: string;
  readonly unknown: string;
  readonly bare: CapturedRun;
  readonly help: CapturedRun;
  readonly commands: ReadonlyArray<{ readonly command: string; readonly flag: CapturedRun; readonly topic: CapturedRun }>;
  readonly version: CapturedRun;
  readonly versionJson: CapturedRun;
  readonly unknownText: CapturedRun;
  readonly unknownJson: CapturedRun;
  readonly unknownAgent: CapturedRun;
  readonly dumb: readonly CapturedRun[];
  /** Runs on a pseudo-terminal with NO_COLOR=1; undefined when no pseudo-terminal is available. */
  readonly ttyNoColor?: readonly CapturedRun[];
  /** `--help` with stdout closed after the first line. */
  readonly pipe: CapturedRun;
  /**
   * The shared commands, run with `--json`. `commands` is always captured when the runner looks;
   * the rest are captured only when `commands --json` answers with the commands envelope, and
   * `tui` and `doctor` only when it lists them.
   */
  readonly shared?: SharedRuns;
}

/** Captured `--json` runs of the shared commands (CLI_MENU_STYLE.md C1). */
export interface SharedRuns {
  readonly commands: CapturedRun;
  readonly status?: CapturedRun;
  readonly tui?: CapturedRun;
  readonly doctor?: CapturedRun;
}

// eslint-disable-next-line no-control-regex
const ANY_ESCAPE = /\u001b/;
// eslint-disable-next-line no-control-regex
const COLOR = /\u001b\[[0-9;]*m/;
// eslint-disable-next-line no-control-regex
const ANSI_GLOBAL = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

/** The contract's CLI symbols. Under TERM=dumb each must be replaced by its ASCII fallback. */
export const CONTRACT_SYMBOLS: readonly string[] = ["✓", "✗", "⚠", "→", "●", "○", "↻", "🔐"];

const TRACE = /panicked at|thread '.*' panicked|\bEPIPE\b|Broken pipe|Traceback \(most recent call last\)|^\s+at .+:\d+:\d+\)?$|RUST_BACKTRACE/m;

function plain(text: string): string {
  return text.replace(ANSI_GLOBAL, "").replace(/\r\n?/g, "\n");
}

function nonBlank(text: string): string[] {
  return plain(text).split("\n").filter(line => line.trim());
}

function exit(run: CapturedRun): string {
  if (run.timedOut) return "timed out";
  if (run.signal) return `killed by ${run.signal}`;
  return `exit ${run.code}`;
}

function quote(line: string | undefined, max = 60): string {
  if (line === undefined) return "nothing";
  const text = line.trim();
  return `"${text.length > max ? `${text.slice(0, max - 1)}…` : text}"`;
}

function widest(lines: readonly string[]): number {
  return lines.reduce((max, line) => Math.max(max, [...line].length), 0);
}

function result(id: string, rule: string, problems: string[], warnings: string[], ok: string): CheckResult {
  if (problems.length) return { id, rule, status: "fail", detail: problems.join("; ") };
  if (warnings.length) return { id, rule, status: "warn", detail: warnings.join("; ") };
  return { id, rule, status: "pass", detail: ok };
}

/** D2: a bare invocation prints at most 25 lines of at most 80 columns to stdout and exits 0. */
export function checkBare(run: CapturedRun): CheckResult {
  const lines = helpLines(run.stdout);
  const problems: string[] = [];
  if (run.code !== 0) problems.push(`${exit(run)}, want exit 0${run.stderr.trim() ? ` (stderr: ${quote(nonBlank(run.stderr)[0])})` : ""}`);
  if (!lines.length) problems.push("printed nothing on stdout");
  if (lines.length > 25) problems.push(`${lines.length} lines, want at most 25`);
  if (widest(lines) > 80) problems.push(`a line is ${widest(lines)} columns, want at most 80`);
  return result("bare", "D2", problems, [], `${lines.length} lines, exit 0`);
}

/** D3: root help prints at most 60 lines to stdout and exits 0. Lines over 100 columns warn. */
export function checkHelp(run: CapturedRun): CheckResult {
  const lines = helpLines(run.stdout);
  const problems: string[] = [];
  const warnings: string[] = [];
  if (run.code !== 0) problems.push(`${exit(run)}, want exit 0`);
  if (!lines.length) problems.push("printed nothing on stdout");
  if (lines.length > 60) problems.push(`${lines.length} lines, want at most 60`);
  if (widest(lines) > 100) warnings.push(`a line is ${widest(lines)} columns; keep help to 100`);
  return result("help", "D3", problems, warnings, `${lines.length} lines, exit 0`);
}

/** D3: `<cmd> --help` exits 0 with help on stdout, and `help <cmd>` prints the same text. */
export function checkCommandHelp(command: string, flag: CapturedRun, topic: CapturedRun): CheckResult {
  const problems: string[] = [];
  const warnings: string[] = [];
  const lines = helpLines(flag.stdout);
  if (flag.code !== 0) problems.push(`\`${command} --help\` ${exit(flag)}, want exit 0`);
  if (!lines.length) problems.push(`\`${command} --help\` printed nothing on stdout`);
  if (topic.code !== 0) warnings.push(`\`help ${command}\` ${exit(topic)}`);
  else if (plain(topic.stdout).trim() !== plain(flag.stdout).trim()) warnings.push(`\`help ${command}\` differs from \`${command} --help\``);
  if (widest(lines) > 100) warnings.push(`a line is ${widest(lines)} columns; keep help to 100`);
  return result(`help:${command}`, "D3", problems, warnings, `${lines.length} lines, exit 0`);
}

/** D4: `--version` prints `name X.Y.Z` and exits 0; with `--json`, `{"name","version"}`. */
export function checkVersion(name: string, run: CapturedRun, json: CapturedRun): CheckResult[] {
  const text = plain(run.stdout).trim();
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const shape = new RegExp(`^${escaped} \\d+\\.\\d+\\.\\d+(?:[-+][0-9A-Za-z.+-]+)?$`);
  const problems: string[] = [];
  if (run.code !== 0) problems.push(`${exit(run)}, want exit 0`);
  if (!shape.test(text)) problems.push(`printed ${quote(text.split("\n")[0])}, want "${name} X.Y.Z"`);
  const jsonProblems: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json.stdout);
  } catch {
    parsed = undefined;
  }
  const record = parsed as { name?: unknown; version?: unknown } | undefined;
  if (json.code !== 0) jsonProblems.push(`${exit(json)}, want exit 0`);
  if (!record || typeof record !== "object" || record.name !== name || typeof record.version !== "string") {
    jsonProblems.push(`printed ${quote(nonBlank(json.stdout)[0] ?? nonBlank(json.stderr)[0])}, want {"name":"${name}","version":"X.Y.Z"}`);
  }
  return [
    result("version", "D4", problems, [], text),
    result("version --json", "D4", jsonProblems, [], json.stdout.trim()),
  ];
}

/**
 * D5: an unknown command prints `✗ … "x" …` then `→ next command` on stderr, nothing on stdout,
 * no usage dump, and exits 2.
 */
export function checkUnknown(unknown: string, run: CapturedRun): CheckResult {
  const lines = nonBlank(run.stderr);
  const problems: string[] = [];
  const warnings: string[] = [];
  if (run.code !== 2) problems.push(`${exit(run)}, want exit 2`);
  if (plain(run.stdout).trim()) problems.push(`printed on stdout: ${quote(nonBlank(run.stdout)[0])}`);
  const first = lines[0] ?? "";
  if (!/^(?:✗|FAIL) /.test(first)) problems.push(`first line is ${quote(first)}, want "✗ Unknown command …"`);
  else if (!first.includes(`"${unknown}"`) && !first.includes(`“${unknown}”`)) problems.push(`first line does not name "${unknown}"`);
  if (!/^(?:→|->) \S/.test(lines[1] ?? "")) problems.push(`second line is ${quote(lines[1])}, want "→ <cli> --help"`);
  if (lines.length > 2) {
    if (lines.some(line => /^\s*usage:/i.test(line))) problems.push("prints a usage dump");
    else warnings.push(`${lines.length} lines on stderr, want 2`);
  }
  return result("unknown command", "D5", problems, warnings, `${first.trim()} (exit 2)`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parse stdout as one JSON document, or undefined. */
function parseJson(stdout: string): unknown {
  try {
    return JSON.parse(stdout);
  } catch {
    return undefined;
  }
}

/** Why stdout is not a JSON document, for a run that printed none. */
function notJson(run: CapturedRun): string {
  return plain(run.stdout).trim()
    ? "stdout is not one JSON document"
    : `nothing on stdout${run.stderr.trim() ? ` (stderr: ${quote(nonBlank(run.stderr)[0])})` : ""}`;
}

/** Where a shared error code's exit status is looked up: a shared code, else 1 for a product code. */
function exitFor(code: string): number {
  return Object.hasOwn(SHARED_ERROR_CODES, code) ? SHARED_ERROR_CODES[code]! : 1;
}

const ONE_LINE = "the envelope spans more than one line; print it on one";

/** A warning when stdout holds the JSON document on more than one line. */
function oneLine(run: CapturedRun): string[] {
  return plain(run.stdout).trim().includes("\n") ? [ONE_LINE] : [];
}

/** What the golden checks know about a CLI's shared commands, from `commands --json`. */
export interface SharedContext {
  /** True when `commands --json` printed the commands envelope or another shared-envelope answer. */
  readonly adopted: boolean;
  /** The product name from the commands envelope. */
  readonly product?: string | undefined;
}

/**
 * D5 and C4: with `--json` or an agent audience, the error is one JSON object on stdout.
 * Two shapes pass. The shared envelope (`"schema": "hraness.error/1"`, `generatedAt`, `error.next` as a list of
 * `{command, why, audience}`) is checked against desktop-foundation's contract; it should be a `usage` error
 * exiting 2, and any other code must exit with that code's status. A CLI whose `commands --json` shows it has
 * the shared commands is always held to the shared envelope. Otherwise the older `hraness-cli-kit` shape,
 * `{"ok":false,"error":{"code","message","next":"<command>"}}` with exit 2, keeps `next` as one command string.
 * A missing or empty `next` warns in either shape.
 */
export function checkJsonError(id: string, run: CapturedRun, shared: SharedContext = { adopted: false }): CheckResult {
  const problems: string[] = [];
  const warnings: string[] = [];
  const doc = parseJson(run.stdout);
  if (!isRecord(doc)) {
    if (run.code !== 2) problems.push(`${exit(run)}, want exit 2`);
    problems.push(notJson(run));
    return result(id, "D5", problems, warnings, "");
  }
  const error = isRecord(doc.error) ? doc.error : undefined;
  if (shared.adopted || doc.schema === ERROR_SCHEMA) {
    if (doc.ok !== false) problems.push('missing "ok": false');
    else problems.push(...envelopeProblems(doc, shared.product));
    const code = typeof error?.code === "string" ? error.code : undefined;
    if (code !== undefined && code !== "usage") warnings.push(`error.code is "${code}"; an unknown command is "usage"`);
    const want = code === undefined ? 2 : exitFor(code);
    if (run.code !== want) problems.push(`${exit(run)}, want exit ${want}${code !== undefined && code !== "usage" ? ` for "${code}"` : ""}`);
    if (error && (!Array.isArray(error.next) || !error.next.length)) warnings.push('no "error.next" command');
    warnings.push(...oneLine(run));
    return result(id, "D5", problems, warnings, `{"ok":false,…} on stdout in the shared envelope, ${exit(run)}`);
  }
  if (run.code !== 2) problems.push(`${exit(run)}, want exit 2`);
  if (doc.ok !== false) problems.push('missing "ok": false');
  if (typeof error?.code !== "string" || typeof error?.message !== "string") problems.push('missing "error": {"code", "message"}');
  else if (Array.isArray(error.next)) {
    // Outside the shared envelope a malformed list warns, as any non-string next did in 0.5.0.
    warnings.push(...nextProblems(error.next, "error.next"));
    if (!error.next.length) warnings.push('no "error.next" command');
  } else if (typeof error.next !== "string" || !error.next.trim()) warnings.push('no "error.next" command');
  return result(id, "D5", problems, warnings, `{"ok":false,…} on stdout in the older error shape, exit 2`);
}

/**
 * Whether `commands --json` shows the CLI has the shared commands. A CLI without them answers with a usage
 * error (exit 2, or a `usage` error envelope); that is the only answer that skips the shared checks. The
 * op class of each listed verb, by path, when stdout is a commands envelope.
 */
export function sharedVerbs(run: CapturedRun): { readonly adopted: boolean; readonly verbs: ReadonlyMap<string, string> } {
  const doc = parseJson(run.stdout);
  const verbs = new Map<string, string>();
  if (isRecord(doc) && isRecord(doc.data) && Array.isArray(doc.data.verbs)) {
    for (const verb of doc.data.verbs) {
      if (isRecord(verb) && Array.isArray(verb.path) && verb.path.every(part => typeof part === "string")) {
        verbs.set(verb.path.join(" "), typeof verb.opClass === "string" ? verb.opClass : "");
      }
    }
  }
  if (isRecord(doc) && (doc.schema === COMMANDS_SCHEMA || doc.schema === ERROR_SCHEMA)) {
    const usage = doc.ok === false && isRecord(doc.error) && doc.error.code === "usage";
    return { adopted: !usage, verbs };
  }
  if (isRecord(doc) && doc.ok === true && verbs.size) return { adopted: true, verbs };
  return { adopted: !run.timedOut && !run.signal && run.code !== 2, verbs };
}

function findingProblems(findings: readonly CopyFinding[]): string[] {
  const problems = findings.slice(0, 3).map(item => item.excerpt);
  if (findings.length > 3) problems.push(`${findings.length - 3} more`);
  return problems;
}

/**
 * C4: a `--json` run prints one envelope on stdout, valid against desktop-foundation's
 * contract, and its exit code matches: 0 for `"ok": true`, and the code's exit status for an error
 * (a product code exits 1). More than one line warns.
 */
function envelopeRun(id: string, rule: string, run: CapturedRun, product: string | undefined, extra: readonly string[] = []): { check: CheckResult; doc: unknown } {
  const problems: string[] = [];
  const warnings: string[] = [...extra];
  const doc = parseJson(run.stdout);
  if (run.timedOut || run.signal) problems.push(exit(run));
  if (!isRecord(doc)) {
    problems.push(notJson(run));
    return { check: result(id, rule, problems, warnings, ""), doc: undefined };
  }
  problems.push(...envelopeProblems(doc, product));
  warnings.push(...oneLine(run));
  let want: number | undefined;
  let what = '"ok": true';
  if (doc.ok === true) want = 0;
  else if (doc.ok === false && isRecord(doc.error) && typeof doc.error.code === "string") {
    want = exitFor(doc.error.code);
    what = `"${doc.error.code}"`;
  }
  if (want !== undefined && !run.timedOut && !run.signal && run.code !== want) problems.push(`${exit(run)}, want exit ${want} for ${what}`);
  const summary = doc.ok === true ? `${String(doc.schema)}, exit 0` : `error ${isRecord(doc.error) ? String(doc.error.code) : "?"}, ${exit(run)}`;
  return { check: result(id, rule, problems, warnings, summary), doc };
}

/**
 * C1, C3 and C4: the shared commands. `commands --json` is the commands envelope with valid verbs;
 * `status --json`, `tui --json` and `doctor --json` print valid envelopes with matching exit codes;
 * `tui --json` should equal `status --json` apart from `generatedAt` (a difference warns). A CLI whose
 * `commands --json` answers with a usage error has not adopted the shared commands yet, and the checks skip.
 */
export function checkShared(shared: SharedRuns | undefined): CheckResult[] {
  const listed = shared ? sharedVerbs(shared.commands) : undefined;
  if (!shared || !listed?.adopted) {
    const why = shared ? `\`commands --json\` is a usage error (${exit(shared.commands)})` : "not captured";
    return [{ id: "shared commands", rule: "C1", status: "skip", detail: `${why}; these checks run once the CLI has the shared commands` }];
  }
  const commandsDoc = parseJson(shared.commands.stdout);
  const commands = isRecord(commandsDoc) ? checkCommands(commandsDoc, "commands --json") : undefined;
  const product = commands?.product;
  const commandProblems = commands ? findingProblems(commands.findings) : [notJson(shared.commands)];
  if (shared.commands.code !== 0) commandProblems.unshift(`${exit(shared.commands)}, want exit 0`);
  const verbs = commands?.verbs ?? new Set<string>();
  const results: CheckResult[] = [result("commands --json", "C1", commandProblems, oneLine(shared.commands), `${verbs.size} verbs${product ? ` for ${product}` : ""}, exit 0`)];

  let statusDoc: unknown;
  if (shared.status) {
    const status = envelopeRun("status --json", "C4", shared.status, product);
    statusDoc = status.doc;
    results.push(status.check);
  } else {
    results.push({ id: "status --json", rule: "C4", status: "fail", detail: "not run: `commands --json` lists no read `status` verb" });
  }
  for (const verb of ["tui", "doctor"] as const) {
    const run = shared[verb];
    const rule = verb === "tui" ? "C3" : "C4";
    if (!run) {
      const detail = verbs.has(verb) ? `not run: \`commands --json\` lists ${verb} with an op class other than read` : `\`commands --json\` lists no ${verb} verb; every product has ${verb}`;
      results.push({ id: `${verb} --json`, rule, status: "warn", detail });
      continue;
    }
    const differs = verb === "tui" && isRecord(statusDoc) && isRecord(parseJson(run.stdout))
      && checkTuiMatchesStatus(parseJson(run.stdout), statusDoc, "tui --json", "status --json").length > 0;
    results.push(envelopeRun(`${verb} --json`, rule, run, product, differs ? ["differs from status --json apart from generatedAt; load both from one function"] : []).check);
  }
  return results;
}

/** D6: output that is not a terminal carries no escape sequences. */
export function checkNonTty(runs: readonly CapturedRun[]): CheckResult {
  const offenders = runs.filter(run => ANY_ESCAPE.test(run.stdout) || ANY_ESCAPE.test(run.stderr));
  return result("non-TTY", "D6", offenders.map(run => `\`${run.args.join(" ") || "(bare)"}\` writes escape sequences to a pipe`), [], `${runs.length} runs, no escape sequences`);
}

/** D6: NO_COLOR=1 on a terminal removes color. Skipped without a pseudo-terminal. */
export function checkNoColor(runs: readonly CapturedRun[] | undefined): CheckResult {
  if (!runs) return { id: "NO_COLOR", rule: "D6", status: "skip", detail: "no pseudo-terminal (the script command) on this runner" };
  const offenders = runs.filter(run => COLOR.test(run.stdout) || COLOR.test(run.stderr));
  return result("NO_COLOR", "D6", offenders.map(run => `\`${run.args.join(" ") || "(bare)"}\` prints color with NO_COLOR=1 on a terminal`), [], `${runs.length} runs on a terminal, no color`);
}

/** D6: TERM=dumb replaces every contract symbol with its ASCII fallback. */
export function checkDumb(runs: readonly CapturedRun[]): CheckResult {
  const problems: string[] = [];
  for (const run of runs) {
    const text = plain(run.stdout + run.stderr);
    const found = CONTRACT_SYMBOLS.filter(symbol => text.includes(symbol));
    if (found.length) problems.push(`\`${run.args.join(" ") || "(bare)"}\` prints ${found.join(" ")}`);
  }
  return result("TERM=dumb", "D6", problems, [], "ASCII fallbacks only");
}

/** D8: `--help | head -1` exits quietly: no panic, trace, or EPIPE on stderr. */
export function checkPipe(run: CapturedRun): CheckResult {
  const problems: string[] = [];
  const quietExit = run.code === 0 || run.code === 141 || run.signal === "SIGPIPE";
  if (run.timedOut) problems.push("timed out");
  else if (!quietExit) problems.push(`${exit(run)}, want exit 0`);
  if (TRACE.test(run.stderr)) problems.push(`stderr shows ${quote(run.stderr.split("\n").find(line => TRACE.test(line)))}`);
  return result("| head -1", "D8", problems, [], run.signal ? `ended by ${run.signal}, no trace` : `${exit(run)}, no trace`);
}

/** The copy rules (budget, sentence case, jargon) over the captured help text. */
export function checkHelpCopy(texts: ReadonlyArray<{ readonly kind: CliHelpKind; readonly location: string; readonly text: string }>, config?: CopyConfig): { result: CheckResult; findings: CopyFinding[] } {
  const findings = texts.flatMap(item => lintCliHelp(item.text, { kind: item.kind, location: item.location, ...(config ? { config } : {}) }));
  // Budgets are already their own checks; keep the copy check to wording.
  const wording = findings.filter(finding => finding.rule !== "cli-budget");
  const errors = wording.filter(finding => finding.severity === "error");
  const warns = wording.filter(finding => finding.severity !== "error");
  const describe = (finding: CopyFinding): string => `${finding.rule} at ${finding.location}: ${finding.excerpt}`;
  const problems = errors.slice(0, 3).map(describe);
  if (errors.length > 3) problems.push(`${errors.length - 3} more`);
  const warnings = warns.slice(0, 2).map(describe);
  if (warns.length > 2) warnings.push(`${warns.length - 2} more`);
  return { result: result("help copy", "D3", problems, warnings, `${texts.length} help texts, sentence case, no jargon`), findings: wording };
}

/** Every check over one set of runs, in the order of the Wave A spot-check table. */
export function evaluate(runs: GoldenRuns, config?: CopyConfig): { results: CheckResult[]; findings: CopyFinding[] } {
  const results: CheckResult[] = [checkBare(runs.bare), checkHelp(runs.help)];
  for (const item of runs.commands) results.push(checkCommandHelp(item.command, item.flag, item.topic));
  results.push(...checkVersion(runs.name, runs.version, runs.versionJson));
  results.push(checkUnknown(runs.unknown, runs.unknownText));
  const listed = runs.shared ? sharedVerbs(runs.shared.commands) : undefined;
  const commandsDoc = listed?.adopted ? parseJson(runs.shared!.commands.stdout) : undefined;
  const context: SharedContext = {
    adopted: listed?.adopted ?? false,
    product: isRecord(commandsDoc) ? checkCommands(commandsDoc, "commands --json").product : undefined,
  };
  results.push(checkJsonError("--json error", runs.unknownJson, context));
  results.push(checkJsonError("agent error", runs.unknownAgent, context));
  results.push(checkNoColor(runs.ttyNoColor));
  const pipes = [runs.bare, runs.help, ...runs.commands.map(item => item.flag), runs.version, runs.unknownText];
  results.push(checkNonTty(pipes));
  results.push(checkDumb(runs.dumb));
  results.push(checkPipe(runs.pipe));
  const copy = checkHelpCopy([
    { kind: "bare", location: "bare", text: runs.bare.stdout },
    { kind: "help", location: "--help", text: runs.help.stdout },
    ...runs.commands.map(item => ({ kind: "command" as const, location: `${item.command} --help`, text: item.flag.stdout })),
  ], config);
  results.push(copy.result);
  if (runs.shared !== undefined) results.push(...checkShared(runs.shared));
  return { results, findings: copy.findings };
}
