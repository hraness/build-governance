/**
 * The CLI golden checks: the Hraness CLI style contract (CLI_MENU_STYLE.md in hraness/.github,
 * sections D2 to D8) turned into pass, warn, fail, or skip results over captured runs.
 * Pure: the runner captures the runs, these functions judge them.
 */
import { helpLines, lintCliHelp } from "../public-copy/cli-help.js";
import type { CliHelpKind } from "../public-copy/cli-help.js";
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

/** D5: with `--json` or an agent audience, the error is one JSON object on stdout with the same exit code. */
export function checkJsonError(id: string, run: CapturedRun): CheckResult {
  const problems: string[] = [];
  const warnings: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(run.stdout);
  } catch {
    parsed = undefined;
  }
  const doc = parsed as { ok?: unknown; error?: { code?: unknown; message?: unknown; next?: unknown } } | undefined;
  if (run.code !== 2) problems.push(`${exit(run)}, want exit 2`);
  if (!doc || typeof doc !== "object") {
    const where = plain(run.stdout).trim() ? "stdout is not one JSON document" : `nothing on stdout${run.stderr.trim() ? ` (stderr: ${quote(nonBlank(run.stderr)[0])})` : ""}`;
    problems.push(where);
  } else {
    if (doc.ok !== false) problems.push('missing "ok": false');
    if (typeof doc.error?.code !== "string" || typeof doc.error?.message !== "string") problems.push('missing "error": {"code", "message"}');
    else if (typeof doc.error.next !== "string") warnings.push('no "error.next" command');
  }
  return result(id, "D5", problems, warnings, `{"ok":false,…} on stdout, exit 2`);
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
  results.push(checkJsonError("--json error", runs.unknownJson));
  results.push(checkJsonError("agent error", runs.unknownAgent));
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
  return { results, findings: copy.findings };
}
