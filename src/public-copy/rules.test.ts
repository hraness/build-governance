import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import { INTERNAL_VOCABULARY, definedTerms, lintCopy, sentenceSpans } from "./rules.ts";
import type { CopySurface } from "./types.ts";

const EM = "—";
const EN = "–";

function rules(text: string, surface: CopySurface = "body", extra: Partial<Parameters<typeof lintCopy>[1]> = {}): string[] {
  return lintCopy(text, { surface, location: "page.md:1", ...extra }).map(f => `${f.rule}:${f.severity}`);
}

describe("emdash", () => {
  test("flags an em dash, a spaced en dash, and a spaced double hyphen", () => {
    expect(rules(`Fast ${EM} and small.`)).toEqual(["emdash:error"]);
    expect(rules(`Fast ${EN} and small.`)).toEqual(["emdash:error"]);
    expect(rules("Fast -- and small.")).toEqual(["emdash:error"]);
  });

  test("allows ranges, hyphenated words, and dashes inside URLs", () => {
    expect(rules(`Runs 2020${EN}2024 on well-known hosts.`)).toEqual([]);
    expect(rules(`See https://example.com/a${EM}b for details.`)).toEqual([]);
  });

  test("applies to every surface, including reference pages", () => {
    for (const surface of ["title", "description", "social", "alt", "heading", "body", "generated", "reference", "agent"] as const) {
      expect(rules(`One ${EM} two`, surface)).toContain("emdash:error");
    }
  });

  test("text without dash characters never produces an emdash finding", () => {
    fc.assert(fc.property(fc.string().filter(s => !/[–—]|--/.test(s)), text => {
      expect(lintCopy(text, { surface: "body", location: "x" }).filter(f => f.rule === "emdash")).toEqual([]);
    }));
  });
});

describe("vocab", () => {
  test("is an error on titles, descriptions, social text, alt text, and headings", () => {
    for (const surface of ["title", "heading", "alt"] as const) {
      expect(rules("Signed receipts", surface)).toContain("vocab:error");
    }
    expect(lintCopy("Every lane is bounded by a gate.", { surface: "social", field: "title", location: "x" })
      .filter(f => f.rule === "vocab").map(f => f.severity)).toEqual(["error", "error", "error"]);
  });

  test("is a warning in body text", () => {
    expect(rules("The receipt is stored.")).toEqual(["vocab:warn"]);
  });

  test("matches plurals and multi-word terms but not parts of hyphenated names", () => {
    expect(rules("Two receipts and three authorities.")).toEqual(["vocab:warn", "vocab:warn"]);
    expect(rules("A steel thread runs through it.")).toEqual(["vocab:warn"]);
    expect(rules("Install credits-foundation and local-custody.")).toEqual([]);
    expect(rules("The gateway opens.")).toEqual([]);
  });

  test("allows a defined term on reference pages and warns about undefined ones", () => {
    const defined = definedTerms("A lease is the time a worker holds a job.", INTERNAL_VOCABULARY);
    expect(defined.has("lease")).toBe(true);
    expect(rules("Renew the lease.", "reference", { definedTerms: defined })).toEqual([]);
    expect(rules("Renew the manifest.", "reference", { definedTerms: defined })).toEqual(["vocab:warn"]);
  });

  test("allows configured terms in body text only when the page defines them", () => {
    const config = { vocabulary: { allowWithDefinition: ["lease"] } };
    expect(rules("Renew the lease.", "body", { config, definedTerms: new Set(["lease"]) })).toEqual([]);
    expect(rules("Renew the lease.", "body", { config })).toEqual(["vocab:warn"]);
    expect(rules("Renew the lease.", "heading", { config, definedTerms: new Set(["lease"]) })).toEqual(["vocab:error"]);
  });

  test("adds repository vocabulary from the config", () => {
    expect(rules("Open the habitat.", "heading", { config: { vocabulary: { add: ["habitat"] } } })).toEqual(["vocab:error"]);
  });

  test("flags a precision stack once per sentence", () => {
    const findings = lintCopy("Sign only the exact retained draft. Keep the full text.", { surface: "body", location: "x" });
    expect(findings.filter(f => f.hint.startsWith("Precision stack"))).toHaveLength(1);
  });

  test("covers every internal word listed in the synced STYLE.md except the context-dependent “owns”", () => {
    const style = readFileSync(join(import.meta.dir, "..", "..", "STYLE.md"), "utf8");
    const bullet = style.split("\n").find(line => line.startsWith("- Treat the vocabulary of `AGENTS.md`"));
    expect(bullet).toBeDefined();
    const list = (bullet ?? "").split("“Every turn")[0] ?? "";
    const terms = [...list.matchAll(/\*([^*]+)\*/g)].map(match => match[1]).filter(term => term !== "owns");
    expect([...terms].sort()).toEqual([...INTERNAL_VOCABULARY].sort());
  });
});

