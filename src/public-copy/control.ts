/**
 * Checks for the shared Hraness control grammar and `--json` envelope, as desktop-foundation 1.0 defines
 * them (`contract/envelope.schema.json`, `op-classes.json`, `error-codes.json`, `names.json`). They read
 * captured output: `<product> commands --json`, `status --json`, `tui --json`, and any other envelope.
 * Pure: every function takes parsed JSON and returns findings.
 */
import type { CopyFinding } from "./types.js";

/** The desktop-foundation release these checks follow. */
export const CONTROL_CONTRACT_VERSION = "desktop-foundation/v1.0.0";

export const COMMANDS_SCHEMA = "hraness.commands/1";
export const ERROR_SCHEMA = "hraness.error/1";
export const OP_CLASSES = ["read", "operate", "decide", "decide-legacy"] as const;
export const GATE_TIERS = ["T1T2", "T3"] as const;

/** Shared error codes and the exit status each one returns (contract/error-codes.json). */
export const SHARED_ERROR_CODES: Readonly<Record<string, number>> = {
  "usage": 2,
  "not-found": 1,
  "permission-denied": 1,
  "human-required": 3,
  "gate-failed": 3,
  "gate-expired": 3,
  "owner-unavailable": 4,
  "control-already-running": 5,
  "conflict": 5,
  "digest-mismatch": 5,
  "unsupported-platform": 1,
  "internal": 1,
};

const PRODUCT_NAME = /^[a-z][a-z0-9-]{0,31}$/;
const VERB_SEGMENT = /^[a-z][a-z0-9-]{0,31}$/;
const SCHEMA_ID = /^[a-z][a-z0-9-]{0,31}(\.[a-z0-9][a-z0-9-]{0,31})+\/[0-9]{1,9}$/;
const ENVELOPE_CODE = /^([a-z][a-z0-9-]*|[a-z][a-z0-9-]{0,31}\.[a-z0-9][a-z0-9.-]{0,63})$/;
const PRODUCT_CODE = /^[a-z][a-z0-9-]{0,31}\.[a-z0-9][a-z0-9.-]{0,63}$/;
const TIMESTAMP = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/;

/**
 * The op class each shared verb must carry (section 4 of the menu bar retirement plan). A verb a product
 * does not register is not required, except `status`.
 */
export const GRAMMAR: readonly { readonly path: string; readonly opClass: readonly string[] }[] = [
  { path: "status", opClass: ["read"] },
  { path: "tui", opClass: ["read"] },
  { path: "doctor", opClass: ["read"] },
  { path: "control status", opClass: ["read"] },
  { path: "control stop", opClass: ["operate"] },
  { path: "control install", opClass: ["decide"] },
  { path: "control uninstall", opClass: ["decide"] },
  { path: "approvals list", opClass: ["read"] },
  { path: "approvals show", opClass: ["read"] },
  { path: "approvals decide", opClass: ["decide"] },
  { path: "permissions list", opClass: ["read"] },
  { path: "permissions set", opClass: ["decide"] },
];

/** Verb names that bring back a menu bar or tray companion. */
export const RETIRED_VERBS = ["menubar", "menu-bar", "tray", "companion"] as const;

export type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extraKeys(value: JsonObject, allowed: readonly string[]): string[] {
  return Object.keys(value).filter(key => !allowed.includes(key));
}

function checkNext(value: unknown, where: string): string[] {
  if (!Array.isArray(value)) return [`${where} must be an array`];
  const problems: string[] = [];
  value.forEach((item, index) => {
    const at = `${where}[${index}]`;
    if (!isObject(item)) {
      problems.push(`${at} must be an object`);
      return;
    }
    for (const key of extraKeys(item, ["command", "why", "audience"])) problems.push(`${at} has an unknown field "${key}"`);
    if (typeof item.command !== "string" || !item.command) problems.push(`${at}.command must be a non-empty string`);
    if (typeof item.why !== "string" || !item.why) problems.push(`${at}.why must be a non-empty string`);
    if (item.audience !== "agent" && item.audience !== "human") problems.push(`${at}.audience must be "agent" or "human"`);
  });
  return problems;
}

/**
 * Problems that make `value` fail `contract/envelope.schema.json`, as short phrases. Empty means valid.
 * `product` also checks that an error code outside the shared list uses that product's prefix.
 */
