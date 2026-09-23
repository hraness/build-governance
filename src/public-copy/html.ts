import type { CopyField, CopySurface, ExtractedText } from "./types.js";

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: "\u00a0", mdash: "\u2014", ndash: "\u2013",
  hellip: "\u2026", lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201c", rdquo: "\u201d", middot: "\u00b7",
  copy: "\u00a9", reg: "\u00ae", trade: "\u2122", times: "\u00d7", rarr: "\u2192", larr: "\u2190",
};

/** Decode HTML character references once. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[name.toLowerCase()] ?? whole;
  });
}

function attributes(source: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const match of source.matchAll(/([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    const name = match[1]?.toLowerCase();
    if (name) result.set(name, decodeEntities(match[2] ?? match[3] ?? match[4] ?? ""));
  }
  return result;
}

const SKIPPED = new Set(["code", "pre", "kbd", "samp", "script", "style", "template", "svg", "math", "textarea"]);
const INLINE_CODE = new Set(["code", "kbd", "samp"]);
/** Elements that read as separate words even when the markup puts no space between them. */
const SPACED = new Set(["a", "br", "wbr", "img", "input", "select"]);
const RAW_TEXT = new Set(["script", "style", "textarea", "title"]);
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const BLOCK = new Set([
  "address", "article", "aside", "blockquote", "body", "caption", "dd", "details", "dialog", "div", "dl", "dt",
  "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "html",
  "li", "main", "nav", "ol", "p", "section", "summary", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul",
  "button", "option", "label", "legend", "head",
]);
const JSON_LD_SKIPPED_KEYS = new Set([
  "url", "image", "logo", "sameas", "datepublished", "datemodified", "inlanguage", "email", "telephone",
  "contenturl", "embedurl", "thumbnailurl", "identifier", "isbasedon", "encodingformat", "pricecurrency", "price",
]);

function socialField(key: string): CopyField | undefined {
  if (/:(?:image:)?alt$/.test(key)) return "alt";
  if (/:title$/.test(key)) return "title";
  if (/:description$/.test(key)) return "description";
  return undefined;
}

function jsonLdStrings(value: unknown, path: string, out: Array<{ key: string; path: string; text: string }>): void {
  if (typeof value === "string") {
    const key = path.split(".").pop()?.replace(/\[\d+\]$/, "") ?? "";
    out.push({ key, path, text: value });
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => jsonLdStrings(item, `${path}[${index}]`, out));
  } else if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      if (key.startsWith("@") || JSON_LD_SKIPPED_KEYS.has(key.toLowerCase())) continue;
      jsonLdStrings(item, path ? `${path}.${key}` : key, out);
    }
  }
}

function jsonLdSurface(key: string): CopySurface {
  const lower = key.toLowerCase();
  if (lower === "description") return "description";
  if (lower === "headline" || lower === "alternativeheadline") return "title";
  if (lower === "name") return "heading";
  return "body";
}

/**
 * Extract reader-visible text from HTML: `<title>`, the meta description, `og:*` and `twitter:*` text,
 * `img` alt text, JSON-LD strings, headings, and visible text. Text inside `code`, `pre`, `kbd`,
 * `samp`, `script`, `style`, and `svg` is skipped.
 */