describe("selfcert", () => {
  test("flags self-certifying words on every surface", () => {
    expect(rules("An honest comparison.")).toEqual(["selfcert:error"]);
    expect(rules("Said plainly, it works.")).toEqual(["selfcert:error"]);
    expect(rules("Honestly sorted", "heading")).toEqual(["selfcert:error"]);
    expect(rules("This is factual proof.")).toEqual(["selfcert:error"]);
    expect(rules("A checked product page.")).toEqual(["selfcert:error"]);
  });

  test("does not flag unrelated words", () => {
    expect(rules("The honeybee checked the flowers.")).toEqual([]);
  });
});

describe("retired", () => {
  test("flags retired names and misspellings", () => {
    expect(rules("Install Atet today.")).toEqual(["retired:error"]);
    expect(rules("Life Days Left and LifeDaysLeft.")).toEqual(["retired:error", "retired:error"]);
    expect(rules("Visit hra.sh for more.")).toEqual(["retired:error"]);
    expect(rules("Run it on an Oompa host.")).toEqual(["retired:error"]);
    expect(rules("TextButler and XCB and Aicharts.")).toEqual(["retired:error", "retired:error", "retired:error"]);
    expect(rules("Sound.fish makes music.")).toEqual(["retired:error"]);
  });

  test("allows a retired name after “formerly” and correct spellings", () => {
    expect(rules("Slopcamera (formerly Atet) records scenes.")).toEqual([]);
    expect(rules("Textbutler, xcb, AI Charts, and Soundfish at sound.fish.")).toEqual([]);
    expect(rules("Grab a wrench.")).toEqual([]);
  });

  test("ignores the retired domain inside a URL path", () => {
    expect(rules("Redirects from https://example.com/hra.sh stay.")).toEqual([]);
  });
});

describe("meta", () => {
  const description = (length: number): string => `${"a".repeat(length - 1)}.`;

  test("requires descriptions of 70 to 160 characters", () => {
    fc.assert(fc.property(fc.integer({ min: 2, max: 240 }), length => {
      const found = lintCopy(description(length), { surface: "description", location: "x" }).some(f => f.rule === "meta");
      expect(found).toBe(length < 70 || length > 160);
    }));
  });

  test("rejects truncated descriptions", () => {
    const base = "Soundfish turns a short prompt into a playable MIDI sketch that you can edit in the browser";
    expect(rules(`${base}…`, "description")).toContain("meta:error");
    expect(rules(`${base}...`, "description")).toContain("meta:error");
    expect(rules(base, "description")).toContain("meta:error");
    expect(rules(`${base}.`, "description")).toEqual([]);
  });

  test("applies description rules to social descriptions but not to package descriptions", () => {
    expect(lintCopy("Short.", { surface: "social", field: "description", location: "x" }).map(f => f.rule)).toEqual(["meta"]);
    expect(lintCopy("Short.", { surface: "description", field: "package", location: "x" })).toEqual([]);
  });

  test("limits titles to 65 characters and one mention of the brand", () => {
    expect(rules("a".repeat(65), "title")).toEqual([]);
    expect(rules("a".repeat(66), "title")).toEqual(["meta:error"]);
    expect(rules("Docs · Sys1 · Sys1", "title")).toEqual(["meta:error"]);
    expect(rules("Sys1 docs for Sys1", "title", { config: { brand: "Sys1" } })).toEqual(["meta:error"]);
    expect(rules("Docs · Sys1", "title", { config: { brand: "Sys1" } })).toEqual([]);
  });

  test("checks alt text length and shape", () => {
    expect(rules("A waveform above a piano roll with four highlighted notes.", "alt")).toEqual([]);
    expect(rules("Image of a waveform.", "alt")).toEqual(["meta:error"]);
    expect(rules("Soundfish - music for agents", "alt")).toEqual(["meta:error"]);
    expect(rules("a".repeat(126), "alt")).toEqual(["meta:error"]);
  });
});

