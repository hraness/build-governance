/**
 * Runs a built CLI the ways the golden checks need: piped, under TERM=dumb, with an agent marker,
 * on a pseudo-terminal (through `script`), and with stdout closed after the first line.
 * Every run gets a fresh temporary HOME so it never reads or writes the person's real state.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { sharedVerbs } from "./checks.js";
import type { CapturedRun, GoldenRuns, SharedRuns } from "./checks.js";

/** The exact agent markers and audience override the contract names. Stripped so a run starts as a person at a pipe. */
export const AUDIENCE_VARIABLES: readonly string[] = [
  "HRANESS_AUDIENCE", "AI_AGENT", "CLAUDECODE", "CODEX_SANDBOX", "CODEX_SANDBOX_NETWORK_DISABLED", "CURSOR_AGENT", "GEMINI_CLI",
];

/** Split a command line into words. Supports single quotes, double quotes, and backslash escapes. */
export function splitCommand(line: string): string[] {
  const words: string[] = [];
  let current = "";
  let inWord = false;
  let quote: "'" | '"' | undefined;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (quote) {
      if (char === quote) quote = undefined;
      else if (char === "\\" && quote === '"' && index + 1 < line.length) current += line[++index];
      else current += char;
    } else if (char === "'" || char === '"') {
      quote = char;
      inWord = true;
    } else if (char === "\\" && index + 1 < line.length) {
      current += line[++index];
      inWord = true;
    } else if (/\s/.test(char)) {
      if (inWord) words.push(current);
      current = "";
      inWord = false;
    } else {
      current += char;
      inWord = true;
    }
  }
  if (quote) throw new Error(`Unclosed ${quote} in the command.`);
  if (inWord) words.push(current);
  return words;
}

/** Quote one word for a POSIX shell. */
export function shellQuote(word: string): string {
  return /^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replaceAll("'", "'\\''")}'`;
}

/** The name a CLI prints in `--version`: the last path part of the first word that is not a runtime. */
export function defaultName(command: readonly string[]): string {
  const runtimes = new Set(["bun", "node", "deno", "npx", "bunx", "tsx", "cargo", "run", "--"]);
  const word = command.find(part => !runtimes.has(basename(part)) && !part.startsWith("-")) ?? command[0] ?? "cli";
  return basename(word).replace(/\.(?:[cm]?[jt]s|exe)$/, "");
}

export interface RunnerOptions {
  /** The CLI as words, such as `["./target/release/xcb"]` or `["bun", "src/cli.ts"]`. */
  readonly command: readonly string[];
  readonly cwd?: string;
  /** Extra environment for every run. */
  readonly env?: Readonly<Record<string, string>>;
  /** Seconds before a run is killed. */
  readonly timeoutSeconds?: number;
}

interface RunSpec {
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly firstLineOnly?: boolean;
  readonly tty?: boolean;
}

export class GoldenRunner {
  readonly #home: string;
  readonly #options: RunnerOptions;
  readonly #script: "bsd" | "util-linux" | undefined;

