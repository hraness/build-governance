import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkDumb, checkJsonError, checkPipe, checkShared, checkUnknown, checkVersion, sharedVerbs } from "./checks.ts";
import type { CapturedRun, CheckResult } from "./checks.ts";
import { countLine, renderAnnotations, renderMarkdown } from "./report.ts";
import { defaultName, GoldenRunner, shellQuote, splitCommand } from "./runner.ts";

const repoRoot = join(import.meta.dir, "..", "..");
const cli = join(repoRoot, "src", "cli-golden-cli.ts");
const good = `${process.execPath} ${join(import.meta.dir, "fixtures", "good-cli.ts")}`;
const bad = `${process.execPath} ${join(import.meta.dir, "fixtures", "bad-cli.ts")}`;
const scratch = mkdtempSync(join(tmpdir(), "cli-golden-test-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const run = (partial: Partial<CapturedRun>): CapturedRun => ({ args: [], code: 0, stdout: "", stderr: "", ...partial });

function harness(...args: string[]): { code: number; stdout: string; stderr: string } {
  const env: Record<string, string | undefined> = { ...process.env, LANG: "en_US.UTF-8" };
  delete env.GITHUB_STEP_SUMMARY;
  const result = Bun.spawnSync([process.execPath, cli, ...args], { stdout: "pipe", stderr: "pipe", env });
  return { code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

describe("command parsing", () => {
  test("splitCommand handles quotes and escapes", () => {
    expect(splitCommand(`bun "src/my cli.ts" --flag 'a b' c\\ d`)).toEqual(["bun", "src/my cli.ts", "--flag", "a b", "c d"]);
    expect(() => splitCommand(`bun "src`)).toThrow("Unclosed");
  });

  test("defaultName skips runtimes and extensions", () => {
    expect(defaultName(["./target/release/xcb"])).toBe("xcb");
    expect(defaultName(["bun", "src/textbutler.ts"])).toBe("textbutler");
    expect(defaultName(["node", "--no-warnings", "dist/cli.js"])).toBe("cli");
  });

  test("shellQuote leaves plain words alone and quotes the rest", () => {
    expect(shellQuote("--help")).toBe("--help");
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
  });
});

describe("checks", () => {
  test("unknown command: exit 2, the named input, a next line, and no usage dump", () => {
    const ok = checkUnknown("stauts", run({ code: 2, stderr: `✗ Unknown command "stauts". Did you mean "status"?\n→ demo --help\n` }));
    expect(ok.status).toBe("pass");
    expect(checkUnknown("stauts", run({ code: 2, stderr: `FAIL Unknown command "stauts".\n-> demo --help\n` })).status).toBe("pass");
    expect(checkUnknown("stauts", run({ code: 2, stderr: `✗ Unknown command.\n→ demo --help\n` })).detail).toContain(`does not name "stauts"`);
    const dump = checkUnknown("stauts", run({ code: 2, stderr: `✗ Unknown command "stauts".\n→ demo --help\n\nUsage: demo <command>\n` }));
    expect(dump.detail).toContain("usage dump");
    expect(checkUnknown("stauts", run({ code: 2, stderr: `✗ Unknown command "stauts".\n→ demo --help\nSee the docs.\n` })).status).toBe("warn");
  });

  test("JSON errors: one document on stdout with ok false and a code", () => {
    expect(checkJsonError("--json error", run({ code: 2, stdout: `{"ok":false,"error":{"code":"usage","message":"m","next":"demo --help"}}\n` })).status).toBe("pass");
    expect(checkJsonError("--json error", run({ code: 2, stdout: `{"ok":false,"error":{"code":"usage","message":"m"}}\n` })).status).toBe("warn");
    expect(checkJsonError("agent error", run({ code: 2, stderr: `{"ok":false}` })).detail).toContain("nothing on stdout");
    expect(checkJsonError("agent error", run({ code: 2, stdout: "✗ nope\n" })).detail).toContain("not one JSON document");
  });

  test("version: name and semver, and the JSON form", () => {
    const [text, json] = checkVersion("demo", run({ stdout: "demo 1.2.3-beta.1\n" }), run({ stdout: `{"name":"demo","version":"1.2.3"}` }));
    expect([text!.status, json!.status]).toEqual(["pass", "pass"]);
    const [bare] = checkVersion("demo", run({ stdout: "1.2.3\n" }), run({ stdout: "" }));
    expect(bare!.detail).toContain(`want "demo X.Y.Z"`);
  });

  test("TERM=dumb: any contract symbol fails", () => {
    expect(checkDumb([run({ args: ["--help"], stdout: "OK ready\n-> next\n" })]).status).toBe("pass");
    expect(checkDumb([run({ args: ["x"], stderr: "✗ Unknown\n" })]).detail).toBe("`x` prints ✗");
  });

  test("pipes: SIGPIPE and exit 0 are quiet; traces and EPIPE are not", () => {
    expect(checkPipe(run({ code: null, signal: "SIGPIPE" })).status).toBe("pass");
    expect(checkPipe(run({ code: 0 })).status).toBe("pass");
    expect(checkPipe(run({ code: 101, stderr: "thread 'main' panicked at src/main.rs:3:5:\nfailed printing to stdout: Broken pipe (os error 32)\n" })).status).toBe("fail");
    expect(checkPipe(run({ code: 0, stderr: "Error: write EPIPE\n    at afterWriteDispatched (node:internal/stream_base_commons:161:15)\n" })).status).toBe("fail");
  });
});

const AT = "2026-09-28T00:00:00.000Z";
const envelope = (doc: Record<string, unknown>) => `${JSON.stringify({ generatedAt: AT, ...doc })}\n`;
const sharedError = (next: unknown, extra: Record<string, unknown> = {}) =>
  envelope({ ok: false, schema: "hraness.error/1", error: { code: "usage", message: "Unknown command.", next, ...extra } });
const verbs = (...paths: string[][]) => paths.map(path => ({ path, opClass: "read", schema: "demo.status/1", summary: "One-screen health" }));
const commandsRun = (paths: string[][] = [["status"], ["tui"], ["doctor"]]) =>
  run({ args: ["commands", "--json"], stdout: envelope({ ok: true, schema: "hraness.commands/1", data: { product: "demo", verbs: verbs(...paths) } }) });
const statusRun = (data: unknown = { pending: 0 }, generatedAt = AT) =>
  run({ args: ["status", "--json"], stdout: `${JSON.stringify({ ok: true, schema: "demo.status/1", generatedAt, data })}\n` });
const byId = (results: CheckResult[], id: string) => results.find(item => item.id === id)!;

describe("--json error shapes", () => {
  const next = [{ command: "demo --help", why: "See every command", audience: "agent" }];

  test("the shared envelope with a structured next passes", () => {
    const checked = checkJsonError("--json error", run({ code: 2, stdout: sharedError(next) }));
    expect(checked.status).toBe("pass");
    expect(checked.detail).toContain("shared envelope");
  });

  test("the older shape with a string next still passes", () => {
    expect(checkJsonError("--json error", run({ code: 2, stdout: `{"ok":false,"error":{"code":"usage","message":"m","next":"demo --help"}}\n` })).detail).toContain("older error shape");
  });

  test("a structured next without the envelope fields passes too", () => {
    expect(checkJsonError("--json error", run({ code: 2, stdout: `${JSON.stringify({ ok: false, error: { code: "usage", message: "m", next } })}\n` })).status).toBe("pass");
  });

  test("a missing or empty next warns in either shape", () => {
    expect(checkJsonError("--json error", run({ code: 2, stdout: sharedError([]) })).status).toBe("warn");
    const missing = envelope({ ok: false, schema: "hraness.error/1", error: { code: "usage", message: "m" } });
    expect(checkJsonError("--json error", run({ code: 2, stdout: missing })).status).toBe("warn");
    expect(checkJsonError("--json error", run({ code: 2, stdout: `{"ok":false,"error":{"code":"usage","message":"m","next":""}}` })).status).toBe("warn");
  });

  test("a malformed structured next fails", () => {
    const bad = checkJsonError("--json error", run({ code: 2, stdout: sharedError([{ command: "demo --help", audience: "robot" }]) }));
    expect(bad.status).toBe("fail");
    expect(bad.detail).toContain("audience");
    expect(checkJsonError("--json error", run({ code: 2, stdout: `${JSON.stringify({ ok: false, error: { code: "usage", message: "m", next: ["demo --help"] } })}` })).status).toBe("fail");
  });

  test("the shared envelope is held to the contract", () => {
    expect(checkJsonError("--json error", run({ code: 2, stdout: sharedError("demo --help") })).detail).toContain("error.next must be an array");
    const late = `${JSON.stringify({ ok: false, schema: "hraness.error/1", generatedAt: "yesterday", error: { code: "usage", message: "m", next } })}`;
    expect(checkJsonError("--json error", run({ code: 2, stdout: late })).detail).toContain("generatedAt");
    const okTrue = envelope({ ok: true, schema: "hraness.error/1", error: { code: "usage", message: "m", next } });
    expect(checkJsonError("--json error", run({ code: 2, stdout: okTrue })).status).toBe("fail");
    expect(checkJsonError("--json error", run({ code: 1, stdout: sharedError(next) })).detail).toContain("want exit 2");
  });

  test("a shared code other than usage warns", () => {
    const notFound = envelope({ ok: false, schema: "hraness.error/1", error: { code: "not-found", message: "m", next } });
    expect(checkJsonError("--json error", run({ code: 2, stdout: notFound })).status).toBe("warn");
  });
});

describe("shared commands", () => {
  test("they skip when commands --json gives no commands envelope", () => {
    const [skipped] = checkShared({ commands: run({ args: ["commands", "--json"], code: 2, stdout: `{"ok":false,"error":{"code":"usage","message":"m"}}` }) });
    expect(skipped!.status).toBe("skip");
    expect(checkShared(undefined)[0]!.status).toBe("skip");
    expect(sharedVerbs(run({ stdout: "not json" }))).toBeUndefined();
  });

  test("every shared command passes when it follows the contract", () => {
    const later = "2026-09-28T00:00:01.000Z";
    const results = checkShared({ commands: commandsRun(), status: statusRun(), tui: statusRun({ pending: 0 }, later), doctor: statusRun() });
    expect(results.map(item => `${item.id}:${item.status}`)).toEqual(["commands --json:pass", "status --json:pass", "tui --json:pass", "doctor --json:pass"]);
  });

  test("a missing tui or doctor verb warns and a missing status run fails", () => {
    const results = checkShared({ commands: commandsRun([["status"]]) });
    expect(byId(results, "status --json").status).toBe("fail");
    expect(byId(results, "tui --json").status).toBe("warn");
    expect(byId(results, "doctor --json").detail).toContain("no doctor verb");
  });

  test("a menu bar verb fails commands --json", () => {
    const results = checkShared({ commands: commandsRun([["status"], ["menubar"]]), status: statusRun() });
    expect(byId(results, "commands --json").status).toBe("fail");
  });

  test("an error envelope must exit with its code's status", () => {
    const unavailable = envelope({ ok: false, schema: "hraness.error/1", error: { code: "owner-unavailable", message: "m" } });
    expect(byId(checkShared({ commands: commandsRun([["status"]]), status: run({ code: 4, stdout: unavailable }) }), "status --json").status).toBe("pass");
    expect(byId(checkShared({ commands: commandsRun([["status"]]), status: run({ code: 1, stdout: unavailable }) }), "status --json").detail).toContain("want exit 4");
    const product = envelope({ ok: false, schema: "hraness.error/1", error: { code: "demo.locked", message: "m" } });
    expect(byId(checkShared({ commands: commandsRun([["status"]]), status: run({ code: 1, stdout: product }) }), "status --json").status).toBe("pass");
    expect(byId(checkShared({ commands: commandsRun([["status"]]), status: run({ code: 1, stdout: statusRun().stdout }) }), "status --json").detail).toContain("want exit 0");
  });

  test("tui --json must match status --json apart from generatedAt", () => {
    const results = checkShared({ commands: commandsRun(), status: statusRun(), tui: statusRun({ pending: 1 }), doctor: statusRun() });
    expect(byId(results, "tui --json").status).toBe("warn");
  });

  test("a status run that is not an envelope fails", () => {
    expect(byId(checkShared({ commands: commandsRun([["status"]]), status: run({ stdout: "Demo is running\n" }) }), "status --json").detail).toContain("not one JSON document");
    const wrong = `${JSON.stringify({ ok: true, schema: "demo.status/1", generatedAt: AT })}`;
    expect(byId(checkShared({ commands: commandsRun([["status"]]), status: run({ stdout: wrong }) }), "status --json").status).toBe("fail");
  });
});

describe("GoldenRunner", () => {
  test("a timeout ends the run even when a grandchild keeps the pipes open", async () => {
    const runner = new GoldenRunner({ command: ["sh", "-c", "sleep 20 & wait"], timeoutSeconds: 1 });
    const started = Date.now();
    try {
      const captured = await runner.run({ args: [] });
      expect(captured.timedOut).toBe(true);
    } finally {
      runner.dispose();
    }
    expect(Date.now() - started).toBeLessThan(5000);
  }, 10_000);

  test("a CLI that exits while a background child holds stdout still finishes", async () => {
    const runner = new GoldenRunner({ command: ["sh", "-c", "echo done; sleep 20 &"], timeoutSeconds: 15 });
    const started = Date.now();
    try {
      const captured = await runner.run({ args: [] });
      expect(captured.code).toBe(0);
      expect(captured.stdout).toBe("done\n");
    } finally {
      runner.dispose();
    }
    expect(Date.now() - started).toBeLessThan(6000);
  }, 10_000);
});

describe("reports", () => {
  const results: CheckResult[] = [
    { id: "bare", rule: "D2", status: "pass", detail: "8 lines" },
    { id: "help:chats add", rule: "D3", status: "fail", detail: "exit 2 | want 0" },
    { id: "NO_COLOR", rule: "D6", status: "skip", detail: "no pseudo-terminal" },
    { id: "help copy", rule: "D3", status: "warn", detail: "cli-jargon" },
  ];

  test("count line", () => {
    expect(countLine(results)).toBe("1 failed, 1 warning, 1 passed, 1 skipped.");
  });

  test("Markdown escapes table pipes and says when it is advisory", () => {
    const markdown = renderMarkdown("bun src/cli.ts", results, true);
    expect(markdown).toContain("| ✗ | help:chats add | D3 | exit 2 \\| want 0 |");
    expect(markdown).toContain("Advisory: findings do not fail the job.");
  });

  test("annotations: errors unless advisory, and titles escape colons", () => {
    expect(renderAnnotations(results, false)).toEqual([
      "::error title=CLI golden help%3Achats add (D3)::exit 2 | want 0",
      "::warning title=CLI golden help copy (D3)::cli-jargon",
    ]);
    expect(renderAnnotations(results, true)[0]).toStartWith("::warning ");
  });
});

describe("hraness-cli-golden", () => {
  test("a CLI that follows the contract passes every check", () => {
    const out = harness("--cli", good, "--name", "demo", "--commands", "setup,status", "--json");
    expect(out.code).toBe(0);
    const report = JSON.parse(out.stdout) as { ok: boolean; results: CheckResult[] };
    expect(report.ok).toBe(true);
    const statuses = report.results.map(item => `${item.id}:${item.status}`);
    expect(statuses.filter(item => !item.endsWith(":pass") && item !== "NO_COLOR:skip" && item !== "shared commands:skip")).toEqual([]);
    expect(report.results.map(item => item.id)).toEqual([
      "bare", "help", "help:setup", "help:status", "version", "version --json", "unknown command",
      "--json error", "agent error", "NO_COLOR", "non-TTY", "TERM=dumb", "| head -1", "help copy", "shared commands",
    ]);
  }, 30_000);

  test("a CLI on the shared envelope and commands passes, with next as a list", () => {
    const out = harness("--cli", good, "--name", "demo", "--commands", "setup,status", "--env", "DEMO_CONTROL=1", "--json");
    expect(out.code).toBe(0);
    const report = JSON.parse(out.stdout) as { ok: boolean; results: CheckResult[] };
    const statuses = report.results.map(item => `${item.id}:${item.status}`);
    expect(statuses.filter(item => !item.endsWith(":pass") && item !== "NO_COLOR:skip")).toEqual([]);
    expect(report.results.slice(-4).map(item => item.id)).toEqual(["commands --json", "status --json", "tui --json", "doctor --json"]);
    expect(byId(report.results, "--json error").detail).toContain("shared envelope");
  }, 30_000);

  test("a CLI that breaks the shared envelope and commands fails them", () => {
    const out = harness("--cli", good, "--name", "demo", "--commands", "setup,status", "--env", "DEMO_CONTROL=broken", "--json");
    expect(out.code).toBe(1);
    const report = JSON.parse(out.stdout) as { ok: boolean; results: CheckResult[] };
    const statuses = Object.fromEntries(report.results.map(item => [item.id, item.status]));
    expect(statuses).toMatchObject({
      "--json error": "fail", "agent error": "fail", "commands --json": "fail", "status --json": "fail", "tui --json": "warn", "doctor --json": "warn",
    });
  }, 30_000);

  test("a CLI that breaks the contract fails, unless the run is advisory", () => {
    const strict = harness("--cli", bad, "--name", "bad", "--commands", "status");
    expect(strict.code).toBe(1);
    for (const id of ["bare", "help", "help:status", "version", "unknown command", "--json error", "agent error", "non-TTY", "TERM=dumb", "| head -1", "help copy"]) {
      expect(strict.stdout).toMatch(new RegExp(`✗ ${id.replace(/[|]/g, "\\|")}\\s`));
    }
    expect(strict.stderr).toContain("Next: fix the failed checks");
    const advisory = harness("--cli", bad, "--name", "bad", "--advisory", "--annotations");
    expect(advisory.code).toBe(0);
    expect(advisory.stdout).toContain("::warning title=CLI golden bare (D2)::");
  }, 30_000);

  test("--write saves the captured output", () => {
    const dir = join(scratch, "goldens");
    expect(harness("--cli", good, "--name", "demo", "--commands", "chats add,status", "--write", dir, "--advisory").code).toBe(0);
    for (const file of ["bare.txt", "help.txt", "version.txt", "unknown.stderr.txt", "unknown.json", "unknown.agent.json", "chats-add.help.txt", "status.help.txt"]) {
      expect(existsSync(join(dir, file))).toBe(true);
    }
    expect(readFileSync(join(dir, "version.txt"), "utf8")).toBe("demo 1.2.3\n");
    expect(existsSync(join(dir, "commands.json"))).toBe(false);
    const shared = join(scratch, "goldens-shared");
    expect(harness("--cli", good, "--name", "demo", "--commands", "status", "--env", "DEMO_CONTROL=1", "--write", shared).code).toBe(0);
    for (const file of ["commands.json", "status.json", "tui.json", "doctor.json"]) expect(existsSync(join(shared, file))).toBe(true);
    expect(JSON.parse(readFileSync(join(shared, "commands.json"), "utf8")).schema).toBe("hraness.commands/1");
  }, 30_000);

  test("its own CLI follows the contract: help, version, and usage errors", () => {
    const help = harness("--help");
    expect(help.code).toBe(0);
    expect(help.stdout).toStartWith("Usage: hraness-cli-golden --cli <command>");
    const version = harness("--version");
    expect(version.stdout).toMatch(/^hraness-cli-golden \d+\.\d+\.\d+\n$/);
    const missing = harness();
    expect(missing.code).toBe(2);
    expect(missing.stderr).toBe("✗ Name the CLI to run with --cli.\n→ hraness-cli-golden --help\n");
    const quote = harness("--cli", `bun "src`);
    expect(quote.code).toBe(2);
    expect(quote.stderr).toBe("✗ --cli: Unclosed \" in the command.\n→ hraness-cli-golden --help\n");
    const json = harness("--bogus", "--json");
    expect(json.code).toBe(2);
    expect(JSON.parse(json.stdout)).toEqual({ ok: false, error: { code: "usage", message: `Unknown option "--bogus".`, next: "hraness-cli-golden --help" } });
  });
});