export function envelopeProblems(value: unknown, product?: string): string[] {
  if (!isObject(value)) return ["not a JSON object"];
  const problems: string[] = [];
  if (typeof value.generatedAt !== "string" || !TIMESTAMP.test(value.generatedAt)) {
    problems.push('"generatedAt" must be a UTC timestamp with milliseconds, such as 2026-09-28T00:00:00.000Z');
  }
  if (value.ok === true) {
    for (const key of extraKeys(value, ["ok", "schema", "generatedAt", "data", "next"])) problems.push(`unknown field "${key}"`);
    if (typeof value.schema !== "string" || !SCHEMA_ID.test(value.schema)) problems.push('"schema" must be an id such as example.status/1');
    if (!("data" in value)) problems.push('missing "data"');
    if ("next" in value) problems.push(...checkNext(value.next, "next"));
    return problems;
  }
  if (value.ok === false) {
    for (const key of extraKeys(value, ["ok", "schema", "generatedAt", "error"])) problems.push(`unknown field "${key}"`);
    if (value.schema !== ERROR_SCHEMA) problems.push(`"schema" must be "${ERROR_SCHEMA}" on an error`);
    const error = value.error;
    if (!isObject(error)) {
      problems.push('missing "error" object');
      return problems;
    }
    for (const key of extraKeys(error, ["code", "message", "detail", "next"])) problems.push(`error has an unknown field "${key}"`);
    if (typeof error.message !== "string" || !error.message) problems.push("error.message must be a non-empty string");
    if ("detail" in error && typeof error.detail !== "string") problems.push("error.detail must be a string");
    if ("next" in error) problems.push(...checkNext(error.next, "error.next"));
    const code = error.code;
    if (typeof code !== "string" || !ENVELOPE_CODE.test(code)) {
      problems.push("error.code must be a shared code or <product>.<code>");
    } else if (!(code in SHARED_ERROR_CODES)) {
      if (!PRODUCT_CODE.test(code)) problems.push(`error.code "${code}" is not a shared code; a product code needs its prefix, as in ${product ?? "example"}.${code}`);
      else if (product && !code.startsWith(`${product}.`)) problems.push(`error.code "${code}" uses another product's prefix; use ${product}.`);
    }
    if (code === "human-required") {
      const next = Array.isArray(error.next) ? error.next : [];
      if (!next.some(item => isObject(item) && item.audience === "human")) {
        problems.push('a human-required error needs an error.next entry with "audience": "human"');
      }
    }
    return problems;
  }
  problems.unshift('"ok" must be true or false');
  return problems;
}

function finding(location: string, excerpt: string, hint: string): CopyFinding {
  return { rule: "control", severity: "error", surface: "agent", location, excerpt, hint };
}

/** Check one captured envelope. */
export function checkEnvelope(value: unknown, location: string, product?: string): CopyFinding[] {
  const problems = envelopeProblems(value, product);
  if (!problems.length) return [];
  return [finding(location, problems.join("; "),
    "Print every --json result through desktop-foundation's envelope (okEnvelope or runCli), which matches contract/envelope.schema.json.")];
}

export interface CommandsCheck {
  readonly findings: CopyFinding[];
  /** The product name from `data.product`, when the document names a valid one. */
  readonly product?: string;
  /** Registered verb paths, joined with spaces. */
  readonly verbs: ReadonlySet<string>;
}

/**
 * Check captured `<product> commands --json`: a valid envelope with schema `hraness.commands/1`, a product
 * name, and verbs that each carry a path, an op class, a schema and a summary, follow the gate rules of
 * `defineRegistry`, give the shared verbs their op classes, and include `status`.
 */
