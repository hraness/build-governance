#!/usr/bin/env bun
/**
 * hraness-copy-lint: run the public-copy checks a repository's public-copy.config.json names,
 * then compare error counts with .public-copy-baseline.json.
 */
import { resolve } from "node:path";
import { compareBaseline, countFindings, lowerBaseline } from "./public-copy/baseline.js";
import { DEFAULT_CONFIG_FILE } from "./public-copy/config.js";
import { baselinePath, loadCopyConfig, readBaseline, runPublicCopy, writeBaseline } from "./public-copy/files.js";
import { PUBLIC_COPY_RULES_VERSION } from "./public-copy/rules.js";
import type { CopyFinding } from "./public-copy/types.js";

const USAGE = `Usage: hraness-copy-lint [options]

Checks public copy against the rules in STYLE.md and fails when an error count rises above the baseline.

Options:
  --root <dir>         Repository root (default: current directory)
  --config <file>      Config file, relative to the root (default: ${DEFAULT_CONFIG_FILE})
  --update-baseline    Write the baseline. The first run records current counts; later runs only lower them.
  --json               Print findings and the comparison as JSON
  --quiet              Print only errors and the summary
  -h, --help           Show this help
`;

interface Options {
  root: string;
  config: string;
  updateBaseline: boolean;
  json: boolean;
  quiet: boolean;
}

function parseArgs(argv: readonly string[]): Options | "help" {
  const options: Options = { root: ".", config: DEFAULT_CONFIG_FILE, updateBaseline: false, json: false, quiet: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = (): string => {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) throw new Error(`${arg} needs a value.`);
      index += 1;
      return next;
    };
    if (arg === "-h" || arg === "--help") return "help";
    else if (arg === "--root") options.root = value();
    else if (arg === "--config") options.config = value();
    else if (arg === "--update-baseline") options.updateBaseline = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--quiet") options.quiet = true;
    else throw new Error(`Unknown option ${arg}.`);
  }
  return options;
}

function line(finding: CopyFinding): string {
  return `${finding.severity === "error" ? "error" : "warn "}  ${finding.rule.padEnd(9)} ${finding.location}\n        ${finding.excerpt}\n        ${finding.hint}`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function main(argv: readonly string[]): number {
  let options: Options | "help";
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`${(error as Error).message}\n\n${USAGE}`);
    return 2;
  }
  if (options === "help") {
    console.log(USAGE);
    return 0;
  }
  const root = resolve(options.root);
  let result;
  let config;
  let baseline;
  try {
    config = loadCopyConfig(root, options.config);
    result = runPublicCopy(root, config);
    baseline = readBaseline(root, config);
  } catch (error) {
    console.error(`hraness-copy-lint: ${(error as Error).message}`);
    return 2;
  }
  const current = countFindings(result.findings);
  const errors = result.findings.filter(f => f.severity === "error").length;
  const warnings = result.findings.length - errors;

  let recorded = baseline;
  if (options.updateBaseline) {
    recorded = baseline === undefined ? current : lowerBaseline(baseline, current);
    writeBaseline(root, config, recorded);
  }
  const comparison = compareBaseline(current, recorded ?? {});

  if (options.json) {
    console.log(JSON.stringify({ version: PUBLIC_COPY_RULES_VERSION, files: result.files, findings: result.findings, baseline: recorded ?? null, comparison }, null, 2));
    return comparison.regressions.length ? 1 : 0;
  }

  for (const finding of result.findings) {
    if (options.quiet && finding.severity !== "error") continue;
    console.log(line(finding));
  }
  console.log(`\n${PUBLIC_COPY_RULES_VERSION}: ${plural(result.files.length, "file")} checked, ${plural(errors, "error")}, ${plural(warnings, "warning")}.`);
  if (options.updateBaseline) console.log(`Wrote ${baselinePath(root, config)}.`);
  if (recorded === undefined && comparison.regressions.length) {
    console.log("No baseline yet. Fix the errors, or run with --update-baseline to record them and fail only on new ones.");
  }
  if (recorded !== undefined) {
    for (const change of comparison.regressions) {
      console.log(`Rose: ${change.file} ${change.rule} ${change.baseline} → ${change.current}`);
    }
    if (comparison.improvements.length && !options.updateBaseline) {
      console.log(`${plural(comparison.improvements.length, "count")} fell below the baseline. Run with --update-baseline to record the lower counts.`);
    }
  }
  return comparison.regressions.length ? 1 : 0;
}

process.exit(main(process.argv.slice(2)));
