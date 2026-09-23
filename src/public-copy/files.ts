/**
 * File-system adapter for the public-copy lint: reads the files a config names and runs the pure checks.
 * The rules themselves live in modules without I/O.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseBaseline, serializeBaseline } from "./baseline.js";
import type { CopyCounts } from "./baseline.js";
import { DEFAULT_BASELINE_FILE, DEFAULT_CONFIG_FILE, parseCopyConfig } from "./config.js";
import { checkGuideText, SYNCED_GUIDES } from "./guides.js";
import { extractHtml } from "./html.js";
import { selectJsonPath } from "./json-path.js";
import { lintMarkdown } from "./markdown.js";
import type { MarkdownKind } from "./markdown.js";
import { checkInstallPins } from "./pins.js";
import type { TextSource } from "./pins.js";
import { excerptAt, lintCopy } from "./rules.js";
import type { CopyConfig, CopyFinding } from "./types.js";

export interface GuideCheckOptions {
  /** Report a missing STYLE.md or WRITING.md. */
  readonly required?: boolean;
}

/** Check that each synced guide's shared text still matches its stamped SHA-256. */
export function checkGuides(repoRoot: string, options: GuideCheckOptions = {}): CopyFinding[] {
  const findings: CopyFinding[] = [];
  for (const name of SYNCED_GUIDES) {
    const path = join(repoRoot, name);
    if (!existsSync(path)) {
      if (options.required) {
        findings.push({ rule: "guides", severity: "error", surface: "reference", location: name, excerpt: "",
          hint: `${name} is missing. Sync it from hraness/.github with sync_guides.py.` });
      }
      continue;
    }
    findings.push(...checkGuideText(name, readFileSync(path, "utf8"), name));
  }
  return findings;
}

const ALWAYS_EXCLUDED = ["node_modules/**", "**/node_modules/**", ".git/**"];

