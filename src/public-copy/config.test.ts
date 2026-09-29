import { describe, expect, test } from "bun:test";
import { parseCopyConfig } from "./config.ts";
import { parseJsonPath, selectJsonPath } from "./json-path.ts";

describe("parseCopyConfig", () => {
  test("accepts the documented config", () => {
    const config = parseCopyConfig({
      html: ["site/dist/**/*.html", ".next/server/app/**/*.html"],
      markdown: ["README.md", "docs/**/*.md"],
      text: [{ file: "public/llms.txt", surface: "agent" }],
      json: [{ file: "portfolio-projects.json", path: "$.projects[*].overrides.description", surface: "description" }],
      reference: ["docs/reference/**"],
      generated: ["kb/notes/reading/**/*.md"],
      vocabulary: { add: [], allowWithDefinition: [] },
      package: "package.json",
      baseline: ".public-copy-baseline.json",
      guides: "required",
      brand: "Soundfish",
    });
    expect(config.text).toEqual([{ file: "public/llms.txt", surface: "agent" }]);
    expect(config.guides).toBe("required");
  });

  test("accepts captured CLI help, control output, the tray guard, and proper nouns", () => {
    const config = parseCopyConfig({
      cli: [{ files: "test/golden/bare.txt", kind: "bare" }, { files: "test/golden/*.help.txt", kind: "command" }],
      control: { commands: "test/json/commands.json", status: "test/json/status.json", tui: "test/json/tui.json", envelopes: ["test/json/errors/*.json"] },
      tray: { exclude: ["docs/history/**"] },
      properNouns: ["Mom"],
    });
    expect(config.cli?.map(entry => entry.kind)).toEqual(["bare", "command"]);
    expect(config.control).toEqual({ commands: "test/json/commands.json", status: "test/json/status.json", tui: "test/json/tui.json", envelopes: ["test/json/errors/*.json"] });
    expect(config.tray).toEqual({ exclude: ["docs/history/**"] });
    expect(parseCopyConfig({ tray: true }).tray).toBe(true);
    expect(parseCopyConfig({ tray: false }).tray).toBe(false);
    expect(() => parseCopyConfig({ cli: [{ files: "a.txt", kind: "usage" }] })).toThrow("kind");
    expect(() => parseCopyConfig({ cli: [{ file: "a.txt", kind: "help" }] })).toThrow("Unknown cli[0] key");
    expect(() => parseCopyConfig({ cli: "a.txt" })).toThrow("cli must be an array");
    expect(() => parseCopyConfig({ menus: { fixtures: ["a.json"] } })).toThrow("menus section was removed");
    expect(() => parseCopyConfig({ control: {} })).toThrow("control needs");
    expect(() => parseCopyConfig({ control: { comands: "a.json" } })).toThrow("Unknown control key");
    expect(() => parseCopyConfig({ control: { tui: "a.json" } })).toThrow("control.tui needs control.status");
    expect(() => parseCopyConfig({ tray: "yes" })).toThrow("tray");
    expect(() => parseCopyConfig({ tray: { include: [] } })).toThrow("Unknown tray key");
    expect(() => parseCopyConfig({ properNouns: "Mom" })).toThrow("properNouns");
  });

  test("rejects unknown keys, bad surfaces, and bad values so a typo cannot turn a check off", () => {
    expect(() => parseCopyConfig({ markdwon: ["README.md"] })).toThrow("Unknown config key");
    expect(() => parseCopyConfig({ text: [{ file: "llms.txt", surface: "page" }] })).toThrow("surface");
    expect(() => parseCopyConfig({ json: [{ file: "a.json", path: "projects", surface: "body" }] })).toThrow("$");
    expect(() => parseCopyConfig({ guides: "yes" })).toThrow("guides");
    expect(() => parseCopyConfig({ vocabulary: { remove: [] } })).toThrow("vocabulary");
    expect(() => parseCopyConfig({ markdown: "README.md" })).toThrow("markdown");
    expect(() => parseCopyConfig([])).toThrow();
  });
});

describe("JSONPath subset", () => {
  const data = { projects: [{ id: "a", overrides: { description: "One." } }, { id: "b" }, { id: "c", overrides: { description: 3 } }], "odd key": "x" };

  test("selects wildcard, index, and quoted keys with concrete paths", () => {
    expect(selectJsonPath(data, "$.projects[*].overrides.description")).toEqual([
      { path: "$.projects[0].overrides.description", value: "One." },
      { path: "$.projects[2].overrides.description", value: 3 },
    ]);
    expect(selectJsonPath(data, "$.projects[1].id")).toEqual([{ path: "$.projects[1].id", value: "b" }]);
    expect(selectJsonPath(data, "$['odd key']")).toEqual([{ path: "$.odd key", value: "x" }]);
    expect(selectJsonPath(data, "$.projects[9].id")).toEqual([]);
    expect(selectJsonPath({ a: { x: 1, y: 2 } }, "$.a.*").map(match => match.value)).toEqual([1, 2]);
  });

  test("rejects unsupported syntax", () => {
    expect(() => parseJsonPath("$..description")).toThrow();
    expect(() => parseJsonPath("projects")).toThrow();
  });
});
