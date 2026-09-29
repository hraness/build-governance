/**
 * File-system adapter for the public-copy lint: reads the files a config names and runs the pure checks.
 * The rules themselves live in modules without I/O.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseBaseline, serializeBaseline } from "./baseline.js";
import type { CopyCounts } from "./baseline.js";
import { DEFAULT_BASELINE_FILE, DEFAULT_CONFIG_FILE, parseCopyConfig } from "./config.js";
import { lintCliHelp } from "./cli-help.js";
import { checkGuideText, SYNCED_GUIDES } from "./guides.js";
import { extractHtml } from "./html.js";
import { selectJsonPath } from "./json-path.js";
import { lintMarkdown } from "./markdown.js";
import type { MarkdownKind } from "./markdown.js";
import { checkCommands, checkEnvelope, checkTuiMatchesStatus } from "./control.js";
import { trayHelpFindings, trayPathFindings, trayTextFindings } from "./tray.js";
import { checkInstallPins } from "./pins.js";
import type { TextSource } from "./pins.js";
import { excerptAt, lintCopy } from "./rules.js";
import { stripLocationSuffix } from "./scanners.js";
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

/** The config sections `--only` can select. `markdown` also covers `reference` and `generated`. */
export type CopySection = "markdown" | "html" | "text" | "json" | "package" | "guides" | "cli" | "control" | "tray";

export const COPY_SECTIONS: readonly CopySection[] = ["markdown", "html", "text", "json", "package", "guides", "cli", "control", "tray"];

export interface RunPublicCopyOptions {
  /** Run only these sections. Default: every section the config names. */
  readonly only?: ReadonlySet<CopySection>;
}

/** Paths the tray guard never reads: dependencies, build output of other tools, and VCS data. */
export const TRAY_ALWAYS_EXCLUDED = ["**/target/**", "**/.venv/**", "**/vendor/**"];

