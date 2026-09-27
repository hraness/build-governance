/**
 * Menu snapshot fixtures: runs desktop-foundation's `companion lint-menu --strict --json` over the
 * fixtures a config names and turns its report into copy findings. The menu rules live in
 * desktop-foundation (`lintMenu`), so every product is checked by the same code its menu ships with.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { CopyFinding } from "./types.js";

export const DESKTOP_FOUNDATION_PACKAGE = "@hraness/desktop-foundation";

/** One fixture in the `lint-menu --json` report. */
export interface MenuLintReportEntry {
  readonly file: string;
  readonly valid: boolean;
  readonly error?: string;
  readonly findings: ReadonlyArray<{ readonly rule: string; readonly severity: "warning" | "error"; readonly message: string; readonly path: string }>;
}

export interface MenuLintReport {
  readonly ok: boolean;
  readonly results: readonly MenuLintReportEntry[];
}

/** Turn a `lint-menu --json` report into findings. File paths are reported as given. */
export function menuFindings(report: MenuLintReport): CopyFinding[] {
  const findings: CopyFinding[] = [];
  for (const result of report.results) {
    if (!result.valid) {
      findings.push({ rule: "menu", severity: "error", surface: "body", location: result.file, excerpt: `not a valid menu snapshot (${result.error ?? "unknown"})`,
        hint: "Write the fixture as a protocol v2 snapshot, the JSON the menu sends, one file per state." });
      continue;
    }
    for (const finding of result.findings) {
      findings.push({ rule: "menu", severity: finding.severity === "error" ? "error" : "warn", surface: "body",
        location: `${result.file}#${finding.path}`, excerpt: `${finding.rule}: ${finding.message}`,
        hint: "See the menu rules in desktop-foundation docs/protocol-v2.md § Menu lint." });
    }
  }
  return findings;
}

function packageRoot(entry: string): string | undefined {
  let dir = dirname(entry);
  for (;;) {
    const manifest = join(dir, "package.json");
    if (existsSync(manifest)) {
      try {
        if ((JSON.parse(readFileSync(manifest, "utf8")) as { name?: unknown }).name === DESKTOP_FOUNDATION_PACKAGE) return dir;
      } catch {
        // keep walking
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * The `companion` CLI script of an installed desktop-foundation package: `override` (a package
 * directory) first, then `configured`, then the package the repository at `root` resolves.
 */
export function findCompanionCli(root: string, configured?: string, override?: string): string {
  const explicit = override ?? configured;
  let pkg: string | undefined;
  if (explicit) {
    pkg = resolve(root, explicit);
  } else {
    try {
      pkg = packageRoot(Bun.resolveSync(DESKTOP_FOUNDATION_PACKAGE, root));
    } catch {
      pkg = undefined;
    }
  }
  const cli = pkg ? join(pkg, "dist", "src", "cli.js") : undefined;
  if (!cli || !existsSync(cli)) {
    throw new Error(explicit
      ? `No desktop-foundation companion CLI at ${cli ?? explicit}. Point --menu-kit or menus.companion at an installed ${DESKTOP_FOUNDATION_PACKAGE} 0.8.0 or later.`
      : `menus needs ${DESKTOP_FOUNDATION_PACKAGE} 0.8.0 or later. Install it, or pass --menu-kit <package dir>.`);
  }
  return cli;
}

export interface MenuLintOptions {
  readonly companionCli: string;
  readonly properNouns?: readonly string[];
}

/** Run `lint-menu --strict --json` over `files` (relative to `root`). Throws when the tool itself fails. */
export function lintMenuFixtures(root: string, files: readonly string[], options: MenuLintOptions): CopyFinding[] {
  if (!files.length) return [];
  const args = [process.execPath, options.companionCli, "lint-menu", "--strict", "--json"];
  for (const noun of options.properNouns ?? []) args.push("--proper-noun", noun);
  const run = Bun.spawnSync([...args, ...files], { cwd: root, stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } });
  const out = run.stdout.toString().trim();
  let report: MenuLintReport;
  try {
    report = JSON.parse(out.split("\n").pop() ?? "") as MenuLintReport;
  } catch {
    throw new Error(`companion lint-menu failed (exit ${run.exitCode}): ${(run.stderr.toString() || out).trim().split("\n")[0] ?? ""}`);
  }
  if (!Array.isArray(report.results)) throw new Error(`companion lint-menu printed an unexpected report (exit ${run.exitCode}).`);
  return menuFindings(report);
}
