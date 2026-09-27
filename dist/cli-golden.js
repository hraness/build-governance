// @bun
// src/public-copy/scanners.ts
var SLASH = 47;
var HASH = 35;
var COLON = 58;
var BACKTICK = 96;
var LT = 60;
var GT = 62;
var EQUALS = 61;
var DOUBLE_QUOTE = 34;
var SINGLE_QUOTE = 39;
var DASH = 45;
var PIPE = 124;
var MIDDLE_DOT = 183;
var EN_DASH = 8211;
var EM_DASH = 8212;
function isWhitespace(code) {
  if (code <= 32)
    return code === 32 || code >= 9 && code <= 13;
  return code === 160 || code === 5760 || code >= 8192 && code <= 8202 || code === 8232 || code === 8233 || code === 8239 || code === 8287 || code === 12288 || code === 65279;
}
function isLineTerminator(code) {
  return code === 10 || code === 13 || code === 8232 || code === 8233;
}
function isAsciiLetter(code) {
  return code >= 65 && code <= 90 || code >= 97 && code <= 122;
}
function isDigit(code) {
  return code >= 48 && code <= 57;
}
function isTagNameChar(code) {
  return isAsciiLetter(code) || isDigit(code) || code === 95 || code === COLON || code === DASH;
}
function isAttributeNameChar(code) {
  return !isWhitespace(code) && code !== DOUBLE_QUOTE && code !== SINGLE_QUOTE && code !== GT && code !== SLASH && code !== EQUALS;
}
function isUnquotedValueChar(code) {
  return !isWhitespace(code) && code !== DOUBLE_QUOTE && code !== SINGLE_QUOTE && code !== EQUALS && code !== LT && code !== GT && code !== BACKTICK;
}
function lineFreeSuffixStart(text) {
  let start = text.length;
  while (start > 0 && !isLineTerminator(text.charCodeAt(start - 1)))
    start -= 1;
  return start;
}
function githubSlug(raw) {
  const n = raw.length;
  const nextSlash = new Int32Array(n + 1);
  const nextHash = new Int32Array(n + 1);
  nextSlash[n] = n;
  nextHash[n] = n;
  for (let index = n - 1;index >= 0; index -= 1) {
    const code = raw.charCodeAt(index);
    nextSlash[index] = code === SLASH ? index : nextSlash[index + 1];
    nextHash[index] = code === HASH ? index : nextHash[index + 1];
  }
  const lineFree = lineFreeSuffixStart(raw);
  for (let at = raw.indexOf("github.com");at !== -1; at = raw.indexOf("github.com", at + 1)) {
    const separator = raw.charCodeAt(at + 10);
    if (separator !== SLASH && separator !== COLON)
      continue;
    const owner = at + 11;
    const slash = nextSlash[owner];
    if (slash === n || slash === owner)
      continue;
    const hash = nextHash[slash + 1];
    if (hash === slash + 1 || nextSlash[slash + 1] < hash)
      continue;
    if (hash < n && hash + 1 < lineFree)
      continue;
    let name = raw.slice(slash + 1, hash);
    if (name.length > 4 && name.endsWith(".git"))
      name = name.slice(0, -4);
    return `${raw.slice(owner, slash)}/${name}`;
  }
  return;
}
function replaceBacktickSpans(text, replacement) {
  const starts = [];
  const lengths = [];
  for (let index = 0;index < text.length; ) {
    if (text.charCodeAt(index) !== BACKTICK) {
      index += 1;
      continue;
    }
    let end = index;
    while (end < text.length && text.charCodeAt(end) === BACKTICK)
      end += 1;
    starts.push(index);
    lengths.push(end - index);
    index = end;
  }
  const close = new Int32Array(starts.length).fill(-1);
  const firstLater = new Map;
  for (let run = starts.length - 1;run >= 0; run -= 1) {
    const length = lengths[run];
    for (let candidate = length;candidate >= 1; candidate -= 1) {
      const found = firstLater.get(candidate);
      if (found !== undefined) {
        close[run] = found;
        break;
      }
    }
    firstLater.set(length, run);
  }
  let out = "";
  let last = 0;
  for (let run = 0;run < starts.length; ) {
    const closing = close[run];
    if (closing === -1) {
      run += 1;
      continue;
    }
    out += text.slice(last, starts[run]) + replacement;
    last = starts[closing] + lengths[closing];
    run = closing + 1;
  }
  return out + text.slice(last);
}
function removeHtmlTags(text) {
  let out = "";
  let last = 0;
  let nextGt = -2;
  for (let index = text.indexOf("<");index !== -1; ) {
    const letter = text.charCodeAt(index + 1) === SLASH ? index + 2 : index + 1;
    if (!isAsciiLetter(text.charCodeAt(letter))) {
      index = text.indexOf("<", index + 1);
      continue;
    }
    if (nextGt <= letter)
      nextGt = text.indexOf(">", letter + 1);
    if (nextGt === -1)
      break;
    out += text.slice(last, index);
    last = nextGt + 1;
    index = text.indexOf("<", last);
  }
  return out + text.slice(last);
}
function whitespaceEnd(text, index) {
  let end = index;
  while (end < text.length && isWhitespace(text.charCodeAt(end)))
    end += 1;
  return end;
}
function splitTitle(title) {
  const parts = [];
  let last = 0;
  for (let index = 0;index < title.length; ) {
    const code = title.charCodeAt(index);
    let end;
    if (isWhitespace(code)) {
      const after = whitespaceEnd(title, index);
      const next = title.charCodeAt(after);
      if (next === MIDDLE_DOT || next === PIPE)
        end = whitespaceEnd(title, after + 1);
      else if ((next === EN_DASH || next === EM_DASH || next === DASH) && isWhitespace(title.charCodeAt(after + 1))) {
        end = whitespaceEnd(title, after + 1);
      } else {
        index = after;
        continue;
      }
    } else if (code === MIDDLE_DOT || code === PIPE) {
      end = whitespaceEnd(title, index + 1);
    } else if (code === COLON && isWhitespace(title.charCodeAt(index + 1))) {
      end = whitespaceEnd(title, index + 1);
    } else {
      index += 1;
      continue;
    }
    parts.push(title.slice(last, index));
    last = end;
    index = end;
  }
  parts.push(title.slice(last));
  return parts;
}
function stripLocationSuffix(location) {
  const hash = location.indexOf("#", lineFreeSuffixStart(location));
  let digits = location.length;
  while (digits > 0 && isDigit(location.charCodeAt(digits - 1)))
    digits -= 1;
  const colon = digits < location.length && location.charCodeAt(digits - 1) === COLON ? digits - 1 : -1;
  const cut = hash === -1 ? colon : colon === -1 ? hash : Math.min(hash, colon);
  return cut === -1 ? location : location.slice(0, cut);
}
function forwardSearch(text, needle) {
  let searchedFrom = Number.POSITIVE_INFINITY;
  let found = -1;
  return (from) => {
    if (from < searchedFrom || found !== -1 && found < from) {
      searchedFrom = from;
      found = text.indexOf(needle, from);
    }
    return found;
  };
}
function startsWithIgnoringAsciiCase(text, prefix, index) {
  if (index + prefix.length > text.length)
    return false;
  for (let offset = 0;offset < prefix.length; offset += 1) {
    const expected = prefix.charCodeAt(offset);
    const actual = text.charCodeAt(index + offset);
    if (actual !== expected && !(isAsciiLetter(expected) && (actual | 32) === (expected | 32) && isAsciiLetter(actual)))
      return false;
  }
  return true;
}
function htmlTokenizer(html) {
  const n = html.length;
  let tables;
  const table = () => {
    if (tables)
      return tables;
    const space = new Int32Array(n + 1);
    const name = new Int32Array(n + 1);
    const unquoted = new Int32Array(n + 1);
    const dq = new Int32Array(n + 1);
    const sq = new Int32Array(n + 1);
    space[n] = name[n] = unquoted[n] = dq[n] = sq[n] = n;
    for (let index = n - 1;index >= 0; index -= 1) {
      const code = html.charCodeAt(index);
      space[index] = isWhitespace(code) ? space[index + 1] : index;
      name[index] = isAttributeNameChar(code) ? name[index + 1] : index;
      unquoted[index] = isUnquotedValueChar(code) ? unquoted[index + 1] : index;
      dq[index] = code === DOUBLE_QUOTE ? index : dq[index + 1];
      sq[index] = code === SINGLE_QUOTE ? index : sq[index + 1];
    }
    tables = { space, name, unquoted, dq, sq };
    return tables;
  };
  let memo;
  const outcomes = [];
  const attributeList = (start) => {
    const { space, name, unquoted, dq, sq } = table();
    memo ??= new Int32Array(n + 1);
    const visited = [];
    let result;
    let at = start;
    for (;; ) {
      const known = memo[at];
      if (known !== 0) {
        result = outcomes[known - 1];
        break;
      }
      visited.push(at);
      const next2 = space[at];
      if (next2 > at && next2 < n && isAttributeNameChar(html.charCodeAt(next2))) {
        const nameEnd = name[next2];
        const equals = space[nameEnd];
        if (equals < n && html.charCodeAt(equals) === EQUALS) {
          const value = space[equals + 1];
          const code2 = html.charCodeAt(value);
          let valueEnd;
          if (code2 === DOUBLE_QUOTE || code2 === SINGLE_QUOTE) {
            const quote = (code2 === DOUBLE_QUOTE ? dq : sq)[value + 1];
            if (quote === n) {
              result = null;
              break;
            }
            valueEnd = quote + 1;
          } else if (value < n && isUnquotedValueChar(code2)) {
            valueEnd = unquoted[value];
          } else {
            result = null;
            break;
          }
          at = valueEnd;
        } else {
          at = nameEnd;
        }
        continue;
      }
      const code = html.charCodeAt(next2);
      if (code === SLASH && html.charCodeAt(next2 + 1) === GT)
        result = { attributeEnd: at, end: next2 + 2, selfClosing: "/" };
      else if (code === GT)
        result = { attributeEnd: at, end: next2 + 1, selfClosing: "" };
      else
        result = null;
      break;
    }
    outcomes.push(result);
    for (const index of visited)
      memo[index] = outcomes.length;
    return result;
  };
  const commentEnd = forwardSearch(html, "-->");
  const gt = forwardSearch(html, ">");
  const next = (index) => {
    if (index >= n)
      return;
    if (html.charCodeAt(index) !== LT) {
      const lt = html.indexOf("<", index);
      const end = lt === -1 ? n : lt;
      return { token: html.slice(index, end), end };
    }
    if (html.startsWith("<!--", index)) {
      const close = commentEnd(index + 4);
      if (close !== -1)
        return { token: html.slice(index, close + 3), end: close + 3 };
    }
    if (startsWithIgnoringAsciiCase(html, "<!doctype", index)) {
      const close = gt(index + 9);
      if (close !== -1)
        return { token: html.slice(index, close + 1), end: close + 1 };
    }
    if (html.charCodeAt(index + 1) === SLASH) {
      const { space } = table();
      const nameStart = space[index + 2];
      if (isAsciiLetter(html.charCodeAt(nameStart))) {
        let nameEnd = nameStart + 1;
        while (nameEnd < n && isTagNameChar(html.charCodeAt(nameEnd)))
          nameEnd += 1;
        const close = space[nameEnd];
        if (html.charCodeAt(close) === GT) {
          return { token: html.slice(index, close + 1), end: close + 1, closing: html.slice(nameStart, nameEnd) };
        }
      }
    } else if (isAsciiLetter(html.charCodeAt(index + 1))) {
      let nameEnd = index + 2;
      while (nameEnd < n && isTagNameChar(html.charCodeAt(nameEnd)))
        nameEnd += 1;
      const tag = attributeList(nameEnd);
      if (tag) {
        return {
          token: html.slice(index, tag.end),
          end: tag.end,
          opening: html.slice(index + 1, nameEnd),
          attributeSource: html.slice(nameEnd, tag.attributeEnd),
          selfClosing: tag.selfClosing
        };
      }
    }
    return { token: "<", end: index + 1 };
  };
  return { next };
}

