// @bun
// src/public-copy/types.ts
var COPY_SURFACES = [
  "title",
  "description",
  "social",
  "alt",
  "heading",
  "body",
  "generated",
  "reference",
  "agent"
];
// src/public-copy/rules.ts
var PUBLIC_COPY_RULES_VERSION = "hraness-public-copy/v0";
var INTERNAL_VOCABULARY = [
  "admission",
  "admitted",
  "qualification",
  "qualified",
  "custody",
  "settlement",
  "settled",
  "receipt",
  "attest",
  "attested",
  "evidence-backed",
  "provenance",
  "bounded",
  "boundary",
  "typed",
  "contract",
  "fenced",
  "lease",
  "manifest",
  "promoted",
  "gate",
  "lane",
  "workstream",
  "surface",
  "projection",
  "foundation",
  "substrate",
  "authority",
  "inert",
  "canonical",
  "retained",
  "source pilot",
  "source-bound",
  "steel thread"
];
var PRECISION_WORDS = [
  "exact",
  "explicit",
  "full",
  "complete",
  "retained",
  "independently"
];
var SELF_CERTIFICATION = [
  "honest",
  "honestly",
  "honesty",
  "said plainly",
  "factual proof",
  "checked product"
];
var RETIRED_NAMES = [
  { pattern: /(?<![\w.-])atet(?![\w-])/gi, hint: "Atet is retired. Mention it only in a redirect, a changelog, or a \u201Cformerly\u201D note." },
  { pattern: /(?<![\w.-])message[ -]like[ -]me(?![\w-])/gi, hint: "Message Like Me is retired. Mention it only in a redirect, a changelog, or a \u201Cformerly\u201D note." },
  { pattern: /(?<![\w.-])life ?days ?left(?![\w-])/gi, hint: "Life Days Left is retired. Mention it only in a redirect, a changelog, or a \u201Cformerly\u201D note." },
  { pattern: /(?<![\w.-])platonik(?![\w-])/gi, hint: "Platonik is retired. Mention it only in a redirect, a changelog, or a \u201Cformerly\u201D note." },
  { pattern: /(?<![\w./-])hra\.sh(?![\w-])/gi, hint: "hra.sh is retired. Mention it only in a redirect, a changelog, or a \u201Cformerly\u201D note." },
  { pattern: /(?<![\w-])Oompa(?![\w-])/g, hint: "Oompa is a retired product name. Name what the reader uses today." },
  { pattern: /(?<![\w-])Wrench(?![\w-])/g, hint: "Wrench is a retired product name. Name what the reader uses today." },
  { pattern: /(?<![\w-])Aicharts(?![\w-])/g, hint: "Write \u201CAI Charts\u201D, as the portfolio registry spells it." },
  { pattern: /(?<![\w-])TextButler(?![\w-])/g, hint: "Write \u201CTextbutler\u201D, as the portfolio registry spells it." },
  { pattern: /(?<![\w-])XCB(?![\w-])/g, hint: "Write \u201Cxcb\u201D, as the portfolio registry spells it." },
  { pattern: /(?<![\w-])Sound\.fish(?![\w-])/g, hint: "The product is Soundfish. Write sound.fish only for the web address." }
];
var SIGNIFICANCE_CLOSER = /\b(?:signals|underscores|highlights|reflects|represents|marks)\b|\braises questions\b/gi;
var PROCESS_WORDS = /\b403\b|\bCloudflare\b|\bat clip time\b|\bthis digest\b|\bcandidate pool\b|\bsupplied evidence\b|\bshould not be selected\b|\bfetched for this draft\b/gi;
var RELATIVE_DATES = /\b(?:today|yesterday|this week)\b/gi;
var GOVERNING_CLAIM = /\bgoverning claim\b/gi;
var TIGHT_SURFACES = new Set(["title", "description", "social", "alt", "heading"]);
var METADATA_SURFACES = new Set(["title", "description", "social", "alt"]);
var SINGULAR_S = new Set([
  "series",
  "news",
  "species",
  "yes",
  "gas",
  "lens",
  "always",
  "perhaps",
  "its",
  "has",
  "was",
  "does",
  "as",
  "canvas",
  "alias",
  "atlas",
  "whereas",
  "sometimes",
  "hers",
  "ours",
  "yours",
  "theirs"
]);
var ORDINAL_LABEL = /\b(?:rank|step|phase|level|tier|version|chapter|part|wave|day|week|stage|option|page|section|figure|table|round|slot|item|no\.)\s+$/i;
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function termPattern(term) {
  const words = term.trim().toLowerCase().split(/\s+/).map(escapeRegExp);
  const last = words.pop() ?? "";
  const plural = last.endsWith("y") ? `${last.slice(0, -1)}(?:y|ies)` : `${last}(?:s|es)?`;
  return `(?<![\\w-])${[...words, plural].join("\\s+")}(?![\\w-])`;
}
var termRegexCache = new Map;
function termRegex(term) {
  let regex = termRegexCache.get(term);
  if (!regex) {
    regex = new RegExp(termPattern(term), "gi");
    termRegexCache.set(term, regex);
  }
  regex.lastIndex = 0;
  return regex;
}
function definedTerms(pageText, terms) {
  const found = new Set;
  for (const term of terms) {
    const definition = new RegExp(`${termPattern(term)}\\s*(?:\\*\\*|\\*|_|\u201D|"|\`)?\\s*(?::|\\(|\\bis\\b|\\bare\\b|\\bmeans\\b|\\brefers to\\b)`, "i");
    if (definition.test(pageText))
      found.add(term.toLowerCase());
  }
  return found;
}
function vocabularyFor(config) {
  const added = config?.vocabulary?.add ?? [];
  return [...new Set([...INTERNAL_VOCABULARY, ...added.map((term) => term.toLowerCase())])];
}
function excerptAt(text, index, length) {
  const start = Math.max(0, index - 30);
  const end = Math.min(text.length, index + length + 30);
  const body = text.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "\u2026" : ""}${body}${end < text.length ? "\u2026" : ""}`;
}
function maskUrls(text) {
  return text.replace(/\bhttps?:\/\/[^\s)>\]]+|\bwww\.[^\s)>\]]+/g, (match) => " ".repeat(match.length));
}
function sentenceSpans(text) {
  const spans = [];
  const boundary = /[.!?]["\u201D\u2019)]*\s+/g;
  let start = 0;
  for (const match of text.matchAll(boundary)) {
    const end = match.index + match[0].length;
    if (text.slice(start, end).trim())
      spans.push({ start, end });
    start = end;
  }
  if (text.slice(start).trim())
    spans.push({ start, end: text.length });
  return spans;
}
function isAfterFormerly(text, index) {
  const before = text.slice(Math.max(0, index - 60), index);
  const sentence = before.split(/[.!?]\s/).pop() ?? "";
  return /\bformerly\b/i.test(sentence);
}
function codePointLength(text) {
  return [...text].length;
}
function titleSegments(title) {
  return title.split(/\s*[\u00B7|]\s*|\s+[\u2013\u2014-]\s+|:\s+/).map((part) => part.trim().toLowerCase()).filter(Boolean);
}
function lintCopy(text, opts) {
  const findings = [];
  const { surface, location } = opts;
  const format = opts.format ?? "text";
  const add = (rule, severity, index, length, hint, source = text) => {
    findings.push({ rule, severity, surface, location, excerpt: excerptAt(source, index, length), hint });
  };
  const masked = maskUrls(text);
  for (const match of masked.matchAll(/\u2014/g)) {
    add("emdash", "error", match.index, 1, "Rewrite the sentence without an em dash. Do not substitute a spaced hyphen.");
  }
  for (const match of masked.matchAll(/ \u2013 | -- /g)) {
    add("emdash", "error", match.index, match[0].length, "A spaced en dash or double hyphen stands in for an em dash. Rewrite the sentence.");
  }
  const allowWithDefinition = new Set((opts.config?.vocabulary?.allowWithDefinition ?? []).map((term) => term.toLowerCase()));
  const defined = opts.definedTerms ?? new Set;
  for (const term of vocabularyFor(opts.config)) {
    let severity;
    if (TIGHT_SURFACES.has(surface))
      severity = "error";
    else if (surface === "reference")
      severity = defined.has(term) ? undefined : "warn";
    else
      severity = allowWithDefinition.has(term) && defined.has(term) ? undefined : "warn";
    if (!severity)
      continue;
    for (const match of masked.matchAll(termRegex(term))) {
      add("vocab", severity, match.index, match[0].length, `\u201C${match[0]}\u201D is internal vocabulary. Say what the reader gets, or define the term where it first appears.`);
    }
  }
  const precision = new RegExp(`\\b(?:${PRECISION_WORDS.join("|")})\\b`, "gi");
  for (const span of sentenceSpans(masked)) {
    const sentence = masked.slice(span.start, span.end);
    const words = [...sentence.matchAll(precision)];
    const distinct = new Set(words.map((word) => word[0].toLowerCase()));
    if (distinct.size >= 2 && words[0]) {
      const severity = TIGHT_SURFACES.has(surface) ? "error" : "warn";
      add("vocab", severity, span.start + words[0].index, sentence.length - words[0].index, `Precision stack (${[...distinct].join(", ")}). Keep a precision word only where it changes the meaning.`);
    }
  }
  const selfcert = new RegExp(`\\b(?:${SELF_CERTIFICATION.map(escapeRegExp).map((term) => term.replace(/ /g, "\\s+")).join("|")})\\b`, "gi");
  for (const match of masked.matchAll(selfcert)) {
    add("selfcert", "error", match.index, match[0].length, "Do not call the page, product, or caveat honest, plain, factual, or checked. Show the evidence.");
  }
  for (const { pattern, hint } of RETIRED_NAMES) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      if (isAfterFormerly(text, match.index))
        continue;
      add("retired", "error", match.index, match[0].length, hint);
    }
  }
  const field = opts.field;
  const trimmed = text.trim();
  const isDescription = field === "description" || surface === "description" && field === undefined;
  const isTitle = field === "title" || surface === "title" && field === undefined;
  const isAlt = field === "alt" || surface === "alt" && field === undefined;
  if (isDescription && trimmed) {
    const length = codePointLength(trimmed);
    if (length < 70 || length > 160) {
      add("meta", "error", 0, trimmed.length, `Description is ${length} characters. Write one or two complete sentences of 70 to 160 characters.`, trimmed);
    }
    if (/(?:\u2026|\.\.\.)$/.test(trimmed)) {
      add("meta", "error", trimmed.length - 3, 3, "Description ends in an ellipsis. Write a complete sentence that fits instead of truncating.", trimmed);
    } else if (!/[.!?)"\u201D\u2019']$/.test(trimmed)) {
      add("meta", "error", Math.max(0, trimmed.length - 20), 20, "Description stops mid-sentence. End it with a complete sentence.", trimmed);
    }
  }
  if (isTitle && trimmed) {
    const length = codePointLength(trimmed);
    if (length > 65)
      add("meta", "error", 0, trimmed.length, `Title is ${length} characters. Keep it to 65 or fewer.`, trimmed);
    const brand = opts.config?.brand?.trim();
    const brandCount = brand ? [...trimmed.matchAll(new RegExp(`(?<![\\w-])${escapeRegExp(brand)}(?![\\w-])`, "gi"))].length : 0;
    const segments = titleSegments(trimmed);
    if (brandCount > 1 || new Set(segments).size < segments.length) {
      add("meta", "error", 0, trimmed.length, "The title repeats a name. Name the brand once.", trimmed);
    }
  }
  if (isAlt && trimmed) {
    const length = codePointLength(trimmed);
    if (length > 125)
      add("meta", "error", 0, trimmed.length, `Alt text is ${length} characters. Describe the image in 125 or fewer.`, trimmed);
    if (/^(?:an?\s+)?(?:image|picture|photo|screenshot)\s+of\b/i.test(trimmed)) {
      add("meta", "error", 0, 12, "Describe what the image shows. Do not start with \u201CImage of\u201D.", trimmed);
    }
    if (/\s[\u2014\u2013|]\s|\s-\s/.test(trimmed)) {
      add("meta", "error", 0, trimmed.length, "Alt text reads as a title and tagline. Describe what the image shows.", trimmed);
    }
  }
  if (format === "html" || METADATA_SURFACES.has(surface)) {
    for (const match of text.matchAll(/`|\*\*/g)) {
      add("render", "error", match.index, match[0].length, "Markdown syntax renders literally here. Use markup, or write the command in prose.");
    }
  }
  if (format !== "markdown") {
    for (const match of text.matchAll(/&(?:apos|quot|amp|lt|gt|#39|#x27);/g)) {
      add("render", "error", match.index, match[0].length, "An HTML entity renders literally. Escape it once.");
    }
  }
  for (const match of masked.matchAll(/[a-z]\.[A-Z][a-z]/g)) {
    add("render", "error", match.index, match[0].length, "Two sentences are glued together. Add a space after the period.");
  }
  for (const match of masked.matchAll(/(?<![\w.,#-])1 ([a-z]+s)\b/g)) {
    const noun = match[1] ?? "";
    if (SINGULAR_S.has(noun) || /(?:ss|us|is|ics)$/.test(noun))
      continue;
    if (ORDINAL_LABEL.test(masked.slice(Math.max(0, match.index - 12), match.index)))
      continue;
    add("render", "warn", match.index, match[0].length, "The count does not agree with its noun. Test zero, one, and several.");
  }
  if (surface === "generated") {
    const spans = sentenceSpans(masked);
    const last = spans[spans.length - 1];
    if (last) {
      const sentence = masked.slice(last.start, last.end);
      for (const match of sentence.matchAll(SIGNIFICANCE_CLOSER)) {
        add("generated", "error", last.start + match.index, match[0].length, "The text ends on a significance claim. End on the last supported fact.");
      }
    }
    for (const match of masked.matchAll(PROCESS_WORDS)) {
      add("generated", "error", match.index, match[0].length, "Do not describe how the text was made or what was fetched.");
    }
    for (const match of masked.matchAll(RELATIVE_DATES)) {
      add("generated", "error", match.index, match[0].length, "Write dates as dates in text that stays published.");
    }
    for (const match of masked.matchAll(GOVERNING_CLAIM)) {
      add("generated", "error", match.index, match[0].length, "Name the speaker and role without paraphrasing the quote in the attribution.");
    }
  }
  return findings;
}
// src/public-copy/html.ts
var NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\xA0",
  mdash: "\u2014",
  ndash: "\u2013",
  hellip: "\u2026",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201C",
  rdquo: "\u201D",
  middot: "\xB7",
  copy: "\xA9",
  reg: "\xAE",
  trade: "\u2122",
  times: "\xD7",
  rarr: "\u2192",
  larr: "\u2190"
};
function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (whole, name) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 1114111 ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[name.toLowerCase()] ?? whole;
  });
}
function attributes(source) {
  const result = new Map;
  for (const match of source.matchAll(/([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    const name = match[1]?.toLowerCase();
    if (name)
      result.set(name, decodeEntities(match[2] ?? match[3] ?? match[4] ?? ""));
  }
  return result;
}
var SKIPPED = new Set(["code", "pre", "kbd", "samp", "script", "style", "template", "svg", "math", "textarea"]);
var INLINE_CODE = new Set(["code", "kbd", "samp"]);
var SPACED = new Set(["a", "br", "wbr", "img", "input", "select"]);
var RAW_TEXT = new Set(["script", "style", "textarea", "title"]);
var VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
var BLOCK = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "body",
  "caption",
  "dd",
  "details",
  "dialog",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "html",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "section",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
  "button",
  "option",
  "label",
  "legend",
  "head"
]);
var JSON_LD_SKIPPED_KEYS = new Set([
  "url",
  "image",
  "logo",
  "sameas",
  "datepublished",
  "datemodified",
  "inlanguage",
  "email",
  "telephone",
  "contenturl",
  "embedurl",
  "thumbnailurl",
  "identifier",
  "isbasedon",
  "encodingformat",
  "pricecurrency",
  "price"
]);
function socialField(key) {
  if (/:(?:image:)?alt$/.test(key))
    return "alt";
  if (/:title$/.test(key))
    return "title";
  if (/:description$/.test(key))
    return "description";
  return;
}
function jsonLdStrings(value, path, out) {
  if (typeof value === "string") {
    const key = path.split(".").pop()?.replace(/\[\d+\]$/, "") ?? "";
    out.push({ key, path, text: value });
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => jsonLdStrings(item, `${path}[${index}]`, out));
  } else if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      if (key.startsWith("@") || JSON_LD_SKIPPED_KEYS.has(key.toLowerCase()))
        continue;
      jsonLdStrings(item, path ? `${path}.${key}` : key, out);
    }
  }
}
function jsonLdSurface(key) {
  const lower = key.toLowerCase();
  if (lower === "description")
    return "description";
  if (lower === "headline" || lower === "alternativeheadline")
    return "title";
  if (lower === "name")
    return "heading";
  return "body";
}
function extractHtml(html, location) {
  const items = [];
  const counters = new Map;
  const selector = (name) => {
    const count = (counters.get(name) ?? 0) + 1;
    counters.set(name, count);
    return `${location}#${name}${count > 1 ? `[${count}]` : ""}`;
  };
  const push = (surface, raw, where, field) => {
    const text = raw.replace(/\s+/g, " ").trim();
    if (!text)
      return;
    items.push(field === undefined ? { surface, text, location: where } : { surface, text, location: where, field });
  };
  const stack = [];
  let buffer = "";
  let bufferSurface = "body";
  let bufferTag = "p";
  const skipping = () => stack.some((tag) => SKIPPED.has(tag));
  const flush = () => {
    if (buffer.trim())
      push(bufferSurface, buffer, selector(bufferTag));
    buffer = "";
    bufferSurface = "body";
    bufferTag = "p";
  };
  const tokens = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/\s*([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>|[^<]+|</gi;
  let match;
  while ((match = tokens.exec(html)) !== null) {
    const [token, closing, opening, attributeSource = "", selfClosing] = match;
    if (token.startsWith("<!--") || /^<!doctype/i.test(token))
      continue;
    if (closing) {
      const name = closing.toLowerCase();
      if (BLOCK.has(name) || /^h[1-6]$/.test(name))
        flush();
      const at = stack.lastIndexOf(name);
      if (at !== -1)
        stack.length = at;
      if (INLINE_CODE.has(name) && !skipping())
        buffer += " [code] ";
      else if (SPACED.has(name))
        buffer += " ";
      else if (/[.!?:;,]$/.test(buffer))
        buffer += " ";
      continue;
    }
    if (opening) {
      const name = opening.toLowerCase();
      const attrs = attributes(attributeSource);
      if (name === "meta") {
        const key = (attrs.get("property") ?? attrs.get("name") ?? "").toLowerCase();
        const content = attrs.get("content") ?? "";
        if (key === "description")
          push("description", content, `${location}#meta[name=description]`, "description");
        else if (/^(?:og|twitter):/.test(key)) {
          const field = socialField(key);
          if (field)
            push("social", content, `${location}#meta[${key}]`, field);
        }
        continue;
      }
      if (name === "img" || name === "input" && attrs.get("type") === "image") {
        const alt = attrs.get("alt");
        if (alt !== undefined)
          push("alt", alt, selector("img"), "alt");
        continue;
      }
      if (RAW_TEXT.has(name) && !selfClosing) {
        const end = new RegExp(`</\\s*${name}\\s*>`, "gi");
        end.lastIndex = tokens.lastIndex;
        const close = end.exec(html);
        const content = html.slice(tokens.lastIndex, close ? close.index : html.length);
        tokens.lastIndex = close ? end.lastIndex : html.length;
        if (name === "title" && !stack.includes("svg"))
          push("title", decodeEntities(content), `${location}#title`, "title");
        if (name === "script" && /application\/ld\+json/i.test(attrs.get("type") ?? "")) {
          let parsed;
          try {
            parsed = JSON.parse(content);
          } catch {
            continue;
          }
          const strings = [];
          jsonLdStrings(parsed, "", strings);
          for (const entry of strings) {
            if (/^(?:https?:|mailto:|\/)/.test(entry.text) || /^\d{4}-\d{2}-\d{2}/.test(entry.text))
              continue;
            const surface = jsonLdSurface(entry.key);
            push(surface, entry.text, `${location}#json-ld:${entry.path}`, surface === "description" ? "description" : undefined);
          }
        }
        continue;
      }
      if (name === "body") {
        const head = stack.lastIndexOf("head");
        if (head !== -1)
          stack.length = head;
      }
      if (SPACED.has(name) || /[.!?:;,]$/.test(buffer))
        buffer += " ";
      if (BLOCK.has(name) || /^h[1-6]$/.test(name))
        flush();
      if (/^h[1-6]$/.test(name) && !skipping()) {
        bufferSurface = "heading";
        bufferTag = name;
      } else if (BLOCK.has(name)) {
        bufferTag = name;
      }
      if (!VOID.has(name) && !selfClosing)
        stack.push(name);
      continue;
    }
    if (token === "<") {
      if (!skipping() && !stack.includes("head"))
        buffer += "<";
      continue;
    }
    if (!skipping() && !stack.includes("head"))
      buffer += decodeEntities(token);
  }
  flush();
  return items;
}
// src/public-copy/markdown.ts
var LIST_ITEM = /^\s{0,3}(?:[-*+]|\d{1,9}[.)])\s+/;
var HEADING = /^ {0,3}(#{1,6})(?:\s+(.*?))?\s*#*\s*$/;
var FENCE = /^ {0,3}(`{3,}|~{3,})/;
var DELIMITER_ROW = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
var REFERENCE_DEFINITION = /^ {0,3}\[[^\]]+\]:\s*\S/;
function tableCells(row) {
  let body = row.trim();
  if (body.startsWith("|"))
    body = body.slice(1);
  if (body.endsWith("|") && !body.endsWith("\\|"))
    body = body.slice(0, -1);
  return body.split(/(?<!\\)\|/).map((cell) => cell.trim());
}
function codeSpans(text) {
  return [...text.matchAll(/(?<!`)(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g)].map((match) => match[2] ?? "");
}
function inlineText(markdown, onAlt) {
  let text = markdown;
  text = text.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, " [code] ");
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)|!\[([^\]]*)\]\[[^\]]*\]/g, (_, alt, refAlt) => {
    onAlt?.(alt ?? refAlt ?? "");
    return "";
  });
  text = text.replace(/<img\b[^>]*?\balt\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi, (_, a, b) => {
    onAlt?.(a ?? b ?? "");
    return "";
  });
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1");
  text = text.replace(/<(?:https?:|mailto:)[^>]+>/g, "");
  text = text.replace(/<\/?[a-zA-Z][^>]*>/g, "");
  text = text.replace(/\*\*|__|~~/g, "");
  text = text.replace(/(^|[\s(])[*_](?=\S)([^*_\n]*?\S)[*_](?=[\s).,;:!?]|$)/g, "$1$2");
  text = text.replace(/\\([\\`*_{}[\]()#+\-.!|>])/g, "$1");
  return text.replace(/[ \t]+/g, " ").trim();
}
function frontMatter(lines) {
  if (lines[0]?.trim() !== "---")
    return { end: 0, blocks: [] };
  const close = lines.findIndex((line, index) => index > 0 && /^(?:---|\.\.\.)\s*$/.test(line));
  if (close === -1)
    return { end: 0, blocks: [] };
  const blocks = [];
  for (let index = 1;index < close; index += 1) {
    const match = /^(title|description):\s*(.*)$/.exec(lines[index] ?? "");
    if (!match?.[1] || !match[2])
      continue;
    const value = match[2].trim().replace(/^(["'])(.*)\1$/, "$2");
    if (!value || value === "|" || value === ">")
      continue;
    const field = match[1];
    blocks.push({ line: index + 1, text: value, surface: field, field });
  }
  return { end: close + 1, blocks };
}
function markdownBlocks(markdown, kind) {
  const lines = markdown.replace(/\r\n?/g, `
`).split(`
`);
  const front = frontMatter(lines);
  const blocks = [...front.blocks];
  const structure = [];
  const prose = kind === "body" ? "body" : kind;
  const headingSurface = kind === "reference" ? "reference" : "heading";
  let paragraph = [];
  let paragraphLine = 0;
  let paragraphHtml = false;
  let lastWasList = false;
  const flush = () => {
    if (paragraph.length) {
      blocks.push({ line: paragraphLine, text: paragraph.join(`
`), surface: prose, ...paragraphHtml ? { html: true } : {} });
    }
    paragraph = [];
    paragraphHtml = false;
  };
  const start = (line, text, html = false) => {
    flush();
    paragraph = [text];
    paragraphLine = line;
    paragraphHtml = html;
  };
  for (let index = front.end;index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const lineNumber = index + 1;
    const fence = FENCE.exec(line);
    if (fence?.[1]) {
      flush();
      const marker = fence[1];
      let end = index + 1;
      while (end < lines.length && !new RegExp(`^ {0,3}${marker[0] === "`" ? "`" : "~"}{${marker.length},}\\s*$`).test(lines[end] ?? ""))
        end += 1;
      index = end;
      lastWasList = false;
      continue;
    }
    if (/^\s*<!--/.test(line)) {
      flush();
      let end = index;
      while (end < lines.length && !(lines[end] ?? "").includes("-->"))
        end += 1;
      index = end;
      lastWasList = false;
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    if (!paragraph.length && !lastWasList && /^(?: {4}|\t)/.test(line))
      continue;
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      if (heading[2])
        blocks.push({ line: lineNumber, text: heading[2], surface: headingSurface });
      lastWasList = false;
      continue;
    }
    if (REFERENCE_DEFINITION.test(line)) {
      flush();
      continue;
    }
    const next = lines[index + 1] ?? "";
    if (line.includes("|") && DELIMITER_ROW.test(next) && next.includes("-")) {
      flush();
      const header = tableCells(line);
      const width = header.length;
      header.forEach((cell) => cell && blocks.push({ line: lineNumber, text: cell, surface: headingSurface }));
      let row = index + 2;
      for (;row < lines.length; row += 1) {
        const text = lines[row] ?? "";
        if (!text.trim() || !text.includes("|"))
          break;
        const cells = tableCells(text);
        if (cells.length !== width) {
          structure.push({ line: row + 1, excerpt: text.trim(), hint: `This table row has ${cells.length} cells; the header has ${width}. GitHub drops or shifts the extra cells.` });
        }
        if (codeSpans(text).some((span) => /(?<!\\)\|/.test(span))) {
          structure.push({ line: row + 1, excerpt: text.trim(), hint: "A pipe inside a code span splits the table cell on GitHub. Escape it as \\| or move the code out of the table." });
        }
        cells.forEach((cell) => cell && blocks.push({ line: row + 1, text: cell, surface: prose }));
      }
      index = row - 1;
      lastWasList = false;
      continue;
    }
    if (LIST_ITEM.test(line)) {
      start(lineNumber, line.replace(LIST_ITEM, ""));
      lastWasList = true;
      continue;
    }
    const quoted = line.replace(/^\s{0,3}>\s?/, "");
    if (!paragraph.length) {
      start(lineNumber, quoted, /^\s*<[a-zA-Z/]/.test(quoted));
      lastWasList = false;
    } else {
      paragraph.push(quoted.replace(/^\s+/, ""));
    }
  }
  flush();
  return { blocks, structure };
}
function extractMarkdown(markdown, location, options = {}) {
  const kind = options.kind ?? "body";
  const { blocks } = markdownBlocks(markdown, kind);
  const items = [];
  for (const block of blocks) {
    const where = `${location}:${block.line}`;
    if (block.field) {
      items.push({ surface: block.surface, text: block.text, location: where, field: block.field });
      continue;
    }
    if (block.html) {
      for (const item of extractHtml(block.text, where)) {
        items.push({ ...item, location: where });
      }
      continue;
    }
    const alts = [];
    const text = inlineText(block.text, (alt) => alts.push(alt));
    for (const alt of alts)
      if (alt.trim())
        items.push({ surface: "alt", text: alt.trim(), location: where, field: "alt" });
    if (text)
      items.push({ surface: block.surface, text, location: where });
  }
  return items;
}
function lintMarkdown(markdown, location, config, options = {}) {
  const kind = options.kind ?? "body";
  const { structure } = markdownBlocks(markdown, kind);
  const plain = inlineText(markdown.replace(/^( {0,3})(`{3,}|~{3,})[\s\S]*?^\1\2\s*$/gm, ""));
  const defined = definedTerms(plain, vocabularyFor(config));
  const findings = [];
  for (const item of extractMarkdown(markdown, location, options)) {
    findings.push(...lintCopy(item.text, {
      surface: item.surface,
      location: item.location,
      format: item.surface === "alt" ? "text" : "markdown",
      definedTerms: defined,
      ...config ? { config } : {},
      ...item.field ? { field: item.field } : {}
    }));
  }
  const prose = kind === "body" ? "body" : kind;
  for (const entry of structure) {
    findings.push({ rule: "render", severity: "error", surface: prose, location: `${location}:${entry.line}`, excerpt: excerptAt(entry.excerpt, 0, 60), hint: entry.hint });
  }
  return findings.sort((a, b) => lineOf(a.location) - lineOf(b.location));
}
function lineOf(location) {
  const match = /:(\d+)$/.exec(location);
  return match?.[1] ? Number(match[1]) : 0;
}
// src/public-copy/pins.ts
var SEMVER = String.raw`(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?`;
function parseVersion(value) {
  const match = new RegExp(`^v?${SEMVER}$`).exec(value.trim());
  if (!match)
    return;
  return { parts: [Number(match[1]), Number(match[2]), Number(match[3])], prerelease: match[4]?.slice(1) };
}
function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b)
    throw new Error(`Not a semantic version: ${a ? right : left}`);
  for (let index = 0;index < 3; index += 1) {
    const difference = (a.parts[index] ?? 0) - (b.parts[index] ?? 0);
    if (difference !== 0)
      return difference;
  }
  if (a.prerelease === b.prerelease)
    return 0;
  if (a.prerelease === undefined)
    return 1;
  if (b.prerelease === undefined)
    return -1;
  return a.prerelease < b.prerelease ? -1 : 1;
}
function escapeRegExp2(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function repositoryFor(pkg) {
  if (pkg.repository) {
    const match = /github\.com[/:]([^/]+\/[^/#]+?)(?:\.git)?(?:#.*)?$/.exec(pkg.repository);
    return match?.[1] ?? pkg.repository.replace(/\.git$/, "");
  }
  const scoped = /^@hraness\/(.+)$/.exec(pkg.name);
  return scoped?.[1] ? `hraness/${scoped[1]}` : undefined;
}
function withLine(location, text, index) {
  if (/:\d+$/.test(location) || location.includes("#"))
    return location;
  const line = text.slice(0, index).split(`
`).length;
  return `${location}:${line}`;
}
function findInstallPins(text, pkg) {
  const patterns = [
    new RegExp(`(?<![\\w@/-])${escapeRegExp2(pkg.name)}@v?${SEMVER}(?![\\w.])`, "g")
  ];
  const repository = repositoryFor(pkg);
  if (repository) {
    const slug = escapeRegExp2(repository);
    patterns.push(new RegExp(`(?<![\\w-])${slug}(?:\\.git)?#v?${SEMVER}(?![\\w.])`, "g"));
    patterns.push(new RegExp(`github\\.com/${slug}/releases/download/v?${SEMVER}(?![\\w.])`, "g"));
  }
  const pins = [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const version = `${match[1]}.${match[2]}.${match[3]}${match[4] ?? ""}`;
      pins.push({ index: match.index, match: match[0], version });
    }
  }
  return pins.sort((a, b) => a.index - b.index);
}
var PLACEHOLDER_RUN = /\/runs\/0+(?![0-9])/g;
function checkInstallPins(texts, pkg) {
  if (!parseVersion(pkg.version))
    throw new Error(`package.json version is not a semantic version: ${pkg.version}`);
  const findings = [];
  for (const { location, text } of texts) {
    for (const pin of findInstallPins(text, pkg)) {
      if (compareVersions(pin.version, pkg.version) >= 0)
        continue;
      findings.push({
        rule: "pins",
        severity: "error",
        surface: "body",
        location: withLine(location, text, pin.index),
        excerpt: excerptAt(text, pin.index, pin.match.length),
        hint: `This pins ${pkg.name} to ${pin.version}; package.json is ${pkg.version}. Derive install lines from the package version.`
      });
    }
    for (const match of text.matchAll(PLACEHOLDER_RUN)) {
      findings.push({
        rule: "pins",
        severity: "error",
        surface: "body",
        location: withLine(location, text, match.index),
        excerpt: excerptAt(text, match.index, match[0].length),
        hint: "This run link has a placeholder ID. Link a real run or remove the link."
      });
    }
  }
  return findings;
}
// src/public-copy/guides.ts
import { createHash } from "crypto";
var SYNCED_GUIDES = ["STYLE.md", "WRITING.md"];
var REPOSITORY_ADDITIONS_HEADING = "## Repository additions";
var STAMP = /\n\n<!-- synced from hraness\/\.github (\S+) sha256:([0-9a-f]{64}) -->\n/;
function readGuideStamp(text) {
  const match = STAMP.exec(text.replace(/\r\n?/g, `
`));
  return match?.[1] && match[2] ? { name: match[1], sha256: match[2] } : undefined;
}
function guideCanonicalHash(text) {
  const normalized = text.replace(/\r\n?/g, `
`);
  const additions = normalized.indexOf(`
${REPOSITORY_ADDITIONS_HEADING}`);
  const above = (additions === -1 ? normalized : normalized.slice(0, additions)).replace(/\s+$/, "") + `
`;
  if (!STAMP.test(above))
    return;
  const body = above.replace(STAMP, `
`);
  return createHash("sha256").update(body, "utf8").digest("hex");
}
function checkGuideText(name, text, location = name) {
  const finding = (hint, excerpt) => ({
    rule: "guides",
    severity: "error",
    surface: "reference",
    location,
    excerpt,
    hint
  });
  const stamp = readGuideStamp(text);
  if (!stamp) {
    return [finding(`${name} has no sync stamp. Run sync_guides.py from hraness/.github to replace it with the canonical copy.`, text.split(`
`, 1)[0] ?? "")];
  }
  const findings = [];
  if (stamp.name !== name) {
    findings.push(finding(`The stamp names ${stamp.name}, but this file is ${name}.`, `sha256:${stamp.sha256}`));
  }
  const actual = guideCanonicalHash(text);
  if (actual !== stamp.sha256) {
    findings.push(finding(`The shared text in ${name} was edited after the sync (sha256 ${actual?.slice(0, 12) ?? "missing"}, stamp ${stamp.sha256.slice(0, 12)}). ` + `Change shared rules in hraness/.github and resync; put local rules under \u201CRepository additions\u201D.`, `sha256:${stamp.sha256}`));
  }
  return findings;
}
// src/public-copy/baseline.ts
function fileOfLocation(location) {
  const hash = location.indexOf("#");
  const withoutSelector = hash === -1 ? location : location.slice(0, hash);
  return withoutSelector.replace(/:\d+(?::\d+)?$/, "");
}
function countFindings(findings) {
  const counts = {};
  for (const finding of findings) {
    if (finding.severity !== "error")
      continue;
    const file = fileOfLocation(finding.location);
    const rules = counts[file] ??= {};
    rules[finding.rule] = (rules[finding.rule] ?? 0) + 1;
  }
  return normalizeCounts(counts);
}
function normalizeCounts(counts) {
  const result = {};
  for (const file of Object.keys(counts).sort()) {
    const rules = counts[file] ?? {};
    const kept = {};
    for (const rule of Object.keys(rules).sort()) {
      const count = rules[rule] ?? 0;
      if (count > 0)
        kept[rule] = count;
    }
    if (Object.keys(kept).length)
      result[file] = kept;
  }
  return result;
}
function keys(counts) {
  return Object.entries(counts).flatMap(([file, rules]) => Object.keys(rules).map((rule) => [file, rule]));
}
function countOf(counts, file, rule) {
  return counts[file]?.[rule] ?? 0;
}
function compareBaseline(current, baseline) {
  const regressions = [];
  const improvements = [];
  const seen = new Set;
  for (const [file, rule] of [...keys(current), ...keys(baseline)]) {
    const key = `${file}\x00${rule}`;
    if (seen.has(key))
      continue;
    seen.add(key);
    const now = countOf(current, file, rule);
    const before = countOf(baseline, file, rule);
    if (now > before)
      regressions.push({ file, rule, baseline: before, current: now });
    else if (now < before)
      improvements.push({ file, rule, baseline: before, current: now });
  }
  const order = (a, b) => a.file.localeCompare(b.file) || a.rule.localeCompare(b.rule);
  return { regressions: regressions.sort(order), improvements: improvements.sort(order) };
}
function lowerBaseline(baseline, current) {
  const result = {};
  for (const [file, rule] of keys(baseline)) {
    const lowered = Math.min(countOf(baseline, file, rule), countOf(current, file, rule));
    if (lowered > 0)
      (result[file] ??= {})[rule] = lowered;
  }
  return normalizeCounts(result);
}
function parseBaseline(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("The baseline must be a JSON object.");
  const record = value;
  if (record.version !== 1)
    throw new Error("The baseline version must be 1.");
  const counts = record.counts;
  if (typeof counts !== "object" || counts === null || Array.isArray(counts))
    throw new Error("The baseline counts must be an object.");
  const parsed = {};
  for (const [file, rules] of Object.entries(counts)) {
    if (typeof rules !== "object" || rules === null || Array.isArray(rules))
      throw new Error(`The baseline entry for ${file} must be an object.`);
    for (const [rule, count] of Object.entries(rules)) {
      if (!Number.isSafeInteger(count) || count < 0)
        throw new Error(`The baseline count for ${file} ${rule} must be a non-negative integer.`);
      (parsed[file] ??= {})[rule] = count;
    }
  }
  return { version: 1, counts: normalizeCounts(parsed) };
}
function serializeBaseline(counts) {
  return `${JSON.stringify({ version: 1, counts: normalizeCounts(counts) }, null, 2)}
`;
}
// src/public-copy/config.ts
var DEFAULT_CONFIG_FILE = "public-copy.config.json";
var DEFAULT_BASELINE_FILE = ".public-copy-baseline.json";
var KEYS = new Set(["$schema", "html", "markdown", "text", "json", "reference", "generated", "exclude", "vocabulary", "brand", "package", "baseline", "guides"]);
function object(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value;
}
function strings(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item)) {
    throw new Error(`${label} must be an array of non-empty strings.`);
  }
  return value;
}
function surface(value, label) {
  if (typeof value !== "string" || !COPY_SURFACES.includes(value)) {
    throw new Error(`${label} must be one of ${COPY_SURFACES.join(", ")}.`);
  }
  return value;
}
function file(value, label) {
  if (typeof value !== "string" || !value)
    throw new Error(`${label} must be a non-empty string.`);
  return value;
}
function parseCopyConfig(value) {
  const raw = object(value, "The config");
  for (const key of Object.keys(raw)) {
    if (!KEYS.has(key))
      throw new Error(`Unknown config key \u201C${key}\u201D.`);
  }
  const config = {};
  for (const key of ["html", "markdown", "reference", "generated", "exclude"]) {
    if (raw[key] !== undefined)
      config[key] = strings(raw[key], key);
  }
  if (raw.text !== undefined) {
    if (!Array.isArray(raw.text))
      throw new Error("text must be an array.");
    config.text = raw.text.map((entry, index) => {
      const item = object(entry, `text[${index}]`);
      return { file: file(item.file, `text[${index}].file`), surface: surface(item.surface, `text[${index}].surface`) };
    });
  }
  if (raw.json !== undefined) {
    if (!Array.isArray(raw.json))
      throw new Error("json must be an array.");
    config.json = raw.json.map((entry, index) => {
      const item = object(entry, `json[${index}]`);
      const path = file(item.path, `json[${index}].path`);
      if (!path.startsWith("$"))
        throw new Error(`json[${index}].path must start with $.`);
      return { file: file(item.file, `json[${index}].file`), path, surface: surface(item.surface, `json[${index}].surface`) };
    });
  }
  if (raw.vocabulary !== undefined) {
    const vocabulary = object(raw.vocabulary, "vocabulary");
    for (const key of Object.keys(vocabulary)) {
      if (key !== "add" && key !== "allowWithDefinition")
        throw new Error(`Unknown vocabulary key \u201C${key}\u201D.`);
    }
    config.vocabulary = {
      ...vocabulary.add === undefined ? {} : { add: strings(vocabulary.add, "vocabulary.add") },
      ...vocabulary.allowWithDefinition === undefined ? {} : { allowWithDefinition: strings(vocabulary.allowWithDefinition, "vocabulary.allowWithDefinition") }
    };
  }
  if (raw.brand !== undefined)
    config.brand = file(raw.brand, "brand");
  if (raw.package !== undefined)
    config.package = file(raw.package, "package");
  if (raw.baseline !== undefined)
    config.baseline = file(raw.baseline, "baseline");
  if (raw.guides !== undefined) {
    if (raw.guides !== true && raw.guides !== false && raw.guides !== "required")
      throw new Error('guides must be true, false, or "required".');
    config.guides = raw.guides;
  }
  return config;
}
// src/public-copy/json-path.ts
function parseJsonPath(path) {
  if (!path.startsWith("$"))
    throw new Error(`JSONPath must start with $: ${path}`);
  const segments = [];
  const token = /\.([A-Za-z_$][\w$-]*)|\.\*|\[\*\]|\[(\d+)\]|\[(?:'([^']*)'|"([^"]*)")\]/y;
  token.lastIndex = 1;
  while (token.lastIndex < path.length) {
    const start = token.lastIndex;
    const match = token.exec(path);
    if (!match)
      throw new Error(`Unsupported JSONPath at position ${start}: ${path}`);
    if (match[1] !== undefined)
      segments.push({ kind: "key", key: match[1] });
    else if (match[2] !== undefined)
      segments.push({ kind: "index", index: Number(match[2]) });
    else if (match[3] !== undefined || match[4] !== undefined)
      segments.push({ kind: "key", key: match[3] ?? match[4] ?? "" });
    else
      segments.push({ kind: "wildcard" });
  }
  return segments;
}
function selectJsonPath(value, path) {
  let current = [{ path: "$", value }];
  for (const segment of parseJsonPath(path)) {
    const next = [];
    for (const { path: at, value: node } of current) {
      if (segment.kind === "wildcard") {
        if (Array.isArray(node))
          node.forEach((item, index) => next.push({ path: `${at}[${index}]`, value: item }));
        else if (typeof node === "object" && node !== null) {
          for (const [key, item] of Object.entries(node))
            next.push({ path: `${at}.${key}`, value: item });
        }
      } else if (segment.kind === "index") {
        if (Array.isArray(node) && segment.index < node.length)
          next.push({ path: `${at}[${segment.index}]`, value: node[segment.index] });
      } else if (typeof node === "object" && node !== null && !Array.isArray(node) && Object.hasOwn(node, segment.key)) {
        next.push({ path: `${at}.${segment.key}`, value: node[segment.key] });
      }
    }
    current = next;
  }
  return current;
}
// src/public-copy/files.ts
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, relative, resolve } from "path";
function checkGuides(repoRoot, options = {}) {
  const findings = [];
  for (const name of SYNCED_GUIDES) {
    const path = join(repoRoot, name);
    if (!existsSync(path)) {
      if (options.required) {
        findings.push({
          rule: "guides",
          severity: "error",
          surface: "reference",
          location: name,
          excerpt: "",
          hint: `${name} is missing. Sync it from hraness/.github with sync_guides.py.`
        });
      }
      continue;
    }
    findings.push(...checkGuideText(name, readFileSync(path, "utf8"), name));
  }
  return findings;
}
var ALWAYS_EXCLUDED = ["node_modules/**", "**/node_modules/**", ".git/**"];
function expand(root, patterns, exclude) {
  const skip = [...ALWAYS_EXCLUDED, ...exclude].map((pattern) => new Bun.Glob(pattern));
  const files = new Set;
  for (const pattern of patterns) {
    if (!/[*?[{]/.test(pattern)) {
      if (existsSync(join(root, pattern)))
        files.add(pattern);
      continue;
    }
    for (const file2 of new Bun.Glob(pattern).scanSync({ cwd: root, onlyFiles: true })) {
      const path = file2.replaceAll("\\", "/");
      if (!skip.some((glob) => glob.match(path)))
        files.add(path);
    }
  }
  return [...files].sort();
}
function read(root, file2) {
  return readFileSync(join(root, file2), "utf8");
}
function runPublicCopy(root, config) {
  const exclude = config.exclude ?? [];
  const findings = [];
  const raw = [];
  const descriptions = new Map;
  const noteDescription = (text, location) => {
    const key = text.replace(/\s+/g, " ").trim().toLowerCase();
    if (!key)
      return;
    descriptions.set(key, [...descriptions.get(key) ?? [], location]);
  };
  const kinds = new Map;
  for (const file2 of expand(root, config.markdown ?? [], exclude))
    kinds.set(file2, "body");
  for (const file2 of expand(root, config.reference ?? [], exclude))
    kinds.set(file2, "reference");
  for (const file2 of expand(root, config.generated ?? [], exclude))
    kinds.set(file2, "generated");
  for (const [file2, kind] of [...kinds].sort(([a], [b]) => a.localeCompare(b))) {
    const text = read(root, file2);
    raw.push({ location: file2, text });
    const fileFindings = lintMarkdown(text, file2, config, { kind });
    findings.push(...fileFindings);
    const normalized = text.replace(/\r\n?/g, `
`);
    const frontEnd = normalized.startsWith(`---
`) ? normalized.indexOf(`
---`, 3) : -1;
    const description = frontEnd === -1 ? undefined : /^description:\s*(.+)$/m.exec(normalized.slice(4, frontEnd))?.[1];
    if (description)
      noteDescription(description.trim().replace(/^(["'])(.*)\1$/, "$2"), file2);
  }
  const htmlFiles = expand(root, config.html ?? [], exclude);
  for (const file2 of htmlFiles) {
    const html = read(root, file2);
    raw.push({ location: file2, text: html });
    for (const item of extractHtml(html, file2)) {
      findings.push(...lintCopy(item.text, {
        surface: item.surface,
        location: item.location,
        config,
        format: "html",
        ...item.field ? { field: item.field } : {}
      }));
      if (item.surface === "description" && item.location.endsWith("#meta[name=description]"))
        noteDescription(item.text, item.location);
    }
  }
  const textFiles = [];
  for (const entry of config.text ?? []) {
    const path = join(root, entry.file);
    if (!existsSync(path))
      throw new Error(`text file not found: ${entry.file}`);
    const text = read(root, entry.file);
    textFiles.push(entry.file);
    raw.push({ location: entry.file, text });
    if (entry.surface === "body" || entry.surface === "agent" || entry.surface === "generated" || entry.surface === "reference") {
      findings.push(...lintMarkdown(text, entry.file, config, { kind: entry.surface }));
    } else {
      findings.push(...lintCopy(text.trim(), { surface: entry.surface, location: `${entry.file}:1`, config }));
    }
  }
  const jsonFiles = [];
  for (const entry of config.json ?? []) {
    const path = join(root, entry.file);
    if (!existsSync(path))
      throw new Error(`json file not found: ${entry.file}`);
    const parsed = JSON.parse(read(root, entry.file));
    jsonFiles.push(entry.file);
    for (const match of selectJsonPath(parsed, entry.path)) {
      if (typeof match.value !== "string")
        continue;
      findings.push(...lintCopy(match.value, { surface: entry.surface, location: `${entry.file}#${match.path}`, config }));
    }
  }
  if (config.package) {
    const manifest = JSON.parse(read(root, config.package));
    const name = manifest.name;
    const version = manifest.version;
    if (typeof name !== "string" || typeof version !== "string")
      throw new Error(`${config.package} needs a name and a version.`);
    const repository = typeof manifest.repository === "string" ? manifest.repository : typeof manifest.repository === "object" && manifest.repository !== null && typeof manifest.repository.url === "string" ? manifest.repository.url : undefined;
    findings.push(...checkInstallPins(raw, { name, version, ...repository ? { repository } : {} }));
    if (typeof manifest.description === "string") {
      findings.push(...lintCopy(manifest.description, { surface: "description", field: "package", location: `${config.package}#description`, config }));
    }
  }
  for (const [key, locations] of descriptions) {
    const files2 = new Set(locations.map((location) => location.split("#")[0]));
    if (files2.size < 2)
      continue;
    for (const location of locations) {
      const others = locations.filter((other) => other !== location).map((other) => other.split("#")[0]);
      findings.push({
        rule: "meta",
        severity: "error",
        surface: "description",
        location,
        excerpt: excerptAt(key, 0, 80),
        hint: `The same description appears on ${others.join(", ")}. Write a unique description for each page.`
      });
    }
  }
  if (config.guides !== false)
    findings.push(...checkGuides(root, { required: config.guides === "required" }));
  const files = [...new Set([...kinds.keys(), ...htmlFiles, ...textFiles, ...jsonFiles])].sort();
  return { findings: sortFindings(findings), files };
}
function sortFindings(findings) {
  const lineOf2 = (location) => Number(/:(\d+)$/.exec(location)?.[1] ?? 0);
  const fileOf = (location) => location.replace(/(?:#.*|:\d+)$/, "");
  return [...findings].sort((a, b) => fileOf(a.location).localeCompare(fileOf(b.location)) || lineOf2(a.location) - lineOf2(b.location) || a.location.localeCompare(b.location) || a.rule.localeCompare(b.rule) || a.excerpt.localeCompare(b.excerpt));
}
function loadCopyConfig(root, configPath = DEFAULT_CONFIG_FILE) {
  const path = resolve(root, configPath);
  if (!existsSync(path))
    throw new Error(`No ${relative(root, path) || configPath} in ${root}.`);
  return parseCopyConfig(JSON.parse(readFileSync(path, "utf8")));
}
function baselinePath(root, config) {
  return resolve(root, config.baseline ?? DEFAULT_BASELINE_FILE);
}
function readBaseline(root, config) {
  const path = baselinePath(root, config);
  if (!existsSync(path))
    return;
  return parseBaseline(JSON.parse(readFileSync(path, "utf8"))).counts;
}
function writeBaseline(root, config, counts) {
  writeFileSync(baselinePath(root, config), serializeBaseline(counts));
}
// src/public-copy/expect.ts
class CopyAssertionError extends Error {
  name = "CopyAssertionError";
}
function expectInstallPinsMatch(readme, pkg, options = {}) {
  const pins = findInstallPins(readme, pkg);
  if ((options.require ?? true) && pins.length === 0) {
    throw new CopyAssertionError(`Expected an install line that pins ${pkg.name} to ${pkg.version}; found none.`);
  }
  const stale = checkInstallPins([{ location: "readme", text: readme }], pkg);
  if (stale.length) {
    throw new CopyAssertionError(`Install pins do not match ${pkg.name}@${pkg.version}:
${stale.map((f) => `  ${f.excerpt}`).join(`
`)}`);
  }
}
var RUN_URL = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/([1-9]\d{9,})(?:\/job\/\d+|\/attempts\/\d+)?\/?$/;
function expectRealRunUrl(url) {
  if (!RUN_URL.test(url)) {
    throw new CopyAssertionError(`Expected a GitHub Actions run URL such as https://github.com/owner/repo/actions/runs/1234567890; got ${url}.`);
  }
}
var NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
var INVARIANT_NOUNS = new Set(["series", "species", "sheep", "fish", "data", "information", "news"]);
function nounAfterCount(text, count) {
  const forms = [String(count)];
  const word = NUMBER_WORDS[count];
  if (word)
    forms.push(word);
  if (count === 0)
    forms.push("no");
  const pattern = new RegExp(`(?<![\\w.,])(?:${forms.join("|")})(?![\\w.,])\\s+([A-Za-z][A-Za-z-]*)`, "i");
  return pattern.exec(text)?.[1]?.toLowerCase();
}
function expectCountAgreement(render, counts = [0, 1, 3]) {
  const nouns = new Map;
  for (const count of counts) {
    const text = render(count);
    const noun = nounAfterCount(text, count);
    if (!noun)
      throw new CopyAssertionError(`render(${count}) does not state the count before a noun: \u201C${text}\u201D.`);
    nouns.set(count, noun);
  }
  const singular = nouns.get(1);
  const plurals = [...nouns].filter(([count]) => count !== 1);
  for (const [count, noun] of plurals) {
    if (singular !== undefined && noun === singular && !INVARIANT_NOUNS.has(noun)) {
      throw new CopyAssertionError(`render(1) and render(${count}) use the same noun \u201C${noun}\u201D. One takes the singular; other counts take the plural.`);
    }
    const first = plurals[0]?.[1];
    if (first !== undefined && noun !== first) {
      throw new CopyAssertionError(`render(${plurals[0]?.[0]}) uses \u201C${first}\u201D but render(${count}) uses \u201C${noun}\u201D.`);
    }
  }
}
function expectNoInternalVocabulary(text, surface2 = "body", config) {
  const findings = lintCopy(text, { surface: surface2, location: "text", ...config ? { config } : {} }).filter((f) => f.rule === "vocab");
  if (findings.length) {
    throw new CopyAssertionError(`Internal vocabulary on a ${surface2} surface:
${findings.map((f) => `  ${f.excerpt} (${f.hint})`).join(`
`)}`);
  }
}
export {
  writeBaseline,
  tableCells,
  serializeBaseline,
  selectJsonPath,
  runPublicCopy,
  readGuideStamp,
  readBaseline,
  parseCopyConfig,
  parseBaseline,
  normalizeCounts,
  lowerBaseline,
  loadCopyConfig,
  lintMarkdown,
  lintCopy,
  inlineText,
  guideCanonicalHash,
  findInstallPins,
  fileOfLocation,
  extractMarkdown,
  extractHtml,
  expectRealRunUrl,
  expectNoInternalVocabulary,
  expectInstallPinsMatch,
  expectCountAgreement,
  definedTerms,
  decodeEntities,
  countFindings,
  compareVersions,
  compareBaseline,
  checkInstallPins,
  checkGuides,
  checkGuideText,
  SYNCED_GUIDES,
  SELF_CERTIFICATION,
  RETIRED_NAMES,
  PUBLIC_COPY_RULES_VERSION,
  PRECISION_WORDS,
  INTERNAL_VOCABULARY,
  DEFAULT_CONFIG_FILE,
  DEFAULT_BASELINE_FILE,
  CopyAssertionError,
  COPY_SURFACES
};
