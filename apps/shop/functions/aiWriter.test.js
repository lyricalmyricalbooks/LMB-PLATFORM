import { createRequire } from "module";
import { describe, expect, it, vi } from "vitest";

const { aiKeyProblem, photoImageUrl, buildRequest, parseResponse, generate, handleAiWrite, fitWords, plainText, bookFacts, resetProviderRest, worthBackup } = createRequire(import.meta.url)("./aiWriter");

const KEY = "AIza" + "x".repeat(35);
const reply = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const answer = obj => reply(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: "STOP" }] });
const deps = (over = {}) => ({ readSettings: async () => ({ apiKey: KEY, voice: "" }), allow: async () => true, fetchImpl: vi.fn(), ...over });

describe("AI writing assistant (Gemini)", () => {
  it("accepts AI Studio keys and refuses junk", () => {
    expect(aiKeyProblem(KEY)).toBe("");
    expect(aiKeyProblem("")).toMatch(/Enter/);
    expect(aiKeyProblem("not a key")).toMatch(/doesn't look/);
  });

  it("asks for JSON and turns off thinking on 2.5 flash only", () => {
    const body = buildRequest("bookSeo", { title: "Salt" }, { siteName: "Lyricalmyrical Books" }, "gemini-2.5-flash");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(buildRequest("bookSeo", { title: "Salt" }, {}, "gemini-flash-latest").generationConfig.thinkingConfig).toBeUndefined();
    expect(body.contents[0].parts[0].text).toContain("Title: Salt");
    expect(body.systemInstruction.parts[0].text).toMatch(/Never invent/);
  });

  it("puts the owner's house style in the instructions", () => {
    const body = buildRequest("bookDescription", { title: "Salt" }, { voice: "Short sentences. British spelling." });
    expect(body.systemInstruction.parts[0].text).toContain("British spelling");
  });

  it("sends only catalog facts, with HTML and links stripped", () => {
    const facts = bookFacts({ title: "Salt", description: "<p>A <b>bold</b> [link](https://x.y) book.</p>", costPrice: 4, shelfLocation: "B2" });
    expect(facts.description).toBe("A bold link book.");
    expect(JSON.stringify(facts)).not.toMatch(/costPrice|shelfLocation|B2/);
    expect(plainText("a<script>bad()</script>b")).toBe("a b");
  });

  it("cleans and fits the answer", () => {
    const long = "word ".repeat(60);
    const out = parseResponse("bookSeo", { candidates: [{ content: { parts: [{ text: JSON.stringify({ metaTitle: "Salt by Ana", metaDescription: long }) }] } }] });
    expect(out.metaTitle).toBe("Salt by Ana");
    expect(out.metaDescription.length).toBeLessThanOrEqual(160);
    expect(out.metaDescription.endsWith(" ")).toBe(false);
    expect(fitWords("one two three", 8)).toBe("one two");
  });

  it("strips markdown from a description and keeps paragraphs", () => {
    const out = parseResponse("bookDescription", { candidates: [{ content: { parts: [{ text: JSON.stringify({ description: "## Heading\n**Bold** start\nline two\n\n- a point" }) }] } }] });
    expect(out.description).toBe("Heading Bold start line two\n\na point");
  });

  it("ignores thought parts and explains a blocked prompt", () => {
    const data = { candidates: [{ content: { parts: [{ text: "thinking…", thought: true }, { text: '{"seoTitle":"About","metaDescription":"Who we are."}' }] } }] };
    expect(parseResponse("pageSeo", data)).toEqual({ seoTitle: "About", metaDescription: "Who we are." });
    expect(() => parseResponse("pageSeo", { promptFeedback: { blockReason: "SAFETY" } })).toThrow(/safety filter/);
    expect(() => parseResponse("pageSeo", { candidates: [{ content: { parts: [{ text: "not json" }] } }] })).toThrow(/couldn't be read/);
  });

  it("moves to the next model when Google has retired one", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply(404, { error: { status: "NOT_FOUND", message: "models/gemini-2.5-flash is not found" } }))
      .mockResolvedValueOnce(answer({ seoTitle: "About", metaDescription: "Who we are." }));
    const out = await generate({ apiKey: KEY, task: "pageSeo", input: { title: "About" }, fetchImpl });
    expect(out.model).toBe("gemini-flash-latest");
    expect(fetchImpl.mock.calls[1][0]).toContain("gemini-flash-latest:generateContent");
    expect(fetchImpl.mock.calls[0][1].headers["x-goog-api-key"]).toBe(KEY);
  });

  it("explains the free allowance running out", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(429, { error: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } }));
    await expect(generate({ apiKey: KEY, task: "pageSeo", input: { title: "About" }, fetchImpl })).rejects.toThrow(/free Google AI allowance/);
    // Each model has its own free allowance, so all three are tried.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("uses the next model's allowance when the first one's is used up", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply(429, { error: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } }))
      .mockResolvedValueOnce(answer({ seoTitle: "About", metaDescription: "Who we are." }));
    expect((await generate({ apiKey: KEY, task: "pageSeo", input: { title: "About" }, fetchImpl })).model).toBe("gemini-flash-latest");
  });

  it("needs a saved key before calling Google", async () => {
    const d = deps({ readSettings: async () => ({}) });
    const out = await handleAiWrite({ task: "bookSeo", input: { title: "Salt" } }, d);
    expect(out.status).toBe(412);
    expect(out.body.needsKey).toBe(true);
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });

  it("is rate limited and refuses unknown tasks", async () => {
    expect((await handleAiWrite({ task: "bookSeo", input: { title: "Salt" } }, deps({ allow: async () => false }))).status).toBe(429);
    expect((await handleAiWrite({ task: "deleteEverything" }, deps())).status).toBe(400);
    expect((await handleAiWrite({ task: "bookSeo", input: {} }, deps())).body.error).toMatch(/title first/);
  });

  it("returns a suggestion for a book", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(answer({ metaTitle: "Salt by Ana — Lyricalmyrical", metaDescription: "A risograph-printed book of sea poems." }));
    const out = await handleAiWrite({ task: "bookSeo", input: { title: "Salt", author: "Ana" }, siteName: "Lyricalmyrical" }, deps({ fetchImpl }));
    expect(out).toEqual({ status: 200, body: { ok: true, result: { metaTitle: "Salt by Ana — Lyricalmyrical", metaDescription: "A risograph-printed book of sea poems.", model: "gemini-2.5-flash", provider: "gemini" } } });
  });

  it("describes a book photo from the shop's own Storage bucket only", async () => {
    const BUCKET = "shop.firebasestorage.app";
    const own = "https://firebasestorage.googleapis.com/v0/b/shop.firebasestorage.app/o/products%2F1-01-960w.webp?alt=media&token=t";
    expect(photoImageUrl(own, BUCKET)).toBe(own);
    expect(photoImageUrl("https://storage.googleapis.com/shop.firebasestorage.app/products/a.jpg", BUCKET)).toMatch(/^https:/);
    expect(photoImageUrl("https://firebasestorage.googleapis.com/v0/b/other.appspot.com/o/a.jpg", BUCKET)).toBe("");
    expect(photoImageUrl("https://evil.example/v0/b/shop.firebasestorage.app/o/a.jpg", BUCKET)).toBe("");
    expect(photoImageUrl("http://firebasestorage.googleapis.com/v0/b/shop.firebasestorage.app/o/a.jpg", BUCKET)).toBe("");
    expect(photoImageUrl("https://firebasestorage.googleapis.com:8443/v0/b/shop.firebasestorage.app/o/a.jpg", BUCKET)).toBe("");

    const refused = await handleAiWrite({ task: "photoAlt", input: { title: "Salt", imageUrl: "https://evil.example/a.jpg" } }, deps({ bucket: BUCKET }));
    expect(refused.status).toBe(400);

    const image = { ok: true, status: 200, headers: { get: h => (h === "content-type" ? "image/webp" : "4") }, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer };
    const fetchImpl = vi.fn().mockResolvedValueOnce(image).mockResolvedValueOnce(answer({ alt: "Salt by Ana, open on a spread of grey sea photographs" }));
    const out = await handleAiWrite({ task: "photoAlt", input: { title: "Salt", author: "Ana", imageUrl: own, photoNumber: 2 } }, deps({ fetchImpl, bucket: BUCKET }));
    expect(out.body.result.alt).toBe("Salt by Ana, open on a spread of grey sea photographs");
    expect(fetchImpl.mock.calls[0][0]).toBe(own);
    const sent = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(sent.contents[0].parts[0].inlineData).toEqual({ mimeType: "image/webp", data: Buffer.from([1, 2, 3, 4]).toString("base64") });
    expect(sent.contents[0].parts[1].text).toMatch(/photo 2 of the book/);

    const notImage = { ...image, headers: { get: () => "text/html" } };
    const bad = await handleAiWrite({ task: "photoAlt", input: { title: "Salt", imageUrl: own } }, deps({ fetchImpl: vi.fn().mockResolvedValue(notImage), bucket: BUCKET }));
    expect(bad.status).toBe(502);
  });

  it("Check key reports Google's refusal in plain English", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(400, { error: { status: "INVALID_ARGUMENT", message: "API key not valid. Please pass a valid API key." } }));
    const out = await handleAiWrite({ op: "check" }, deps({ fetchImpl }));
    expect(out.status).toBe(200);
    expect(out.body.ok).toBe(false);
    expect(out.body.error).toMatch(/isn't valid/);
  });
});

