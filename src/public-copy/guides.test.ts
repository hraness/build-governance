import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import { checkGuideText, guideCanonicalHash, readGuideStamp } from "./guides.ts";

const repoRoot = join(import.meta.dir, "..", "..");

/** The stamping step of sync_guides.py, for generated fixtures. */
function stamp(name: string, canonicalBody: string, additions?: string): string {
  const body = canonicalBody.replace(/\s+$/, "") + "\n";
  const digest = createHash("sha256").update(body, "utf8").digest("hex");
  const newline = body.indexOf("\n");
  const title = body.slice(0, newline);
  const rest = body.slice(newline + 1);
  const canon = `${title}\n\n<!-- synced from hraness/.github ${name} sha256:${digest} -->\n${rest}`;
  return additions === undefined ? canon : `${canon.replace(/\s+$/, "")}\n\n## Repository additions\n\n${additions}\n`;
}

describe("checkGuideText", () => {
  test("accepts the guides sync_guides.py wrote into this repository", () => {
    for (const name of ["STYLE.md", "WRITING.md"]) {
      const text = readFileSync(join(repoRoot, name), "utf8");
      expect(readGuideStamp(text)?.name).toBe(name);
      expect(checkGuideText(name, text)).toEqual([]);
    }
  });

  test("accepts any change under Repository additions and rejects any change above it", () => {
    const base = "# Public writing style\n\nThis guide covers public copy.\n\n## Use a direct voice\n\n- State what the object does.\n";
    const synced = stamp("STYLE.md", base, "- A local rule.");
    expect(checkGuideText("STYLE.md", synced)).toEqual([]);
    expect(checkGuideText("STYLE.md", synced.replace("A local rule.", "A different local rule."))).toEqual([]);
    const edited = synced.replace("State what the object does.", "State what the object does, loudly.");
    expect(checkGuideText("STYLE.md", edited).map(f => f.rule)).toEqual(["guides"]);
  });

  test("detects an edit to any line of the shared text", () => {
    const lines = fc.array(fc.stringMatching(/^[A-Za-z]{1,10}(?:[ ,.][A-Za-z]{1,10}){0,3}$/), { minLength: 1, maxLength: 12 });
    fc.assert(fc.property(lines, fc.nat(), (body, pick) => {
      const base = `# Guide\n\n${body.map(line => `- ${line}`).join("\n")}\n`;
      const synced = stamp("WRITING.md", base, "- Local.");
      expect(checkGuideText("WRITING.md", synced)).toEqual([]);
      const target = `- ${body[pick % body.length]}`;
      const edited = synced.replace(target, `${target}!`);
      expect(checkGuideText("WRITING.md", edited)).toHaveLength(1);
    }));
  });

  test("reports a missing stamp and a stamp for another file", () => {
    expect(checkGuideText("STYLE.md", "# Public writing style\n\nText.\n")[0]?.hint).toContain("no sync stamp");
    const writing = stamp("WRITING.md", "# Writing\n\nText.\n");
    expect(checkGuideText("STYLE.md", writing).map(f => f.hint)).toEqual([expect.stringContaining("The stamp names WRITING.md")]);
  });

  test("ignores trailing whitespace and CRLF line endings", () => {
    const synced = stamp("STYLE.md", "# Guide\n\nText.\n");
    expect(guideCanonicalHash(`${synced}\n\n`)).toBe(readGuideStamp(synced)?.sha256);
    expect(checkGuideText("STYLE.md", synced.replace(/\n/g, "\r\n"))).toEqual([]);
  });
});
