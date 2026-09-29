import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { uxCopyConfig } from "./ux-copy-config.ts";

const repoRoot = join(import.meta.dir, "..");

describe("uxCopyConfig", () => {
  test("turns workflow inputs into cli, control, and tray sections", () => {
    expect(uxCopyConfig({
      COMMANDS_JSON: "test/json/commands.json",
      STATUS_JSON: " test/json/status.json ",
      TUI_JSON: "test/json/tui.json",
      ENVELOPES: "test/json/errors/*.json\n  test/json/more/*.json\n",
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
      control: {
        commands: "test/json/commands.json",
        status: "test/json/status.json",
        tui: "test/json/tui.json",
        envelopes: ["test/json/errors/*.json", "test/json/more/*.json"],
      },
      tray: true,
      properNouns: ["Mom", "Dad"],
      guides: false,
    });
  });

  test("keeps the tray guard on by default, and refuses to run with nothing to check", () => {
    expect(uxCopyConfig({ PROPER_NOUNS: "Mom" })).toEqual({ tray: true, properNouns: ["Mom"], guides: false });
    expect(() => uxCopyConfig({ PROPER_NOUNS: "Mom", TRAY: "false" })).toThrow("Nothing to check");
    expect(() => uxCopyConfig({ TRAY: "off" })).toThrow("tray must be true or false");
    expect(uxCopyConfig({ HELP_GOLDEN: "help.txt", TRAY: "false" }).tray).toBeUndefined();
    expect(uxCopyConfig({ TRAY_EXCLUDE: "docs/history/**\n" }).tray).toEqual({ exclude: ["docs/history/**"] });
    expect(() => uxCopyConfig({ HELP_GOLDEN: "help.txt", TRAY: "false", TRAY_EXCLUDE: "a/**" })).toThrow("tray-exclude needs");
  });

  test("fails with a pointer when a caller still passes menu fixtures", () => {
    expect(() => uxCopyConfig({ MENU_FIXTURES: "test/menus/*.json", HELP_GOLDEN: "help.txt" })).toThrow("menu-fixtures was removed");
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
