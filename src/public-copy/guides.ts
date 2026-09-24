import { createHash } from "node:crypto";
import type { CopyFinding } from "./types.js";

/** Guides synced from hraness/.github into each repository. */
export const SYNCED_GUIDES: readonly string[] = ["STYLE.md", "WRITING.md"];

export const REPOSITORY_ADDITIONS_HEADING = "## Repository additions";

const STAMP = /\n\n<!-- synced from hraness\/\.github (\S+) sha256:([0-9a-f]{64}) -->\n/;

export interface GuideStamp {
  readonly name: string;
  readonly sha256: string;
}

/** Read the sync stamp that `sync_guides.py` writes after the title. */
export function readGuideStamp(text: string): GuideStamp | undefined {
  const match = STAMP.exec(text.replace(/\r\n?/g, "\n"));
  return match?.[1] && match[2] ? { name: match[1], sha256: match[2] } : undefined;
}

/**
 * The SHA-256 of the canonical text above "## Repository additions", computed the way
 * `sync_guides.py` computes it: the stamp line removed and the text ending in one newline.
 */
export function guideCanonicalHash(text: string): string | undefined {
  const normalized = text.replace(/\r\n?/g, "\n");
  const additions = normalized.indexOf(`\n${REPOSITORY_ADDITIONS_HEADING}`);
  const above = (additions === -1 ? normalized : normalized.slice(0, additions)).replace(/\s+$/, "") + "\n";
  if (!STAMP.test(above)) return undefined;
  const body = above.replace(STAMP, "\n");
  return createHash("sha256").update(body, "utf8").digest("hex");
}

/** Check one synced guide's text against its stamp. */
export function checkGuideText(name: string, text: string, location = name): CopyFinding[] {
  const finding = (hint: string, excerpt: string): CopyFinding => ({
    rule: "guides", severity: "error", surface: "reference", location, excerpt, hint,
  });
  const stamp = readGuideStamp(text);
  if (!stamp) {
    return [finding(
      `${name} has no sync stamp. Run sync_guides.py from hraness/.github to replace it with the canonical copy.`,
      text.split("\n", 1)[0] ?? "",
    )];
  }
  const findings: CopyFinding[] = [];
  if (stamp.name !== name) {
    findings.push(finding(`The stamp names ${stamp.name}, but this file is ${name}.`, `sha256:${stamp.sha256}`));
  }
  const actual = guideCanonicalHash(text);
  if (actual !== stamp.sha256) {
    findings.push(finding(
      `The shared text in ${name} was edited after the sync (sha256 ${actual?.slice(0, 12) ?? "missing"}, stamp ${stamp.sha256.slice(0, 12)}). ` +
        `Change shared rules in hraness/.github and resync; put local rules under “Repository additions”.`,
      `sha256:${stamp.sha256}`,
    ));
  }
  return findings;
}
