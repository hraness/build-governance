#!/usr/bin/env bun
// A CLI that breaks the Hraness CLI style contract in every checked way. The golden checks must fail it.
const args = process.argv.slice(2);
if (!args.length) {
  console.log(Array.from({ length: 30 }, (_, i) => `\u001b[1mLine ${i} of the Getting Started guide, which runs on well past the eighty column budget\u001b[0m`).join("\n"));
  process.exit(0);
}
if (args[0] === "--help") {
  // Enough output that a closed pipe raises EPIPE, and no handler for it.
  const lines = Array.from({ length: 20000 }, (_, i) => `Show The Admission Receipt ${i}`).join("\n");
  process.stdout.write(`${lines}\n`, error => { if (error) { console.error(error.stack); process.exit(1); } });
  process.exitCode = 2;
} else if (args[0] === "--version") {
  console.log("1.2.3");
} else if (args[0] === "status" || args[0] === "help") {
  process.exit(1);
} else {
  console.error(`\u001b[31merror\u001b[0m: unrecognized subcommand '${args[0]}'\n\nUsage: bad <COMMAND>\n\nFor more information, try '--help'. ✓`);
  process.exit(1);
}