function expand(root: string, patterns: readonly string[], exclude: readonly string[]): string[] {
  const skip = [...ALWAYS_EXCLUDED, ...exclude].map(pattern => new Bun.Glob(pattern));
  const files = new Set<string>();
  for (const pattern of patterns) {
    if (!/[*?[{]/.test(pattern)) {
      if (existsSync(join(root, pattern))) files.add(pattern);
      continue;
    }
    for (const file of new Bun.Glob(pattern).scanSync({ cwd: root, onlyFiles: true })) {
      const path = file.replaceAll("\\", "/");
      if (!skip.some(glob => glob.match(path))) files.add(path);
    }
  }
  return [...files].sort();
}

function read(root: string, file: string): string {
  return readFileSync(join(root, file), "utf8");
}

export interface PublicCopyResult {
  readonly findings: readonly CopyFinding[];
  readonly files: readonly string[];
}

/** Run every configured check over the files under `root`. */
export function runPublicCopy(root: string, config: CopyConfig): PublicCopyResult {
  const exclude = config.exclude ?? [];
  const findings: CopyFinding[] = [];
  const raw: TextSource[] = [];
  const descriptions = new Map<string, string[]>();
  const noteDescription = (text: string, location: string): void => {
    const key = text.replace(/\s+/g, " ").trim().toLowerCase();
    if (!key) return;
    descriptions.set(key, [...(descriptions.get(key) ?? []), location]);
  };

  const kinds = new Map<string, MarkdownKind>();
  for (const file of expand(root, config.markdown ?? [], exclude)) kinds.set(file, "body");
  for (const file of expand(root, config.reference ?? [], exclude)) kinds.set(file, "reference");
  for (const file of expand(root, config.generated ?? [], exclude)) kinds.set(file, "generated");
  for (const [file, kind] of [...kinds].sort(([a], [b]) => a.localeCompare(b))) {
    const text = read(root, file);
    raw.push({ location: file, text });
    const fileFindings = lintMarkdown(text, file, config, { kind });
    findings.push(...fileFindings);
    const normalized = text.replace(/\r\n?/g, "\n");
    const frontEnd = normalized.startsWith("---\n") ? normalized.indexOf("\n---", 3) : -1;
    const description = frontEnd === -1 ? undefined : /^description:\s*(.+)$/m.exec(normalized.slice(4, frontEnd))?.[1];
    if (description) noteDescription(description.trim().replace(/^(["'])(.*)\1$/, "$2"), file);
  }

  const htmlFiles = expand(root, config.html ?? [], exclude);
  for (const file of htmlFiles) {
    const html = read(root, file);
    raw.push({ location: file, text: html });
    for (const item of extractHtml(html, file)) {
      findings.push(...lintCopy(item.text, {
        surface: item.surface, location: item.location, config, format: "html",
        ...(item.field ? { field: item.field } : {}),
      }));
      if (item.surface === "description" && item.location.endsWith("#meta[name=description]")) noteDescription(item.text, item.location);
    }
  }

  const textFiles: string[] = [];
  for (const entry of config.text ?? []) {
    const path = join(root, entry.file);
    if (!existsSync(path)) throw new Error(`text file not found: ${entry.file}`);
    const text = read(root, entry.file);
    textFiles.push(entry.file);
    raw.push({ location: entry.file, text });
    if (entry.surface === "body" || entry.surface === "agent" || entry.surface === "generated" || entry.surface === "reference") {
      findings.push(...lintMarkdown(text, entry.file, config, { kind: entry.surface }));
    } else {
      findings.push(...lintCopy(text.trim(), { surface: entry.surface, location: `${entry.file}:1`, config }));
    }
  }

  const jsonFiles: string[] = [];
  for (const entry of config.json ?? []) {
    const path = join(root, entry.file);
    if (!existsSync(path)) throw new Error(`json file not found: ${entry.file}`);
    const parsed: unknown = JSON.parse(read(root, entry.file));
    jsonFiles.push(entry.file);
    for (const match of selectJsonPath(parsed, entry.path)) {
      if (typeof match.value !== "string") continue;
      findings.push(...lintCopy(match.value, { surface: entry.surface, location: `${entry.file}#${match.path}`, config }));
    }
  }

  if (config.package) {
    const manifest = JSON.parse(read(root, config.package)) as Record<string, unknown>;
    const name = manifest.name;
    const version = manifest.version;
    if (typeof name !== "string" || typeof version !== "string") throw new Error(`${config.package} needs a name and a version.`);
    const repository = typeof manifest.repository === "string" ? manifest.repository
      : typeof manifest.repository === "object" && manifest.repository !== null && typeof (manifest.repository as { url?: unknown }).url === "string"
        ? (manifest.repository as { url: string }).url : undefined;
    findings.push(...checkInstallPins(raw, { name, version, ...(repository ? { repository } : {}) }));
    if (typeof manifest.description === "string") {
      findings.push(...lintCopy(manifest.description, { surface: "description", field: "package", location: `${config.package}#description`, config }));
    }
  }

  for (const [key, locations] of descriptions) {
    const files = new Set(locations.map(location => location.split("#")[0]));
    if (files.size < 2) continue;
    for (const location of locations) {
      const others = locations.filter(other => other !== location).map(other => other.split("#")[0]);
      findings.push({ rule: "meta", severity: "error", surface: "description", location, excerpt: excerptAt(key, 0, 80),
        hint: `The same description appears on ${others.join(", ")}. Write a unique description for each page.` });
    }
  }

  if (config.guides !== false) findings.push(...checkGuides(root, { required: config.guides === "required" }));

  const files = [...new Set([...kinds.keys(), ...htmlFiles, ...textFiles, ...jsonFiles])].sort();
  return { findings: sortFindings(findings), files };
}

export function sortFindings(findings: readonly CopyFinding[]): CopyFinding[] {
  const lineOf = (location: string): number => Number(/:(\d+)$/.exec(location)?.[1] ?? 0);
  const fileOf = (location: string): string => location.replace(/(?:#.*|:\d+)$/, "");
  return [...findings].sort((a, b) =>
    fileOf(a.location).localeCompare(fileOf(b.location)) || lineOf(a.location) - lineOf(b.location) ||
    a.location.localeCompare(b.location) || a.rule.localeCompare(b.rule) || a.excerpt.localeCompare(b.excerpt));
}

export function loadCopyConfig(root: string, configPath = DEFAULT_CONFIG_FILE): CopyConfig {
  const path = resolve(root, configPath);
  if (!existsSync(path)) throw new Error(`No ${relative(root, path) || configPath} in ${root}.`);
  return parseCopyConfig(JSON.parse(readFileSync(path, "utf8")));
}

export function baselinePath(root: string, config: CopyConfig): string {
  return resolve(root, config.baseline ?? DEFAULT_BASELINE_FILE);
}

/** The recorded counts, or undefined when the repository has no baseline yet. */
export function readBaseline(root: string, config: CopyConfig): CopyCounts | undefined {
  const path = baselinePath(root, config);
  if (!existsSync(path)) return undefined;
  return parseBaseline(JSON.parse(readFileSync(path, "utf8"))).counts;
}

export function writeBaseline(root: string, config: CopyConfig, counts: CopyCounts): void {
  writeFileSync(baselinePath(root, config), serializeBaseline(counts));
}

