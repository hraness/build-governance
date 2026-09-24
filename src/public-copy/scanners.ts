/**
 * Hand-written scanners for the patterns the public-copy lint used to express as regular expressions.
 *
 * Each one returns exactly what the regular expression it replaces returned (the tests compare them on
 * generated input), but runs in time linear in the input. The regular expressions backtracked
 * polynomially on inputs such as `github.com/` followed by many `github.com:.` repetitions, long runs
 * of spaces or backticks, or many unclosed `<!--`.
 */

const SLASH = 0x2f;
const HASH = 0x23;
const COLON = 0x3a;
const BACKTICK = 0x60;
const LT = 0x3c;
const GT = 0x3e;
const EQUALS = 0x3d;
const DOUBLE_QUOTE = 0x22;
const SINGLE_QUOTE = 0x27;
const DASH = 0x2d;
const PIPE = 0x7c;
const MIDDLE_DOT = 0xb7;
const EN_DASH = 0x2013;
const EM_DASH = 0x2014;

/** The characters `\s` matches in a JavaScript regular expression. */
export function isWhitespace(code: number): boolean {
  if (code <= 0x20) return code === 0x20 || (code >= 0x09 && code <= 0x0d);
  return code === 0xa0 || code === 0x1680 || (code >= 0x2000 && code <= 0x200a) || code === 0x2028 || code === 0x2029 ||
    code === 0x202f || code === 0x205f || code === 0x3000 || code === 0xfeff;
}

/** The characters `.` does not match without the `s` flag. */
function isLineTerminator(code: number): boolean {
  return code === 0x0a || code === 0x0d || code === 0x2028 || code === 0x2029;
}

