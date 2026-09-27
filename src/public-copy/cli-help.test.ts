import { describe, expect, test } from "bun:test";
import { helpLines, lintCliHelp, proseOf, sentenceCaseBreak } from "./cli-help.ts";
import { CLI_PROPER_NOUNS } from "./cli-help.ts";

const BARE = `Textbutler answers your Messages chats for you, only in chats you turn on.

Start here
  textbutler setup           Connect Messages and choose chats
  textbutler status          See what Textbutler is doing
  textbutler menubar         Show Textbutler in the menu bar

Everyday
  textbutler chats           List chats and their reply settings
  textbutler pause           Pause automatic replies

All commands: textbutler --help · Topics: textbutler help <topic>
textbutler 1.4.0
`;

const COMMAND = `Usage: textbutler chats add <contact> [options]

Add a chat. Automatic replies stay off until you turn them on.

Options
  --auto        Turn on automatic replies now
  --json        Print machine-readable output

Example
  textbutler chats add "+1 555 0100"
`;

const rules = (text: string, kind: "bare" | "help" | "command" = "help") =>
  lintCliHelp(text, { kind, location: "golden.txt", config: { brand: "Textbutler" } }).map(f => `${f.rule}:${f.severity}:${f.location}`);

describe("lintCliHelp", () => {
  test("the contract's own examples pass", () => {
    expect(rules(BARE, "bare")).toEqual([]);
    expect(rules(COMMAND, "command")).toEqual([]);
  });

  test("bare invocation budget: 25 lines and 80 columns are errors", () => {
    const long = Array.from({ length: 26 }, (_, i) => `line ${i}`).join("\n");
    expect(rules(long, "bare")).toEqual(["cli-budget:error:golden.txt:26"]);
    expect(rules(`${"x".repeat(81)}\n`, "bare")).toEqual(["cli-budget:error:golden.txt:1"]);
    expect(rules(`${"x".repeat(80)}\n\n\n`, "bare")).toEqual([]);
  });

  test("root help budget: 60 lines is an error, 100 columns a warning; command help only warns", () => {
    const long = Array.from({ length: 61 }, (_, i) => `line ${i}`).join("\n");
    expect(rules(long, "help")).toEqual(["cli-budget:error:golden.txt:61"]);
    expect(rules(long, "command")).toEqual(["cli-budget:warn:golden.txt:61"]);
    expect(rules(`${"x".repeat(101)}\n`, "help")).toEqual(["cli-budget:warn:golden.txt:1"]);
  });

  test("ANSI color and CRLF do not count toward the budget", () => {
    expect(helpLines("\u001b[32m✓\u001b[0m Done\r\n\r\n")).toEqual(["✓ Done"]);
    expect(rules(`\u001b[1m${"x".repeat(80)}\u001b[0m\n`, "bare")).toEqual([]);
  });

  test("title case in headings and summaries is an error", () => {
    expect(rules("Usage: x [options]\n\nGetting Started\n  x setup   Set up\n")).toEqual(["cli-case:error:golden.txt:3"]);
    expect(rules("Options\n  --auto   Turn On Automatic replies\n")).toEqual(["cli-case:error:golden.txt:2"]);
  });

  test("sentence case allows proper nouns, mixed case, capitals, literals, and new segments", () => {
    const ok = [
      "Options\n  --web   Sign in with GitHub on macOS, then open System Settings",
      "Topics\n  help   All commands: x --help · Topics: x help <topic>",
      "Keys\n  x keys   Press Enter to open Settings, then choose Always Allow",
      "Flags\n  --json   Print JSON for AI Charts and the API",
      "Paths\n  x read   Read \"Some File\" from ~/Library/Messages/chat.db",
      "Items\n  x add   Add a chat. Replies stay off",
    ];
    for (const text of ok) expect(rules(text)).toEqual([]);
    expect(rules("Contacts\n  x add   Add Mom to the list\n")).toEqual(["cli-case:error:golden.txt:2"]);
    expect(lintCliHelp("Contacts\n  x add   Add Mom to the list\n", { kind: "help", location: "g", config: { properNouns: ["Mom"] } })).toEqual([]);
  });

  test("examples and synopses are not checked for case", () => {
    expect(proseOf("  textbutler chats add \"Mom Smith\"", 5)).toBeUndefined();
    expect(proseOf("Usage: textbutler Chats", 0)).toBeUndefined();
    expect(proseOf("  $ textbutler Setup", 3)).toBeUndefined();
    expect(proseOf("  Only the chats you pick are read.", 3)).toEqual({ text: "Only the chats you pick are read.", offset: 2, role: "prose" });
  });

  test("internal vocabulary is an error unless the same line glosses it", () => {
    expect(rules("Commands\n  x receipts   Print the admission receipt\n")).toEqual([
      "cli-jargon:error:golden.txt:2", "cli-jargon:error:golden.txt:2", "cli-jargon:error:golden.txt:2",
    ]);
    expect(rules("Commands\n  x lane   Pick a lane (the queue a chat waits in)\n")).toEqual([]);
    expect(rules("Commands\n  x run   Run the saved setup (a habitat)\n")).toEqual([]);
    expect(rules("Commands\n  x habitat   A habitat is a saved setup\n")).toEqual([]);
  });

  test("softer internal words and pin are warnings", () => {
    expect(rules("Commands\n  x pin   Pin a chat to the top\n")).toEqual(["cli-jargon:warn:golden.txt:2", "cli-jargon:warn:golden.txt:2"]);
    expect(rules("Commands\n  x show   Show the manifest\n")).toEqual(["cli-jargon:warn:golden.txt:2"]);
  });

  test("config vocabulary.add words are errors", () => {
    const found = lintCliHelp("Commands\n  x sync   Sync the ledger\n", { kind: "help", location: "g", config: { vocabulary: { add: ["ledger"] } } });
    expect(found.map(f => `${f.rule}:${f.severity}`)).toEqual(["cli-jargon:error"]);
  });

  test("shared rules apply: em dashes and retired names", () => {
    expect(rules("Commands\n  x run   Run it — fast\n")).toEqual(["emdash:error:golden.txt:2"]);
    expect(rules("Commands\n  x send   Send with TextButler\n")).toEqual(["retired:error:golden.txt:2"]);
  });

  test("sentenceCaseBreak reports the word and its position", () => {
    expect(sentenceCaseBreak("Show All chats", CLI_PROPER_NOUNS)).toEqual({ word: "All", index: 5 });
    expect(sentenceCaseBreak("Open Full Disk Access settings", CLI_PROPER_NOUNS)).toBeUndefined();
    expect(sentenceCaseBreak("Done. Next step", CLI_PROPER_NOUNS)).toBeUndefined();
  });
});
