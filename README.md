# @hraness/build-governance

`@hraness/build-governance` holds the build checks that Hraness repositories share. Add it as a dev dependency to enforce the Effect architecture rules, generate the portfolio inventory record from `package.json`, and lint public copy against the Hraness style guide.

Each repository keeps its own settings: an architecture policy map, any product-specific inventory fields, and a `public-copy.config.json`.

## Install

```sh
bun add -d github:hraness/build-governance#v0.5.2
```

The package needs Bun 1.3.14 or later. The architecture checker also needs TypeScript 6 in the consuming repository.

## Lint public copy

`hraness-copy-lint` reads the pages, READMEs, and metadata a repository publishes and reports text that breaks the rules in [`STYLE.md`](STYLE.md): em dashes, internal vocabulary on public pages, retired product names, descriptions that stop mid-sentence, stale install pins, and Markdown that renders wrong on GitHub.

1. Add `public-copy.config.json` at the repository root:

   ```json
   {
     "html": ["site/dist/**/*.html"],
     "markdown": ["README.md", "docs/**/*.md"],
     "text": [{ "file": "public/llms.txt", "surface": "agent" }],
     "package": "package.json"
   }
   ```

2. Add a script and run it from `bun run check`:

   ```json
   { "scripts": { "check:copy": "hraness-copy-lint" } }
   ```

3. Record the findings that exist today, then fix them over time:

   ```sh
   bun run check:copy --update-baseline
   ```

Each finding names the rule, the file and line (or the HTML element), an excerpt, and a fix:

```text
error  emdash    README.md:7
        [code] — a TypeScript AST checker that…
        Rewrite the sentence without an em dash. Do not substitute a spaced hyphen.
```

### How the baseline works

The first `--update-baseline` run writes `.public-copy-baseline.json` with the number of errors per file and rule. After that, `hraness-copy-lint` exits with status 1 when any of those counts rises, including errors in a file or rule the baseline does not list. Later `--update-baseline` runs only lower counts to match what you fixed; they never raise one, so a new error cannot be recorded away. Without a baseline file, any error fails the run.

Warnings are printed but never fail the run and never enter the baseline.

| Exit status | Meaning |
| --- | --- |
| 0 | No error count rose above the baseline |
| 1 | An error count rose, or there is no baseline and the run found errors |
| 2 | The options, the config file, or the baseline file are invalid, or a file the config names is missing or invalid |

Other options: `--root <dir>`, `--config <file>`, `--json` for machine-readable output, `--quiet` to print only errors, `--only <sections>` to check some sections of the config (such as `--only cli,control,tray`), `--advisory` to report findings without failing, and `--annotations` to print GitHub Actions annotations.

### Configuration

Every field is optional, and an unknown field is an error.

