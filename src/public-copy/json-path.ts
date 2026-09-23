export interface JsonPathMatch {
  readonly path: string;
  readonly value: unknown;
}

type Segment = { readonly kind: "key"; readonly key: string } | { readonly kind: "index"; readonly index: number } | { readonly kind: "wildcard" };

/** Parse a JSONPath subset: `$`, `.key`, `['key']`, `["key"]`, `[n]`, `[*]`, and `.*`. */
export function parseJsonPath(path: string): Segment[] {
  if (!path.startsWith("$")) throw new Error(`JSONPath must start with $: ${path}`);
  const segments: Segment[] = [];
  const token = /\.([A-Za-z_$][\w$-]*)|\.\*|\[\*\]|\[(\d+)\]|\[(?:'([^']*)'|"([^"]*)")\]/y;
  token.lastIndex = 1;
  while (token.lastIndex < path.length) {
    const start = token.lastIndex;
    const match = token.exec(path);
    if (!match) throw new Error(`Unsupported JSONPath at position ${start}: ${path}`);
    if (match[1] !== undefined) segments.push({ kind: "key", key: match[1] });
    else if (match[2] !== undefined) segments.push({ kind: "index", index: Number(match[2]) });
    else if (match[3] !== undefined || match[4] !== undefined) segments.push({ kind: "key", key: match[3] ?? match[4] ?? "" });
    else segments.push({ kind: "wildcard" });
  }
  return segments;
}

/** Every value the path selects, with a concrete path such as `$.projects[3].description`. */
export function selectJsonPath(value: unknown, path: string): JsonPathMatch[] {
  let current: JsonPathMatch[] = [{ path: "$", value }];
  for (const segment of parseJsonPath(path)) {
    const next: JsonPathMatch[] = [];
    for (const { path: at, value: node } of current) {
      if (segment.kind === "wildcard") {
        if (Array.isArray(node)) node.forEach((item, index) => next.push({ path: `${at}[${index}]`, value: item }));
        else if (typeof node === "object" && node !== null) {
          for (const [key, item] of Object.entries(node)) next.push({ path: `${at}.${key}`, value: item });
        }
      } else if (segment.kind === "index") {
        if (Array.isArray(node) && segment.index < node.length) next.push({ path: `${at}[${segment.index}]`, value: node[segment.index] });
      } else if (typeof node === "object" && node !== null && !Array.isArray(node) && Object.hasOwn(node, segment.key)) {
        next.push({ path: `${at}.${segment.key}`, value: (node as Record<string, unknown>)[segment.key] });
      }
    }
    current = next;
  }
  return current;
}
