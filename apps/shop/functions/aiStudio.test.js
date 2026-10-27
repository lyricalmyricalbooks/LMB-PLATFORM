import { createRequire } from "module";
import { describe, expect, it, vi } from "vitest";

const { buildRequest, parseResponse, handleAiWrite, DRAFT_TYPES, REWRITE_HOW, REWRITE_MAX, sanitizeHtml, tokensOf } = createRequire(import.meta.url)("./aiWriter");

const KEY = "AIza" + "x".repeat(35);
const reply = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const answer = obj => reply(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: "STOP" }] });
const gemini = obj => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });
const deps = (over = {}) => ({ readSettings: async () => ({ apiKey: KEY, voice: "" }), allow: async () => true, fetchImpl: vi.fn(), ...over });

describe("Studio AI: rewrite a field", () => {
  it("asks for each kind of rewrite, keeps placeholders and labels the field", () => {
    for (const how of Object.keys(REWRITE_HOW)) {
      const text = buildRequest("rewrite", { text: "Hello {name}", how, label: "Greeting", where: "Header" }).contents[0].parts[0].text;
      expect(text).toContain(REWRITE_HOW[how]);
      expect(text).toContain("{name}");
      expect(text).toContain('field "Greeting"');
    }
    const custom = buildRequest("rewrite", { text: "Hi", how: "custom", instruction: "mention the spring sale" }).contents[0].parts[0].text;
    expect(custom).toContain("mention the spring sale");
    expect(buildRequest("rewrite", { text: "Hi" }).systemInstruction.parts[0].text).toMatch(/Never invent prices/);
  });

  it("refuses an answer that drops a placeholder, and unwraps quotes around the whole answer", () => {
    const ctx = { input: { text: "Thanks {name}, see {{book.title}}" } };
    expect(() => parseResponse("rewrite", gemini({ text: "Thanks friend" }), ctx)).toThrow(/placeholder/);
    expect(parseResponse("rewrite", gemini({ text: "\"Thank you {name}, enjoy {{book.title}}\"" }), ctx).text).toBe("Thank you {name}, enjoy {{book.title}}");
    expect(parseResponse("rewrite", gemini({ text: 'He said "hi"' }), { input: { text: "x" } }).text).toBe('He said "hi"');
  });

  it("keeps rich text to simple, safe markup and refuses a changed link", () => {
    const ctx = { input: { text: '<p>See <a href="/page/about">us</a></p>', format: "html" } };
    const out = parseResponse("rewrite", gemini({ text: '<p onclick="x">Read <a href="/page/about" target="_blank">about us</a><script>bad()</script><img src=x></p>' }), ctx);
    expect(out.text).toBe('<p>Read <a href="/page/about">about us</a></p>');
    expect(() => parseResponse("rewrite", gemini({ text: '<p><a href="https://evil.test">us</a></p>' }), ctx)).toThrow(/link/);
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(tokensOf("{a} {a} {{b.c}}")).toEqual(["{a}", "{{b.c}}"]);
  });

  it("keeps phone and relative links like the Studio editor does", () => {
    const ctx = { input: { text: '<p>Call <a href="tel:+14165550100">us</a> or read <a href="about">about</a></p>', format: "html" } };
    expect(parseResponse("rewrite", gemini({ text: '<p>Phone <a href="tel:+14165550100">us</a>, or see <a href="about">about us</a></p>' }), ctx).text).toContain('href="tel:+14165550100"');
  });

  it("refuses text it would cut or rich text it would lose parts of, instead of changing it", async () => {
    const long = await handleAiWrite({ task: "rewrite", input: { text: "x".repeat(REWRITE_MAX.plain + 1) } }, deps());
    expect(long.status).toBe(400);
    expect(long.body.error).toMatch(/too long/);
    const pic = await handleAiWrite({ task: "rewrite", input: { text: '<p>Hi</p><p><img src="x"></p>', format: "html" } }, deps());
    expect(pic.status).toBe(400);
    expect(pic.body.error).toMatch(/can't keep/);
  });

  it("gives longer answers room and explains an answer cut short", () => {
    expect(buildRequest("rewrite", { text: "Hi" }).generationConfig.maxOutputTokens).toBe(8192);
    expect(() => parseResponse("rewrite", { candidates: [{ content: { parts: [{ text: '{"text":"Hal' }] }, finishReason: "MAX_TOKENS" }] }, { input: { text: "Hi" } })).toThrow(/too long/);
  });

  it("keeps the picture and layout markers Studio puts in place of pictures", () => {
    const input = { text: "<p>Hi.</p><p>[[keep-1]]</p><p>[[line-1]]Centred <s>old</s></p><h1>Big</h1>", format: "html" };
    const prompt = buildRequest("rewrite", input).contents[0].parts[0].text;
    expect(prompt).toMatch(/\[\[keep-1\]\] stand for pictures/);
    expect(prompt).toMatch(/<s>.*<h1>/);
    expect(buildRequest("rewrite", { text: "<p>Hi</p>", format: "html" }).contents[0].parts[0].text).not.toMatch(/stand for pictures/);
    expect(tokensOf(input.text)).toEqual(["[[keep-1]]", "[[line-1]]"]);
    const ctx = { input };
    expect(() => parseResponse("rewrite", gemini({ text: "<p>Hello.</p><p>[[line-1]]Centred</p>" }), ctx)).toThrow(/placeholder/);
    const ok = parseResponse("rewrite", gemini({ text: "<p>Hello.</p><p>[[keep-1]]</p><p>[[line-1]]Centred <s>gone</s></p><h1>Big</h1>" }), ctx);
    expect(ok.text).toBe("<p>Hello.</p><p>[[keep-1]]</p><p>[[line-1]]Centred <s>gone</s></p><h1>Big</h1>");
  });

  it("says when there's nothing to rewrite", async () => {
    const res = await handleAiWrite({ task: "rewrite", input: { text: "  <p></p> " } }, deps());
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no text to rewrite/);
  });
});

