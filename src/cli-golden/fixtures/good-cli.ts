#!/usr/bin/env bun
// A CLI that follows the Hraness CLI style contract. The golden checks must pass it.
const args = process.argv.slice(2);
const env = process.env;
const json = args.includes("--json");
const agent = ["AI_AGENT", "CLAUDECODE", "CODEX_SANDBOX", "CURSOR_AGENT", "GEMINI_CLI"].some(name => env[name]);
const ascii = env.TERM === "dumb" || ![env.LC_ALL, env.LC_CTYPE, env.LANG].some(v => /utf-?8/i.test(v ?? ""));
const color = (stream: { isTTY?: boolean }) => !env.NO_COLOR && env.TERM !== "dumb" && stream.isTTY === true;
const sym = (glyph: string, fallback: string, sgr: string, stream: { isTTY?: boolean }) => {
  const text = ascii ? fallback : glyph;
  return color(stream) ? `\u001b[${sgr}m${text}\u001b[0m` : text;
};
process.stdout.on("error", () => process.exit(0));

const START = `Demo keeps a list of things for you.

Start here
  demo setup           Choose where your list lives
  demo status          See what Demo is doing

All commands: demo --help · Topics: demo help <topic>
demo 1.2.3`;
const HELP = `Usage: demo <command> [options]

Start here
  setup           Choose where your list lives
  status          See what Demo is doing

Options
  -h, --help      Show help
  -V, --version   Show the version
  --json          Print machine-readable output`;
const COMMANDS: Record<string, string> = {
  setup: "Usage: demo setup [options]\n\nChoose where your list lives.\n\nOptions\n  --json   Print machine-readable output",
  status: "Usage: demo status [options]\n\nSee what Demo is doing.\n\nOptions\n  --json   Print machine-readable output",
};

const rest = args.filter(arg => arg !== "--json");
if (!rest.length) { console.log(START); process.exit(0); }
if (rest[0] === "--help" || rest[0] === "-h") { console.log(HELP); process.exit(0); }
if (rest[0] === "--version" || rest[0] === "-V") { console.log(json ? JSON.stringify({ name: "demo", version: "1.2.3" }) : "demo 1.2.3"); process.exit(0); }
if (rest[0] === "help" && rest[1] && COMMANDS[rest[1]]) { console.log(COMMANDS[rest[1]]); process.exit(0); }
if (COMMANDS[rest[0]!] && rest.includes("--help")) { console.log(COMMANDS[rest[0]!]); process.exit(0); }
if (COMMANDS[rest[0]!]) { console.log(`${sym("✓", "OK", "32", process.stdout)} Demo is ready.`); process.exit(0); }
const input = rest[0]!;
const guess = Object.keys(COMMANDS).find(name => name[0] === input[0]);
const message = `Unknown command "${input}".${guess ? ` Did you mean "${guess}"?` : ""}`;
if (json || agent) console.log(JSON.stringify({ ok: false, error: { code: "usage", message, next: "demo --help" } }));
else console.error(`${sym("✗", "FAIL", "31", process.stderr)} ${message}\n${sym("→", "->", "2", process.stderr)} demo --help`);
process.exit(2);
