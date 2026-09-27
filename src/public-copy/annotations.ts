/** GitHub Actions annotations for copy findings, so an advisory run shows its findings on the pull request. */
import { stripLocationSuffix } from "./scanners.js";
import type { CopyFinding } from "./types.js";

/** Escape a GitHub Actions workflow command value. Properties also escape `:` and `,`. */
function escapeData(value: string): string {
  return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}
function escapeProperty(value: string): string {
  return escapeData(value).replaceAll(":", "%3A").replaceAll(",", "%2C");
}

/** One `::warning` or `::error` workflow command. Advisory runs annotate every finding as a warning. */
export function annotation(finding: CopyFinding, advisory: boolean): string {
  const level = advisory || finding.severity !== "error" ? "warning" : "error";
  const file = stripLocationSuffix(finding.location);
  const line = /:(\d+)$/.exec(finding.location)?.[1];
  const where = finding.location.includes("#") ? ` (${finding.location.slice(finding.location.indexOf("#") + 1)})` : "";
  const props = [`file=${escapeProperty(file)}`, ...(line ? [`line=${line}`] : []), `title=${escapeProperty(`copy lint: ${finding.rule}`)}`];
  return `::${level} ${props.join(",")}::${escapeData(`${finding.excerpt}${where} · ${finding.hint}`)}`;
}