function isAsciiLetter(code: number): boolean {
  return (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
}

function isDigit(code: number): boolean {
  return code >= 0x30 && code <= 0x39;
}

/** `[\w:-]` */
function isTagNameChar(code: number): boolean {
  return isAsciiLetter(code) || isDigit(code) || code === 0x5f || code === COLON || code === DASH;
}

/** `[^\s"'>/=]` */
function isAttributeNameChar(code: number): boolean {
  return !isWhitespace(code) && code !== DOUBLE_QUOTE && code !== SINGLE_QUOTE && code !== GT && code !== SLASH && code !== EQUALS;
}

/** `[^\s"'=<>\`]` */
function isUnquotedValueChar(code: number): boolean {
  return !isWhitespace(code) && code !== DOUBLE_QUOTE && code !== SINGLE_QUOTE && code !== EQUALS && code !== LT &&
    code !== GT && code !== BACKTICK;
}

/** The start of the trailing part of `text` that contains no line terminator. */
function lineFreeSuffixStart(text: string): number {
  let start = text.length;
  while (start > 0 && !isLineTerminator(text.charCodeAt(start - 1))) start -= 1;
  return start;
}

/**
 * The `owner/name` slug in a GitHub repository URL.
 * Same result as `/github\.com[/:]([^/]+\/[^/#]+?)(?:\.git)?(?:#.*)?$/.exec(raw)?.[1]`.
 */
export function githubSlug(raw: string): string | undefined {
  const n = raw.length;
  const nextSlash = new Int32Array(n + 1);
  const nextHash = new Int32Array(n + 1);
  nextSlash[n] = n;
  nextHash[n] = n;
  for (let index = n - 1; index >= 0; index -= 1) {
    const code = raw.charCodeAt(index);
    nextSlash[index] = code === SLASH ? index : nextSlash[index + 1]!;
    nextHash[index] = code === HASH ? index : nextHash[index + 1]!;
  }
  const lineFree = lineFreeSuffixStart(raw);
  for (let at = raw.indexOf("github.com"); at !== -1; at = raw.indexOf("github.com", at + 1)) {
    const separator = raw.charCodeAt(at + 10);
    if (separator !== SLASH && separator !== COLON) continue;
    const owner = at + 11;
    const slash = nextSlash[owner]!; // the owner is `[^/]+`, so it ends at the first slash
    if (slash === n || slash === owner) continue;
    const hash = nextHash[slash + 1]!; // the name is `[^/#]+`, so it ends at the first hash
    if (hash === slash + 1 || nextSlash[slash + 1]! < hash) continue;
    if (hash < n && hash + 1 < lineFree) continue; // `#.*$` needs the rest of the text on one line
    let name = raw.slice(slash + 1, hash);
    if (name.length > 4 && name.endsWith(".git")) name = name.slice(0, -4);
    return `${raw.slice(owner, slash)}/${name}`;
  }
  return undefined;
}

/**
 * Replace each backtick code span with `replacement`.
 * Same result as ``text.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, replacement)`` for a replacement with no `$` patterns.
 */
export function replaceBacktickSpans(text: string, replacement: string): string {
  const starts: number[] = [];
  const lengths: number[] = [];
  for (let index = 0; index < text.length;) {
    if (text.charCodeAt(index) !== BACKTICK) {
      index += 1;
      continue;
    }
    let end = index;
    while (end < text.length && text.charCodeAt(end) === BACKTICK) end += 1;
    starts.push(index);
    lengths.push(end - index);
    index = end;
  }
  // A run of length m opens a span with the longest length l <= m that a later run has exactly,
  // and the first such later run closes it.
  const close = new Int32Array(starts.length).fill(-1);
  const firstLater = new Map<number, number>();
  for (let run = starts.length - 1; run >= 0; run -= 1) {
    const length = lengths[run]!;
    for (let candidate = length; candidate >= 1; candidate -= 1) {
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
  for (let run = 0; run < starts.length;) {
    const closing = close[run]!;
    if (closing === -1) {
      run += 1;
      continue;
    }
    out += text.slice(last, starts[run]) + replacement;
    last = starts[closing]! + lengths[closing]!;
    run = closing + 1;
  }
  return out + text.slice(last);
}

/**
 * Remove HTML tags.
 * Same result as `text.replace(/<\/?[a-zA-Z][^>]*>/g, "")`. This produces text for the lint to read,
 * not markup to render, so it does not need to be an HTML sanitizer.
 */
export function removeHtmlTags(text: string): string {
  let out = "";
  let last = 0;
  let nextGt = -2; // cached result of the last search for `>`; searches only move forward
  for (let index = text.indexOf("<"); index !== -1;) {
    const letter = text.charCodeAt(index + 1) === SLASH ? index + 2 : index + 1;
    if (!isAsciiLetter(text.charCodeAt(letter))) {
      index = text.indexOf("<", index + 1);
      continue;
    }
    if (nextGt <= letter) nextGt = text.indexOf(">", letter + 1);
    if (nextGt === -1) break;
    out += text.slice(last, index);
    last = nextGt + 1;
    index = text.indexOf("<", last);
  }
  return out + text.slice(last);
}

function whitespaceEnd(text: string, index: number): number {
  let end = index;
  while (end < text.length && isWhitespace(text.charCodeAt(end))) end += 1;
  return end;
}

/**
 * Split a page title into its segments.
 * Same result as `title.split(/\s*[·|]\s*|\s+[–—-]\s+|:\s+/)`.
 */
export function splitTitle(title: string): string[] {
  const parts: string[] = [];
  let last = 0;
  for (let index = 0; index < title.length;) {
    const code = title.charCodeAt(index);
    let end: number;
    if (isWhitespace(code)) {
      // Every start inside a whitespace run sees the same character after the run, so only the first can match.
      const after = whitespaceEnd(title, index);
      const next = title.charCodeAt(after);
      if (next === MIDDLE_DOT || next === PIPE) end = whitespaceEnd(title, after + 1);
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

/**
 * Drop a trailing `#selector` or `:line` from a finding location.
 * Same result as `location.replace(/(?:#.*|:\d+)$/, "")`.
 */
export function stripLocationSuffix(location: string): string {
  const hash = location.indexOf("#", lineFreeSuffixStart(location));
  let digits = location.length;
  while (digits > 0 && isDigit(location.charCodeAt(digits - 1))) digits -= 1;
  const colon = digits < location.length && location.charCodeAt(digits - 1) === COLON ? digits - 1 : -1;
  const cut = hash === -1 ? colon : colon === -1 ? hash : Math.min(hash, colon);
  return cut === -1 ? location : location.slice(0, cut);
}

/** `text.indexOf(needle, from)`, amortized to linear total time when `from` only moves forward. */
function forwardSearch(text: string, needle: string): (from: number) => number {
  let searchedFrom = Number.POSITIVE_INFINITY;
  let found = -1;
  return from => {
    if (from < searchedFrom || (found !== -1 && found < from)) {
      searchedFrom = from;
      found = text.indexOf(needle, from);
    }
    return found;
  };
}

/** Whether `text` has `prefix` at `index`, matching ASCII letters without regard to case like a non-Unicode `i` regex. */
function startsWithIgnoringAsciiCase(text: string, prefix: string, index: number): boolean {
  if (index + prefix.length > text.length) return false;
  for (let offset = 0; offset < prefix.length; offset += 1) {
    const expected = prefix.charCodeAt(offset);
    const actual = text.charCodeAt(index + offset);
    if (actual !== expected && !(isAsciiLetter(expected) && (actual | 0x20) === (expected | 0x20) && isAsciiLetter(actual))) return false;
  }
  return true;
}

export interface HtmlToken {
  /** The matched source text. */
  token: string;
  /** The index just past the token. */
  end: number;
  /** The tag name of a closing tag. */
  closing?: string;
  /** The tag name of an opening tag. */
  opening?: string;
  /** The raw attribute text of an opening tag. */
  attributeSource?: string;
  /** `/` for a self-closing opening tag, otherwise the empty string. */
  selfClosing?: string;
}

interface TagEnd {
  attributeEnd: number;
  end: number;
  selfClosing: string;
}

/**
 * An HTML tokenizer. `next(index)` returns the token at `index`, with the same text and groups as
 * ``/<!--[\s\S]*?-->|<!doctype[^>]*>|<\/\s*([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>|[^<]+|</gi``
 * executed with `lastIndex = index`. Scanning a whole document takes linear time in total.
 */
export function htmlTokenizer(html: string): { next(index: number): HtmlToken | undefined } {
  const n = html.length;
  let tables: { space: Int32Array; name: Int32Array; unquoted: Int32Array; dq: Int32Array; sq: Int32Array } | undefined;
  const table = () => {
    if (tables) return tables;
    // For each index: the end of the whitespace, attribute-name, and unquoted-value runs starting there,
    // and the next double and single quote at or after it.
    const space = new Int32Array(n + 1);
    const name = new Int32Array(n + 1);
    const unquoted = new Int32Array(n + 1);
    const dq = new Int32Array(n + 1);
    const sq = new Int32Array(n + 1);
    space[n] = name[n] = unquoted[n] = dq[n] = sq[n] = n;
    for (let index = n - 1; index >= 0; index -= 1) {
      const code = html.charCodeAt(index);
      space[index] = isWhitespace(code) ? space[index + 1]! : index;
      name[index] = isAttributeNameChar(code) ? name[index + 1]! : index;
      unquoted[index] = isUnquotedValueChar(code) ? unquoted[index + 1]! : index;
      dq[index] = code === DOUBLE_QUOTE ? index : dq[index + 1]!;
      sq[index] = code === SINGLE_QUOTE ? index : sq[index + 1]!;
    }
    tables = { space, name, unquoted, dq, sq };
    return tables;
  };

  // The attribute list parses deterministically, so its outcome depends only on where it starts.
  // Memoizing that outcome keeps repeated failed tag attempts from rescanning the same text.
  let memo: Int32Array | undefined;
  const outcomes: Array<TagEnd | null> = [];
  const attributeList = (start: number): TagEnd | null => {
    const { space, name, unquoted, dq, sq } = table();
    memo ??= new Int32Array(n + 1);
    const visited: number[] = [];
    let result: TagEnd | null;
    let at = start;
    for (;;) {
      const known = memo[at]!;
      if (known !== 0) {
        result = outcomes[known - 1]!;
        break;
      }
      visited.push(at);
      const next = space[at]!;
      if (next > at && next < n && isAttributeNameChar(html.charCodeAt(next))) {
        const nameEnd = name[next]!;
        const equals = space[nameEnd]!;
        if (equals < n && html.charCodeAt(equals) === EQUALS) {
          const value = space[equals + 1]!;
          const code = html.charCodeAt(value);
          let valueEnd: number;
          if (code === DOUBLE_QUOTE || code === SINGLE_QUOTE) {
            const quote = (code === DOUBLE_QUOTE ? dq : sq)[value + 1]!;
            if (quote === n) {
              result = null;
              break;
            }
            valueEnd = quote + 1;
          } else if (value < n && isUnquotedValueChar(code)) {
            valueEnd = unquoted[value]!;
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
      const code = html.charCodeAt(next);
      if (code === SLASH && html.charCodeAt(next + 1) === GT) result = { attributeEnd: at, end: next + 2, selfClosing: "/" };
      else if (code === GT) result = { attributeEnd: at, end: next + 1, selfClosing: "" };
      else result = null;
      break;
    }
    outcomes.push(result);
    for (const index of visited) memo[index] = outcomes.length;
    return result;
  };

  const commentEnd = forwardSearch(html, "-->");
  const gt = forwardSearch(html, ">");
  const next = (index: number): HtmlToken | undefined => {
    if (index >= n) return undefined;
    if (html.charCodeAt(index) !== LT) {
      const lt = html.indexOf("<", index);
      const end = lt === -1 ? n : lt;
      return { token: html.slice(index, end), end };
    }
    if (html.startsWith("<!--", index)) {
      const close = commentEnd(index + 4);
      if (close !== -1) return { token: html.slice(index, close + 3), end: close + 3 };
    }
    if (startsWithIgnoringAsciiCase(html, "<!doctype", index)) {
      const close = gt(index + 9);
      if (close !== -1) return { token: html.slice(index, close + 1), end: close + 1 };
    }
    if (html.charCodeAt(index + 1) === SLASH) {
      const { space } = table();
      const nameStart = space[index + 2]!;
      if (isAsciiLetter(html.charCodeAt(nameStart))) {
        let nameEnd = nameStart + 1;
        while (nameEnd < n && isTagNameChar(html.charCodeAt(nameEnd))) nameEnd += 1;
        const close = space[nameEnd]!;
        if (html.charCodeAt(close) === GT) {
          return { token: html.slice(index, close + 1), end: close + 1, closing: html.slice(nameStart, nameEnd) };
        }
      }
    } else if (isAsciiLetter(html.charCodeAt(index + 1))) {
      let nameEnd = index + 2;
      while (nameEnd < n && isTagNameChar(html.charCodeAt(nameEnd))) nameEnd += 1;
      const tag = attributeList(nameEnd);
      if (tag) {
        return {
          token: html.slice(index, tag.end), end: tag.end, opening: html.slice(index + 1, nameEnd),
          attributeSource: html.slice(nameEnd, tag.attributeEnd), selfClosing: tag.selfClosing,
        };
      }
    }
    return { token: "<", end: index + 1 };
  };
  return { next };
}
