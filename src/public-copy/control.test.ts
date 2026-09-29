import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkCommands, checkEnvelope, checkTuiMatchesStatus, envelopeProblems } from "./control.ts";

/** The goldens desktop-foundation v1.0.0 ships in contract/golden, copied into fixtures/ux/control. */
const dir = join(import.meta.dir, "..", "..", "fixtures", "ux", "control");
const load = (file: string): Record<string, unknown> => JSON.parse(readFileSync(join(dir, file), "utf8")) as Record<string, unknown>;
const at = "2026-09-28T00:00:00.000Z";
const commands = (verbs: unknown[], product = "example"): unknown => ({ ok: true, schema: "hraness.commands/1", generatedAt: at, data: { product, verbs } });
const status = { path: ["status"], opClass: "read", schema: "example.status/1", summary: "One-screen health" };

describe("envelopeProblems", () => {
  test("accepts desktop-foundation's envelope goldens", () => {
    for (const file of ["commands.json", "status.json", "tui.json", "errors/error.json", "errors/human-required.json", "errors/product-code.json"]) {
      expect({ file, problems: envelopeProblems(load(file), "example") }).toEqual({ file, problems: [] });
    }
  });

  test("rejects what the schema rejects", () => {
    expect(envelopeProblems([])).toEqual(["not a JSON object"]);
    expect(envelopeProblems({ ok: "yes", generatedAt: at })[0]).toContain('"ok"');
    expect(envelopeProblems({ ok: true, schema: "status", generatedAt: at, data: {} }).join()).toContain('"schema"');
    expect(envelopeProblems({ ok: true, schema: "example.status/1", generatedAt: "2026-09-28T00:00:00Z", data: {} }).join()).toContain("generatedAt");
    expect(envelopeProblems({ ok: true, schema: "example.status/1", generatedAt: at }).join()).toContain('missing "data"');
    expect(envelopeProblems({ ok: true, schema: "example.status/1", generatedAt: at, data: {}, error: {} }).join()).toContain('unknown field "error"');
    expect(envelopeProblems({ ok: true, schema: "example.status/1", generatedAt: at, data: {}, next: [{ command: "x", why: "y", audience: "robot" }] }).join()).toContain("audience");
    expect(envelopeProblems({ ok: false, schema: "example.error/1", generatedAt: at, error: { code: "internal", message: "x" } }).join()).toContain("hraness.error/1");
    expect(envelopeProblems({ ok: false, schema: "hraness.error/1", generatedAt: at, error: { code: "internal", message: "" } }).join()).toContain("error.message");
    expect(envelopeProblems({ ok: false, schema: "hraness.error/1", generatedAt: at, error: { code: "internal", message: "x", hint: "y" } }).join()).toContain('unknown field "hint"');
  });

  test("allows shared codes and product codes under the product's own prefix only", () => {
    const error = (code: string): unknown => ({ ok: false, schema: "hraness.error/1", generatedAt: at, error: { code, message: "x" } });
    expect(envelopeProblems(error("not-found"), "example")).toEqual([]);
    expect(envelopeProblems(error("example.locked"), "example")).toEqual([]);
    expect(envelopeProblems(error("locked"), "example").join()).toContain("example.locked");
    expect(envelopeProblems(error("other.locked"), "example").join()).toContain("another product's prefix");
    expect(envelopeProblems(error("Bad Code")).join()).toContain("error.code");
  });

  test("needs a human next step on human-required", () => {
    const envelope = { ok: false, schema: "hraness.error/1", generatedAt: at, error: { code: "human-required", message: "x", next: [{ command: "a", why: "b", audience: "agent" }] } };
    expect(envelopeProblems(envelope).join()).toContain('"audience": "human"');
  });
});

