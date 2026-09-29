/**
 * Builds the hraness-copy-lint config the reusable "CLI copy and control" workflow runs, from its
 * inputs (passed as environment variables). Run as a script, it prints the config as JSON.
 */
import { parseCopyConfig } from "./public-copy/config.js";
import type { CopyConfig } from "./public-copy/types.js";

function list(value: string | undefined, separator: RegExp): string[] {
  return (value ?? "").split(separator).map(item => item.trim()).filter(Boolean);
}

/**
 * `COMMAND_GOLDENS`, `ENVELOPES` and `TRAY_EXCLUDE` hold one glob per line; `PROPER_NOUNS` is comma-separated.
 * `TRAY` is "true" or "false" (default true). `MENU_FIXTURES` was removed in 0.5.0 and fails when set.
 */
export function uxCopyConfig(env: Readonly<Record<string, string | undefined>>): CopyConfig {
  if (list(env.MENU_FIXTURES, /\n/).length) {
    throw new Error("menu-fixtures was removed in build-governance 0.5.0: menu bars were retired in desktop-foundation 1.0. Pass commands-json and status-json instead.");
  }
  const cli = [
    ...list(env.BARE_GOLDEN, /\n/).map(files => ({ files, kind: "bare" as const })),
    ...list(env.HELP_GOLDEN, /\n/).map(files => ({ files, kind: "help" as const })),
    ...list(env.COMMAND_GOLDENS, /\n/).map(files => ({ files, kind: "command" as const })),
  ];
  const control = {
    ...(env.COMMANDS_JSON?.trim() ? { commands: env.COMMANDS_JSON.trim() } : {}),
    ...(env.STATUS_JSON?.trim() ? { status: env.STATUS_JSON.trim() } : {}),
    ...(env.TUI_JSON?.trim() ? { tui: env.TUI_JSON.trim() } : {}),
    ...(list(env.ENVELOPES, /\n/).length ? { envelopes: list(env.ENVELOPES, /\n/) } : {}),
  };
  const trayValue = (env.TRAY ?? "").trim() || "true";
  if (trayValue !== "true" && trayValue !== "false") throw new Error(`tray must be true or false, not "${trayValue}".`);
  const tray = trayValue === "true";
  const trayExclude = list(env.TRAY_EXCLUDE, /\n/);
  if (trayExclude.length && !tray) throw new Error("tray-exclude needs tray: true.");
  const properNouns = list(env.PROPER_NOUNS, /,/);
  if (!cli.length && !Object.keys(control).length && !tray) {
    throw new Error("Nothing to check. Pass bare-golden, help-golden, command-goldens, commands-json, status-json, envelopes, or config, or leave tray on.");
  }
  return parseCopyConfig({
    ...(cli.length ? { cli } : {}),
    ...(Object.keys(control).length ? { control } : {}),
    ...(tray ? { tray: trayExclude.length ? { exclude: trayExclude } : true } : {}),
    ...(properNouns.length ? { properNouns } : {}),
    guides: false,
  });
}

if (import.meta.main) {
  try {
    console.log(JSON.stringify(uxCopyConfig(process.env), null, 2));
  } catch (error) {
    console.error(`✗ ${(error as Error).message}\n→ See "Run the checks in CI" in the build-governance README.`);
    process.exit(2);
  }
}