export function checkCommands(value: unknown, location: string): CommandsCheck {
  const findings: CopyFinding[] = [];
  const verbs = new Set<string>();
  const fail = (excerpt: string, hint: string): void => {
    findings.push(finding(location, excerpt, hint));
  };
  const product = isObject(value) && isObject(value.data) && typeof value.data.product === "string" && PRODUCT_NAME.test(value.data.product)
    ? value.data.product : undefined;
  findings.push(...checkEnvelope(value, location, product));
  if (!isObject(value) || value.ok !== true) {
    if (isObject(value) && value.ok === false) fail("commands --json returned an error", "Capture the output of a working `<product> commands --json`.");
    return { findings, verbs, ...(product ? { product } : {}) };
  }
  if (value.schema !== COMMANDS_SCHEMA) fail(`schema ${JSON.stringify(value.schema)}`, `commands --json must use the schema ${COMMANDS_SCHEMA}.`);
  const data = value.data;
  if (!isObject(data)) {
    fail("data is not an object", 'commands --json data is { "product", "verbs" }.');
    return { findings, verbs };
  }
  for (const key of extraKeys(data, ["product", "verbs"])) fail(`data.${key}`, 'commands --json data has only "product" and "verbs".');
  if (!product) fail(`product ${JSON.stringify(data.product)}`, "data.product must be the product name: lowercase letters, digits and hyphens.");
  if (!Array.isArray(data.verbs) || !data.verbs.length) {
    fail("no verbs", "data.verbs lists every verb the command line accepts.");
    return { findings, verbs, ...(product ? { product } : {}) };
  }
  const classes = new Map<string, string>();
  data.verbs.forEach((verb, index) => {
    const at = `verbs[${index}]`;
    if (!isObject(verb)) {
      fail(`${at} is not an object`, "Each verb is { path, opClass, schema, summary, gate?, operateWhen? }.");
      return;
    }
    const path = verb.path;
    const validPath = Array.isArray(path) && path.length > 0 && path.every(segment => typeof segment === "string" && VERB_SEGMENT.test(segment));
    const name = validPath ? (path as string[]).join(" ") : at;
    if (!validPath) {
      fail(`${at}.path ${JSON.stringify(path)}`, "A verb path is one or more lowercase words, such as [\"approvals\", \"list\"].");
      return;
    }
    for (const key of extraKeys(verb, ["path", "opClass", "schema", "summary", "gate", "operateWhen"])) fail(`${name}: ${key}`, "A verb descriptor has only path, opClass, schema, summary, gate and operateWhen.");
    if (verbs.has(name)) fail(`${name} is listed twice`, "Register each verb path once.");
    verbs.add(name);
    const first = (path as string[])[0] ?? "";
    if (first === "commands") fail(name, "`commands` is built in. Do not register it as a verb.");
    if ((RETIRED_VERBS as readonly string[]).includes(first)) {
      fail(name, "Menu bar and tray companions were retired in desktop-foundation 1.0. Offer `tui` and `status --json` instead.");
    }
    const opClass = verb.opClass;
    if (typeof opClass !== "string" || !(OP_CLASSES as readonly string[]).includes(opClass)) {
      fail(`${name}: opClass ${JSON.stringify(opClass)}`, `Every verb needs an op class: ${OP_CLASSES.join(", ")}.`);
    } else {
      classes.set(name, opClass);
    }
    if (typeof verb.schema !== "string" || !SCHEMA_ID.test(verb.schema)) fail(`${name}: schema ${JSON.stringify(verb.schema)}`, "A verb schema is an id such as example.status/1.");
    if (typeof verb.summary !== "string" || !verb.summary.trim()) fail(`${name}: no summary`, "Give every verb a one-line summary.");
    const gate = verb.gate;
    if (gate !== undefined && (typeof gate !== "string" || !(GATE_TIERS as readonly string[]).includes(gate))) {
      fail(`${name}: gate ${JSON.stringify(gate)}`, `A gate tier is ${GATE_TIERS.join(" or ")}.`);
    }
    if (opClass === "decide" && gate === undefined) fail(`${name}: decide without a gate`, "A decide verb needs the human gate.");
    if ((opClass === "read" || opClass === "operate") && gate !== undefined) fail(`${name}: ${opClass} with a gate`, `A ${opClass} verb cannot have a gate.`);
    if (verb.operateWhen !== undefined && (gate === undefined || typeof verb.operateWhen !== "string" || !verb.operateWhen.trim())) {
      fail(`${name}: operateWhen`, "operateWhen is a summary string, and only a gated verb has one.");
    }
  });
  for (const rule of GRAMMAR) {
    const actual = classes.get(rule.path);
    if (actual === undefined) {
      if (rule.path === "status" && !verbs.has("status")) fail("no status verb", "Every product answers `<product> status --json` with one-screen health.");
      continue;
    }
    if (!rule.opClass.includes(actual)) fail(`${rule.path}: ${actual}`, `The shared verb \`${rule.path}\` is ${rule.opClass.join(" or ")}.`);
  }
  return { findings, verbs, ...(product ? { product } : {}) };
}

function withoutGeneratedAt(value: unknown): unknown {
  if (!isObject(value)) return value;
  const { generatedAt: _generatedAt, ...rest } = value;
  return rest;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}

/** `tui --json` must print the same envelope as `status --json`, except `generatedAt`. */
export function checkTuiMatchesStatus(tui: unknown, status: unknown, location: string, statusLocation: string): CopyFinding[] {
  if (canonical(withoutGeneratedAt(tui)) === canonical(withoutGeneratedAt(status))) return [];
  return [finding(location, `differs from ${statusLocation}`,
    "`tui --json` prints the same envelope as `status --json` (only generatedAt may differ). Load both from one function.")];
}
