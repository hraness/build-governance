import { describe, expect, test } from "bun:test";
import { trayHelpFindings, trayPathFindings, trayTextFindings } from "./tray.ts";

const excerpts = (text: string, file: string): string[] => trayTextFindings(text, file).map(finding => finding.excerpt.split(":")[0] ?? "");

describe("trayPathFindings", () => {
  test("flags menu bar directories and files", () => {
    for (const path of ["desktop/menubar/src/main.rs", "src/menubar.ts", "src/menubar-state.ts", "src/cli/menu-bar.tsx", "apps/tray/index.js", "Sources/Tray.swift", "src/menubar_view.rs"]) {
      expect({ path, found: trayPathFindings(path).length }).toEqual({ path, found: 1 });
    }
  });

  test("reports a menu bar directory once, at its path", () => {
    const seen = new Set<string>();
    expect(trayPathFindings("desktop/menubar/src/main.rs", seen).map(finding => finding.location)).toEqual(["desktop/menubar/"]);
    expect(trayPathFindings("desktop/menubar/icons/icon.png", seen)).toEqual([]);
    expect(trayPathFindings("src/tray/index.ts", seen).map(finding => finding.location)).toEqual(["src/tray/"]);
  });

  test("flags camelCase and PascalCase menu bar files", () => {
    for (const path of ["src/trayIcon.ts", "Sources/TrayMenu.swift", "Sources/StatusBarController.swift", "src/MenuBarApp.tsx", "cmd/tray.go"]) {
      expect({ path, found: trayPathFindings(path).length }).toEqual({ path, found: 1 });
    }
  });

  test("leaves similar names, docs and images alone", () => {
    for (const path of ["src/menu.ts", "src/trays-of-food.md", "docs/menubar.md", "src/menubarRetire.ts", "fixtures/menubar.json", "src/ashtray.ts", "src/retire-menubar.ts",
      "assets/tray/icon.png", "docs/tray/old.md", "src/traySize.ts", "src/Trays.ts"]) {
      expect({ path, found: trayPathFindings(path).length }).toEqual({ path, found: 0 });
    }
  });
});

