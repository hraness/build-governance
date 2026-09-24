import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import {
  compareBaseline,
  countFindings,
  fileOfLocation,
  lowerBaseline,
  normalizeCounts,
  parseBaseline,
  serializeBaseline,
} from "./baseline.ts";
import type { CopyCounts } from "./baseline.ts";
import type { CopyFinding } from "./types.ts";

const files = ["README.md", "docs/a.md", "site/index.html"];
const rules = ["emdash", "vocab", "meta", "render"];

const counts: fc.Arbitrary<CopyCounts> = fc.dictionary(
  fc.constantFrom(...files),
  fc.dictionary(fc.constantFrom(...rules), fc.nat(6)),
).map(normalizeCounts);

const get = (value: CopyCounts, file: string, rule: string): number => value[file]?.[rule] ?? 0;
const everyKey = (fn: (file: string, rule: string) => void): void => {
  for (const file of files) for (const rule of rules) fn(file, rule);
};

/** Pointwise lower-or-equal pair: `lower` never exceeds `upper`. */
const dominated: fc.Arbitrary<[CopyCounts, CopyCounts]> = counts.chain(upper => {
  const entries = Object.entries(upper).flatMap(([file, byRule]) => Object.entries(byRule).map(([rule, count]) => ({ file, rule, count })));
  return fc.tuple(...entries.map(entry => fc.nat(entry.count))).map(values => {
    const lower: Record<string, Record<string, number>> = {};
    entries.forEach((entry, index) => {
      (lower[entry.file] ??= {})[entry.rule] = values[index] ?? 0;
    });
    return [normalizeCounts(lower), upper] as [CopyCounts, CopyCounts];
  });
});

describe("ratchet properties", () => {
  test("lowering never raises a count or adds a key", () => {
    fc.assert(fc.property(counts, counts, (baseline, current) => {
      const lowered = lowerBaseline(baseline, current);
      everyKey((file, rule) => {
        expect(get(lowered, file, rule)).toBeLessThanOrEqual(get(baseline, file, rule));
        expect(get(lowered, file, rule)).toBe(Math.min(get(baseline, file, rule), get(current, file, rule)));
      });
    }));
  });

  test("lowering is idempotent and order-independent", () => {
    fc.assert(fc.property(counts, counts, counts, (baseline, first, second) => {
      const once = lowerBaseline(baseline, first);
      expect(lowerBaseline(once, first)).toEqual(once);
      expect(lowerBaseline(lowerBaseline(baseline, first), second)).toEqual(lowerBaseline(lowerBaseline(baseline, second), first));
    }));
  });

  test("the check fails exactly when some count rose", () => {
    fc.assert(fc.property(counts, counts, (current, baseline) => {
      let rose = false;
      everyKey((file, rule) => {
        if (get(current, file, rule) > get(baseline, file, rule)) rose = true;
      });
      expect(compareBaseline(current, baseline).regressions.length > 0).toBe(rose);
    }));
  });

  test("lowering the baseline neither hides nor adds a regression", () => {
    fc.assert(fc.property(counts, counts, (baseline, current) => {
      const before = compareBaseline(current, baseline);
      const after = compareBaseline(current, lowerBaseline(baseline, current));
      expect(after.regressions).toEqual(before.regressions);
      expect(after.improvements).toEqual([]);
    }));
  });

  test("fixing findings never fails a passing check", () => {
    fc.assert(fc.property(dominated, counts, ([fewer, current], extra) => {
      const baseline = normalizeCounts({ ...extra, ...current });
      if (compareBaseline(current, baseline).regressions.length === 0) {
        expect(compareBaseline(fewer, baseline).regressions).toEqual([]);
      }
    }));
  });

  test("a baseline recorded from the current counts passes and stays fixed", () => {
    fc.assert(fc.property(counts, current => {
      expect(compareBaseline(current, current)).toEqual({ regressions: [], improvements: [] });
      expect(lowerBaseline(current, current)).toEqual(current);
    }));
  });

  test("serialization round-trips and is canonical", () => {
    fc.assert(fc.property(counts, value => {
      const bytes = serializeBaseline(value);
      const parsed = parseBaseline(JSON.parse(bytes));
      expect(parsed.counts).toEqual(value);
      expect(serializeBaseline(parsed.counts)).toBe(bytes);
    }));
  });
});

describe("counts", () => {
  const finding = (location: string, rule: CopyFinding["rule"], severity: CopyFinding["severity"] = "error"): CopyFinding =>
    ({ rule, severity, surface: "body", location, excerpt: "", hint: "" });

  test("counts errors per file and rule and ignores warnings", () => {
    expect(countFindings([
      finding("README.md:3", "emdash"),
      finding("README.md:9", "emdash"),
      finding("README.md:9", "vocab", "warn"),
      finding("site/index.html#h2[2]", "vocab"),
      finding("package.json#description", "vocab"),
    ])).toEqual({ "README.md": { emdash: 2 }, "package.json": { vocab: 1 }, "site/index.html": { vocab: 1 } });
  });

  test("takes the file from line and selector locations", () => {
    expect(fileOfLocation("docs/a.md:12")).toBe("docs/a.md");
    expect(fileOfLocation("docs/a.md:12:4")).toBe("docs/a.md");
    expect(fileOfLocation("site/index.html#meta[og:title]")).toBe("site/index.html");
    expect(fileOfLocation("registry.json#$.projects[0].description")).toBe("registry.json");
    expect(fileOfLocation("STYLE.md")).toBe("STYLE.md");
  });

  test("rejects malformed baselines", () => {
    expect(() => parseBaseline({ version: 2, counts: {} })).toThrow();
    expect(() => parseBaseline({ version: 1, counts: { a: { emdash: -1 } } })).toThrow();
    expect(() => parseBaseline({ version: 1, counts: { a: { emdash: 1.5 } } })).toThrow();
    expect(() => parseBaseline({ version: 1, counts: [] })).toThrow();
    expect(parseBaseline({ version: 1, counts: { a: { emdash: 0 } } }).counts).toEqual({});
  });
});
