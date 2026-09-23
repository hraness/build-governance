import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { decodeEntities, extractHtml } from "./html.ts";

const page = `<!doctype html>
<html lang="en">
<head>
  <title>Docs &middot; Sys1</title>
  <meta name="description" content="Install Sys1 and call it from a Node or Bun client.">
  <meta property="og:title" content="Sys1 docs">
  <meta property="og:description" content="Install Sys1 and call it.">
  <meta property="og:image:alt" content="The Sys1 wordmark">
  <meta name="twitter:description" content="Call Sys1 from Bun.">
  <meta property="og:url" content="https://sys1.io/docs">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"SoftwareApplication","name":"Sys1","description":"Ask a model yes or no.","url":"https://sys1.io","offers":{"@type":"Offer","price":"0"},"mainEntity":[{"@type":"Question","name":"Is it free?","acceptedAnswer":{"@type":"Answer","text":"Yes, locally."}}],"datePublished":"2026-09-01"}</script>
  <style>.x{content:"honest"}</style>
</head>
<body>
  <nav><a href="/">Docs</a><a href="/b">Benchmark</a></nav>
  <h1>Check what your<br>agent can solve.</h1>
  <p>Run <code>sys1 ask</code> to start. It&rsquo;s fast &amp; small.</p>
  <pre><code>honest — code</code></pre>
  <img src="a.png" alt="A chart of answers by model">
  <svg><title>icon</title><text>svg text</text></svg>
  <script>const honest = "—";</script>
  <!-- a comment with receipt -->
  <p>Last line.</p>
</body>
</html>`;

describe("extractHtml", () => {
  const items = extractHtml(page, "site/docs.html");
  const find = (location: string) => items.find(item => item.location === `site/docs.html#${location}`);

  test("reads the title, meta description, and social text with their fields", () => {
    expect(find("title")).toEqual({ surface: "title", text: "Docs · Sys1", location: "site/docs.html#title", field: "title" });
    expect(find("meta[name=description]")?.field).toBe("description");
    expect(find("meta[og:title]")).toMatchObject({ surface: "social", field: "title", text: "Sys1 docs" });
    expect(find("meta[og:description]")).toMatchObject({ surface: "social", field: "description" });
    expect(find("meta[og:image:alt]")).toMatchObject({ surface: "social", field: "alt" });
    expect(find("meta[twitter:description]")).toMatchObject({ surface: "social", field: "description" });
    expect(find("meta[og:url]")).toBeUndefined();
  });

  test("reads JSON-LD strings and skips identifiers, URLs, prices, and dates", () => {
    const jsonLd = items.filter(item => item.location.includes("#json-ld:"));
    expect(jsonLd.map(item => [item.location.split("#json-ld:")[1], item.surface])).toEqual([
      ["name", "heading"],
      ["description", "description"],
      ["mainEntity[0].name", "heading"],
      ["mainEntity[0].acceptedAnswer.text", "body"],
    ]);
  });

  test("keeps a heading with a line break together and separates adjacent links", () => {
    expect(find("h1")?.text).toBe("Check what your agent can solve.");
    expect(find("nav")?.text).toBe("Docs Benchmark");
  });

  test("replaces inline code with a placeholder, decodes entities, and skips code blocks, scripts, styles, SVG, and comments", () => {
    const text = items.map(item => item.text).join("\n");
    expect(find("p")?.text).toBe("Run [code] to start. It’s fast & small.");
    expect(text).not.toContain("honest");
    expect(text).not.toContain("svg text");
    expect(text).not.toContain("icon");
    expect(text).not.toContain("receipt");
    expect(find("p[2]")?.text).toBe("Last line.");
  });

  test("reads image alt text", () => {
    expect(find("img")).toMatchObject({ surface: "alt", field: "alt", text: "A chart of answers by model" });
  });

  test("reads the body when the page omits the closing head tag", () => {
    const items = extractHtml("<html><head><title>A page</title><body><p>Visible.</p>", "x.html");
    expect(items.map(item => item.text)).toEqual(["A page", "Visible."]);
  });

  test("tolerates malformed markup and invalid JSON-LD", () => {
    expect(() => extractHtml(`<p>Open <b>bold <i>text</p><script type="application/ld+json">{not json</script><p>After`, "x")).not.toThrow();
    fc.assert(fc.property(fc.string({ maxLength: 300 }), html => {
      for (const item of extractHtml(html, "x")) expect(item.text.trim()).toBe(item.text);
    }));
  });
});

describe("decodeEntities", () => {
  test("decodes named and numeric references once", () => {
    expect(decodeEntities("&amp;apos; &#8212; &#x2014; &hellip; &unknown;")).toBe("&apos; — — … &unknown;");
  });
});