describe("trayTextFindings", () => {
  test("flags a menu-kit import in every spelling", () => {
    expect(excerpts('import { renderMenu } from "@hraness/desktop-foundation/menu-kit";', "src/a.ts")).toEqual(["an import of desktop-foundation's retired menu kit"]);
    expect(excerpts("const kit = await import('../sdk/src/menu-kit.js');", "src/a.mjs")).toEqual(["an import of desktop-foundation's retired menu kit"]);
    expect(excerpts('const kit = require("@hraness/desktop-foundation/menu-kit")', "src/a.cjs")).toEqual(["an import of desktop-foundation's retired menu kit"]);
    expect(excerpts('import "@hraness/desktop-foundation/menu-kit";', "src/a.ts")).toEqual(["an import of desktop-foundation's retired menu kit"]);
    expect(excerpts("// the old menu-kit is gone", "src/a.ts")).toEqual([]);
    expect(excerpts("assert.equal(pkg.exports['./menu-kit'], undefined);", "test/a.ts")).toEqual([]);
    expect(excerpts('  "node_modules/@hraness/desktop-foundation/dist/src/menu-kit.js": "abc",', "scripts/pins.ts")).toEqual([]);
  });

  test("flags the companion's tray modes and entry point", () => {
    expect(excerpts('spawn("hraness-companion", ["--state-dir", dir]);', "src/a.ts")).toEqual(["a hraness-companion tray mode"]);
    expect(excerpts("exec hraness-companion --foreground", "bin/run.sh")).toEqual(["a hraness-companion tray mode"]);
    expect(excerpts('"args": ["hraness-companion", "--check-protocol"]', "config.json")).toEqual(["a hraness-companion tray mode"]);
    expect(excerpts("await serveCompanion({ appId });", "src/a.ts")).toEqual(["serveCompanion, the retired tray entry point"]);
    expect(excerpts("import { runCompanion, serveCompanion } from 'x';", "src/a.ts")).toEqual(["serveCompanion, the retired tray entry point"]);
    expect(excerpts("for (const name of ['serveCompanion']) assert(!(name in sdk));", "test/a.ts")).toEqual([]);
    expect(excerpts("bunx companion lint-menu --strict", "scripts/lint.sh")).toEqual(["the retired companion lint-menu"]);
    expect(excerpts("hraness-helper status --json", "bin/run.sh")).toEqual([]);
  });

  test("flags Electron, the menubar package, Python and Go trays", () => {
    expect(excerpts("const tray = new Tray(icon);", "src/main.ts")).toEqual(["an Electron tray or the menubar package"]);
    expect(excerpts('import { menubar } from "menubar";', "src/main.ts")).toEqual(["an Electron tray or the menubar package"]);
    expect(excerpts('const { menubar } = require("menubar");', "src/main.cjs")).toEqual(["an Electron tray or the menubar package"]);
    expect(excerpts("let icon = tray_icon::TrayIcon::new(attrs)?;", "src/main.rs")).toEqual(["a Tauri tray icon"]);
    expect(excerpts("SystemTray::new().with_menu(menu)", "src/main.rs")).toEqual(["a Tauri tray icon"]);
    expect(excerpts("import rumps", "app.py")).toEqual(["a Python menu bar app"]);
    expect(excerpts("from pystray import Icon", "app.py")).toEqual(["a Python menu bar app"]);
    expect(excerpts('import "github.com/getlantern/systray"', "main.go")).toEqual(["a Go system tray"]);
    expect(excerpts("\tsystray.Run(onReady, onExit)", "main.go")).toEqual(["a Go system tray"]);
    expect(excerpts('<span className="tray-icon" />', "src/a.tsx")).toEqual([]);
    expect(excerpts("const trayIconSize = 16;", "src/a.ts")).toEqual([]);
  });

  test("flags Tauri and macOS tray APIs in the languages that use them", () => {
    expect(excerpts("let tray = TrayIconBuilder::new().build(app)?;", "src-tauri/src/main.rs")).toEqual(["a Tauri tray icon"]);
    expect(excerpts('tauri = { version = "2", features = ["tray-icon"] }', "Cargo.toml")).toEqual(["a Tauri tray icon"]);
    expect(excerpts('  "trayIcon": { "iconPath": "icons/tray.png" }', "tauri.conf.json")).toEqual(["a Tauri tray icon"]);
    expect(excerpts("let item = NSStatusBar.system.statusItem(withLength: 22)", "Sources/App.swift")).toEqual(["a macOS menu bar item"]);
    expect(excerpts('MenuBarExtra("Demo") { Text("Hi") }', "Sources/App.swift")).toEqual(["a macOS menu bar item"]);
    expect(excerpts("NSStatusBar is gone", "notes.md")).toEqual([]);
  });

  test("allows a line that retires an old tray, marked on the line or the line above", () => {
    const text = [
      "// tray-guard: retiring the 0.x login item",
      'const legacy = ["hraness-companion", "--state-dir"];',
      'const other = ["hraness-companion", "--state-dir"]; // tray-guard: retiring',
      'const fresh = ["hraness-companion", "--state-dir"];',
    ].join("\n");
    expect(trayTextFindings(text, "src/retire.ts").map(finding => finding.location)).toEqual(["src/retire.ts:4"]);
  });

  test("reports one finding per line with its location and a hint", () => {
    const [finding] = trayTextFindings("\nimport x from '@hraness/desktop-foundation/menu-kit'; serveCompanion();", "src/a.ts");
    expect(finding?.location).toBe("src/a.ts:2");
    expect(finding?.rule).toBe("tray");
    expect(finding?.hint).toContain("tui");
    expect(trayTextFindings("import x from '@hraness/desktop-foundation/menu-kit'; serveCompanion();", "src/a.ts")).toHaveLength(1);
  });
});

describe("trayHelpFindings", () => {
  test("flags a menu bar command in captured help", () => {
    const help = "Usage: demo <command>\n\nCommands\n  status     See what Demo is doing\n  menubar    Show Demo in the menu bar\n  ui tray\n";
    expect(trayHelpFindings(help, "help.txt").map(finding => finding.location)).toEqual(["help.txt:5", "help.txt:6"]);
    expect(trayHelpFindings("  status   Shows what is in the tray today\n", "help.txt")).toEqual([]);
    expect(trayHelpFindings("  companion   Start the companion\n", "help.txt")).toHaveLength(1);
  });
});