/** Tracked files under `root` (from git when it is a repository, else every file), minus the exclusions. */
function trackedFiles(root: string, exclude: readonly string[]): string[] {
  const skip = [...ALWAYS_EXCLUDED, ...TRAY_ALWAYS_EXCLUDED, ...exclude].map(pattern => new Bun.Glob(pattern));
  const git = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "."], { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  const listed = git.status === 0
    ? git.stdout.split("\0").filter(Boolean)
    : [...new Bun.Glob("**/*").scanSync({ cwd: root, onlyFiles: true, dot: true })];
  return listed.map(file => file.replaceAll("\\", "/")).filter(file => !skip.some(glob => glob.match(file)) && isFile(join(root, file))).sort();
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function readJson(root: string, file: string, label: string): unknown {
  const path = join(root, file);
  if (!existsSync(path)) throw new Error(`${label} not found: ${file}`);
  try {
    return JSON.parse(read(root, file));
  } catch (error) {
    throw new Error(`${label} is not JSON: ${file} (${(error as Error).message})`);
  }
}

/** Run every configured check over the files under `root`. */
export function runPublicCopy(root: string, config: CopyConfig, options: RunPublicCopyOptions = {}): PublicCopyResult {
  const on = (section: CopySection): boolean => !options.only || options.only.has(section);
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
  if (on("markdown")) {
    for (const file of expand(root, config.markdown ?? [], exclude)) kinds.set(file, "body");
    for (const file of expand(root, config.reference ?? [], exclude)) kinds.set(file, "reference");
    for (const file of expand(root, config.generated ?? [], exclude)) kinds.set(file, "generated");
  }
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

  const htmlFiles = on("html") ? expand(root, config.html ?? [], exclude) : [];
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
  for (const entry of on("text") ? config.text ?? [] : []) {
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
  for (const entry of on("json") ? config.json ?? [] : []) {
    const path = join(root, entry.file);
    if (!existsSync(path)) throw new Error(`json file not found: ${entry.file}`);
    const parsed: unknown = JSON.parse(read(root, entry.file));
    jsonFiles.push(entry.file);
    for (const match of selectJsonPath(parsed, entry.path)) {
      if (typeof match.value !== "string") continue;
      findings.push(...lintCopy(match.value, { surface: entry.surface, location: `${entry.file}#${match.path}`, config }));
    }
  }

  const cliFiles: string[] = [];
  for (const entry of on("cli") ? config.cli ?? [] : []) {
    const matched = expand(root, [entry.files], exclude);
    if (!matched.length) throw new Error(`cli files not found: ${entry.files}`);
    for (const file of matched) {
      cliFiles.push(file);
      findings.push(...lintCliHelp(read(root, file), { kind: entry.kind, location: file, config }));
    }
  }

  if (on("tray") && config.tray) {
    for (const file of cliFiles) findings.push(...trayHelpFindings(read(root, file), file));
  }

  const controlFiles: string[] = [];
  if (on("control") && config.control) {
    const control = config.control;
    let product: string | undefined;
    if (control.commands) {
      const commands = checkCommands(readJson(root, control.commands, "control.commands"), control.commands);
      findings.push(...commands.findings);
      product = commands.product;
      controlFiles.push(control.commands);
    }
    let status: unknown;
    if (control.status) {
      status = readJson(root, control.status, "control.status");
      findings.push(...checkEnvelope(status, control.status, product));
      controlFiles.push(control.status);
    }
    if (control.tui && control.status) {
      const tui = readJson(root, control.tui, "control.tui");
      const envelope = checkEnvelope(tui, control.tui, product);
      findings.push(...envelope);
      if (!envelope.length) findings.push(...checkTuiMatchesStatus(tui, status, control.tui, control.status));
      controlFiles.push(control.tui);
    }
    if (control.envelopes) {
      const matched = expand(root, control.envelopes, exclude);
      if (!matched.length) throw new Error(`control envelopes not found: ${control.envelopes.join(", ")}`);
      for (const file of matched) {
        if (controlFiles.includes(file)) continue;
        findings.push(...checkEnvelope(readJson(root, file, "control envelope"), file, product));
        controlFiles.push(file);
      }
    }
  }

  const trayFiles: string[] = [];
  if (on("tray") && config.tray) {
    const trayExclude = [...exclude, ...(config.tray === true ? [] : config.tray.exclude ?? [])];
    const trayDirectories = new Set<string>();
    for (const file of trackedFiles(root, trayExclude)) {
      const pathFindings = trayPathFindings(file, trayDirectories);
      findings.push(...pathFindings);
      const text = readFileSync(join(root, file));
      if (text.length > 2 * 1024 * 1024 || text.includes(0)) continue;
      const textFindings = trayTextFindings(text.toString("utf8"), file);
      findings.push(...textFindings);
      if (pathFindings.length || textFindings.length) trayFiles.push(file);
    }
  }

  if (on("package") && config.package) {
    const manifest = JSON.parse(read(root, config.package)) as Record<string, unknown>;
    const name = manifest.name;
    const version = manifest.version;
    if (typeof name !== "string" || typeof version !== "string") throw new Error(`${config.package} needs a name and a version.`);
    const repository = typeof manifest.repository === "string" ? manifest.repository
      : typeof manifest.repository === "object" && manifest.repository !== null && typeof (manifest.repository as { url?: unknown }).url === "string"
        ? (manifest.repository as { url: string }).url : undefined;
    // The pins live in the pages and docs, so read them even when --only skipped their sections.
    const sources = [...raw];
    const seen = new Set(raw.map(source => source.location));
    const pages = [
      ...expand(root, [...config.markdown ?? [], ...config.reference ?? [], ...config.generated ?? [], ...config.html ?? []], exclude),
      ...(config.text ?? []).map(entry => entry.file).filter(entry => existsSync(join(root, entry))),
    ];
    for (const page of pages) {
      if (seen.has(page)) continue;
      seen.add(page);
      sources.push({ location: page, text: read(root, page) });
    }
    findings.push(...checkInstallPins(sources, { name, version, ...(repository ? { repository } : {}) }));
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

  if (on("guides") && config.guides !== false) findings.push(...checkGuides(root, { required: config.guides === "required" }));

  const files = [...new Set([...kinds.keys(), ...htmlFiles, ...textFiles, ...jsonFiles, ...cliFiles, ...controlFiles, ...trayFiles])].sort();
  return { findings: sortFindings(findings), files };
}

export function sortFindings(findings: readonly CopyFinding[]): CopyFinding[] {
  const lineOf = (location: string): number => Number(/:(\d+)$/.exec(location)?.[1] ?? 0);
  const fileOf = stripLocationSuffix;
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