describe("AI writing assistant: OpenRouter takes over when Google runs out", () => {
  const ROUTER = "sk-or-v1-" + "a".repeat(40);
  const quota = () => reply(429, { error: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } });
  const routerAnswer = obj => reply(200, { choices: [{ message: { content: JSON.stringify(obj) }, finish_reason: "stop" }] });
  const both = { apiKey: KEY, openrouterKey: ROUTER, provider: "gemini", voice: "" };

  it("counts used-up, busy and slow answers, not refusals", () => {
    expect([429, 402, 503, 504].every(status => worthBackup({ status }))).toBe(true);
    expect([400, 401, 403, 404].some(status => worthBackup({ status }))).toBe(false);
  });

  it("writes with OpenRouter when every Gemini model is used up", async () => {
    resetProviderRest();
    const fetchImpl = vi.fn().mockResolvedValueOnce(quota()).mockResolvedValueOnce(quota()).mockResolvedValueOnce(quota())
      .mockResolvedValueOnce(routerAnswer({ seoTitle: "About", metaDescription: "Who we are." }));
    const out = await handleAiWrite({ task: "pageSeo", input: { title: "About" } }, deps({ fetchImpl, readSettings: async () => both }));
    expect(out.status).toBe(200);
    expect(out.body.result).toMatchObject({ seoTitle: "About", provider: "openrouter", fellBack: true });
    expect(fetchImpl.mock.calls[3][0]).toBe("https://openrouter.ai/api/v1/chat/completions");
  });

  it("goes straight to OpenRouter for a minute after Google ran out, then tries Google again", async () => {
    resetProviderRest();
    let t = 1000;
    const now = () => t;
    const settings = async () => both;
    const first = vi.fn().mockResolvedValueOnce(quota()).mockResolvedValueOnce(quota()).mockResolvedValueOnce(quota())
      .mockResolvedValueOnce(routerAnswer({ seoTitle: "A", metaDescription: "B." }));
    await handleAiWrite({ task: "pageSeo", input: { title: "About" } }, deps({ fetchImpl: first, readSettings: settings, now }));

    t += 30 * 1000;
    const second = vi.fn().mockResolvedValue(routerAnswer({ seoTitle: "A", metaDescription: "B." }));
    expect((await handleAiWrite({ task: "pageSeo", input: { title: "About" } }, deps({ fetchImpl: second, readSettings: settings, now }))).body.result.provider).toBe("openrouter");
    expect(second).toHaveBeenCalledTimes(1);

    t += 60 * 1000;
    const third = vi.fn().mockResolvedValue(answer({ seoTitle: "A", metaDescription: "B." }));
    const back = await handleAiWrite({ task: "pageSeo", input: { title: "About" } }, deps({ fetchImpl: third, readSettings: settings, now }));
    expect(back.body.result.provider).toBe("gemini");
    expect(back.body.result.fellBack).toBeUndefined();
  });

  it("keeps Google's reason when no OpenRouter key is saved, and says so when both fail", async () => {
    resetProviderRest();
    const alone = await handleAiWrite({ task: "pageSeo", input: { title: "About" } }, deps({ fetchImpl: vi.fn().mockResolvedValue(quota()) }));
    expect(alone.status).toBe(429);
    expect(alone.body.error).toMatch(/free Google AI allowance/);

    resetProviderRest();
    const fetchImpl = vi.fn().mockResolvedValueOnce(quota()).mockResolvedValueOnce(quota()).mockResolvedValueOnce(quota())
      .mockResolvedValueOnce(reply(402, { error: { message: "Insufficient credits" } }));
    const failed = await handleAiWrite({ task: "pageSeo", input: { title: "About" } }, deps({ fetchImpl, readSettings: async () => both }));
    expect(failed.status).toBe(429);
    expect(failed.body.error).toMatch(/free Google AI allowance.*OpenRouter couldn't take over either: .*out of credits/);
  });

  it("doesn't hand a refused request to the other AI", async () => {
    resetProviderRest();
    const fetchImpl = vi.fn().mockResolvedValue(reply(400, { error: { status: "INVALID_ARGUMENT", message: "API key not valid" } }));
    const out = await handleAiWrite({ task: "pageSeo", input: { title: "About" } }, deps({ fetchImpl, readSettings: async () => both }));
    expect(out.body.error).toMatch(/isn't valid/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
