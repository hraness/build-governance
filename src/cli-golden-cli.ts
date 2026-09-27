#!/usr/bin/env bun
/**
 * hraness-cli-golden: run a built CLI the ways the Hraness CLI style contract names (bare, --help,
 * <cmd> --help, --version, an unknown command, --json and agent errors, NO_COLOR on a terminal,
 * TERM=dumb, pipes) and check the budgets and exit codes.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { evaluate } from "./cli-golden/checks.js";
import { goldenFiles, renderAnnotations, renderMarkdown, renderText, useAscii } from "./cli-golden/report.js";
import { defaultName, GoldenRunner, splitCommand } from "./cli-golden/runner.js";

const NAME = "hraness-cli-golden";

const USAGE = `Usage: ${NAME} --cli <command> [options]

Run a built CLI the ways the Hraness CLI style guide names and check its
line budgets, exit codes, errors, color and pipe behavior.

Options
  --cli <command>        The CLI to run, such as "./target/release/xcb" or "bun src/cli.ts"
  --name <name>          The name --version prints (default: from the command)
  --commands <list>      Comma-separated commands to check with --help, such as "status,chats add"
  --unknown <word>       A command that does not exist (default: stauts)
  --cwd <dir>            Where to run the CLI (default: current directory)
  --env <NAME=value>     Extra environment for every run; repeat as needed
  --proper-noun <name>   A name help text may capitalize; repeat as needed
  --write <dir>          Save the captured output as golden files in <dir>
  --advisory             Report problems but exit 0
  --annotations          Print GitHub Actions annotations
  --timeout <seconds>    Kill a run after this long (default: 30)
  --json                 Print machine-readable output
  -h, --help             Show this help
  -V, --version          Show the version

Example
  ${NAME} --cli "bun src/cli.ts" --name textbutler --commands "setup,status"
`;

interface Options {
  cli: string;
  command: string[];
  name?: string;
  commands: string[];
  unknown: string;
  cwd?: string;
  env: Record<string, string>;
  properNouns: string[];
  write?: string;
  advisory: boolean;
  annotations: boolean;
  timeout: number;
  json: boolean;
}

class UsageError extends Error {}

function parseArgs(argv: readonly string[]): Options | "help" | "version" {
  const options: Options = { cli: "", command: [], commands: [], unknown: "stauts", env: {}, properNouns: [], advisory: false, annotations: false, timeout: 30, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    const value = (): string => {
      const next = argv[index + 1];
      if (next === undefined) throw new UsageError(`${arg} needs a value.`);
      index += 1;
      return next;
    };
    if (arg === "-h" || arg === "--help") return "help";
    if (arg === "-V" || arg === "--version") return "version";
    if (arg === "--cli") options.cli = value();
    else if (arg === "--name") options.name = value();
    else if (arg === "--commands") options.commands = value().split(",").map(item => item.trim()).filter(Boolean);
    else if (arg === "--unknown") options.unknown = value();
    else if (arg === "--cwd") options.cwd = value();
    else if (arg === "--env") {
      const pair = value();
      const eq = pair.indexOf("=");
      if (eq < 1) throw new UsageError(`--env needs NAME=value, not "${pair}".`);
      options.env[pair.slice(0, eq)] = pair.slice(eq + 1);
    } else if (arg === "--proper-noun") options.properNouns.push(value());
    else if (arg === "--write") options.write = value();
    else if (arg === "--advisory") options.advisory = true;
    else if (arg === "--annotations") options.annotations = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--timeout") {
      options.timeout = Number(value());
      if (!Number.isFinite(options.timeout) || options.timeout <= 0) throw new UsageError("--timeout needs a number of seconds.");
    } else throw new UsageError(`Unknown option "${arg}".`);
  }
  if (!options.cli.trim()) throw new UsageError("Name the CLI to run with --cli.");
  try {
    options.command = splitCommand(options.cli);
  } catch (error) {
    throw new UsageError(`--cli: ${(error as Error).message}`);
  }
  return options;
}

function version(): string {
  const manifest = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8")) as { version: string };
  return manifest.version;
}

async function main(argv: readonly string[]): Promise<number> {
  const ascii = useAscii(process.env);
  const json = argv.includes("--json");
  let options: Options | "help" | "version";
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    if (json) console.log(JSON.stringify({ ok: false, error: { code: "usage", message: error.message, next: `${NAME} --help` } }));
    else console.error(`${ascii ? "FAIL" : "✗"} ${error.message}\n${ascii ? "->" : "→"} ${NAME} --help`);
    return 2;
  }
  if (options === "help") {
    console.log(USAGE.trimEnd());
    return 0;
  }
  if (options === "version") {
    console.log(json ? JSON.stringify({ name: NAME, version: version() }) : `${NAME} ${version()}`);
    return 0;
  }

  const name = options.name ?? defaultName(options.command);
  const runner = new GoldenRunner({ command: options.command, env: options.env, timeoutSeconds: options.timeout, ...(options.cwd ? { cwd: resolve(options.cwd) } : {}) });
  let runs;
  try {
    runs = await runner.collect({ name, commands: options.commands, unknown: options.unknown });
  } finally {
    runner.dispose();
  }
  // The product name, capitalized as prose writes it ("Demo is ready"), may appear mid-sentence.
  const config = { properNouns: [...options.properNouns, name.charAt(0).toUpperCase() + name.slice(1)] };
  const { results, findings } = evaluate(runs, config);
  const failed = results.some(item => item.status === "fail");

  if (options.write) {
    const dir = resolve(options.write);
    mkdirSync(dir, { recursive: true });
    for (const [file, text] of Object.entries(goldenFiles(runs))) writeFileSync(join(dir, file), text);
  }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, renderMarkdown(options.cli, results, options.advisory));
  if (options.annotations && !options.json) for (const line of renderAnnotations(results, options.advisory)) console.log(line);

  if (options.json) {
    console.log(JSON.stringify({ ok: !failed, advisory: options.advisory, cli: options.cli, name, results, findings }, null, 2));
  } else {
    process.stdout.write(renderText(results, ascii));
    if (failed && options.advisory) console.error("Advisory run: these problems do not fail the check. Drop --advisory to enforce them.");
    else if (failed) console.error(`Next: fix the failed checks, then run ${NAME} again.`);
  }
  return failed && !options.advisory ? 1 : 0;
}

process.exitCode = await main(process.argv.slice(2));
