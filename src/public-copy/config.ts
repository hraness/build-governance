import { COPY_SURFACES } from "./types.js";
import type { CopyConfig, CopyJsonEntry, CopySurface, CopyTextEntry } from "./types.js";

export const DEFAULT_CONFIG_FILE = "public-copy.config.json";
export const DEFAULT_BASELINE_FILE = ".public-copy-baseline.json";

const KEYS = new Set(["$schema", "html", "markdown", "text", "json", "reference", "generated", "exclude", "vocabulary", "brand", "package", "baseline", "guides"]);

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== "string" || !item)) {
    throw new Error(`${label} must be an array of non-empty strings.`);
  }
  return value as string[];
}

function surface(value: unknown, label: string): CopySurface {
  if (typeof value !== "string" || !(COPY_SURFACES as readonly string[]).includes(value)) {
    throw new Error(`${label} must be one of ${COPY_SURFACES.join(", ")}.`);
  }
  return value as CopySurface;
}

function file(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

/** Validate a parsed `public-copy.config.json`. Unknown keys are errors, so a typo cannot disable a check. */
export function parseCopyConfig(value: unknown): CopyConfig {
  const raw = object(value, "The config");
  for (const key of Object.keys(raw)) {
    if (!KEYS.has(key)) throw new Error(`Unknown config key “${key}”.`);
  }
  const config: {
    -readonly [K in keyof CopyConfig]: CopyConfig[K];
  } = {};
  for (const key of ["html", "markdown", "reference", "generated", "exclude"] as const) {
    if (raw[key] !== undefined) config[key] = strings(raw[key], key);
  }
  if (raw.text !== undefined) {
    if (!Array.isArray(raw.text)) throw new Error("text must be an array.");
    config.text = raw.text.map((entry, index): CopyTextEntry => {
      const item = object(entry, `text[${index}]`);
      return { file: file(item.file, `text[${index}].file`), surface: surface(item.surface, `text[${index}].surface`) };
    });
  }
  if (raw.json !== undefined) {
    if (!Array.isArray(raw.json)) throw new Error("json must be an array.");
    config.json = raw.json.map((entry, index): CopyJsonEntry => {
      const item = object(entry, `json[${index}]`);
      const path = file(item.path, `json[${index}].path`);
      if (!path.startsWith("$")) throw new Error(`json[${index}].path must start with $.`);
      return { file: file(item.file, `json[${index}].file`), path, surface: surface(item.surface, `json[${index}].surface`) };
    });
  }
  if (raw.vocabulary !== undefined) {
    const vocabulary = object(raw.vocabulary, "vocabulary");
    for (const key of Object.keys(vocabulary)) {
      if (key !== "add" && key !== "allowWithDefinition") throw new Error(`Unknown vocabulary key “${key}”.`);
    }
    config.vocabulary = {
      ...(vocabulary.add === undefined ? {} : { add: strings(vocabulary.add, "vocabulary.add") }),
      ...(vocabulary.allowWithDefinition === undefined ? {} : { allowWithDefinition: strings(vocabulary.allowWithDefinition, "vocabulary.allowWithDefinition") }),
    };
  }
  if (raw.brand !== undefined) config.brand = file(raw.brand, "brand");
  if (raw.package !== undefined) config.package = file(raw.package, "package");
  if (raw.baseline !== undefined) config.baseline = file(raw.baseline, "baseline");
  if (raw.guides !== undefined) {
    if (raw.guides !== true && raw.guides !== false && raw.guides !== "required") throw new Error("guides must be true, false, or \"required\".");
    config.guides = raw.guides;
  }
  return config;
}
