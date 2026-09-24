import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { sortFindings } from "./files.ts";
import { extractHtml } from "./html.ts";
import { inlineText } from "./markdown.ts";
import { repositoryFor } from "./pins.ts";
import { lintCopy } from "./rules.ts";
import { githubSlug, htmlTokenizer, removeHtmlTags, replaceBacktickSpans, splitTitle, stripLocationSuffix } from "./scanners.ts";

// The regular expressions the scanners replace. They stay here as the reference behavior.
const SLUG = /github\.com[/:]([^/]+\/[^/#]+?)(?:\.git)?(?:#.*)?$/;
const BACKTICK_SPAN = /(`+)([\s\S]*?[^`])\1(?!`)/g;
const HTML_TAG = /<\/?[a-zA-Z][^>]*>/g;
const TITLE_SEPARATOR = /\s*[·|]\s*|\s+[–—-]\s+|:\s+/;
const LOCATION_SUFFIX = /(?:#.*|:\d+)$/;
const HTML_TOKEN = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/\s*([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>|[^<]+|</gi;

/** Strings over a small alphabet, so generated input hits the interesting cases often. */
const over = (pieces: readonly string[], maxLength = 40): fc.Arbitrary<string> =>
  fc.array(fc.constantFrom(...pieces), { maxLength }).map(parts => parts.join(""));

const RUNS = { numRuns: 3000 };

/** Milliseconds `run` takes. The quadratic regular expressions took minutes on these inputs. */
function elapsed(run: () => unknown): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

const LIMIT_MS = 1000;
const REPEAT = 50_000;

describe("scanners match the regular expressions they replace", () => {
  test("githubSlug", () => {
    for (const raw of [
      "git+https://github.com/hraness/build-governance.git",
      "https://github.com/hraness/build-governance",
      "git@github.com:hraness/build-governance.git#main",
      "github.com/a/.git",
      "https://example.com/x",
    ]) expect(githubSlug(raw)).toBe(SLUG.exec(raw)?.[1]);
    const pieces = ["github.com", "/", ":", "#", ".git", "a", "b", ".", "\n", "gith"];
    fc.assert(fc.property(over(pieces), raw => {
      expect(githubSlug(raw)).toBe(SLUG.exec(raw)?.[1]);
    }), RUNS);
  });

  test("replaceBacktickSpans", () => {
    expect(replaceBacktickSpans("`a` and ``b ` c`` and ```x`` y`", " [code] ")).toBe("`a` and ``b ` c`` and ```x`` y`".replace(BACKTICK_SPAN, " [code] "));
    fc.assert(fc.property(over(["`", "``", "```", "a", " ", "\n"]), text => {
      expect(replaceBacktickSpans(text, " [code] ")).toBe(text.replace(BACKTICK_SPAN, " [code] "));
    }), RUNS);
  });

  test("removeHtmlTags", () => {
    fc.assert(fc.property(over(["<", ">", "/", "a", "Z", "1", " ", "\n", "<b>", "</i>"]), text => {
      expect(removeHtmlTags(text)).toBe(text.replace(HTML_TAG, ""));
    }), RUNS);
  });

  test("splitTitle", () => {
    const pieces = [" ", "\t", " ", "　", "·", "|", "–", "—", "-", ":", "a", "B"];
    fc.assert(fc.property(over(pieces), title => {
      expect(splitTitle(title)).toEqual(title.split(TITLE_SEPARATOR));
    }), RUNS);
    fc.assert(fc.property(fc.string({ maxLength: 40 }), title => {
      expect(splitTitle(title)).toEqual(title.split(TITLE_SEPARATOR));
    }), RUNS);
  });

  test("stripLocationSuffix", () => {
    fc.assert(fc.property(over(["#", ":", "1", "23", "a", ".md", "\n", "\r"]), location => {
      expect(stripLocationSuffix(location)).toBe(location.replace(LOCATION_SUFFIX, ""));
    }), RUNS);
  });

  test("htmlTokenizer", () => {
    const pieces = [
      "<", ">", "/", "!", "<!--", "-->", "<!doctype", "<!DocType", "a", "p", "-", " ", "\n", "=", "\"", "'", "`",
      "<a", "</a", "x=", "b", "/>", ":",
    ];
    fc.assert(fc.property(over(pieces, 30), html => {
      const tokenizer = htmlTokenizer(html);
      for (let index = 0; index <= html.length; index += 1) {
        HTML_TOKEN.lastIndex = index;
        const expected = HTML_TOKEN.exec(html);
        const actual = tokenizer.next(index);
        if (!expected) {
          expect(actual).toBeUndefined();
          continue;
        }
        expect(actual).toBeDefined();
        const [token, closing, opening, attributeSource, selfClosing] = expected;
        expect(expected.index).toBe(index);
        expect([actual?.token, actual?.end, actual?.closing, actual?.opening, actual?.attributeSource, actual?.selfClosing])
          .toEqual([token, HTML_TOKEN.lastIndex, closing, opening, attributeSource, selfClosing]);
      }
    }), { numRuns: 1500 });
  });
});

