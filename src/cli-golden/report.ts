/** Text, Markdown, and annotation forms of the golden check results. */
import type { CheckResult, CheckStatus, GoldenRuns } from "./checks.js";

const SYMBOLS: Record<CheckStatus, { glyph: string; ascii: string }> = {
  pass: { glyph: "✓", ascii: "OK" },
  warn: { glyph: "⚠", ascii: "WARN" },
  fail: { glyph: "✗", ascii: "FAIL" },
  skip: { glyph: "–", ascii: "-" },
};

/** ASCII fallbacks for TERM=dumb, a locale without UTF-8, or HRANESS_ASCII=1, as the style contract asks. */
export function useAscii(env: NodeJS.ProcessEnv): boolean {
  const utf8 = [env.LC_ALL, env.LC_CTYPE, env.LANG].some(value => /utf-?8/i.test(value ?? ""));
  return env.TERM === "dumb" || !utf8 || env.HRANESS_ASCII === "1";
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function countLine(results: readonly CheckResult[]): string {
  const count = (status: CheckStatus): number => results.filter(item => item.status === status).length;
  const parts = [
    count("fail") ? `${count("fail")} failed` : "",
    count("warn") ? plural(count("warn"), "warning") : "",
    `${count("pass")} passed`,
    count("skip") ? `${count("skip")} skipped` : "",
  ].filter(Boolean);
  return `${parts.join(", ")}.`;
}

/** One line per check, then the count line. */
export function renderText(results: readonly CheckResult[], ascii: boolean): string {
  const width = Math.max(...results.map(item => item.id.length));
  const lines = results.map(item => `${ascii ? SYMBOLS[item.status].ascii.padEnd(4) : SYMBOLS[item.status].glyph} ${item.id.padEnd(width)}  ${item.rule}  ${item.detail}`);
  return `${lines.join("\n")}\n\n${countLine(results)}\n`;
}

function cell(text: string): string {
  return text.replaceAll("|", "\\|").replaceAll("\n", " ");
}

/** A Markdown table for the GitHub job summary. */
export function renderMarkdown(cli: string, results: readonly CheckResult[], advisory: boolean): string {
  const rows = results.map(item => `| ${SYMBOLS[item.status].glyph} | ${cell(item.id)} | ${item.rule} | ${cell(item.detail)} |`);
  return [
    `### CLI golden checks: \`${cli}\``,
    "",
    `${countLine(results)}${advisory ? " Advisory: findings do not fail the job." : ""}`,
    "",
    "| | Check | Rule | Result |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
    "Rules are the sections of the CLI and menu bar style guide (CLI_MENU_STYLE.md in hraness/.github).",
    "",
  ].join("\n");
}

function escapeData(value: string): string {
  return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

/** GitHub Actions annotations: warnings under advisory, errors otherwise. */
export function renderAnnotations(results: readonly CheckResult[], advisory: boolean): string[] {
  return results
    .filter(item => item.status === "fail" || item.status === "warn")
    .map(item => `::${item.status === "fail" && !advisory ? "error" : "warning"} title=CLI golden ${escapeData(item.id).replaceAll(":", "%3A").replaceAll(",", "%2C")} (${item.rule})::${escapeData(item.detail)}`);
}

/** The files `--write` saves, so a pull request shows how the output changed. */
export function goldenFiles(runs: GoldenRuns): Record<string, string> {
  const slug = (command: string): string => command.trim().replace(/[^\w.-]+/g, "-");
  const files: Record<string, string> = {
    "bare.txt": runs.bare.stdout,
    "help.txt": runs.help.stdout,
    "version.txt": runs.version.stdout,
    "unknown.stderr.txt": runs.unknownText.stderr,
    "unknown.json": runs.unknownJson.stdout,
    "unknown.agent.json": runs.unknownAgent.stdout,
  };
  for (const item of runs.commands) files[`${slug(item.command)}.help.txt`] = item.flag.stdout;
  return files;
}
