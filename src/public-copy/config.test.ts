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