export function extractHtml(html: string, location: string): ExtractedText[] {
  const items: ExtractedText[] = [];
  const counters = new Map<string, number>();
  const selector = (name: string): string => {
    const count = (counters.get(name) ?? 0) + 1;
    counters.set(name, count);
    return `${location}#${name}${count > 1 ? `[${count}]` : ""}`;
  };
  const push = (surface: CopySurface, raw: string, where: string, field?: CopyField): void => {
    const text = raw.replace(/\s+/g, " ").trim();
    if (!text) return;
    items.push(field === undefined ? { surface, text, location: where } : { surface, text, location: where, field });
  };

  const stack: string[] = [];
  let buffer = "";
  let bufferSurface: CopySurface = "body";
  let bufferTag = "p";
  const skipping = (): boolean => stack.some(tag => SKIPPED.has(tag));
  const flush = (): void => {
    if (buffer.trim()) push(bufferSurface, buffer, selector(bufferTag));
    buffer = "";
    bufferSurface = "body";
    bufferTag = "p";
  };

  const tokens = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/\s*([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>|[^<]+|</gi;
  let match: RegExpExecArray | null;
  while ((match = tokens.exec(html)) !== null) {
    const [token, closing, opening, attributeSource = "", selfClosing] = match;
    if (token.startsWith("<!--") || /^<!doctype/i.test(token)) continue;
    if (closing) {
      const name = closing.toLowerCase();
      if (BLOCK.has(name) || /^h[1-6]$/.test(name)) flush();
      const at = stack.lastIndexOf(name);
      if (at !== -1) stack.length = at;
      if (INLINE_CODE.has(name) && !skipping()) buffer += " [code] ";
      else if (SPACED.has(name)) buffer += " ";
      else if (/[.!?:;,]$/.test(buffer)) buffer += " "; // separate elements that CSS lays out apart
      continue;
    }
    if (opening) {
      const name = opening.toLowerCase();
      const attrs = attributes(attributeSource);
      if (name === "meta") {
        const key = (attrs.get("property") ?? attrs.get("name") ?? "").toLowerCase();
        const content = attrs.get("content") ?? "";
        if (key === "description") push("description", content, `${location}#meta[name=description]`, "description");
        else if (/^(?:og|twitter):/.test(key)) {
          const field = socialField(key);
          if (field) push("social", content, `${location}#meta[${key}]`, field);
        }
        continue;
      }
      if (name === "img" || (name === "input" && attrs.get("type") === "image")) {
        const alt = attrs.get("alt");
        if (alt !== undefined) push("alt", alt, selector("img"), "alt");
        continue;
      }
      if (RAW_TEXT.has(name) && !selfClosing) {
        const end = new RegExp(`</\\s*${name}\\s*>`, "gi");
        end.lastIndex = tokens.lastIndex;
        const close = end.exec(html);
        const content = html.slice(tokens.lastIndex, close ? close.index : html.length);
        tokens.lastIndex = close ? end.lastIndex : html.length;
        if (name === "title" && !stack.includes("svg")) push("title", decodeEntities(content), `${location}#title`, "title");
        if (name === "script" && /application\/ld\+json/i.test(attrs.get("type") ?? "")) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(content);
          } catch {
            continue; // Invalid JSON-LD is a markup error for other tools; this lint reads prose.
          }
          const strings: Array<{ key: string; path: string; text: string }> = [];
          jsonLdStrings(parsed, "", strings);
          for (const entry of strings) {
            if (/^(?:https?:|mailto:|\/)/.test(entry.text) || /^\d{4}-\d{2}-\d{2}/.test(entry.text)) continue;
            const surface = jsonLdSurface(entry.key);
            push(surface, entry.text, `${location}#json-ld:${entry.path}`, surface === "description" ? "description" : undefined);
          }
        }
        continue;
      }
      if (name === "body") {
        const head = stack.lastIndexOf("head"); // </head> is optional in HTML
        if (head !== -1) stack.length = head;
      }
      if (SPACED.has(name) || /[.!?:;,]$/.test(buffer)) buffer += " ";
      if (BLOCK.has(name) || /^h[1-6]$/.test(name)) flush();
      if (/^h[1-6]$/.test(name) && !skipping()) {
        bufferSurface = "heading";
        bufferTag = name;
      } else if (BLOCK.has(name)) {
        bufferTag = name;
      }
      if (!VOID.has(name) && !selfClosing) stack.push(name);
      continue;
    }
    if (token === "<") {
      if (!skipping() && !stack.includes("head")) buffer += "<";
      continue;
    }
    if (!skipping() && !stack.includes("head")) buffer += decodeEntities(token);
  }
  flush();
  return items;
}
