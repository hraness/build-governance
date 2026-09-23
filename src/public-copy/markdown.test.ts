import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { codeSpans, extractMarkdown, inlineText, lintMarkdown, tableCells } from "./markdown.ts";

const EM = "—";

describe("extractMarkdown", () => {
  const doc = [
    "---",
    "title: \"Reading notes\"",
    "description: A summary of one paper on sleep and memory, with its sample size and the main limit it reports.",
    "---",
    "",
    "# Soundfish",
    "",
    "Make music with `soundfish play` and [the docs](https://sound.fish/docs).",
    "It wraps lines.",
    "",
    "```sh",
    `echo "honest ${EM} code"`,
    "```",
    "",
    "- First item",
    "- Second item with ![A piano roll](roll.png)",
    "",
    "<!-- end list -->",
    "    indented code honest",
    "",
    "<!-- honest comment -->",
    "",
    "| Name | Role |",
    "| --- | --- |",
    "| xcb | Runs tasks |",
    "",
    "<p align=\"center\"><img src=\"logo.svg\" alt=\"Soundfish logo\"></p>",
    "",
    "[ref]: https://example.com/honest",
  ].join("\n");
  const items = extractMarkdown(doc, "README.md");

  test("reads front matter, headings, paragraphs, list items, table cells, and images with line numbers", () => {
    expect(items.map(item => [item.location, item.surface, item.text])).toEqual([
      ["README.md:2", "title", "Reading notes"],
      ["README.md:3", "description", "A summary of one paper on sleep and memory, with its sample size and the main limit it reports."],
      ["README.md:6", "heading", "Soundfish"],
      ["README.md:8", "body", "Make music with [code] and the docs.\nIt wraps lines."],
      ["README.md:15", "body", "First item"],
      ["README.md:16", "alt", "A piano roll"],
      ["README.md:16", "body", "Second item with"],
      ["README.md:23", "heading", "Name"],
      ["README.md:23", "heading", "Role"],
      ["README.md:25", "body", "xcb"],
      ["README.md:25", "body", "Runs tasks"],
      ["README.md:27", "alt", "Soundfish logo"],
    ]);
  });

  test("never reports text from code, comments, or link definitions", () => {
    expect(lintMarkdown(doc, "README.md")).toEqual([]);
  });

  test("marks prose as generated or reference by kind", () => {
    expect(extractMarkdown("# A\n\nText.", "x.md", { kind: "generated" }).map(item => item.surface)).toEqual(["heading", "generated"]);
    expect(extractMarkdown("# A\n\nText.", "x.md", { kind: "reference" }).map(item => item.surface)).toEqual(["reference", "reference"]);
  });
});

describe("lintMarkdown", () => {
  test("reports findings at the line of their block", () => {
    const findings = lintMarkdown(`# Title\n\nFirst.\n\nSecond ${EM} line.\n`, "doc.md");
    expect(findings.map(f => [f.rule, f.location])).toEqual([["emdash", "doc.md:5"]]);
  });

  test("flags table rows whose cell count differs from the header", () => {
    const findings = lintMarkdown("| A | B |\n| - | - |\n| 1 | 2 | 3 |\n| 4 | 5 |\n", "t.md");
    expect(findings.map(f => [f.rule, f.location])).toEqual([["render", "t.md:3"]]);
  });

  test("flags a pipe inside a code span in a table row but not pipes between code spans", () => {
    const bad = lintMarkdown("| Type | Shape |\n| --- | --- |\n| `Result` | `Ok | Err` |\n", "t.md");
    expect(bad.filter(f => f.hint.includes("pipe inside a code span"))).toHaveLength(1);
    const good = lintMarkdown("| A | B |\n| --- | --- |\n| `a.js` | `b.ts` |\n| `Ok \\| Err` | x |\n", "t.md");
    expect(good).toEqual([]);
  });

  test("allows internal terms a reference page defines", () => {
    const doc = "# Leases\n\nA lease is the time a worker holds a job.\n\nRenew the lease before it expires.\n";
    expect(lintMarkdown(doc, "ref.md", undefined, { kind: "reference" })).toEqual([]);
    expect(lintMarkdown(doc, "body.md").every(f => f.severity === "warn" || f.surface === "heading")).toBe(true);
  });

  test("applies the generated rules to model-written notes", () => {
    const findings = lintMarkdown("# Note\n\nThe study found a 12% drop. This underscores the risk.\n", "n.md", undefined, { kind: "generated" });
    expect(findings.map(f => f.rule)).toEqual(["generated"]);
  });

  test("checks front matter descriptions as descriptions", () => {
    const findings = lintMarkdown("---\ndescription: Too short\n---\n\nBody.\n", "n.md");
    expect(findings.map(f => [f.rule, f.location])).toEqual([["meta", "n.md:2"], ["meta", "n.md:2"]]);
  });

  test("never throws on arbitrary input", () => {
    fc.assert(fc.property(fc.string({ maxLength: 500 }), text => {
      expect(Array.isArray(lintMarkdown(text, "x.md"))).toBe(true);
    }));
  });
});

describe("inline helpers", () => {
  test("inlineText keeps link text and drops markup", () => {
    expect(inlineText("**Bold** and _em_ and [link](https://x.y) and <kbd>K</kbd> and \\*star\\*")).toBe("Bold and em and link and K and *star*");
  });

  test("tableCells splits on unescaped pipes the way GitHub does", () => {
    expect(tableCells("| a | `b | c` | d \\| e |")).toEqual(["a", "`b", "c`", "d \\| e"]);
  });

  test("codeSpans pairs backtick runs of equal length", () => {
    expect(codeSpans("`a` and ``b ` c`` and `d")).toEqual(["a", "b ` c"]);
  });
});
