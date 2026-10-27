// @vitest-environment jsdom
import { createRequire } from "module";
import { describe, expect, it } from "vitest";
import { getBlockFields, getBlocksKey, getSectionFields, getSectionMeta, SECTION_REGISTRY } from "../ThemeEditorExtensions";
import { canRewrite, DRAFT_TYPES, keepsTokens, MOVED_MARK, normalizeRichText, protectRichText, REWRITE_MAX, restoreRichText, rewriteFormat, rewriteProblem, richTextSignature, sectionFromDraft, SIMPLE_TAGS, tokensOf } from "./aiStudio";
import { sanitizeRichText } from "./richText";

const server = createRequire(import.meta.url)("../../../../functions/aiWriter.js");

describe("Studio AI rules", () => {
  it("drafts the same sections, fields and limits as the server", () => {
    const strip = (map: Record<string, any>) => Object.fromEntries(Object.entries(map).map(([t, s]) => [t, { label: s.label, fields: s.fields, items: s.items, html: s.html }]));
    expect(JSON.parse(JSON.stringify(strip(DRAFT_TYPES)))).toEqual(JSON.parse(JSON.stringify(strip(server.DRAFT_TYPES))));
  });
  it("only drafts real sections and their own text fields, and never quotes or reviews", () => {
    for (const [type, spec] of Object.entries(DRAFT_TYPES)) {
      expect(SECTION_REGISTRY.some(m => m.type === type), type).toBe(true);
      const keys = new Set(getSectionFields(type).filter(f => ["text", "textarea", "richtext"].includes(f.kind)).map(f => f.key));
      for (const key of Object.keys(spec.fields)) expect(keys.has(key), `${type}.${key}`).toBe(true);
      for (const key of (spec.html || [])) expect(getSectionFields(type).find(f => f.key === key)?.kind, `${type}.${key}`).toBe("richtext");
      if (spec.items) {
        const blockKeys = new Set(getBlockFields(type).map(f => f.key));
        for (const key of Object.keys(spec.items)) expect(blockKeys.has(key), `${type} block ${key}`).toBe(true);
      }
    }
    expect(Object.keys(DRAFT_TYPES).some(t => /Testimonial|Praise|Review|Quote/.test(t))).toBe(false);
  });
  it("offers a rewrite only for plain text, text areas and rich text with words in them", () => {
    expect(canRewrite("text", "Hello")).toBe(true);
    expect(canRewrite("richtext", "<p>Hi</p>")).toBe(true);
    expect(canRewrite("richtext", "<p></p>")).toBe(false);
    expect(canRewrite("text", "")).toBe(false);
    expect(canRewrite("text", "{name}")).toBe(false);
    expect(canRewrite("text", { $dyn: "book.title" })).toBe(false);
    for (const kind of ["link", "image", "html", "color", "number"]) expect(canRewrite(kind, "words"), kind).toBe(false);
    expect(rewriteFormat("richtext")).toBe("html");
    expect(rewriteFormat("textarea")).toBe("plain");
  });
  it("keeps every {placeholder} and connected detail", () => {
    expect(tokensOf("Hi {name}, {{book.title}} ({count})")).toEqual(["{name}", "{{book.title}}", "{count}"]);
    expect(keepsTokens("Hi {name}", "Hello {name}!")).toBe(true);
    expect(keepsTokens("Hi {name}", "Hello friend")).toBe(false);
  });
  it("builds a section from a draft: defaults kept, only drafted words laid over, items become fresh blocks", () => {
    const faq = sectionFromDraft("FAQSection", { title: "Questions", subtitle: "", extra: "ignored", items: [{ question: "Q1?", answer: "A1." }, { question: "Q2?", answer: "A2." }, { question: "half" }] }, getSectionMeta as any, getBlocksKey)!;
    expect(faq.type).toBe("FAQSection");
    expect(faq.settings.title).toBe("Questions");
    expect(faq.settings).not.toHaveProperty("extra");
    const items = faq.settings[getBlocksKey("FAQSection")];
    expect(items.map((b: any) => b.question)).toEqual(["Q1?", "Q2?"]);
    expect(new Set(items.map((b: any) => b.id)).size).toBe(2);
    const hero = sectionFromDraft("HeroSection", { title: "Autumn list" }, getSectionMeta as any, getBlocksKey)!;
    expect(hero.settings.title).toBe("Autumn list");
    expect(hero.settings.imageUrl).toBe(getSectionMeta("HeroSection")?.defaults?.imageUrl);
    const text = sectionFromDraft("TextContentSection", { title: "T", content: "<p>x</p><script>bad()</script>" }, getSectionMeta as any, getBlocksKey, h => h.replace(/<script[\s\S]*?<\/script>/g, ""))!;
    expect(text.settings.content).toBe("<p>x</p>");
    expect(sectionFromDraft("TestimonialsSection", { title: "x" }, getSectionMeta as any, getBlocksKey)).toBeNull();
  });

  it("won't rewrite rich text it would lose parts of, or text longer than the server takes", () => {
    expect(rewriteProblem("richtext", '<p>Hi <a href="/x" target="_blank" rel="noopener noreferrer">us</a><br></p><ul><li>a</li></ul>')).toBe("");
    // Pictures, videos, dividers, alignment, indents, big headings and struck-out words are carried over now.
    for (const html of ['<p class="ql-align-center">x</p>', '<p><img src="https://x.test/a.png"></p><p>Words</p>', '<iframe class="ql-video" src="https://v"></iframe><p>w</p>', "<h1>Big</h1>", "<p><s>old</s></p>", '<ol><li class="ql-indent-1">x</li></ol>', "<hr><p>w</p>"])
      expect(rewriteProblem("richtext", html), html).toBe("");
    // Coloured words and unusual markup still can't be.
    expect(rewriteProblem("richtext", '<p><span style="color:red">x</span></p>')).toMatch(/coloured/);
    expect(rewriteProblem("richtext", '<p class="note">x</p>')).toMatch(/coloured/);
    expect(rewriteProblem("richtext", "<table><tr><td>x</td></tr></table>")).toMatch(/can't keep \(<table>\)/);
    expect(rewriteProblem("textarea", "x".repeat(REWRITE_MAX.plain))).toBe("");
    expect(rewriteProblem("textarea", "x".repeat(REWRITE_MAX.plain + 1))).toMatch(/too long/);
    expect(REWRITE_MAX).toEqual(server.REWRITE_MAX);
    // Long picture addresses don't count: only the words the AI sees do.
    expect(rewriteProblem("richtext", `<p><img src="https://x.test/${"a".repeat(9000)}.png"></p><p>Words</p>`)).toBe("");
    expect(rewriteProblem("richtext", `<p>${"w".repeat(REWRITE_MAX.html)}</p>`)).toMatch(/too long/);
    // The server refuses raw pictures (Studio always holds them out first) and writes back the same tags.
    expect(server.richTextProblem('<p><img src="x"></p>')).toMatch(/can't keep/);
    expect(server.richTextProblem('<p><a href="/x" target="_blank" rel="noopener">a</a></p>')).toBe("");
    expect([...server.HTML_TAGS].sort()).toEqual([...SIMPLE_TAGS].sort());
    expect(server.richTextProblem(protectRichText('<p class="ql-align-center"><img src="x"></p><p class="ql-align-right">Hi <img src="y" width="80"></p><hr>').text)).toBe("");
  });
});

describe("rewriting rich text with pictures (words only)", () => {
  const page = '<p>Intro <strong>words</strong>.</p><p class="ql-align-center"><img src="https://x.test/a.png" alt="Cover" width="480"></p><p class="ql-align-center">Centred line with <img src="https://x.test/b.png"> inline.</p><iframe class="ql-video" frameborder="0" allowfullscreen="true" src="https://www.youtube.com/embed/x"></iframe><hr><ol><li class="ql-indent-1">Indented {item}</li></ol>';
  const answerOf = (text: string) => sanitizeRichText(text); // what the editor does to the server's answer first

  it("holds pictures, videos, dividers and line layout out of what the AI sees", () => {
    const { text, held, problem } = protectRichText(page);
    expect(problem).toBe("");
    expect(text).not.toMatch(/<img|<iframe|<hr|class=|style=|https:/);
    expect(text).toBe('<p>Intro <strong>words</strong>.</p><p>[[keep-1]]</p><p>[[line-1]]Centred line with [[keep-2]] inline.</p><p>[[keep-3]]</p><p>[[keep-4]]</p><ol><li>[[line-2]]Indented {item}</li></ol>');
    expect(held.keep.map(k => k.block)).toEqual([true, false, true, true]);
    expect(tokensOf(text)).toEqual(expect.arrayContaining(["[[keep-1]]", "[[line-2]]", "{item}"]));
    expect(server.tokensOf(text)).toEqual(tokensOf(text));
  });
  it("puts everything back exactly when the AI changes nothing", () => {
    const { text, held } = protectRichText(page);
    const back = restoreRichText(answerOf(text), held);
    expect(back).toEqual({ html: normalizeRichText(page) });
  });
  it("changes only the words", () => {
    const { text, held } = protectRichText(page);
    const answer = text.replace("Intro <strong>words</strong>.", "A <em>warmer</em> welcome.").replace("Centred line with", "A centred line, with").replace("Indented {item}", "Indented again {item}");
    const back = restoreRichText(answerOf(answer), held) as { html: string };
    expect(back.html).toContain("<p>A <em>warmer</em> welcome.</p>");
    expect(back.html).toContain('<p class="ql-align-center"><img src="https://x.test/a.png" alt="Cover" width="480"></p>');
    expect(back.html).toContain('<p class="ql-align-center">A centred line, with <img src="https://x.test/b.png"> inline.</p>');
    expect(back.html).toContain('<iframe class="ql-video" frameborder="0" allowfullscreen="true" src="https://www.youtube.com/embed/x"></iframe><hr>');
    expect(back.html).toContain('<li class="ql-indent-1">Indented again {item}</li>');
  });
  it("keeps a picture on its own line even when the AI writes words around its marker", () => {
    const { text, held } = protectRichText("<p>One.</p><p><img src=\"a\"></p><p>Two.</p>");
    expect((restoreRichText("<p>One. [[keep-1]] Two.</p>", held) as any).html).toBe('<p>One. Two.</p><p><img src="a"></p>');
    expect((restoreRichText("<p>[[keep-1]] One and two.</p>", held) as any).html).toBe('<p><img src="a"></p><p>One and two.</p>');
    expect(text).toBe("<p>One.</p><p>[[keep-1]]</p><p>Two.</p>");
  });
  it("changes nothing when the AI drops, repeats or reorders a marker, or moves a line's layout", () => {
    const { text, held } = protectRichText(page);
    for (const bad of [
      text.replace("[[keep-2]]", ""),
      text.replace("[[keep-1]]", "[[keep-1]] [[keep-1]]"),
      text.replace("[[keep-1]]", "[[keep-x]]").replace("[[keep-3]]", "[[keep-1]]").replace("[[keep-x]]", "[[keep-3]]"),
      text.replace("[[line-1]]Centred line with", "Centred [[line-1]]line with"),
      text + "<p>[[keep-9]]</p>",
    ]) expect(restoreRichText(answerOf(bad), held), bad).toEqual({ error: MOVED_MARK });
  });
  it("refuses a line layout or picture marker that lands somewhere it can't come back from", () => {
    const one = protectRichText('<p class="ql-align-center">Title</p><p>Body</p>');
    // Swapped lines, a line marker left on a line of its own, and a marker inside a link address.
    const twoLines = protectRichText('<p class="ql-align-center">A</p><p class="ql-align-right">B</p>');
    expect(restoreRichText("<p>[[line-2]]A</p><p>[[line-1]]B</p>", twoLines.held)).toEqual({ error: MOVED_MARK });
    expect(restoreRichText("<p>[[line-1]]</p><p>Title Body</p>", one.held)).toEqual({ error: MOVED_MARK });
    const pic = protectRichText('<p>Hello</p><p><img src="a"></p>');
    expect(restoreRichText(answerOf('<p>Hello <a href="[[keep-1]]">pic</a></p>'), pic.held)).toEqual({ error: MOVED_MARK });
    // A picture marker the AI put in a list item of its own leaves no empty bullet behind.
    expect((restoreRichText("<ul><li>One</li><li>[[keep-1]]</li></ul>", pic.held) as any).html).toBe('<ul><li>One</li></ul><p><img src="a"></p>');
    // An indented list item holding only a picture keeps both.
    const li = protectRichText('<p>Intro</p><ol><li class="ql-indent-1"><img src="b"></li></ol>');
    expect((restoreRichText(answerOf(li.text), li.held) as any).html).toBe('<p>Intro</p><ol><li class="ql-indent-1"><img src="b"></li></ol>');
  });
  it("sends only what the server accepts, and gives links back their new-tab settings", () => {
    const html = '<p>See <a href="https://x.test" target="_blank" rel="noopener noreferrer">us</a> and <span>plain</span> words.</p><p class="" style="">Empty attributes</p><p class="ql-align-center"><img src="a"></p>';
    const { text, held, problem } = protectRichText(html);
    expect(problem).toBe("");
    expect(server.richTextProblem(text)).toBe("");
    expect(text).toBe('<p>See <a href="https://x.test">us</a> and plain words.</p><p>Empty attributes</p><p>[[keep-1]]</p>');
    const back = restoreRichText(answerOf(server.sanitizeHtml(text)), held) as { html: string };
    expect(back.html).toContain('<a href="https://x.test" target="_blank" rel="noopener noreferrer">us</a>');
    expect(rewriteProblem("richtext", '<p><a href="/x" title="Tip">x</a></p>')).toMatch(/title on <a>/);
    expect(rewriteProblem("richtext", "<p>Use [[keep-1]] here</p>")).toMatch(/looks like/);
  });
  it("tells an editor's tidying apart from a real edit", () => {
    const html = '<p class="ql-align-center">Hi <a href="/x">us</a></p><p><img src="a" alt="A"></p>';
    expect(richTextSignature(html)).toBe(richTextSignature(html.replace("</p><p>", "</p>\n<p>").replace('href="/x"', 'href="/x" rel="noopener"')));
    for (const edit of [html.replace('<p><img src="a" alt="A"></p>', ""), html.replace("/x", "/y"), html.replace(' class="ql-align-center"', ""), html.replace("Hi", "Hey")])
      expect(richTextSignature(edit)).not.toBe(richTextSignature(html));
  });
  it("shows no rewrite for a body that is only pictures", () => {
    expect(canRewrite("richtext", '<p><img src="a"></p><hr>')).toBe(false);
    expect(canRewrite("richtext", '<p><img src="a"></p><p>Caption</p>')).toBe(true);
  });
});
