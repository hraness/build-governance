# @hraness/build-governance

`@hraness/build-governance` holds the build checks that Hraness repositories share. Add it as a dev dependency to enforce the Effect architecture rules, generate the portfolio inventory record from `package.json`, and lint public copy against the Hraness style guide.

Each repository keeps its own settings: an architecture policy map, any product-specific inventory fields, and a `public-copy.config.json`.

## Install

```sh
bun add -d github:hraness/build-governance#v0.2.0
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

Other options: `--root <dir>`, `--config <file>`, `--json` for machine-readable output, and `--quiet` to print only errors.

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

The word lists ship with the package, so a new entry reaches every repository on its next version bump.

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