  constructor(options: RunnerOptions) {
    if (!options.command.length) throw new Error("The command is empty.");
    this.#options = options;
    this.#home = mkdtempSync(join(tmpdir(), "cli-golden-home-"));
    for (const dir of [".config", ".local/share", ".local/state", ".cache"]) mkdirSync(join(this.#home, dir), { recursive: true });
    this.#script = detectScript();
  }

  get hasTty(): boolean {
    return this.#script !== undefined;
  }

  dispose(): void {
    rmSync(this.#home, { recursive: true, force: true });
  }

  #env(extra: Readonly<Record<string, string>> = {}): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const name of [...AUDIENCE_VARIABLES, "NO_COLOR", "FORCE_COLOR", "CLICOLOR_FORCE", "LC_ALL", "LC_CTYPE", "HRANESS_ASCII", "HRANESS_DEBUG"]) delete env[name];
    Object.assign(env, {
      HOME: this.#home,
      XDG_CONFIG_HOME: join(this.#home, ".config"),
      XDG_DATA_HOME: join(this.#home, ".local/share"),
      XDG_STATE_HOME: join(this.#home, ".local/state"),
      XDG_CACHE_HOME: join(this.#home, ".cache"),
      LANG: "en_US.UTF-8",
      TERM: "xterm-256color",
      COLUMNS: "100",
    }, this.#options.env ?? {}, extra);
    return env;
  }

  run(spec: RunSpec): Promise<CapturedRun> {
    const [program, ...base] = this.#options.command as [string, ...string[]];
    let argv: string[] = [program, ...base, ...spec.args];
    if (spec.tty) {
      argv = this.#script === "bsd"
        ? ["script", "-q", "/dev/null", ...argv]
        : ["script", "-qec", argv.map(shellQuote).join(" "), "/dev/null"];
    }
    const timeout = (this.#options.timeoutSeconds ?? 30) * 1000;
    return new Promise(resolve => {
      // Its own process group, so a timeout or a leftover grandchild can be killed with the CLI.
      const child = spawn(argv[0]!, argv.slice(1), {
        cwd: this.#options.cwd ?? process.cwd(),
        env: this.#env(spec.env),
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
      });
      let stdout = "";
      let stderr = "";
      let closedEarly = false;
      let settled = false;
      let grace: ReturnType<typeof setTimeout> | undefined;
      const killGroup = (): void => {
        try {
          if (child.pid !== undefined && process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
          else child.kill("SIGKILL");
        } catch {
          // already gone
        }
      };
      const finish = (captured: Omit<CapturedRun, "args" | "stdout" | "stderr">): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (grace) clearTimeout(grace);
        resolve({ args: spec.args, stdout, stderr, ...captured });
      };
      const timer = setTimeout(() => {
        killGroup();
        finish({ code: null, signal: "SIGKILL", timedOut: true });
      }, timeout);
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        if (closedEarly) return;
        stdout += chunk;
        if (spec.firstLineOnly && stdout.includes("\n")) {
          // What `| head -1` does: keep one line, then close the read end of the pipe.
          stdout = stdout.slice(0, stdout.indexOf("\n") + 1);
          closedEarly = true;
          child.stdout.destroy();
        }
      });
      child.stderr.on("data", (chunk: string) => { stderr += chunk; });
      child.on("error", error => {
        stderr += `${error.message}\n`;
        finish({ code: 127, signal: null });
      });
      // The CLI exited; give its output a moment to drain, then stop any child still holding the pipes.
      child.on("exit", (code, signal) => {
        grace = setTimeout(() => {
          killGroup();
          finish({ code, signal });
        }, 2000);
      });
      child.on("close", (code, signal) => finish({ code, signal }));
    });
  }

  /** Every run the checks need. `commands` are subcommands such as `status` or `chats add`. */
  async collect(options: { readonly name: string; readonly commands: readonly string[]; readonly unknown: string }): Promise<GoldenRuns> {
    const words = (command: string): string[] => command.split(/\s+/).filter(Boolean);
    const commands = [];
    for (const command of options.commands) {
      commands.push({
        command,
        flag: await this.run({ args: [...words(command), "--help"] }),
        topic: await this.run({ args: ["help", ...words(command)] }),
      });
    }
    const dumb = { TERM: "dumb" };
    const noColor = { NO_COLOR: "1" };
    return {
      name: options.name,
      unknown: options.unknown,
      bare: await this.run({ args: [] }),
      help: await this.run({ args: ["--help"] }),
      commands,
      version: await this.run({ args: ["--version"] }),
      versionJson: await this.run({ args: ["--version", "--json"] }),
      unknownText: await this.run({ args: [options.unknown] }),
      unknownJson: await this.run({ args: [options.unknown, "--json"] }),
      unknownAgent: await this.run({ args: [options.unknown], env: { AI_AGENT: "1" } }),
      dumb: [
        await this.run({ args: [], env: dumb }),
        await this.run({ args: ["--help"], env: dumb }),
        await this.run({ args: [options.unknown], env: dumb }),
      ],
      ...(this.hasTty ? {
        ttyNoColor: [
          await this.run({ args: ["--help"], env: noColor, tty: true }),
          await this.run({ args: [options.unknown], env: noColor, tty: true }),
        ],
      } : {}),
      pipe: await this.run({ args: ["--help"], firstLineOnly: true }),
      shared: await this.collectShared(),
    };
  }

  /**
   * The shared commands with `--json`: `commands` first, then `status`, `tui` and `doctor` only when
   * `commands --json` answers with the commands envelope (`tui` and `doctor` only when it lists them).
   * Each is a read verb, and each runs under the private HOME.
   */
  async collectShared(): Promise<SharedRuns> {
    const commands = await this.run({ args: ["commands", "--json"] });
    const verbs = sharedVerbs(commands);
    if (!verbs) return { commands };
    return {
      commands,
      status: await this.run({ args: ["status", "--json"] }),
      ...(verbs.has("tui") ? { tui: await this.run({ args: ["tui", "--json"] }) } : {}),
      ...(verbs.has("doctor") ? { doctor: await this.run({ args: ["doctor", "--json"] }) } : {}),
    };
  }
}

/** Which `script` flavor gives a pseudo-terminal here, if any. */
function detectScript(): "bsd" | "util-linux" | undefined {
  if (process.platform === "win32") return undefined;
  const probe = spawnSync("script", ["-V"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (probe.error) return undefined;
  if (/util-linux/.test(`${probe.stdout}${probe.stderr}`)) return "util-linux";
  return process.platform === "darwin" || /bsd/i.test(process.platform) ? "bsd" : undefined;
}
