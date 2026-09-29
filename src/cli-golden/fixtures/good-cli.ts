#!/usr/bin/env bun
// A CLI that follows the Hraness CLI style contract. The golden checks must pass it.
// DEMO_CONTROL=1 adds the shared commands and prints errors in the shared envelope, as desktop-foundation 1.0
// products do. DEMO_CONTROL=broken adds them with envelopes that break the contract.
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

const control = env.DEMO_CONTROL;
const AT = "2026-09-28T00:00:00.000Z";
const print = (doc: unknown, code = 0): never => { console.log(JSON.stringify(doc)); process.exit(code); };
const verb = (path: string[], schema: string, summary: string) => ({ path, opClass: "read", schema, summary });

const rest = args.filter(arg => arg !== "--json");
if (control && json && ["commands", "status", "tui", "doctor"].includes(rest[0]!) && rest.length === 1) {
  const broken = control === "broken";
  const health = { owner: "stopped", pending: 0 };
  if (rest[0] === "commands") {
    const verbs = [verb(["status"], "demo.status/1", "One-screen health"), verb(["tui"], "demo.status/1", "Watch Demo in this terminal")];
    if (broken) verbs.push({ path: ["menubar"], opClass: "read", schema: "demo.menu/1", summary: "Open the menu bar" });
    else verbs.push(verb(["doctor"], "demo.doctor/1", "Check this machine"));
    print({ ok: true, schema: "hraness.commands/1", generatedAt: AT, data: { product: "demo", verbs } });
  }
  if (rest[0] === "status") {
    if (broken) print({ ok: false, schema: "hraness.error/1", generatedAt: AT, error: { code: "owner-unavailable", message: "Demo isn't running." } }, 1);
    print({ ok: true, schema: "demo.status/1", generatedAt: new Date().toISOString(), data: health, next: [{ command: "demo setup", why: "Choose where your list lives", audience: "human" }] });
  }
  if (rest[0] === "tui") {
    if (broken) print({ ok: true, schema: "demo.status/1", generatedAt: AT, data: { ...health, pending: 1 } });
    print({ ok: true, schema: "demo.status/1", generatedAt: new Date().toISOString(), data: health, next: [{ command: "demo setup", why: "Choose where your list lives", audience: "human" }] });
  }
  print({ ok: true, schema: "demo.doctor/1", generatedAt: AT, data: { checks: [] } });
}
if (!rest.length) { console.log(START); process.exit(0); }
if (rest[0] === "--help" || rest[0] === "-h") { console.log(HELP); process.exit(0); }
if (rest[0] === "--version" || rest[0] === "-V") { console.log(json ? JSON.stringify({ name: "demo", version: "1.2.3" }) : "demo 1.2.3"); process.exit(0); }
if (rest[0] === "help" && rest[1] && COMMANDS[rest[1]]) { console.log(COMMANDS[rest[1]]); process.exit(0); }
if (COMMANDS[rest[0]!] && rest.includes("--help")) { console.log(COMMANDS[rest[0]!]); process.exit(0); }
if (COMMANDS[rest[0]!]) { console.log(`${sym("✓", "OK", "32", process.stdout)} Demo is ready.`); process.exit(0); }
const input = rest[0]!;
const guess = Object.keys(COMMANDS).find(name => name[0] === input[0]);
const message = `Unknown command "${input}".${guess ? ` Did you mean "${guess}"?` : ""}`;
if ((json || agent) && control === "broken") console.log(JSON.stringify({ ok: false, schema: "hraness.error/1", generatedAt: "yesterday", error: { code: "usage", message, next: "demo --help" } }));
else if ((json || agent) && control) console.log(JSON.stringify({ ok: false, schema: "hraness.error/1", generatedAt: new Date().toISOString(), error: { code: "usage", message, next: [{ command: "demo --help", why: "See every command", audience: "agent" }] } }));
else if (json || agent) console.log(JSON.stringify({ ok: false, error: { code: "usage", message, next: "demo --help" } }));
else console.error(`${sym("✗", "FAIL", "31", process.stderr)} ${message}\n${sym("→", "->", "2", process.stderr)} demo --help`);
process.exit(2);
