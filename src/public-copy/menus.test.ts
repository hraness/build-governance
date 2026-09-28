import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { annotation } from "./annotations.ts";
import { runPublicCopy } from "./files.ts";
import { findCompanionCli, lintMenuFixtures, menuFindings } from "./menus.ts";

const repoRoot = join(import.meta.dir, "..", "..");
const cli = join(repoRoot, "src", "public-copy-cli.ts");
const scratch = realpathSync(mkdtempSync(join(tmpdir(), "public-copy-menus-")));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function write(root: string, files: Record<string, string>): string {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

/**
 * A stand-in for desktop-foundation's `companion lint-menu --strict --json`: fixtures whose name
 * starts with "bad" get one sentence-case error, "broken" ones are invalid, and the arguments are echoed
 * in a sidecar file so tests can see what was passed.
 */
const FAKE_CLI = `
import { writeFileSync } from "node:fs";
const args = process.argv.slice(2);
writeFileSync(new URL("./args.json", import.meta.url), JSON.stringify(args));
if (args[0] !== "lint-menu") { console.error("unknown"); process.exit(2); }
const files = args.slice(1).filter((arg, i, all) => !arg.startsWith("--") && all[i - 1] !== "--proper-noun");
const results = files.map(file => file.includes("broken")
  ? { file, valid: false, error: "invalid-json", findings: [] }
  : { file, valid: true, findings: file.includes("bad") ? [{ rule: "sentence-case", severity: "error", message: "\\"Open The Dashboard\\" capitalizes \\"The\\".", path: "items[3]" }] : [] });
console.log(JSON.stringify({ ok: results.every(r => r.valid && !r.findings.length), results }));
process.exit(results.every(r => r.valid && !r.findings.length) ? 0 : 1);
`;

function fakeKit(dir: string): string {
  write(dir, {
    "package.json": JSON.stringify({ name: "@hraness/desktop-foundation", version: "0.8.0", type: "module", exports: { ".": { import: "./dist/src/index.js" } } }),
    "dist/src/index.js": "export {};\n",
    "dist/src/cli.js": FAKE_CLI,
  });
  return dir;
}

const GOOD = JSON.stringify({ version: 2, type: "snapshot", appId: "demo", name: "Demo", revision: 1, mark: { symbol: "mark.agent", letters: "Hc" }, items: [] });

describe("menuFindings", () => {
  test("maps findings to file#path locations and invalid fixtures to errors", () => {
    const findings = menuFindings({ ok: false, results: [
      { file: "menus/running.json", valid: true, findings: [] },
      { file: "menus/error.json", valid: true, findings: [{ rule: "quit", severity: "error", message: "Quit is not last.", path: "items[4]" }, { rule: "length", severity: "warning", message: "Too long.", path: "items[2].subtitle" }] },
      { file: "menus/broken.json", valid: false, error: "invalid-json", findings: [] },
    ] });
    expect(findings.map(f => `${f.rule}:${f.severity}:${f.location}:${f.excerpt}`)).toEqual([
      "menu:error:menus/error.json#items[4]:quit: Quit is not last.",
      "menu:warn:menus/error.json#items[2].subtitle:length: Too long.",
      "menu:error:menus/broken.json:not a valid menu snapshot (invalid-json)",
    ]);
  });
});

describe("findCompanionCli", () => {
  test("finds the package a repository resolves, or the one it is pointed at", () => {
    const root = write(join(scratch, "resolves"), { "package.json": "{}" });
    fakeKit(join(root, "node_modules", "@hraness", "desktop-foundation"));
    expect(findCompanionCli(root)).toBe(join(root, "node_modules", "@hraness", "desktop-foundation", "dist", "src", "cli.js"));
    const elsewhere = fakeKit(join(scratch, "kit-elsewhere"));
    expect(findCompanionCli(root, undefined, elsewhere)).toBe(join(elsewhere, "dist", "src", "cli.js"));
  });

  test("resolves the override from the working directory, not the linted root", () => {
    const root = write(join(scratch, "other-root"), { "package.json": "{}" });
    const kit = fakeKit(join(scratch, "cwd-kit"));
    const cwd = process.cwd();
    process.chdir(scratch);
    try {
      expect(findCompanionCli(root, undefined, "cwd-kit")).toBe(join(kit, "dist", "src", "cli.js"));
    } finally {
      process.chdir(cwd);
    }
  });

  test("explains what to install when nothing resolves", () => {
    const root = write(join(scratch, "no-kit"), { "package.json": "{}" });
    expect(() => findCompanionCli(root)).toThrow("--menu-kit");
    expect(() => findCompanionCli(root, "missing-dir")).toThrow("No desktop-foundation companion CLI");
  });
});

describe("lintMenuFixtures", () => {
  test("runs lint-menu --strict --json with proper nouns and maps the report", () => {
    const kit = fakeKit(join(scratch, "kit-run"));
    const root = write(join(scratch, "menus-run"), { "menus/running.json": GOOD, "menus/bad-error.json": GOOD });
    const findings = lintMenuFixtures(root, ["menus/bad-error.json", "menus/running.json"], { companionCli: join(kit, "dist", "src", "cli.js"), properNouns: ["Mom"] });
    expect(findings.map(f => f.location)).toEqual(["menus/bad-error.json#items[3]"]);
    const args = JSON.parse(readFileSync(join(kit, "dist", "src", "args.json"), "utf8")) as string[];
    expect(args).toEqual(["lint-menu", "--strict", "--json", "--proper-noun", "Mom", "menus/bad-error.json", "menus/running.json"]);
  });

  test("a companion that does not print a report is a tool failure, not a clean result", () => {
    const kit = write(join(scratch, "kit-broken"), { "dist/src/cli.js": "console.error('boom'); process.exit(3);\n" });
    expect(() => lintMenuFixtures(scratch, ["x.json"], { companionCli: join(kit, "dist", "src", "cli.js") })).toThrow("companion lint-menu failed (exit 3): boom");
  });
});

describe("runPublicCopy with cli and menus", () => {
  const kit = fakeKit(join(scratch, "kit-config"));
  const root = write(join(scratch, "product"), {
    "public-copy.config.json": JSON.stringify({
      markdown: ["README.md"],
      cli: [{ files: "test/golden/bare.txt", kind: "bare" }, { files: "test/golden/help-*.txt", kind: "command" }],
      menus: { fixtures: ["test/menus/*.json"] },
      properNouns: ["Mom"],
      guides: false,
    }),
    "README.md": "# Demo\n\nIt is fast — and small.\n",
    "test/golden/bare.txt": "Demo does one thing.\n\nStart here\n  demo setup   Set Up the thing\n",
    "test/golden/help-add.txt": "Usage: demo add <name>\n\nAdd a person, such as Mom.\n",
    "test/menus/running.json": GOOD,
    "test/menus/bad-error.json": GOOD,
  });
  const config = JSON.parse(readFileSync(join(root, "public-copy.config.json"), "utf8"));

  test("lints captured help and menu fixtures alongside the other sections", () => {
    const result = runPublicCopy(root, config, { menuKit: kit });
    expect(result.files).toEqual(["README.md", "test/golden/bare.txt", "test/golden/help-add.txt", "test/menus/bad-error.json", "test/menus/running.json"]);
    expect(result.findings.map(f => `${f.rule}:${f.location}`)).toEqual([
      "emdash:README.md:3",
      "cli-case:test/golden/bare.txt:4",
      "menu:test/menus/bad-error.json#items[3]",
    ]);
  });

  test("only runs the sections it is given", () => {
    const result = runPublicCopy(root, config, { menuKit: kit, only: new Set(["cli"]) });
    expect(result.findings.map(f => f.rule)).toEqual(["cli-case"]);
  });

  test("a cli glob that matches nothing is a config error", () => {
    expect(() => runPublicCopy(root, { cli: [{ files: "nope/*.txt", kind: "help" }] })).toThrow("cli files not found");
  });

  function run(...args: string[]): { code: number; out: string } {
    const result = Bun.spawnSync([process.execPath, cli, "--root", root, "--menu-kit", kit, ...args], { stdout: "pipe", stderr: "pipe" });
    return { code: result.exitCode, out: result.stdout.toString() + result.stderr.toString() };
  }

  test("the CLI fails on the findings, or only warns under --advisory", () => {
    expect(run().code).toBe(1);
    const advisory = run("--advisory", "--annotations", "--only", "cli,menus");
    expect(advisory.code).toBe(0);
    expect(advisory.out).toContain("::warning file=test/golden/bare.txt,line=4,title=copy lint%3A cli-case::");
    expect(advisory.out).toContain("::warning file=test/menus/bad-error.json,title=copy lint%3A menu::");
    expect(advisory.out).not.toContain("emdash");
    expect(advisory.out).toContain("Advisory run");
  });

  test("--json and --annotations cannot be combined", () => {
    expect(run("--json", "--annotations").code).toBe(2);
  });

  test("--only package still reads the pages that hold install pins", () => {
    const pinned = write(join(scratch, "pinned"), {
      "package.json": JSON.stringify({ name: "@hraness/demo", version: "0.3.0", repository: "github:hraness/demo" }),
      "README.md": "# Demo\n\nInstall with `bun add github:hraness/demo#v0.1.0`.\n",
    });
    const result = runPublicCopy(pinned, { markdown: ["README.md"], package: "package.json", guides: false }, { only: new Set(["package"]) });
    expect(result.findings.map(f => `${f.rule}:${f.location}`)).toEqual(["pins:README.md:3"]);
  });

  test("--only rejects unknown sections and refuses to rewrite the baseline", () => {
    expect(run("--only", "cli,menu").code).toBe(2);
    const refused = run("--only", "cli", "--update-baseline");
    expect(refused.code).toBe(2);
    expect(refused.out).toContain("Run it without --only");
  });
});

describe("annotation", () => {
  test("escapes workflow command data and properties", () => {
    const line = annotation({ rule: "cli-case", severity: "error", surface: "body", location: "a,b:c.txt:7", excerpt: "50% done\nnext", hint: "Fix it." }, false);
    expect(line).toBe("::error file=a%2Cb%3Ac.txt,line=7,title=copy lint%3A cli-case::50%25 done%0Anext · Fix it.");
    expect(annotation({ rule: "vocab", severity: "error", surface: "body", location: "x.md:1", excerpt: "e", hint: "h" }, true)).toStartWith("::warning ");
  });
});
