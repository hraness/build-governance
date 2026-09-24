import { extractHtml } from "./html.js";
import { definedTerms, excerptAt, lintCopy, vocabularyFor } from "./rules.js";
import { removeHtmlTags, replaceBacktickSpans } from "./scanners.js";
import type { CopyConfig, CopyFinding, CopySurface, ExtractedText } from "./types.js";

/** How a Markdown file is read: ordinary prose, model-written prose, interface reference, or agent text. */
export type MarkdownKind = "body" | "generated" | "reference" | "agent";

export interface MarkdownOptions {
  readonly kind?: MarkdownKind;
}

interface Block {
  readonly line: number;
  readonly text: string;
  readonly surface: CopySurface;
  readonly field?: "title" | "description" | "alt";
  readonly html?: boolean;
}

interface StructureFinding {
  readonly line: number;
  readonly excerpt: string;
  readonly hint: string;
}

const LIST_ITEM = /^\s{0,3}(?:[-*+]|\d{1,9}[.)])\s+/;
const HEADING = /^ {0,3}(#{1,6})(?:\s+(.*?))?\s*#*\s*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const DELIMITER_ROW = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
const REFERENCE_DEFINITION = /^ {0,3}\[[^\]]+\]:\s*\S/;

/** Split a GFM table row into cells the way GitHub does: every unescaped pipe is a separator, even in code. */
export function tableCells(row: string): string[] {
  let body = row.trim();
  if (body.startsWith("|")) body = body.slice(1);
  if (body.endsWith("|") && !body.endsWith("\\|")) body = body.slice(0, -1);
  return body.split(/(?<!\\)\|/).map(cell => cell.trim());
}