// src/public-copy/rules.ts
var PUBLIC_COPY_RULES_VERSION = "hraness-public-copy/v1";
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
  return splitTitle(title).map((part) => part.trim().toLowerCase()).filter(Boolean);
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

// src/public-copy/cli-help.ts
var CLI_HELP_KINDS = ["bare", "help", "command"];
var CLI_HELP_BUDGETS = {
  bare: { lines: 25, linesSeverity: "error", columns: 80, columnsSeverity: "error" },
  help: { lines: 60, linesSeverity: "error", columns: 100, columnsSeverity: "warn" },
  command: { lines: 60, linesSeverity: "warn", columns: 100, columnsSeverity: "warn" }
};
var CLI_JARGON = [
  "admission",
  "admitted",
  "qualification",
  "qualified",
  "custody",
  "receipt",
  "lane",
  "gate",
  "surface",
  "projection",
  "habitat",
  "organism"
];
var CLI_JARGON_WARN_ONLY = ["pin"];
var CLI_PROPER_NOUNS = [
  "Mac",
  "Messages",
  "Chrome",
  "Safari",
  "Firefox",
  "Edge",
  "Brave",
  "Arc",
  "Finder",
  "System Settings",
  "Keychain Access",
  "Privacy & Security",
  "Full Disk Access",
  "Automation",
  "Contacts",
  "Accessibility",
  "Screen & System Audio Recording",
  "Camera",
  "Microphone",
  "Local Network",
  "Firewall",
  "Notifications",
  "Login Items & Extensions",
  "Login Items",
  "Settings",
  "Enter",
  "Return",
  "Escape",
  "Option",
  "Command",
  "Control",
  "Shift",
  "Always Allow",
  "Allow",
  "Don't Allow",
  "Apple",
  "Apple Intelligence",
  "Xcode",
  "Terminal",
  "Ghostty",
  "Zed",
  "Warp",
  "WezTerm",
  "Visual Studio Code",
  "Windows",
  "Linux",
  "Homebrew",
  "Bun",
  "Node",
  "Deno",
  "Rust",
  "Swift",
  "Python",
  "Markdown",
  "Git",
  "Google",
  "Slack",
  "Stripe",
  "Vercel",
  "Cloudflare",
  "Claude",
  "Claude Code",
  "Codex",
  "Devin",
  "Cursor",
  "Gemini",
  "OpenAI",
  "Anthropic",
  "Ollama",
  "Hraness",
  "Textbutler",
  "Ghostget",
  "Wordcell",
  "Sponge",
  "PeopleBlade",
  "AI Charts",
  "Slopcamera",
  "Valhalla",
  "Soundfish",
  "Gobstopper",
  "Morphogen",
  "Lifecharts",
  "System One",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
  "English"
];
var ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
function escapeRegExp2(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function columns(line) {
  return [...line].length;
}
function helpLines(text) {
  const lines = text.replace(ANSI, "").replace(/\r\n?/g, `
`).split(`
`);
  while (lines.length && !lines[lines.length - 1].trim())
    lines.pop();
  return lines;
}
function literalSpans(text) {
  const spans = [];
  const patterns = [
    /`[^`]*`/g,
    /"[^"]*"/g,
    /\u201C[^\u201D]*\u201D/g,
    /'[^'\s][^']*'/g,
    /<[^>]*>/g,
    /\[[^\]]*\]/g,
    /\{[^}]*\}/g,
    /(?<!\S)--?[A-Za-z][\w-]*(?:[= ]<[^>]*>)?/g,
    /\S*[/\\~@]\S*/g,
    /\S+\.\S+/g
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern))
      spans.push([match.index, match.index + match[0].length]);
  }
  return spans;
}
function sentenceCaseBreak(text, nouns) {
  const exempt = literalSpans(text);
  for (const noun of nouns) {
    for (const match of text.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp2(noun)}(?![\\p{L}\\p{N}])`, "gu"))) {
      exempt.push([match.index, match.index + noun.length]);
    }
  }
  for (const match of text.matchAll(/\S+/g)) {
    const before = text.slice(0, match.index);
    if (!/[\p{L}\p{N}]/u.test(before) || /(?:[.!?:\u00B7|\u2022]|\s[-\u2013]|\()\s*$/.test(before))
      continue;
    const lead = match[0].search(/[\p{L}\p{N}]/u);
    if (lead === -1)
      continue;
    const start = match.index + lead;
    if (exempt.some(([from, to]) => start >= from && start < to))
      continue;
    const bare = match[0].replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (!/^\p{Lu}\p{Ll}+(?:'\p{Ll}+)?$/u.test(bare))
      continue;
    return { word: bare, index: start };
  }
  return;
}
function proseOf(line, index) {
  if (!line.trim())
    return;
  const indent = /^\s*/.exec(line)[0].length;
  if (indent === 0) {
    if (/^usage:/i.test(line))
      return;
    const gap2 = /\S( {2,}|\t)\S/.exec(line);
    if (gap2)
      return { text: line.slice(gap2.index + 1 + gap2[1].length), offset: gap2.index + 1 + gap2[1].length, role: "summary" };
    return { text: line, offset: 0, role: index === 0 ? "prose" : "heading" };
  }
  const gap = /\S( {2,}|\t)(?=\S)/.exec(line.slice(indent));
  if (gap) {
    const offset = indent + gap.index + 1 + gap[1].length;
    return { text: line.slice(offset), offset, role: "summary" };
  }
  const trimmed = line.trim();
  if (/^[$>#]/.test(trimmed) || /^[a-z0-9][\w.-]*(\s|$)/.test(trimmed) && !/[.!?]$/.test(trimmed))
    return;
  return { text: trimmed, offset: indent, role: "prose" };
}
function glossed(line, term) {
  const word = termPattern(term);
  const patterns = [
    `${word}\\s*\\((?=[^)]*\\S\\s+\\S)[^)]+\\)`,
    `${word}\\s*:\\s+\\S+\\s+\\S+`,
    `${word}\\s+(?:is|are)\\s+(?:an?|the)\\s`,
    `${word}\\s+(?:means|refers\\s+to)\\s`,
    `\\((?:an?\\s+|the\\s+)?${word}\\)`
  ];
  return patterns.some((pattern) => new RegExp(pattern, "i").test(line));
}
function lintCliHelp(text, options) {
  const findings = [];
  const { kind, location, config } = options;
  const lines = helpLines(text);
  const budget = CLI_HELP_BUDGETS[kind];
  const add = (rule, severity, line, excerpt, hint) => {
    findings.push({ rule, severity, surface: "body", location: `${location}:${line}`, excerpt, hint });
  };
  if (lines.length > budget.lines) {
    const what = kind === "bare" ? "A bare invocation" : kind === "help" ? "Root help" : "Command help";
    add("cli-budget", budget.linesSeverity, budget.lines + 1, `${lines.length} lines`, `${what} prints ${lines.length} lines. Keep it to ${budget.lines}${kind === "help" ? "; move advanced verbs to `help advanced`" : kind === "bare" ? ": a one-line description, 3 to 5 starter commands, and the help pointer" : ""}.`);
  }
  lines.forEach((line, index) => {
    const width = columns(line);
    if (width > budget.columns) {
      add("cli-budget", budget.columnsSeverity, index + 1, excerptAt(line, budget.columns - 20, 20), `Line is ${width} columns. Keep ${kind === "bare" ? "a bare invocation" : "help"} to ${budget.columns}; wrap the summary or shorten it.`);
    }
  });
  const nouns = [...new Set([...CLI_PROPER_NOUNS, ...config?.properNouns ?? [], ...options.properNouns ?? [], ...config?.brand ? [config.brand] : []])].sort((a, b) => b.length - a.length);
  const added = (config?.vocabulary?.add ?? []).map((term) => term.toLowerCase());
  const errorTerms = [...new Set([...CLI_JARGON, ...added])];
  const warnTerms = [...new Set([...CLI_JARGON_WARN_ONLY, ...INTERNAL_VOCABULARY.map((term) => term.toLowerCase())])].filter((term) => !errorTerms.includes(term));
  lines.forEach((line, index) => {
    const prose = proseOf(line, index);
    const lineNo = index + 1;
    if (prose) {
      const broken = sentenceCaseBreak(prose.text, nouns);
      if (broken) {
        add("cli-case", "error", lineNo, excerptAt(prose.text, broken.index, broken.word.length), `\u201C${broken.word}\u201D is capitalized mid-sentence. Use sentence case, or add the name to properNouns.`);
      }
    }
    for (const [terms, severity] of [[errorTerms, "error"], [warnTerms, "warn"]]) {
      for (const term of terms) {
        for (const match of line.matchAll(new RegExp(termPattern(term), "gi"))) {
          if (glossed(line, term))
            continue;
          add("cli-jargon", severity, lineNo, excerptAt(line, match.index, match[0].length), `\u201C${match[0]}\u201D is internal vocabulary. Say what the person gets, or gloss it on the same line, as in \u201C${match[0]} (what it means)\u201D.`);
        }
      }
    }
    if (prose) {
      for (const finding of lintCopy(prose.text, { surface: "body", location: `${location}:${lineNo}`, ...config ? { config } : {} })) {
        if (finding.rule === "emdash" || finding.rule === "selfcert" || finding.rule === "retired")
          findings.push(finding);
      }
    }
  });
  return findings;
}

// src/cli-golden/checks.ts
var ANY_ESCAPE = /\u001b/;
var COLOR = /\u001b\[[0-9;]*m/;
var ANSI_GLOBAL = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
var CONTRACT_SYMBOLS = ["\u2713", "\u2717", "\u26A0", "\u2192", "\u25CF", "\u25CB", "\u21BB", "\uD83D\uDD10"];
var TRACE = /panicked at|thread '.*' panicked|\bEPIPE\b|Broken pipe|Traceback \(most recent call last\)|^\s+at .+:\d+:\d+\)?$|RUST_BACKTRACE/m;
function plain(text) {
  return text.replace(ANSI_GLOBAL, "").replace(/\r\n?/g, `
`);
}
function nonBlank(text) {
  return plain(text).split(`
`).filter((line) => line.trim());
}
function exit(run) {
  if (run.timedOut)
    return "timed out";
  if (run.signal)
    return `killed by ${run.signal}`;
  return `exit ${run.code}`;
}
function quote(line, max = 60) {
  if (line === undefined)
    return "nothing";
  const text = line.trim();
  return `"${text.length > max ? `${text.slice(0, max - 1)}\u2026` : text}"`;
}
function widest(lines) {
  return lines.reduce((max, line) => Math.max(max, [...line].length), 0);
}
function result(id, rule, problems, warnings, ok) {
  if (problems.length)
    return { id, rule, status: "fail", detail: problems.join("; ") };
  if (warnings.length)
    return { id, rule, status: "warn", detail: warnings.join("; ") };
  return { id, rule, status: "pass", detail: ok };
}
function checkBare(run) {
  const lines = helpLines(run.stdout);
  const problems = [];
  if (run.code !== 0)
    problems.push(`${exit(run)}, want exit 0${run.stderr.trim() ? ` (stderr: ${quote(nonBlank(run.stderr)[0])})` : ""}`);
  if (!lines.length)
    problems.push("printed nothing on stdout");
  if (lines.length > 25)
    problems.push(`${lines.length} lines, want at most 25`);
  if (widest(lines) > 80)
    problems.push(`a line is ${widest(lines)} columns, want at most 80`);
  return result("bare", "D2", problems, [], `${lines.length} lines, exit 0`);
}
function checkHelp(run) {
  const lines = helpLines(run.stdout);
  const problems = [];
  const warnings = [];
  if (run.code !== 0)
    problems.push(`${exit(run)}, want exit 0`);
  if (!lines.length)
    problems.push("printed nothing on stdout");
  if (lines.length > 60)
    problems.push(`${lines.length} lines, want at most 60`);
  if (widest(lines) > 100)
    warnings.push(`a line is ${widest(lines)} columns; keep help to 100`);
  return result("help", "D3", problems, warnings, `${lines.length} lines, exit 0`);
}
function checkCommandHelp(command, flag, topic) {
  const problems = [];
  const warnings = [];
  const lines = helpLines(flag.stdout);
  if (flag.code !== 0)
    problems.push(`\`${command} --help\` ${exit(flag)}, want exit 0`);
  if (!lines.length)
    problems.push(`\`${command} --help\` printed nothing on stdout`);
  if (topic.code !== 0)
    warnings.push(`\`help ${command}\` ${exit(topic)}`);
  else if (plain(topic.stdout).trim() !== plain(flag.stdout).trim())
    warnings.push(`\`help ${command}\` differs from \`${command} --help\``);
  if (widest(lines) > 100)
    warnings.push(`a line is ${widest(lines)} columns; keep help to 100`);
  return result(`help:${command}`, "D3", problems, warnings, `${lines.length} lines, exit 0`);
}
function checkVersion(name, run, json) {
  const text = plain(run.stdout).trim();
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const shape = new RegExp(`^${escaped} \\d+\\.\\d+\\.\\d+(?:[-+][0-9A-Za-z.+-]+)?$`);
  const problems = [];
  if (run.code !== 0)
    problems.push(`${exit(run)}, want exit 0`);
  if (!shape.test(text))
    problems.push(`printed ${quote(text.split(`
`)[0])}, want "${name} X.Y.Z"`);
  const jsonProblems = [];
  let parsed;
  try {
    parsed = JSON.parse(json.stdout);
  } catch {
    parsed = undefined;
  }
  const record = parsed;
  if (json.code !== 0)
    jsonProblems.push(`${exit(json)}, want exit 0`);
  if (!record || typeof record !== "object" || record.name !== name || typeof record.version !== "string") {
    jsonProblems.push(`printed ${quote(nonBlank(json.stdout)[0] ?? nonBlank(json.stderr)[0])}, want {"name":"${name}","version":"X.Y.Z"}`);
  }
  return [
    result("version", "D4", problems, [], text),
    result("version --json", "D4", jsonProblems, [], json.stdout.trim())
  ];
}
function checkUnknown(unknown, run) {
  const lines = nonBlank(run.stderr);
  const problems = [];
  const warnings = [];
  if (run.code !== 2)
    problems.push(`${exit(run)}, want exit 2`);
  if (plain(run.stdout).trim())
    problems.push(`printed on stdout: ${quote(nonBlank(run.stdout)[0])}`);
  const first = lines[0] ?? "";
  if (!/^(?:\u2717|FAIL) /.test(first))
    problems.push(`first line is ${quote(first)}, want "\u2717 Unknown command \u2026"`);
  else if (!first.includes(`"${unknown}"`) && !first.includes(`\u201C${unknown}\u201D`))
    problems.push(`first line does not name "${unknown}"`);
  if (!/^(?:\u2192|->) \S/.test(lines[1] ?? ""))
    problems.push(`second line is ${quote(lines[1])}, want "\u2192 <cli> --help"`);
  if (lines.length > 2) {
    if (lines.some((line) => /^\s*usage:/i.test(line)))
      problems.push("prints a usage dump");
    else
      warnings.push(`${lines.length} lines on stderr, want 2`);
  }
  return result("unknown command", "D5", problems, warnings, `${first.trim()} (exit 2)`);
}
function checkJsonError(id, run) {
  const problems = [];
  const warnings = [];
  let parsed;
  try {
    parsed = JSON.parse(run.stdout);
  } catch {
    parsed = undefined;
  }
  const doc = parsed;
  if (run.code !== 2)
    problems.push(`${exit(run)}, want exit 2`);
  if (!doc || typeof doc !== "object") {
    const where = plain(run.stdout).trim() ? "stdout is not one JSON document" : `nothing on stdout${run.stderr.trim() ? ` (stderr: ${quote(nonBlank(run.stderr)[0])})` : ""}`;
    problems.push(where);
  } else {
    if (doc.ok !== false)
      problems.push('missing "ok": false');
    if (typeof doc.error?.code !== "string" || typeof doc.error?.message !== "string")
      problems.push('missing "error": {"code", "message"}');
    else if (typeof doc.error.next !== "string")
      warnings.push('no "error.next" command');
  }
  return result(id, "D5", problems, warnings, `{"ok":false,\u2026} on stdout, exit 2`);
}
function checkNonTty(runs) {
  const offenders = runs.filter((run) => ANY_ESCAPE.test(run.stdout) || ANY_ESCAPE.test(run.stderr));
  return result("non-TTY", "D6", offenders.map((run) => `\`${run.args.join(" ") || "(bare)"}\` writes escape sequences to a pipe`), [], `${runs.length} runs, no escape sequences`);
}
function checkNoColor(runs) {
  if (!runs)
    return { id: "NO_COLOR", rule: "D6", status: "skip", detail: "no pseudo-terminal (the script command) on this runner" };
  const offenders = runs.filter((run) => COLOR.test(run.stdout) || COLOR.test(run.stderr));
  return result("NO_COLOR", "D6", offenders.map((run) => `\`${run.args.join(" ") || "(bare)"}\` prints color with NO_COLOR=1 on a terminal`), [], `${runs.length} runs on a terminal, no color`);
}
function checkDumb(runs) {
  const problems = [];
  for (const run of runs) {
    const text = plain(run.stdout + run.stderr);
    const found = CONTRACT_SYMBOLS.filter((symbol) => text.includes(symbol));
    if (found.length)
      problems.push(`\`${run.args.join(" ") || "(bare)"}\` prints ${found.join(" ")}`);
  }
  return result("TERM=dumb", "D6", problems, [], "ASCII fallbacks only");
}
function checkPipe(run) {
  const problems = [];
  const quietExit = run.code === 0 || run.code === 141 || run.signal === "SIGPIPE";
  if (run.timedOut)
    problems.push("timed out");
  else if (!quietExit)
    problems.push(`${exit(run)}, want exit 0`);
  if (TRACE.test(run.stderr))
    problems.push(`stderr shows ${quote(run.stderr.split(`
`).find((line) => TRACE.test(line)))}`);
  return result("| head -1", "D8", problems, [], run.signal ? `ended by ${run.signal}, no trace` : `${exit(run)}, no trace`);
}
function checkHelpCopy(texts, config) {
  const findings = texts.flatMap((item) => lintCliHelp(item.text, { kind: item.kind, location: item.location, ...config ? { config } : {} }));
  const wording = findings.filter((finding) => finding.rule !== "cli-budget");
  const errors = wording.filter((finding) => finding.severity === "error");
  const warns = wording.filter((finding) => finding.severity !== "error");
  const describe = (finding) => `${finding.rule} at ${finding.location}: ${finding.excerpt}`;
  const problems = errors.slice(0, 3).map(describe);
  if (errors.length > 3)
    problems.push(`${errors.length - 3} more`);
  const warnings = warns.slice(0, 2).map(describe);
  if (warns.length > 2)
    warnings.push(`${warns.length - 2} more`);
  return { result: result("help copy", "D3", problems, warnings, `${texts.length} help texts, sentence case, no jargon`), findings: wording };
}
function evaluate(runs, config) {
  const results = [checkBare(runs.bare), checkHelp(runs.help)];
  for (const item of runs.commands)
    results.push(checkCommandHelp(item.command, item.flag, item.topic));
  results.push(...checkVersion(runs.name, runs.version, runs.versionJson));
  results.push(checkUnknown(runs.unknown, runs.unknownText));
  results.push(checkJsonError("--json error", runs.unknownJson));
  results.push(checkJsonError("agent error", runs.unknownAgent));
  results.push(checkNoColor(runs.ttyNoColor));
  const pipes = [runs.bare, runs.help, ...runs.commands.map((item) => item.flag), runs.version, runs.unknownText];
  results.push(checkNonTty(pipes));
  results.push(checkDumb(runs.dumb));
  results.push(checkPipe(runs.pipe));
  const copy = checkHelpCopy([
    { kind: "bare", location: "bare", text: runs.bare.stdout },
    { kind: "help", location: "--help", text: runs.help.stdout },
    ...runs.commands.map((item) => ({ kind: "command", location: `${item.command} --help`, text: item.flag.stdout }))
  ], config);
  results.push(copy.result);
  return { results, findings: copy.findings };
}
// src/cli-golden/report.ts
var SYMBOLS = {
  pass: { glyph: "\u2713", ascii: "OK" },
  warn: { glyph: "\u26A0", ascii: "WARN" },
  fail: { glyph: "\u2717", ascii: "FAIL" },
  skip: { glyph: "\u2013", ascii: "-" }
};
function useAscii(env) {
  const utf8 = [env.LC_ALL, env.LC_CTYPE, env.LANG].some((value) => /utf-?8/i.test(value ?? ""));
  return env.TERM === "dumb" || !utf8 || env.HRANESS_ASCII === "1";
}
function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
function countLine(results) {
  const count = (status) => results.filter((item) => item.status === status).length;
  const parts = [
    count("fail") ? `${count("fail")} failed` : "",
    count("warn") ? plural(count("warn"), "warning") : "",
    `${count("pass")} passed`,
    count("skip") ? `${count("skip")} skipped` : ""
  ].filter(Boolean);
  return `${parts.join(", ")}.`;
}
function renderText(results, ascii) {
  const width = Math.max(...results.map((item) => item.id.length));
  const lines = results.map((item) => `${ascii ? SYMBOLS[item.status].ascii.padEnd(4) : SYMBOLS[item.status].glyph} ${item.id.padEnd(width)}  ${item.rule}  ${item.detail}`);
  return `${lines.join(`
`)}

${countLine(results)}
`;
}
function cell(text) {
  return text.replaceAll("|", "\\|").replaceAll(`
`, " ");
}
function renderMarkdown(cli, results, advisory) {
  const rows = results.map((item) => `| ${SYMBOLS[item.status].glyph} | ${cell(item.id)} | ${item.rule} | ${cell(item.detail)} |`);
  return [
    `### CLI golden checks: \`${cli}\``,
    "",
    `${countLine(results)}${advisory ? " Advisory: findings do not fail the job." : ""}`,
    "",
    "| | Check | Rule | Result |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
    "Rules are the sections of the CLI and menu bar style guide (CLI_MENU_STYLE.md in hraness/.github).",
    ""
  ].join(`
`);
}
function escapeData(value) {
  return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll(`
`, "%0A");
}
function renderAnnotations(results, advisory) {
  return results.filter((item) => item.status === "fail" || item.status === "warn").map((item) => `::${item.status === "fail" && !advisory ? "error" : "warning"} title=CLI golden ${escapeData(item.id).replaceAll(":", "%3A").replaceAll(",", "%2C")} (${item.rule})::${escapeData(item.detail)}`);
}
function goldenFiles(runs) {
  const slug = (command) => command.trim().replace(/[^\w.-]+/g, "-");
  const files = {
    "bare.txt": runs.bare.stdout,
    "help.txt": runs.help.stdout,
    "version.txt": runs.version.stdout,
    "unknown.stderr.txt": runs.unknownText.stderr,
    "unknown.json": runs.unknownJson.stdout,
    "unknown.agent.json": runs.unknownAgent.stdout
  };
  for (const item of runs.commands)
    files[`${slug(item.command)}.help.txt`] = item.flag.stdout;
  return files;
}
// src/cli-golden/runner.ts
import { spawn, spawnSync } from "child_process";
import { mkdirSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { basename, join } from "path";
var AUDIENCE_VARIABLES = [
  "HRANESS_AUDIENCE",
  "AI_AGENT",
  "CLAUDECODE",
  "CODEX_SANDBOX",
  "CODEX_SANDBOX_NETWORK_DISABLED",
  "CURSOR_AGENT",
  "GEMINI_CLI"
];
function splitCommand(line) {
  const words = [];
  let current = "";
  let inWord = false;
  let quote2;
  for (let index = 0;index < line.length; index += 1) {
    const char = line[index];
    if (quote2) {
      if (char === quote2)
        quote2 = undefined;
      else if (char === "\\" && quote2 === '"' && index + 1 < line.length)
        current += line[++index];
      else
        current += char;
    } else if (char === "'" || char === '"') {
      quote2 = char;
      inWord = true;
    } else if (char === "\\" && index + 1 < line.length) {
      current += line[++index];
      inWord = true;
    } else if (/\s/.test(char)) {
      if (inWord)
        words.push(current);
      current = "";
      inWord = false;
    } else {
      current += char;
      inWord = true;
    }
  }
  if (quote2)
    throw new Error(`Unclosed ${quote2} in the command.`);
  if (inWord)
    words.push(current);
  return words;
}
function shellQuote(word) {
  return /^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replaceAll("'", "'\\''")}'`;
}
function defaultName(command) {
  const runtimes = new Set(["bun", "node", "deno", "npx", "bunx", "tsx", "cargo", "run", "--"]);
  const word = command.find((part) => !runtimes.has(basename(part)) && !part.startsWith("-")) ?? command[0] ?? "cli";
  return basename(word).replace(/\.(?:[cm]?[jt]s|exe)$/, "");
}

class GoldenRunner {
  #home;
  #options;
  #script;
  constructor(options) {
    if (!options.command.length)
      throw new Error("The command is empty.");
    this.#options = options;
    this.#home = mkdtempSync(join(tmpdir(), "cli-golden-home-"));
    for (const dir of [".config", ".local/share", ".local/state", ".cache"])
      mkdirSync(join(this.#home, dir), { recursive: true });
    this.#script = detectScript();
  }
  get hasTty() {
    return this.#script !== undefined;
  }
  dispose() {
    rmSync(this.#home, { recursive: true, force: true });
  }
  #env(extra = {}) {
    const env = { ...process.env };
    for (const name of [...AUDIENCE_VARIABLES, "NO_COLOR", "FORCE_COLOR", "CLICOLOR_FORCE", "LC_ALL", "LC_CTYPE", "HRANESS_ASCII", "HRANESS_DEBUG"])
      delete env[name];
    Object.assign(env, {
      HOME: this.#home,
      XDG_CONFIG_HOME: join(this.#home, ".config"),
      XDG_DATA_HOME: join(this.#home, ".local/share"),
      XDG_STATE_HOME: join(this.#home, ".local/state"),
      XDG_CACHE_HOME: join(this.#home, ".cache"),
      LANG: "en_US.UTF-8",
      TERM: "xterm-256color",
      COLUMNS: "100"
    }, this.#options.env ?? {}, extra);
    return env;
  }
  run(spec) {
    const [program, ...base] = this.#options.command;
    let argv = [program, ...base, ...spec.args];
    if (spec.tty) {
      argv = this.#script === "bsd" ? ["script", "-q", "/dev/null", ...argv] : ["script", "-qec", argv.map(shellQuote).join(" "), "/dev/null"];
    }
    const timeout = (this.#options.timeoutSeconds ?? 30) * 1000;
    return new Promise((resolve) => {
      const child = spawn(argv[0], argv.slice(1), {
        cwd: this.#options.cwd ?? process.cwd(),
        env: this.#env(spec.env),
        stdio: ["ignore", "pipe", "pipe"]
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let closedEarly = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeout);
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        if (closedEarly)
          return;
        stdout += chunk;
        if (spec.firstLineOnly && stdout.includes(`
`)) {
          stdout = stdout.slice(0, stdout.indexOf(`
`) + 1);
          closedEarly = true;
          child.stdout.destroy();
        }
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        resolve({ args: spec.args, code: 127, signal: null, stdout, stderr: `${stderr}${error.message}
` });
      });
      child.on("close", (code, signal) => {
        clearTimeout(timer);
        resolve({ args: spec.args, code, signal, stdout, stderr, timedOut });
      });
    });
  }
  async collect(options) {
    const words = (command) => command.split(/\s+/).filter(Boolean);
    const commands = [];
    for (const command of options.commands) {
      commands.push({
        command,
        flag: await this.run({ args: [...words(command), "--help"] }),
        topic: await this.run({ args: ["help", ...words(command)] })
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
        await this.run({ args: [options.unknown], env: dumb })
      ],
      ...this.hasTty ? {
        ttyNoColor: [
          await this.run({ args: ["--help"], env: noColor, tty: true }),
          await this.run({ args: [options.unknown], env: noColor, tty: true })
        ]
      } : {},
      pipe: await this.run({ args: ["--help"], firstLineOnly: true })
    };
  }
}
function detectScript() {
  if (process.platform === "win32")
    return;
  const probe = spawnSync("script", ["-V"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (probe.error)
    return;
  if (/util-linux/.test(`${probe.stdout}${probe.stderr}`))
    return "util-linux";
  return process.platform === "darwin" || /bsd/i.test(process.platform) ? "bsd" : undefined;
}
export {
  useAscii,
  splitCommand,
  shellQuote,
  renderText,
  renderMarkdown,
  renderAnnotations,
  goldenFiles,
  evaluate,
  defaultName,
  countLine,
  checkVersion,
  checkUnknown,
  checkPipe,
  checkNonTty,
  checkNoColor,
  checkJsonError,
  checkHelpCopy,
  checkHelp,
  checkDumb,
  checkCommandHelp,
  checkBare,
  GoldenRunner,
  CONTRACT_SYMBOLS,
  AUDIENCE_VARIABLES
};
