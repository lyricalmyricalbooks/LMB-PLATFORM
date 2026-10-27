// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { editorHtml } from "./quillHtml";
import { loadQuill } from "./QuillEditor";
import { protectRichText, restoreRichText } from "../admin/studio/aiStudio";

// Page bodies and rich-text sections saved before the Quill 2 upgrade are Quill 1 HTML. Opening one in
// the editor and saving it must give back the same HTML (same meaning, same storefront look).

const Quill = await loadQuill();
const BlockEmbed: any = Quill.import("blots/block/embed");
class Divider extends BlockEmbed {}
(Divider as any).blotName = "divider";
(Divider as any).tagName = "hr";
Quill.register(Divider as any, true);

function editorWith(html: string) {
  const box = document.createElement("div");
  document.body.appendChild(box);
  const q = new Quill(box, { theme: "snow", modules: { toolbar: [["bold"]] } });
  q.setContents(q.clipboard.convert({ html }), "api");
  return q;
}

// Exactly what Quill 1 (react-quill) saved for a page using every feature the page editor offers.
const QUILL1_PAGE = [
  "<h2>About the press</h2>",
  '<p>We print <strong>small</strong> runs &amp; <em>zines</em>. <a href="https://example.com/shop" rel="noopener noreferrer" target="_blank">Visit</a></p>',
  "<ul><li>Risograph</li><li class=\"ql-indent-1\">two colours</li><li>Letterpress</li></ul>",
  "<ol><li>Write</li><li>Print</li><li class=\"ql-indent-1\">fold</li></ol>",
  '<p class="ql-align-center"><img src="https://example.invalid/a.webp" alt="Open book spread" width="50%"></p>',
  '<p class="ql-align-right">Signed, the editors</p>',
  '<p class="ql-indent-2">An indented aside</p>',
  "<hr>",
  '<iframe class="ql-video" frameborder="0" allowfullscreen="true" src="https://www.youtube.com/embed/abc123"></iframe>',
  "<p><br></p>",
  "<blockquote>A quote</blockquote>",
  "<h3>Heading three</h3>",
  "<p><s>gone</s> <u>under</u></p>",
].join("");

describe("Quill 2 editor keeps Quill 1 page HTML", () => {
  it("loads and saves an old page body unchanged", () => {
    const q = editorWith(QUILL1_PAGE);
    expect(editorHtml(q.root)).toBe(QUILL1_PAGE);
  });

  it("keeps bulleted lists as <ul> and numbered lists as <ol>, never Quill 2's data-list markup", () => {
    const q = editorWith(QUILL1_PAGE);
    const out = editorHtml(q.root);
    expect(out).not.toMatch(/data-list|ql-ui|contenteditable|&nbsp;/);
    expect(out).toContain("<ul><li>Risograph</li>");
    expect(out).toContain("<ol><li>Write</li>");
    // The live editor itself uses Quill 2's markup; only what we save is converted.
    expect(q.root.innerHTML).toContain('data-list="bullet"');
    expect(q.root.innerHTML).toBe(q.root.innerHTML); // root untouched by editorHtml
  });

  it("splits a run of mixed list kinds the way Quill 1 did", () => {
    const q = editorWith("<p>a</p><p>b</p><p>c</p><p>d</p>");
    q.formatLine(0, 1, "list", "bullet", "user");
    q.formatLine(2, 1, "list", "bullet", "user");
    q.formatLine(4, 1, "list", "ordered", "user");
    q.formatLine(6, 1, "list", "bullet", "user");
    q.formatLine(2, 1, "indent", 1, "user");
    expect(editorHtml(q.root)).toBe('<ul><li>a</li><li class="ql-indent-1">b</li></ul><ol><li>c</li></ol><ul><li>d</li></ul>');
  });

  it("types spaces as spaces (Quill 2's getSemanticHTML would save &nbsp; and turn videos into links)", () => {
    const q = editorWith("<p><br></p>");
    q.insertText(0, "two words", "user");
    q.insertEmbed(10, "video", "https://www.youtube.com/embed/xyz", "user");
    const out = editorHtml(q.root);
    expect(out).toContain("<p>two words</p>");
    expect(out).toContain('<iframe class="ql-video"');
    expect(q.getSemanticHTML()).toContain("two&nbsp;words"); // why we don't use it
  });

  it("saves the divider, empty lines and an empty editor like Quill 1", () => {
    const q = editorWith("");
    expect(editorHtml(q.root)).toBe("<p><br></p>");
    q.insertEmbed(0, "divider", true, "user");
    expect(editorHtml(q.root)).toBe("<hr><p><br></p>");
  });

  it("saves code blocks as Quill 1's <pre class=\"ql-syntax\">", () => {
    const q = editorWith('<pre class="ql-syntax" spellcheck="false">let a = 1;\nlet b = 2;\n</pre>');
    expect(editorHtml(q.root)).toBe('<pre class="ql-syntax" spellcheck="false">let a = 1;\nlet b = 2;\n</pre>');
  });

  it("keeps the AI rewrite's held-out pictures, videos and line layout working", () => {
    const html = editorHtml(editorWith(QUILL1_PAGE).root);
    const { text, held, problem } = protectRichText(html);
    expect(problem).toBe("");
    const back = restoreRichText(text, held);
    const parse = (s: string) => { const t = document.createElement("template"); t.innerHTML = s; return t.content; };
    expect("html" in back).toBe(true);
    // Same nodes and attributes (the rewrite may write a link's attributes in another order).
    expect(parse((back as { html: string }).html).isEqualNode(parse(html))).toBe(true);
  });

  it("renders saved bodies on the storefront with bullets as bullets", async () => {
    const { CurrentPageContext, PageContentSection } = await import("./SectionComponents");
    const body = editorHtml(editorWith(QUILL1_PAGE).root);
    const markup = renderToStaticMarkup(
      h(CurrentPageContext.Provider, { value: { title: "About", body } } as any, h(PageContentSection, { settings: {} })),
    );
    expect(markup).toContain("<ul><li>Risograph</li>");
    expect(markup).toContain("[&amp;_ul]:list-disc");
    expect(markup).toContain("[&amp;_ol]:list-decimal");
    expect(markup).toContain('<iframe class="ql-video"');
  });
});
