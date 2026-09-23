/**
 * Test helpers that pin facts instead of prose. Each throws `CopyAssertionError` on failure, so they
 * work in `bun:test`, Vitest, Jest, and `node:test` without an adapter.
 */
import { checkInstallPins, findInstallPins } from "./pins.js";
import type { PackageIdentity } from "./pins.js";
import { lintCopy } from "./rules.js";
import type { CopyConfig, CopySurface } from "./types.js";

export class CopyAssertionError extends Error {
  override readonly name = "CopyAssertionError";
}

export interface InstallPinOptions {
  /** Require at least one pin to the package. Defaults to true, so a README that drops its install line fails. */
  readonly require?: boolean;
}

/** Every install pin in `readme` names the version in `package.json`. */
export function expectInstallPinsMatch(readme: string, pkg: PackageIdentity, options: InstallPinOptions = {}): void {
  const pins = findInstallPins(readme, pkg);
  if ((options.require ?? true) && pins.length === 0) {
    throw new CopyAssertionError(`Expected an install line that pins ${pkg.name} to ${pkg.version}; found none.`);
  }
  const stale = checkInstallPins([{ location: "readme", text: readme }], pkg);
  if (stale.length) {
    throw new CopyAssertionError(`Install pins do not match ${pkg.name}@${pkg.version}:\n${stale.map(f => `  ${f.excerpt}`).join("\n")}`);
  }
}

const RUN_URL = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/([1-9]\d{9,})(?:\/job\/\d+|\/attempts\/\d+)?\/?$/;

/** A GitHub Actions run link with a real run ID (10 or more digits), never a placeholder. */
export function expectRealRunUrl(url: string): void {
  if (!RUN_URL.test(url)) {
    throw new CopyAssertionError(`Expected a GitHub Actions run URL such as https://github.com/owner/repo/actions/runs/1234567890; got ${url}.`);
  }
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const INVARIANT_NOUNS = new Set(["series", "species", "sheep", "fish", "data", "information", "news"]);

function nounAfterCount(text: string, count: number): string | undefined {
  const forms = [String(count)];
  const word = NUMBER_WORDS[count];
  if (word) forms.push(word);
  if (count === 0) forms.push("no");
  const pattern = new RegExp(`(?<![\\w.,])(?:${forms.join("|")})(?![\\w.,])\\s+([A-Za-z][A-Za-z-]*)`, "i");
  return pattern.exec(text)?.[1]?.toLowerCase();
}

/**
 * `render(n)` states the count with a noun that agrees: one form for 1 and another for every other count.
 * Pass the counts to try; the default is zero, one, and several.
 */
export function expectCountAgreement(render: (count: number) => string, counts: readonly number[] = [0, 1, 3]): void {
  const nouns = new Map<number, string>();
  for (const count of counts) {
    const text = render(count);
    const noun = nounAfterCount(text, count);
    if (!noun) throw new CopyAssertionError(`render(${count}) does not state the count before a noun: “${text}”.`);
    nouns.set(count, noun);
  }
  const singular = nouns.get(1);
  const plurals = [...nouns].filter(([count]) => count !== 1);
  for (const [count, noun] of plurals) {
    if (singular !== undefined && noun === singular && !INVARIANT_NOUNS.has(noun)) {
      throw new CopyAssertionError(`render(1) and render(${count}) use the same noun “${noun}”. One takes the singular; other counts take the plural.`);
    }
    const first = plurals[0]?.[1];
    if (first !== undefined && noun !== first) {
      throw new CopyAssertionError(`render(${plurals[0]?.[0]}) uses “${first}” but render(${count}) uses “${noun}”.`);
    }
  }
}

/** No internal vocabulary or precision stack in `text` on this surface. */
export function expectNoInternalVocabulary(text: string, surface: CopySurface = "body", config?: CopyConfig): void {
  const findings = lintCopy(text, { surface, location: "text", ...(config ? { config } : {}) }).filter(f => f.rule === "vocab");
  if (findings.length) {
    throw new CopyAssertionError(`Internal vocabulary on a ${surface} surface:\n${findings.map(f => `  ${f.excerpt} (${f.hint})`).join("\n")}`);
  }
}