describe("checkCommands", () => {
  test("accepts desktop-foundation's commands golden", () => {
    const result = checkCommands(load("commands.json"), "commands.json");
    expect(result.findings).toEqual([]);
    expect(result.product).toBe("example");
    expect([...result.verbs]).toEqual(["status", "approvals decide", "control stop"]);
  });

  test("needs an op class on every verb", () => {
    const result = checkCommands(commands([status, { path: ["sync"], schema: "example.sync/1", summary: "Sync now" }]), "c.json");
    expect(result.findings.map(finding => finding.excerpt)).toEqual(["sync: opClass undefined"]);
    expect(result.findings[0]?.rule).toBe("control");
    expect(result.findings[0]?.severity).toBe("error");
  });

  test("follows the gate rules of defineRegistry", () => {
    const excerpts = checkCommands(commands([
      status,
      { path: ["allow"], opClass: "decide", schema: "example.allow/1", summary: "Allow" },
      { path: ["deny"], opClass: "operate", schema: "example.deny/1", summary: "Deny", gate: "T1T2" },
      { path: ["loosen"], opClass: "decide", schema: "example.loosen/1", summary: "Loosen", gate: "T9" },
      { path: ["pause"], opClass: "operate", schema: "example.pause/1", summary: "Pause", operateWhen: "always" },
    ]), "c.json").findings.map(finding => finding.excerpt);
    expect(excerpts).toEqual([
      "allow: decide without a gate",
      "deny: operate with a gate",
      'loosen: gate "T9"',
      "pause: operateWhen",
    ]);
  });

  test("gives the shared verbs their op classes and requires status", () => {
    const excerpts = checkCommands(commands([
      { path: ["approvals", "decide"], opClass: "operate", schema: "example.approval/1", summary: "Decide" },
      { path: ["control", "stop"], opClass: "decide", schema: "hraness.control/1", summary: "Stop", gate: "T1T2" },
    ]), "c.json").findings.map(finding => finding.excerpt);
    expect(excerpts).toEqual(["no status verb", "control stop: decide", "approvals decide: operate"]);
  });

  test("rejects a menu bar verb, a registered commands verb, and repeats", () => {
    const excerpts = checkCommands(commands([
      status,
      { path: ["menubar"], opClass: "operate", schema: "example.menubar/1", summary: "Show the menu bar" },
      { path: ["tray", "start"], opClass: "operate", schema: "example.tray/1", summary: "Start the tray" },
      { path: ["commands"], opClass: "read", schema: "hraness.commands/1", summary: "List" },
      status,
    ]), "c.json").findings.map(finding => finding.excerpt);
    expect(excerpts).toEqual(["menubar", "tray start", "commands", "status is listed twice"]);
  });

  test("checks the envelope, the schema, the product and the descriptors", () => {
    expect(checkCommands({ ok: true, schema: "example.commands/1", generatedAt: at, data: { product: "example", verbs: [status] } }, "c.json").findings.map(f => f.excerpt))
      .toEqual(['schema "example.commands/1"']);
    expect(checkCommands(commands([status], "Example"), "c.json").findings.map(f => f.excerpt)).toEqual(['product "Example"']);
    expect(checkCommands(commands([]), "c.json").findings.map(f => f.excerpt)).toEqual(["no verbs"]);
    expect(checkCommands(commands([{ ...status, flags: ["x"] }]), "c.json").findings.map(f => f.excerpt)).toEqual(["status: flags"]);
    expect(checkCommands(commands([{ ...status, path: ["Status"] }]), "c.json").findings.map(f => f.excerpt)).toEqual(['verbs[0].path ["Status"]', "no status verb"]);
    expect(checkCommands(commands([{ ...status, summary: " " }]), "c.json").findings.map(f => f.excerpt)).toEqual(["status: no summary"]);
    const failed = checkCommands(load("errors/error.json"), "c.json").findings.map(f => f.excerpt);
    expect(failed).toEqual(["commands --json returned an error"]);
    expect(checkCommands("nope", "c.json").findings.map(f => f.excerpt)).toEqual(["not a JSON object"]);
  });
});

describe("checkTuiMatchesStatus", () => {
  test("ignores generatedAt and key order", () => {
    const statusEnvelope = load("status.json");
    const tui = { data: statusEnvelope.data, generatedAt: "2026-09-28T09:00:00.000Z", next: statusEnvelope.next, schema: statusEnvelope.schema, ok: true };
    expect(checkTuiMatchesStatus(tui, statusEnvelope, "tui.json", "status.json")).toEqual([]);
    expect(checkTuiMatchesStatus(load("tui.json"), statusEnvelope, "tui.json", "status.json")).toEqual([]);
  });

  test("reports any other difference", () => {
    const statusEnvelope = load("status.json");
    const tui = { ...statusEnvelope, data: { owner: "stopped", pending: 2 } };
    expect(checkTuiMatchesStatus(tui, statusEnvelope, "tui.json", "status.json").map(f => f.excerpt)).toEqual(["differs from status.json"]);
  });
});

describe("checkEnvelope", () => {
  test("returns one finding naming every problem", () => {
    const findings = checkEnvelope({ ok: true, schema: "x", generatedAt: "now" }, "out.json");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.location).toBe("out.json");
    expect(findings[0]?.excerpt).toContain("generatedAt");
    expect(findings[0]?.excerpt).toContain('missing "data"');
  });
});