/** The contents of each inline code span, pairing backtick runs of equal length. */
export function codeSpans(text: string): string[] {
  return [...text.matchAll(/(?<!`)(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g)].map(match => match[2] ?? "");
}

/** Turn inline Markdown into the text a reader sees. Code spans become `[code]`. */
export function inlineText(markdown: string, onAlt?: (alt: string) => void): string {
  let text = markdown;
  text = replaceBacktickSpans(text, " [code] ");
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)|!\[([^\]]*)\]\[[^\]]*\]/g, (_, alt?: string, refAlt?: string) => {
    onAlt?.(alt ?? refAlt ?? "");
    return "";
  });
  text = text.replace(/<img\b[^>]*?\balt\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi, (_, a?: string, b?: string) => {
    onAlt?.(a ?? b ?? "");
    return "";
  });
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1");
  text = text.replace(/<(?:https?:|mailto:)[^>]+>/g, "");
  text = removeHtmlTags(text);
  text = text.replace(/\*\*|__|~~/g, "");
  text = text.replace(/(^|[\s(])[*_](?=\S)([^*_\n]*?\S)[*_](?=[\s).,;:!?]|$)/g, "$1$2");
  text = text.replace(/\\([\\`*_{}[\]()#+\-.!|>])/g, "$1");
  return text.replace(/[ \t]+/g, " ").trim();
}

function frontMatter(lines: readonly string[]): { end: number; blocks: Block[] } {
  if (lines[0]?.trim() !== "---") return { end: 0, blocks: [] };
  const close = lines.findIndex((line, index) => index > 0 && /^(?:---|\.\.\.)\s*$/.test(line));
  if (close === -1) return { end: 0, blocks: [] };
  const blocks: Block[] = [];
  for (let index = 1; index < close; index += 1) {
    const match = /^(title|description):\s*(.*)$/.exec(lines[index] ?? "");
    if (!match?.[1] || !match[2]) continue;
    const value = match[2].trim().replace(/^(["'])(.*)\1$/, "$2");
    if (!value || value === "|" || value === ">") continue;
    const field = match[1] as "title" | "description";
    blocks.push({ line: index + 1, text: value, surface: field, field });
  }
  return { end: close + 1, blocks };
}

function markdownBlocks(markdown: string, kind: MarkdownKind): { blocks: Block[]; structure: StructureFinding[] } {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const front = frontMatter(lines);
  const blocks: Block[] = [...front.blocks];
  const structure: StructureFinding[] = [];
  const prose: CopySurface = kind === "body" ? "body" : kind;
  const headingSurface: CopySurface = kind === "reference" ? "reference" : "heading";
  let paragraph: string[] = [];
  let paragraphLine = 0;
  let paragraphHtml = false;
  let lastWasList = false;
  const flush = (): void => {
    if (paragraph.length) {
      blocks.push({ line: paragraphLine, text: paragraph.join("\n"), surface: prose, ...(paragraphHtml ? { html: true } : {}) });
    }
    paragraph = [];
    paragraphHtml = false;
  };
  const start = (line: number, text: string, html = false): void => {
    flush();
    paragraph = [text];
    paragraphLine = line;
    paragraphHtml = html;
  };

  for (let index = front.end; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const lineNumber = index + 1;
    const fence = FENCE.exec(line);
    if (fence?.[1]) {
      flush();
      const marker = fence[1];
      let end = index + 1;
      while (end < lines.length && !new RegExp(`^ {0,3}${marker[0] === "`" ? "`" : "~"}{${marker.length},}\\s*$`).test(lines[end] ?? "")) end += 1;
      index = end;
      lastWasList = false;
      continue;
    }
    if (/^\s*<!--/.test(line)) {
      flush();
      let end = index;
      while (end < lines.length && !(lines[end] ?? "").includes("-->")) end += 1;
      index = end;
      lastWasList = false;
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    if (!paragraph.length && !lastWasList && /^(?: {4}|\t)/.test(line)) continue; // indented code
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      if (heading[2]) blocks.push({ line: lineNumber, text: heading[2], surface: headingSurface });
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
      header.forEach(cell => cell && blocks.push({ line: lineNumber, text: cell, surface: headingSurface }));
      let row = index + 2;
      for (; row < lines.length; row += 1) {
        const text = lines[row] ?? "";
        if (!text.trim() || !text.includes("|")) break;
        const cells = tableCells(text);
        if (cells.length !== width) {
          structure.push({ line: row + 1, excerpt: text.trim(), hint: `This table row has ${cells.length} cells; the header has ${width}. GitHub drops or shifts the extra cells.` });
        }
        if (codeSpans(text).some(span => /(?<!\\)\|/.test(span))) {
          structure.push({ line: row + 1, excerpt: text.trim(), hint: "A pipe inside a code span splits the table cell on GitHub. Escape it as \\| or move the code out of the table." });
        }
        cells.forEach(cell => cell && blocks.push({ line: row + 1, text: cell, surface: prose }));
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

/** The reader-visible text of a Markdown document, one entry per heading, paragraph, list item, table cell, and image. */
export function extractMarkdown(markdown: string, location: string, options: MarkdownOptions = {}): ExtractedText[] {
  const kind = options.kind ?? "body";
  const { blocks } = markdownBlocks(markdown, kind);
  const items: ExtractedText[] = [];
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
    const alts: string[] = [];
    const text = inlineText(block.text, alt => alts.push(alt));
    for (const alt of alts) if (alt.trim()) items.push({ surface: "alt", text: alt.trim(), location: where, field: "alt" });
    if (text) items.push({ surface: block.surface, text, location: where });
  }
  return items;
}

/** Lint a Markdown document. Findings carry `file:line` locations. */
export function lintMarkdown(markdown: string, location: string, config?: CopyConfig, options: MarkdownOptions = {}): CopyFinding[] {
  const kind = options.kind ?? "body";
  const { structure } = markdownBlocks(markdown, kind);
  const plain = inlineText(markdown.replace(/^( {0,3})(`{3,}|~{3,})[\s\S]*?^\1\2\s*$/gm, ""));
  const defined = definedTerms(plain, vocabularyFor(config));
  const findings: CopyFinding[] = [];
  for (const item of extractMarkdown(markdown, location, options)) {
    findings.push(...lintCopy(item.text, {
      surface: item.surface,
      location: item.location,
      format: item.surface === "alt" ? "text" : "markdown",
      definedTerms: defined,
      ...(config ? { config } : {}),
      ...(item.field ? { field: item.field } : {}),
    }));
  }
  const prose: CopySurface = kind === "body" ? "body" : kind;
  for (const entry of structure) {
    findings.push({ rule: "render", severity: "error", surface: prose, location: `${location}:${entry.line}`, excerpt: excerptAt(entry.excerpt, 0, 60), hint: entry.hint });
  }
  return findings.sort((a, b) => lineOf(a.location) - lineOf(b.location));
}

function lineOf(location: string): number {
  const match = /:(\d+)$/.exec(location);
  return match?.[1] ? Number(match[1]) : 0;
}
