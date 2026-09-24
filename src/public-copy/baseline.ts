import type { CopyFinding } from "./types.js";

/** Error counts per file, then per rule. */
export type CopyCounts = Readonly<Record<string, Readonly<Record<string, number>>>>;

export interface CopyBaseline {
  readonly version: 1;
  readonly counts: CopyCounts;
}

export interface CountChange {
  readonly file: string;
  readonly rule: string;
  readonly baseline: number;
  readonly current: number;
}

export interface BaselineComparison {
  /** Counts that rose above the baseline, including findings in files or rules the baseline lacks. */
  readonly regressions: readonly CountChange[];
  /** Counts that fell below the baseline. `--update-baseline` records them. */
  readonly improvements: readonly CountChange[];
}

/** The file part of a `file:line` or `file#selector` location. */
export function fileOfLocation(location: string): string {
  const hash = location.indexOf("#");
  const withoutSelector = hash === -1 ? location : location.slice(0, hash);
  return withoutSelector.replace(/:\d+(?::\d+)?$/, "");
}

/** Count error findings per file and rule. Warnings are reported but never ratcheted. */
export function countFindings(findings: readonly CopyFinding[]): CopyCounts {
  const counts: Record<string, Record<string, number>> = {};
  for (const finding of findings) {
    if (finding.severity !== "error") continue;
    const file = fileOfLocation(finding.location);
    const rules = (counts[file] ??= {});
    rules[finding.rule] = (rules[finding.rule] ?? 0) + 1;
  }
  return normalizeCounts(counts);
}

/** Sort keys and drop zero counts, so equal counts serialize to equal bytes. */
export function normalizeCounts(counts: CopyCounts): CopyCounts {
  const result: Record<string, Record<string, number>> = {};
  for (const file of Object.keys(counts).sort()) {
    const rules = counts[file] ?? {};
    const kept: Record<string, number> = {};
    for (const rule of Object.keys(rules).sort()) {
      const count = rules[rule] ?? 0;
      if (count > 0) kept[rule] = count;
    }
    if (Object.keys(kept).length) result[file] = kept;
  }
  return result;
}

function keys(counts: CopyCounts): Array<[string, string]> {
  return Object.entries(counts).flatMap(([file, rules]) => Object.keys(rules).map(rule => [file, rule] as [string, string]));
}

function countOf(counts: CopyCounts, file: string, rule: string): number {
  return counts[file]?.[rule] ?? 0;
}

/** Compare current counts with the baseline. The check fails when any count rose. */
export function compareBaseline(current: CopyCounts, baseline: CopyCounts): BaselineComparison {
  const regressions: CountChange[] = [];
  const improvements: CountChange[] = [];
  const seen = new Set<string>();
  for (const [file, rule] of [...keys(current), ...keys(baseline)]) {
    const key = `${file}\u0000${rule}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const now = countOf(current, file, rule);
    const before = countOf(baseline, file, rule);
    if (now > before) regressions.push({ file, rule, baseline: before, current: now });
    else if (now < before) improvements.push({ file, rule, baseline: before, current: now });
  }
  const order = (a: CountChange, b: CountChange): number => a.file.localeCompare(b.file) || a.rule.localeCompare(b.rule);
  return { regressions: regressions.sort(order), improvements: improvements.sort(order) };
}

/**
 * The baseline after `--update-baseline`: each count becomes the lower of the recorded and current
 * count. It never raises a count and never adds a file or rule.
 */
export function lowerBaseline(baseline: CopyCounts, current: CopyCounts): CopyCounts {
  const result: Record<string, Record<string, number>> = {};
  for (const [file, rule] of keys(baseline)) {
    const lowered = Math.min(countOf(baseline, file, rule), countOf(current, file, rule));
    if (lowered > 0) (result[file] ??= {})[rule] = lowered;
  }
  return normalizeCounts(result);
}

/** Validate a parsed `.public-copy-baseline.json`. */
export function parseBaseline(value: unknown): CopyBaseline {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("The baseline must be a JSON object.");
  const record = value as Record<string, unknown>;
  if (record.version !== 1) throw new Error("The baseline version must be 1.");
  const counts = record.counts;
  if (typeof counts !== "object" || counts === null || Array.isArray(counts)) throw new Error("The baseline counts must be an object.");
  const parsed: Record<string, Record<string, number>> = {};
  for (const [file, rules] of Object.entries(counts)) {
    if (typeof rules !== "object" || rules === null || Array.isArray(rules)) throw new Error(`The baseline entry for ${file} must be an object.`);
    for (const [rule, count] of Object.entries(rules)) {
      if (!Number.isSafeInteger(count) || (count as number) < 0) throw new Error(`The baseline count for ${file} ${rule} must be a non-negative integer.`);
      (parsed[file] ??= {})[rule] = count as number;
    }
  }
  return { version: 1, counts: normalizeCounts(parsed) };
}

export function serializeBaseline(counts: CopyCounts): string {
  return `${JSON.stringify({ version: 1, counts: normalizeCounts(counts) }, null, 2)}\n`;
}