describe("render", () => {
  test("flags Markdown syntax that renders literally in HTML and metadata", () => {
    expect(rules("Run `xcb` now.", "body", { format: "html" })).toEqual(["render:error", "render:error"]);
    expect(rules("A **bold** claim.", "description")).toContain("render:error");
    expect(rules("Run `xcb` now.", "body", { format: "markdown" })).toEqual([]);
  });

  test("flags double-escaped entities outside Markdown", () => {
    expect(rules("It&apos;s here.", "body", { format: "html" })).toEqual(["render:error"]);
    expect(rules("It&apos;s here.", "body", { format: "markdown" })).toEqual([]);
  });

  test("flags glued sentences but not URLs or domains", () => {
    expect(rules("It installs in one step.Then it runs.")).toEqual(["render:error"]);
    expect(rules("Open https://example.com/a.Bc and sound.fish.")).toEqual([]);
  });

  test("warns when a count of one takes a plural noun", () => {
    expect(rules("Found 1 checks.")).toEqual(["render:warn"]);
    expect(rules("Found 1 check and 1 series and 1 status.")).toEqual([]);
    expect(rules("Step 1 runs first. Version 2.1 builds.")).toEqual([]);
    expect(rules("Took 1.1 seconds.")).toEqual([]);
  });
});

describe("generated", () => {
  test("flags a significance closer in the last sentence only", () => {
    expect(rules("The court ruled on Monday. The ruling underscores a shift.", "generated")).toEqual(["generated:error"]);
    expect(rules("The ruling underscores a shift. The court ruled on Monday.", "generated")).toEqual([]);
  });

  test("flags process narration, relative dates, and quote glosses", () => {
    expect(rules("The page returned 403 at clip time.", "generated")).toEqual(["generated:error", "generated:error"]);
    expect(rules("The board met today.", "generated")).toEqual(["generated:error"]);
    expect(rules("Ada Example, stating the governing claim.", "generated")).toEqual(["generated:error"]);
  });

  test("does not apply to human-written body text", () => {
    expect(rules("The board met today. It marks a change.", "body")).toEqual([]);
  });
});

describe("lintCopy", () => {
  test("never throws and reports the location it was given", () => {
    const surfaces = ["title", "description", "social", "alt", "heading", "body", "generated", "reference", "agent"] as const;
    fc.assert(fc.property(fc.string({ maxLength: 400 }), fc.constantFrom(...surfaces), (text, surface) => {
      for (const finding of lintCopy(text, { surface, location: "loc" })) {
        expect(finding.location).toBe("loc");
        expect(finding.surface).toBe(surface);
        expect(finding.hint.length).toBeGreaterThan(0);
      }
    }));
  });

  test("hints follow the house style they enforce", () => {
    const samples = [`A ${EM} B`, "honest", "Atet", "1 checks", "`x`", "receipt", "today", `${"a".repeat(200)}`];
    for (const surface of ["description", "generated", "title"] as const) {
      for (const sample of samples) {
        for (const finding of lintCopy(sample, { surface, location: "x" })) {
          expect(lintCopy(finding.hint, { surface: "body", location: "hint" }).filter(f => f.rule === "emdash")).toEqual([]);
        }
      }
    }
  });

  test("splits sentences after terminal punctuation", () => {
    const text = "One. Two! “Three?” Four";
    expect(sentenceSpans(text).map(span => text.slice(span.start, span.end).trim())).toEqual(["One.", "Two!", "“Three?”", "Four"]);
  });
});
