import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import ts from "typescript";
import { inspectEffectArchitecture } from "../effect-architecture.ts";
import { checkGuides, runPublicCopy } from "./files.ts";

const EM = "—";
const repoRoot = join(import.meta.dir, "..", "..");
const cli = join(repoRoot, "src", "public-copy-cli.ts");
const scratch = mkdtempSync(join(tmpdir(), "public-copy-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function fixture(name: string, files: Record<string, string>): string {
  const root = join(scratch, name);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

function run(root: string, ...args: string[]): { code: number; out: string } {
  const result = Bun.spawnSync([process.execPath, cli, "--root", root, ...args], { stdout: "pipe", stderr: "pipe" });
  return { code: result.exitCode, out: result.stdout.toString() + result.stderr.toString() };
}

const description = "Soundfish turns a short prompt into a MIDI sketch you can play, edit, and export from your browser.";
const page = (title: string, desc: string, body: string): string =>
  `<html><head><title>${title}</title><meta name="description" content="${desc}"></head><body>${body}</body></html>`;

describe("runPublicCopy", () => {
  const root = fixture("site", {
    "public-copy.config.json": "{}",
    "README.md": `# Soundfish\n\nInstall with \`bun add github:hraness/soundfish#v0.9.0\`.\n\nIt is fast ${EM} and small.\n`,
    "docs/reference/api.md": "# API\n\nA lease is the time a job holds a worker.\n\nRenew the lease.\n",
    "notes/one.md": `---\ndescription: ${description}\n---\n\nThe study found a drop. This underscores the risk.\n`,
    "site/index.html": page("Soundfish · Soundfish", description, "<h1>Make music</h1><p>Plays in the browser.</p>"),
    "site/about.html": page("About · Soundfish", description, "<p>Made in 2026.</p>"),
    "public/llms.txt": "# Soundfish\n\nSoundfish is an honest tool.\n",
    "registry.json": JSON.stringify({ projects: [{ description: "Soundfish makes receipts." }, { description: 3 }] }),
    "package.json": JSON.stringify({ name: "soundfish", version: "1.0.0", description: "Music for agents.", repository: { url: "git+https://github.com/hraness/soundfish.git" } }),
    "node_modules/dep/README.md": `Ignored ${EM} here.\n`,
  });
  const result = runPublicCopy(root, {
    html: ["site/**/*.html"],
    markdown: ["README.md", "**/*.md"],
    reference: ["docs/reference/**"],
    generated: ["notes/**/*.md"],
    text: [{ file: "public/llms.txt", surface: "agent" }],
    json: [{ file: "registry.json", path: "$.projects[*].description", surface: "description" }],
    package: "package.json",
    brand: "Soundfish",
  });
  const summary = result.findings.map(f => `${f.rule} ${f.location}`);

  test("reads every configured file and skips node_modules", () => {
    expect(result.files).toEqual(["README.md", "docs/reference/api.md", "notes/one.md", "public/llms.txt", "registry.json", "site/about.html", "site/index.html"]);
    expect(summary.some(line => line.includes("node_modules"))).toBe(false);
  });

  test("applies each rule to the right surface", () => {
    expect(summary).toContain("emdash README.md:5");
    expect(summary).toContain("pins README.md:3");
    expect(summary).toContain("generated notes/one.md:5");
    expect(summary).toContain("selfcert public/llms.txt:3");
    expect(summary).toContain("vocab registry.json#$.projects[0].description");
    expect(summary).toContain("meta site/index.html#title");
    expect(summary.filter(line => line.startsWith("vocab docs/reference"))).toEqual([]);
  });

  test("flags a description shared by two pages", () => {
    const duplicates = result.findings.filter(f => f.hint.startsWith("The same description"));
    expect(duplicates.map(f => f.location)).toEqual(["notes/one.md", "site/about.html#meta[name=description]", "site/index.html#meta[name=description]"]);
  });

  test("lints the package description without the page-description length rule", () => {
    expect(result.findings.filter(f => f.location === "package.json#description")).toEqual([]);
  });
});

describe("checkGuides", () => {
  test("passes this repository's synced guides", () => {
    expect(checkGuides(repoRoot, { required: true })).toEqual([]);
  });

  test("reports missing guides only when they are required", () => {
    const root = fixture("no-guides", { "README.md": "# x\n" });
    expect(checkGuides(root)).toEqual([]);
    expect(checkGuides(root, { required: true }).map(f => f.location)).toEqual(["STYLE.md", "WRITING.md"]);
  });

  test("reports a guide edited above Repository additions", () => {
    const style = readFileSync(join(repoRoot, "STYLE.md"), "utf8").replace("Use the Oxford comma.", "Use the Oxford comma sometimes.");
    const root = fixture("edited-guide", { "STYLE.md": style });
    expect(checkGuides(root).map(f => f.rule)).toEqual(["guides"]);
  });
});

describe("hraness-copy-lint", () => {
  const files = {
    "public-copy.config.json": JSON.stringify({ markdown: ["README.md"] }),
    "README.md": `# Tool\n\nOne ${EM} two.\n\nThree ${EM} four.\n`,
  };

  test("prints help", () => {
    const { code, out } = run(scratch, "--help");
    expect(code).toBe(0);
    expect(out).toContain("--update-baseline");
  });

  test("exits 2 on a bad option or config", () => {
    expect(run(scratch, "--nope").code).toBe(2);
    const root = fixture("bad-config", { "public-copy.config.json": JSON.stringify({ markdwon: [] }) });
    expect(run(root).code).toBe(2);
  });

  test("fails without a baseline, records one, then fails only when a count rises", () => {
    const root = fixture("ratchet", files);
    expect(run(root).code).toBe(1);

    const recorded = run(root, "--update-baseline");
    expect(recorded.code).toBe(0);
    const baselinePath = join(root, ".public-copy-baseline.json");
    expect(JSON.parse(readFileSync(baselinePath, "utf8"))).toEqual({ version: 1, counts: { "README.md": { emdash: 2 } } });
    expect(run(root).code).toBe(0);

    writeFileSync(join(root, "README.md"), `# Tool\n\nOne ${EM} two.\n\nThree ${EM} four.\n\nFive ${EM} six.\n`);
    const rose = run(root);
    expect(rose.code).toBe(1);
    expect(rose.out).toContain("Rose: README.md emdash 2 → 3");

    const refused = run(root, "--update-baseline");
    expect(refused.code).toBe(1);
    expect(JSON.parse(readFileSync(baselinePath, "utf8")).counts["README.md"].emdash).toBe(2);

    writeFileSync(join(root, "README.md"), `# Tool\n\nOne and two.\n\nThree ${EM} four.\n`);
    const fell = run(root);
    expect(fell.code).toBe(0);
    expect(fell.out).toContain("fell below the baseline");
    expect(run(root, "--update-baseline").code).toBe(0);
    expect(JSON.parse(readFileSync(baselinePath, "utf8")).counts["README.md"].emdash).toBe(1);

    writeFileSync(join(root, "README.md"), "# Tool\n\nOne and two.\n");
    expect(run(root, "--update-baseline").code).toBe(0);
    expect(JSON.parse(readFileSync(baselinePath, "utf8"))).toEqual({ version: 1, counts: {} });
  }, 30_000);

  test("prints JSON with the findings and the comparison", () => {
    const root = fixture("json", files);
    const { code, out } = run(root, "--json");
    expect(code).toBe(1);
    const parsed = JSON.parse(out) as { findings: unknown[]; comparison: { regressions: unknown[] } };
    expect(parsed.findings).toHaveLength(2);
    expect(parsed.comparison.regressions).toHaveLength(1);
  });

  test("passes on this repository", () => {
    const { code, out } = run(repoRoot);
    expect(out).not.toContain("Rose:");
    expect(code).toBe(0);
  });
});

describe("architecture", () => {
  test("the public-copy modules satisfy the Effect architecture policy with no declared roles", () => {
    const sources = [
      "public-copy.ts", "public-copy-cli.ts", "public-copy/types.ts", "public-copy/rules.ts", "public-copy/html.ts",
      "public-copy/markdown.ts", "public-copy/pins.ts", "public-copy/guides.ts", "public-copy/baseline.ts",
      "public-copy/config.ts", "public-copy/json-path.ts", "public-copy/expect.ts", "public-copy/files.ts",
    ].map(file => join(repoRoot, "src", file));
    const program = ts.createProgram({
      rootNames: sources,
      options: { strict: true, noEmit: true, module: ts.ModuleKind.Preserve, moduleResolution: ts.ModuleResolutionKind.Bundler, target: ts.ScriptTarget.ES2023, types: ["bun"], allowImportingTsExtensions: true },
    });
    expect(inspectEffectArchitecture(program, { root: join(repoRoot, "src"), modules: [], adapters: [], runtimeRoots: [] })).toEqual([]);
  }, 30_000);
});
