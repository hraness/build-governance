import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { uxCopyConfig } from "./ux-copy-config.ts";

const repoRoot = join(import.meta.dir, "..");

describe("uxCopyConfig", () => {
  test("turns workflow inputs into cli and menus sections", () => {
    expect(uxCopyConfig({
      MENU_FIXTURES: "test/menus/*.json\n  test/more/*.json\n",
      BARE_GOLDEN: "test/golden/bare.txt",
      HELP_GOLDEN: "test/golden/help.txt",
      COMMAND_GOLDENS: "test/golden/*.help.txt",
      PROPER_NOUNS: "Mom, Dad",
    })).toEqual({
      cli: [
        { files: "test/golden/bare.txt", kind: "bare" },
        { files: "test/golden/help.txt", kind: "help" },
        { files: "test/golden/*.help.txt", kind: "command" },
      ],
      menus: { fixtures: ["test/menus/*.json", "test/more/*.json"] },
      properNouns: ["Mom", "Dad"],
      guides: false,
    });
  });

  test("refuses to run with nothing to check", () => {
    expect(() => uxCopyConfig({ PROPER_NOUNS: "Mom" })).toThrow("Nothing to check");
  });
});

describe("reusable workflows", () => {
  const version = (JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { version: string }).version;

  test.each(["ux-copy.yml", "cli-golden.yml"])("%s defaults to this release of the tools", file => {
    const workflow = readFileSync(join(repoRoot, ".github", "workflows", file), "utf8");
    const block = /governance-ref:\n(?:\s+\w[^\n]*\n)*?\s+default: (\S+)/.exec(workflow);
    expect(block?.[1]).toBe(`v${version}`);
  });

  test.each(["ux-copy.yml", "cli-golden.yml"])("%s is advisory unless the caller asks for required", file => {
    const workflow = readFileSync(join(repoRoot, ".github", "workflows", file), "utf8");
    expect(workflow).toMatch(/mode:\n(?:\s+\w[^\n]*\n)*?\s+default: advisory/);
    expect(workflow).toContain("continue-on-error: ${{ inputs.mode == 'advisory' }}");
  });
});