describe("scanners run in linear time on adversarial input", () => {
  test("repository URLs with many github.com repetitions", () => {
    const inputs = [
      `github.com/${"github.com:.".repeat(REPEAT)}`,
      `github.com/./"#${"github.com/./\"#".repeat(REPEAT)}\n`,
      `github.com/${"a/".repeat(REPEAT)}`,
    ];
    for (const url of inputs) {
      expect(elapsed(() => githubSlug(url))).toBeLessThan(LIMIT_MS);
      expect(elapsed(() => repositoryFor({ name: "x", version: "1.0.0", repository: { url } }))).toBeLessThan(LIMIT_MS);
    }
  });

  test("inline Markdown with long backtick runs and unclosed tags", () => {
    const inputs = [
      "`".repeat(REPEAT),
      `\`${"``".repeat(REPEAT)}`,
      `${"`a".repeat(REPEAT)}`,
      Array.from({ length: 300 }, (_, index) => "`".repeat(index + 1)).join(" "),
      "<a".repeat(REPEAT),
      "</a<b".repeat(REPEAT),
    ];
    for (const text of inputs) {
      expect(elapsed(() => replaceBacktickSpans(text, " [code] "))).toBeLessThan(LIMIT_MS);
      expect(elapsed(() => removeHtmlTags(text))).toBeLessThan(LIMIT_MS);
      expect(elapsed(() => inlineText(text))).toBeLessThan(LIMIT_MS);
    }
  });

  test("titles with long whitespace runs", () => {
    const inputs = [" ".repeat(REPEAT * 4), `a${" ".repeat(REPEAT * 4)}b`, `${" ".repeat(REPEAT * 4)}-x`];
    for (const title of inputs) {
      expect(elapsed(() => splitTitle(title))).toBeLessThan(LIMIT_MS);
      expect(elapsed(() => lintCopy(title, { surface: "title", location: "x.html#title" }))).toBeLessThan(LIMIT_MS * 3);
    }
  });

  test("locations with many hashes", () => {
    const inputs = ["#".repeat(REPEAT * 4), `a${"#".repeat(REPEAT * 4)}\n`, `${":1".repeat(REPEAT)}x`];
    for (const location of inputs) {
      expect(elapsed(() => stripLocationSuffix(location))).toBeLessThan(LIMIT_MS);
    }
    const findings = inputs.map(location => ({ rule: "emdash" as const, severity: "error" as const, surface: "body" as const, location, excerpt: "", hint: "" }));
    expect(elapsed(() => sortFindings(findings))).toBeLessThan(LIMIT_MS);
  });

  test("HTML with many unclosed comments, doctypes, and tags", () => {
    const inputs = [
      "<!--".repeat(REPEAT),
      "<!doctype".repeat(REPEAT),
      "<a ".repeat(REPEAT),
      "<a b=\"".repeat(REPEAT),
      "<a <a x='".repeat(REPEAT),
      "</ a".repeat(REPEAT),
    ];
    for (const html of inputs) {
      expect(elapsed(() => extractHtml(html, "x.html"))).toBeLessThan(LIMIT_MS);
    }
  });
});
