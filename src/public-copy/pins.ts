import { excerptAt } from "./rules.js";
import type { CopyFinding } from "./types.js";

export interface PackageIdentity {
  readonly name: string;
  readonly version: string;
  /**
   * `owner/repo`, a repository URL, or package.json's `{ type, url }` object. Derived from an
   * `@hraness/<name>` package name when omitted.
   */
  readonly repository?: string | { readonly url?: string };
}

export interface TextSource {
  readonly location: string;
  readonly text: string;
}

const SEMVER = String.raw`(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?`;

interface Version {
  readonly parts: readonly [number, number, number];
  readonly prerelease: string | undefined;
}

export function parseVersion(value: string): Version | undefined {
  const match = new RegExp(`^v?${SEMVER}$`).exec(value.trim());
  if (!match) return undefined;
  return { parts: [Number(match[1]), Number(match[2]), Number(match[3])], prerelease: match[4]?.slice(1) };
}

/** Negative when `left` is older than `right`. A prerelease is older than its release. */
export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) throw new Error(`Not a semantic version: ${a ? right : left}`);
  for (let index = 0; index < 3; index += 1) {
    const difference = (a.parts[index] ?? 0) - (b.parts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  if (a.prerelease === b.prerelease) return 0;
  if (a.prerelease === undefined) return 1;
  if (b.prerelease === undefined) return -1;
  return a.prerelease < b.prerelease ? -1 : 1;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The repository slug a package is released from, such as `hraness/build-governance`. */
export function repositoryFor(pkg: PackageIdentity): string | undefined {
  const raw = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
  if (raw) {
    const match = /github\.com[/:]([^/]+\/[^/#]+?)(?:\.git)?(?:#.*)?$/.exec(raw);
    return match?.[1] ?? raw.replace(/\.git$/, "");
  }
  const scoped = /^@hraness\/(.+)$/.exec(pkg.name);
  return scoped?.[1] ? `hraness/${scoped[1]}` : undefined;
}

function withLine(location: string, text: string, index: number): string {
  if (/:\d+$/.test(location) || location.includes("#")) return location;
  const line = text.slice(0, index).split("\n").length;
  return `${location}:${line}`;
}

/** Each place a text pins this package to a version: npm specs, git tags, and release downloads. */
export function findInstallPins(text: string, pkg: PackageIdentity): Array<{ index: number; match: string; version: string }> {
  const patterns: RegExp[] = [
    new RegExp(`(?<![\\w@/-])${escapeRegExp(pkg.name)}@v?${SEMVER}(?![\\w.])`, "g"),
  ];
  const repository = repositoryFor(pkg);
  if (repository) {
    const slug = escapeRegExp(repository);
    patterns.push(new RegExp(`(?<![\\w-])${slug}(?:\\.git)?#v?${SEMVER}(?![\\w.])`, "g"));
    patterns.push(new RegExp(`github\\.com/${slug}/releases/download/v?${SEMVER}(?![\\w.])`, "g"));
  }
  const pins: Array<{ index: number; match: string; version: string }> = [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const version = `${match[1]}.${match[2]}.${match[3]}${match[4] ?? ""}`;
      pins.push({ index: match.index, match: match[0], version });
    }
  }
  return pins.sort((a, b) => a.index - b.index);
}

const PLACEHOLDER_RUN = /\/runs\/0+(?![0-9])/g;

/**
 * Find install commands that pin this package to an older version than `package.json`,
 * and run links with placeholder IDs such as `/runs/0`.
 */
export function checkInstallPins(texts: readonly TextSource[], pkg: PackageIdentity): CopyFinding[] {
  if (!parseVersion(pkg.version)) throw new Error(`package.json version is not a semantic version: ${pkg.version}`);
  const findings: CopyFinding[] = [];
  for (const { location, text } of texts) {
    for (const pin of findInstallPins(text, pkg)) {
      if (compareVersions(pin.version, pkg.version) >= 0) continue;
      findings.push({
        rule: "pins",
        severity: "error",
        surface: "body",
        location: withLine(location, text, pin.index),
        excerpt: excerptAt(text, pin.index, pin.match.length),
        hint: `This pins ${pkg.name} to ${pin.version}; package.json is ${pkg.version}. Derive install lines from the package version.`,
      });
    }
    for (const match of text.matchAll(PLACEHOLDER_RUN)) {
      findings.push({
        rule: "pins",
        severity: "error",
        surface: "body",
        location: withLine(location, text, match.index),
        excerpt: excerptAt(text, match.index, match[0].length),
        hint: "This run link has a placeholder ID. Link a real run or remove the link.",
      });
    }
  }
  return findings;
}