describe("Studio AI: draft a section", () => {
  it("builds a schema for the section's own words, with items where the section has blocks", () => {
    const faq = buildRequest("sectionDraft", { type: "FAQSection", brief: "shipping questions" });
    expect(Object.keys(faq.generationConfig.responseSchema.properties)).toEqual(["title", "subtitle", "items"]);
    expect(faq.contents[0].parts[0].text).toContain("shipping questions");
    expect(Object.keys(buildRequest("sectionDraft", { type: "HeroSection", brief: "x" }).generationConfig.responseSchema.properties)).toEqual(["eyebrow", "title", "subtitle", "ctaText"]);
  });

  it("clips every field, drops unknown keys and incomplete items", () => {
    const ctx = { input: { type: "FAQSection" } };
    const out = parseResponse("sectionDraft", gemini({ title: "Questions", subtitle: "s", extra: "no", items: [{ question: "Q?", answer: "A." }, { question: "only half" }] }), ctx);
    expect(out).toEqual({ title: "Questions", subtitle: "s", items: [{ question: "Q?", answer: "A." }] });
    const text = parseResponse("sectionDraft", gemini({ title: "T", eyebrow: "", subtitle: "", content: "<p>Hi<script>x</script></p>" }), { input: { type: "TextContentSection" } });
    expect(text.content).toBe("<p>Hi</p>");
  });

  it("refuses section kinds it may not draft, such as quotes and reviews", async () => {
    expect(DRAFT_TYPES).not.toHaveProperty("TestimonialsSection");
    const res = await handleAiWrite({ task: "sectionDraft", input: { type: "TestimonialsSection", brief: "praise" } }, deps());
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/can't be drafted/);
    expect((await handleAiWrite({ task: "sectionDraft", input: { type: "FAQSection", brief: "" } }, deps())).status).toBe(400);
  });

  it("returns a draft end to end", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(answer({ title: "Join us", description: "Monthly news.", buttonLabel: "Sign up" }));
    const res = await handleAiWrite({ task: "sectionDraft", input: { type: "NewsletterSection", brief: "a monthly letter" } }, deps({ fetchImpl }));
    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({ title: "Join us", buttonLabel: "Sign up" });
  });
});
