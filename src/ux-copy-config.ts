/**
 * Builds the hraness-copy-lint config the reusable "CLI and menu copy" workflow runs, from its
 * inputs (passed as environment variables). Run as a script, it prints the config as JSON.
 */
import { parseCopyConfig } from "./public-copy/config.js";
import type { CopyConfig } from "./public-copy/types.js";

function list(value: string | undefined, separator: RegExp): string[] {
  return (value ?? "").split(separator).map(item => item.trim()).filter(Boolean);
}

/** `MENU_FIXTURES` and `COMMAND_GOLDENS` hold one glob per line; `PROPER_NOUNS` is comma-separated. */
export function uxCopyConfig(env: Readonly<Record<string, string | undefined>>): CopyConfig {
  const cli = [
    ...list(env.BARE_GOLDEN, /\n/).map(files => ({ files, kind: "bare" as const })),
    ...list(env.HELP_GOLDEN, /\n/).map(files => ({ files, kind: "help" as const })),
    ...list(env.COMMAND_GOLDENS, /\n/).map(files => ({ files, kind: "command" as const })),
  ];
  const fixtures = list(env.MENU_FIXTURES, /\n/);
  const properNouns = list(env.PROPER_NOUNS, /,/);
  if (!cli.length && !fixtures.length) {
    throw new Error("Nothing to check. Pass menu-fixtures, bare-golden, help-golden, command-goldens, or config.");
  }
  return parseCopyConfig({
    ...(cli.length ? { cli } : {}),
    ...(fixtures.length ? { menus: { fixtures } } : {}),
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