| Field | What it does |
| --- | --- |
| `html` | Globs of built HTML pages. The lint reads the title, meta description, `og:*` and `twitter:*` text, alt text, JSON-LD strings, headings, and visible text, and skips `code`, `pre`, `kbd`, `script`, `style`, and `svg`. |
| `markdown` | Globs of Markdown files. The lint reads front matter `title` and `description`, headings, paragraphs, list items, table cells, and image alt text, and skips code. |
| `reference` | Markdown files that document an interface. An internal term the page defines, as in “A lease is…”, is allowed there. |
| `generated` | Markdown files written by a model. The `generated` rule applies to their prose. |
| `text` | Plain-text files with a surface, such as `{ "file": "public/llms.txt", "surface": "agent" }`. |
| `json` | Strings in JSON files, selected with a path such as `$.projects[*].description`. |
| `vocabulary` | `add` lists internal words for this repository; `allowWithDefinition` lists words allowed in body text on a page that defines them. |
| `brand` | The product name as the registry spells it. A title may name it once. |
| `package` | Path to `package.json`, for the install-pin check and the package description. |
| `baseline` | Path to the baseline file. The default is `.public-copy-baseline.json`. |
| `exclude` | Globs to skip. `node_modules` and `.git` are always skipped. |
| `guides` | `true` (default) checks the synced guides when they exist, `"required"` also fails when they are missing, and `false` skips the check. |
| `cli` | Captured CLI output: `[{ "files": "test/golden/bare.txt", "kind": "bare" }]`. `kind` is `bare` (the command run with no arguments), `help` (root `--help`), or `command` (one command's `--help`). `files` is a file or a glob. |
| `control` | Captured `--json` output: `commands` (the output of `<product> commands --json`), `status` (`status --json`), `tui` (`tui --json`, which needs `status`), and `envelopes` (globs of other captured output, such as errors). |
| `tray` | `true` fails on menu bar or tray code anywhere in the repository. `{ "exclude": ["src/legacy/**"] }` does the same and skips those globs. |
| `properNouns` | Names that CLI help may capitalize mid-sentence, such as `Mom` in a fixture. |

### Rules

| Rule | Checks | Severity |
| --- | --- | --- |
| `emdash` | The em dash (U+2014), and a spaced en dash or spaced double hyphen used in its place | Error |
| `vocab` | Internal words from `STYLE.md` (such as `custody` and `lease`), and two or more precision words (`exact`, `explicit`, `full`, `complete`, `retained`, `independently`) in one sentence | Error in titles, descriptions, social text, alt text, and headings; warning in body text; allowed on reference pages that define the word |
| `selfcert` | `honest`, `honestly`, `honesty`, `said plainly`, `factual proof`, `checked product` | Error |
| `meta` | Descriptions outside 70 to 160 characters, ending in an ellipsis or mid-sentence, or repeated on another page; titles over 65 characters or naming the brand twice; alt text over 125 characters, starting with `Image of`, or written as a title and tagline | Error |
| `retired` | Retired names (`Atet`, `Message Like Me`, `Life Days Left`, `Platonik`, `hra.sh`, `Oompa`, `Wrench`) unless they follow “formerly”, and misspellings (`Aicharts`, `TextButler`, `XCB`, `Sound.fish`) | Error |
| `pins` | Install lines that pin this package to an older version than `package.json`, and GitHub Actions run links whose run ID is all zeros | Error |
| `render` | Table rows with the wrong number of cells, a pipe inside a code span in a table, literal backticks or `**` in HTML and metadata, double-escaped entities, and sentences glued together without a space | Error |
| `render` | A count of one with a plural noun, as in `1 checks` | Warning |
| `generated` | In model-written text only: a last sentence about what something signals or underscores, narration about fetches and blocked pages, relative dates such as “today”, and quote glosses such as “stating the governing claim” | Error |
| `guides` | Synced `STYLE.md` and `WRITING.md` whose shared text no longer matches the SHA-256 stamped by `sync_guides.py`. Edit shared rules in hraness/.github; put local rules under “Repository additions”. | Error |
| `cli-budget` | A bare invocation over 25 lines or 80 columns, root help over 60 lines, or help lines over 100 columns | Error for the bare invocation and root help line count; warning for help columns and long command help |
| `cli-case` | A capitalized word in the middle of a help heading or command summary, such as `Getting Started` or `Turn On replies`. Names in `properNouns`, the brand, macOS and app names, key names, mixed-case names, capitals, commands, flags, quotes, and placeholders pass. | Error |
| `cli-jargon` | Internal words in help text (`admission`, `qualification`, `custody`, `receipt`, `lane`, `gate`, `surface`, `projection`, `habitat`, `organism`, and `vocabulary.add`) unless the same line explains them, as in `lane (the queue a chat waits in)` | Error; warning for `pin` and the other internal words |
| `control` | Captured `--json` output that breaks desktop-foundation's envelope schema, an unknown error code or another product's prefix, a `human-required` error with no step for a person, a `commands --json` verb with no op class, a `read` or `operate` verb that asks for a person or a `decide` verb that does not, a shared verb (`status`, `tui`, `doctor`, `control`, `approvals`, `permissions`) with the wrong op class, no `status` verb, and `tui --json` that differs from `status --json` in anything but `generatedAt` | Error |
| `tray` | Menu bar code: a `menubar`, `menu-bar` or `tray` directory holding source files, a source file with such a name (`menubar.ts`, `trayIcon.ts`, `SystemTray.swift`; a `components/ui/menubar.tsx` web component is fine), an import of desktop-foundation's `menu-kit`, `serveCompanion`, a `hraness-companion` tray mode (`--state-dir`, `--check-protocol`, `--foreground`), `companion lint-menu`, Tauri, Electron, macOS, Python (`rumps`, `pystray`) and Go (`systray`) tray APIs, the `menubar` npm package, and a `menubar`, `tray` or `companion` command in captured help | Error |

The word lists ship with the package, so a new entry reaches every repository on its next version bump.

### Lint CLI help and control output

Products with a command line add their captured help and `--json` output to the same config. The help rules come from the CLI style guide (`CLI_MENU_STYLE.md` in hraness/.github). The control checks follow desktop-foundation 1.0: its envelope schema, error codes, op classes and name limits, which this package carries as data, so no desktop-foundation install is needed.

```json
{
  "cli": [
    { "files": "test/golden/bare.txt", "kind": "bare" },
    { "files": "test/golden/help.txt", "kind": "help" },
    { "files": "test/golden/*.help.txt", "kind": "command" }
  ],
  "control": {
    "commands": "test/golden/commands.json",
    "status": "test/golden/status.json",
    "tui": "test/golden/tui.json",
    "envelopes": ["test/golden/errors/*.json"]
  },
  "tray": true,
  "properNouns": ["Mom"]
}
```

Menu bars were retired in desktop-foundation 1.0, so `tray` fails when one comes back. It scans the whole Git repository that holds `--root`, even when the lint runs from a subdirectory, and reads the files Git tracks or would track (every file outside a Git repository). It skips `node_modules`, `.git`, `target`, `.venv`, `vendor`, `exclude`, and `tray.exclude`, whose globs are relative to the top of the repository. Files over 2 MiB and binary files are checked by name only. Nested repositories and submodules are not scanned; they run their own check. Code that retires an old menu bar, such as a check for a leftover login item, marks the line with a `tray-guard: retiring` comment, on the same line or alone on the line above.

The `menus` section and `--menu-kit` were removed in 0.5.0. A config that still has `menus` fails with a message that says what replaced it.

### Use it from code and tests

```ts
import {
  lintCopy,
  lintMarkdown,
  extractHtml,
  checkInstallPins,
  checkGuides,
} from "@hraness/build-governance/public-copy";

const findings = lintCopy("Every turn lands on one eligible account.", {
  surface: "description",
  location: "site/index.html#meta[name=description]",
});
```

`lintCopy` checks one string on one surface. A surface is where the text appears: `title`, `description`, `social`, `alt`, `heading`, `body`, `generated`, `reference`, or `agent`. `extractHtml` returns the text of a page with a surface for each piece, `lintMarkdown` checks a whole Markdown document, `checkInstallPins` compares install lines with a package version, and `checkGuides` checks the synced guides in a repository.

Four helpers replace a test that pins a sentence with one that pins a fact. Each throws when the check fails, so they work with `bun:test`, Vitest, and Jest.

```ts
import {
  expectInstallPinsMatch,
  expectRealRunUrl,
  expectCountAgreement,
  expectNoInternalVocabulary,
} from "@hraness/build-governance/public-copy";

expectInstallPinsMatch(readme, packageJson); // at least one line pins this package, and none pins a version older than package.json
expectRealRunUrl(proofUrl); // a GitHub Actions run link with a real run ID
expectCountAgreement(count => summary(count)); // "1 check", "3 checks", and "No checks"
expectNoInternalVocabulary(heroHeading, "heading");
```

## Check CLI output

`hraness-cli-golden` runs a built command-line tool the ways the CLI and menu bar style guide (`CLI_MENU_STYLE.md` in hraness/.github) names, then checks line budgets, exit codes, errors, color, and pipes. Each run gets temporary `HOME` and XDG directories for settings and state. These environment defaults do not restrict access to other files or services.

```sh
hraness-cli-golden --cli "bun src/cli.ts" --name textbutler --commands "setup,status,chats add"
```

```text
✓ bare             D2  14 lines, exit 0
✓ help             D3  42 lines, exit 0
✗ unknown command  D5  exit 1, want exit 2; second line is "Usage: …", want "→ <cli> --help"
…
1 failed, 13 passed.
```

| Check | Rule | Passes when |
| --- | --- | --- |
| `bare` | D2 | Running the tool with no arguments prints at most 25 lines of at most 80 columns to stdout and exits 0 |
| `help` | D3 | `--help` prints at most 60 lines to stdout and exits 0. Lines over 100 columns warn. |
| `help:<command>` | D3 | `<command> --help` exits 0 with help on stdout. A different `help <command>` warns. |
| `version`, `version --json` | D4 | `--version` prints `name X.Y.Z`; with `--json`, `{"name","version"}` |
| `unknown command` | D5 | An unknown command prints `✗ … "stauts" …` then `→ next command` on stderr, nothing on stdout, no usage dump, and exits 2 |
| `--json error`, `agent error` | D5 | With `--json`, or with `AI_AGENT=1`, the error is one JSON document on stdout. The shared envelope (`"schema": "hraness.error/1"`) must match desktop-foundation's `contract/envelope.schema.json`, with `error.next` as a list of `{command, why, audience}`; it should be a `usage` error with exit 2, and any other code must exit with that code's status. A CLI with the shared commands must use it; for a CLI without them, envelope findings warn. Otherwise the older `{"ok":false,"error":{"code","message","next":"<command>"}}` shape with exit 2 still passes. A missing `next` warns |
| `NO_COLOR` | D6 | `NO_COLOR=1` on a terminal prints no color. Skipped where `script` cannot open a pseudo-terminal. |
| `non-TTY` | D6 | Output to a pipe has no escape sequences |
| `TERM=dumb` | D6 | `TERM=dumb` output uses the ASCII fallbacks (`OK`, `FAIL`, `WARN`, `->`) instead of `✓ ✗ ⚠ → ● ○ ↻ 🔐` |
| `\| head -1` | D8 | Closing stdout after one line of `--help` ends the tool quietly, with no panic, trace, or `EPIPE` |
| `help copy` | D3 | The captured help passes the `cli-case` and `cli-jargon` copy rules |
| `commands --json` | C1 | When `commands --json` answers with anything but a usage error, it must be the commands envelope and pass the `control` checks: op classes, who may run each verb, shared verbs, a `status` verb, no menu bar verbs. A CLI that answers with a usage error gets one skipped `shared commands` row |
| `status --json`, `doctor --json` | C4 | Run only when `commands --json` lists them as `read`. One envelope on stdout that matches `contract/envelope.schema.json`, exiting 0 for `"ok": true` and with the error code's exit status otherwise. More than one line warns, and so does a missing `doctor` verb |
| `tui --json` | C3 | The same checks. It should equal `status --json` apart from `generatedAt`; a difference warns |

The command exits 1 when a check fails, 0 under `--advisory`, and 2 for a usage error. Other options: `--unknown <word>`, `--cwd <dir>`, `--env NAME=value`, `--proper-noun <name>`, `--write <dir>` to save the captured output as golden files (with `commands.json`, `status.json`, `tui.json` and `doctor.json` for a CLI with the shared commands), `--annotations` for GitHub Actions, `--timeout <seconds>`, and `--json`. In GitHub Actions it also writes a table to the job summary.

## Run the checks in CI

Two reusable workflows run these checks in a product's CI without adding a dependency. Both start as **advisory**: findings show as warnings on the pull request and in the job summary, and the job never fails the caller.

```yaml
jobs:
  cli-golden:
    uses: hraness/build-governance/.github/workflows/cli-golden.yml@v0.5.2
    with:
      build: bun install --frozen-lockfile
      cli: bun src/cli.ts
      name: textbutler
      commands: setup,status,chats add

  ux-copy:
    uses: hraness/build-governance/.github/workflows/ux-copy.yml@v0.5.2
    with:
      bare-golden: test/golden/bare.txt
      help-golden: test/golden/help.txt
      command-goldens: test/golden/*.help.txt
      commands-json: test/golden/commands.json
      status-json: test/golden/status.json
      tui-json: test/golden/tui.json
      proper-nouns: Mom
```

- `cli-golden.yml` builds the CLI (`build`, with `setup: node` or `setup: rust` for those toolchains and `runs-on` for macOS tools), runs `hraness-cli-golden`, and keeps the captured output as a `cli-goldens-<name>-<OS>` artifact.
- `ux-copy.yml` runs `hraness-copy-lint --only cli,control,tray` over the captured help, the captured `--json` output (`commands-json`, `status-json`, `tui-json`, and `envelopes`), and the repository's files for menu bar code. The tray guard is on unless you pass `tray: "false"`; `tray-exclude` lists globs it skips. A repository that already has `cli`, `control` and `tray` in its `public-copy.config.json` passes `config: public-copy.config.json` instead. `menu-fixtures` was removed in 0.5.0 and fails when set.

To make a check required, once its findings are fixed:

1. Pass `mode: required`. The job then fails on a finding.
2. Add the calling job to the `needs` list of the workflow's `Required` job, so branch protection enforces it through the one required check.

## Check Effect architecture

`inspectEffectArchitecture(program, policy)` walks a TypeScript program and reports Effect code that breaks the architecture policy, such as modules that use Effect without a declared role, native I/O or ambient time outside an adapter, runtime entry points outside a declared runtime root, Effects that are created and never used, erased failures, and type-checker suppressions. `createArchitectureProgram(tsconfigPath)` builds the program from a repository's `tsconfig.json`.

```ts
import { createArchitectureProgram, inspectEffectArchitecture } from "@hraness/build-governance/effect-architecture";

const findings = inspectEffectArchitecture(createArchitectureProgram("tsconfig.json"), {
  root: ".",
  modules: ["src/app.ts", "src/files.ts", "src/main.ts"],
  adapters: ["src/files.ts"],
  runtimeRoots: ["src/main.ts"],
});
```

## Generate the portfolio inventory

`canonicalPortfolioInventoryBytes(packageJson)` returns the `hraness.portfolio-inventory/v1` record for a package: its name, version, and GitHub repository, plus its dependencies on `@hraness` packages or Hraness GitHub sources. Repositories commit the output as `portfolio-inventory.json` and test that it matches.

## Develop

```sh
bun install
bun run check
bun run build
```

`bun run check` runs the type check, the tests, and this repository's own copy lint. Consumers install from a Git tag without a build step, so commit the rebuilt `dist/` with each source change.

This package is MIT licensed.
