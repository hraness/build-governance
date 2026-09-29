/**
 * A guard against bringing back a menu bar or tray companion after desktop-foundation 1.0 retired them.
 * It flags menu bar source paths, imports of the retired menu kit, the companion's tray modes, and the
 * platform tray APIs. Pure: `trayPathFindings` takes a path and `trayTextFindings` takes file text.
 */
import type { CopyFinding } from "./types.js";

/** File extensions whose text the guard reads. Docs and changelogs may still describe the old tray. */
export const TRAY_SOURCE_EXTENSIONS = [
  ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs",
  ".rs", ".swift", ".m", ".mm", ".go", ".sh", ".py", ".plist", ".toml", ".yml", ".yaml", ".json",
] as const;

const HINT = "Menu bars were retired in desktop-foundation 1.0. Give each former menu item a CLI verb with --json, and use `tui` to watch the product.";

interface TrayPattern {
  readonly pattern: RegExp;
  readonly what: string;
  /** Only in files with these extensions. Default: every source file. */
  readonly extensions?: readonly string[];
}

const SCRIPT = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

/** What the guard looks for in source text. */
export const TRAY_PATTERNS: readonly TrayPattern[] = [
  { pattern: /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'`][^"'`\n]*\bmenu-kit(?:\.[cm]?[jt]sx?)?["'`]/, what: "an import of desktop-foundation's retired menu kit", extensions: SCRIPT },
  { pattern: /\bserveCompanion\s*\(|\bimport\s*\{[^}]*\bserveCompanion\b/, what: "serveCompanion, the retired tray entry point" },
  { pattern: /\bhraness-companion["'`,\s[\]]+(?:--state-dir|--check-protocol|--foreground|lint-menu)\b/, what: "a hraness-companion tray mode" },
  { pattern: /\bcompanion["'`,\s[\]]+lint-menu\b/, what: "the retired companion lint-menu" },
  { pattern: /\bTrayIconBuilder\b|\bSystemTray(?:Event|Menu|MenuItem)?\b|\btray_icon::/, what: "a Tauri tray icon", extensions: [".rs"] },
  { pattern: /\bTrayIconBuilder\b|["']@tauri-apps\/api\/tray["']/, what: "a Tauri tray icon", extensions: SCRIPT },
  { pattern: /["']tray-icon["']|\btray-icon\s*=/, what: "a Tauri tray icon", extensions: [".toml"] },
  { pattern: /"trayIcon"\s*:|"systemTray"\s*:/, what: "a Tauri tray icon", extensions: [".json"] },
  { pattern: /\bnew\s+(?:[A-Za-z_$][\w$]*\.)?Tray\s*\(|(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(?\s*)["']menubar["']/, what: "an Electron tray or the menubar package", extensions: SCRIPT },
  { pattern: /\bNSStatusBar\b|\bNSStatusItem\b|\bMenuBarExtra\b/, what: "a macOS menu bar item", extensions: [".swift", ".m", ".mm", ".rs"] },
  { pattern: /^\s*(?:import\s+(?:[\w.]+\s*,\s*)*|from\s+)(?:rumps|pystray)\b/, what: "a Python menu bar app", extensions: [".py"] },
  { pattern: /["'][^"'\n]*\/systray["']|\bsystray\.(?:Run|Register)\b/, what: "a Go system tray", extensions: [".go"] },
];

/**
 * A comment with this marker, on the line or alone on the line above, lets code that retires an old menu bar name
 * it, such as a check for a leftover login item that ran `hraness-companion --state-dir`.
 */
export const TRAY_ALLOW_MARKER = "tray-guard: retiring";
const TRAY_ALLOW = /tray-guard: retiring\b/;
/** A line that holds only a comment, so its marker covers the next line. */
const COMMENT_LINE = /^\s*(?:\/\/|#|\/\*|\*|--|<!--)/;

/**
 * Paths that hold menu bar code: a `menubar`, `menu-bar` or `tray` directory (reported once, as
 * `desktop/menubar/`) or a source file with such a name, such as `src/menubar.ts`.
 */
export function trayPathFindings(file: string, seen: Set<string> = new Set()): CopyFinding[] {
  const path = file.replaceAll("\\", "/");
  const segments = path.split("/");
  const base = segments.at(-1) ?? "";
  const lower = base.toLowerCase();
  if (!TRAY_SOURCE_EXTENSIONS.some(extension => lower.endsWith(extension))) return [];
  const index = segments.slice(0, -1).findIndex(segment => /^(menubar|menu-bar|menu_bar|tray)$/i.test(segment));
  if (index >= 0) {
    const directory = `${segments.slice(0, index + 1).join("/")}/`;
    if (seen.has(directory)) return [];
    seen.add(directory);
    return [{ rule: "tray", severity: "error", surface: "reference", location: directory, excerpt: `a menu bar directory: ${directory}`, hint: HINT }];
  }
  // A bare `Tray.tsx` is often a drawer component; in native code a `Tray` file is a tray.
  const nativeTray = /^Tray\.(?:swift|m|mm|rs|go)$/.test(base);
  if (lower.endsWith(".json") || !(TRAY_NAME.test(base) || nativeTray)) return [];
  return [{ rule: "tray", severity: "error", surface: "reference", location: path, excerpt: `a menu bar source file: ${path}`, hint: HINT }];
}

/**
 * `menubar.ts`, `menu-bar-state.ts`, `trayIcon.ts`, `TrayMenuBuilder.ts`, `systemTray.ts`, but not `trays.ts`,
 * `menubarRetire.ts` or a `Tray.tsx` drawer. `StatusBar` names are left to the `NSStatusBar` text rule, since
 * terminal UIs have status bars too.
 */
const TRAY_NAME = /^(?:(?:menubar|menu-bar|menu_bar|tray)(?=[-._]|$)|(?:[Mm]enu[Bb]ar|[Tt]ray|[Ss]ystem[Tt]ray)(?=(?:Icon|Menu|Item|Controller|App|Manager|Window)(?:[A-Z]|[-._]))|(?:[Mm]enu[Bb]ar|[Ss]ystem[Tt]ray)(?=[-._]))/;

/** Lines in one source file that bring back a menu bar or tray. */
export function trayTextFindings(text: string, file: string): CopyFinding[] {
  const lower = file.toLowerCase();
  const extension = TRAY_SOURCE_EXTENSIONS.find(item => lower.endsWith(item));
  if (!extension) return [];
  const findings: CopyFinding[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const above = lines[index - 1] ?? "";
    if (TRAY_ALLOW.test(line) || (TRAY_ALLOW.test(above) && COMMENT_LINE.test(above))) return;
    for (const { pattern, what, extensions } of TRAY_PATTERNS) {
      if (extensions && !extensions.includes(extension)) continue;
      const match = pattern.exec(line);
      if (!match) continue;
      findings.push({ rule: "tray", severity: "error", surface: "reference", location: `${file}:${index + 1}`,
        excerpt: `${what}: ${line.trim().slice(0, 120)}`, hint: HINT });
      break;
    }
  });
  return findings;
}

/** Commands in captured help that start a menu bar, such as `demo menubar  Show Demo in the menu bar`. */
export function trayHelpFindings(text: string, file: string): CopyFinding[] {
  const findings: CopyFinding[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (/^\s+(?:[a-z][a-z0-9-]*\s+)?(menubar|menu-bar|tray|companion)\b(?:\s{2,}|$)/.test(line)) {
      findings.push({ rule: "tray", severity: "error", surface: "reference", location: `${file}:${index + 1}`, excerpt: line.trim(), hint: HINT });
    }
  });
  return findings;
}
