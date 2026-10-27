import { createRequire } from "module";
import { describe, expect, it, vi } from "vitest";

const {
  OPENROUTER_MODELS, openRouterKeyProblem, openRouterModelProblem, toJsonSchema, buildOpenRouterRequest, fromOpenRouter,
  generateOpenRouter, pickProvider, handleAiWrite, TASKS,
} = createRequire(import.meta.url)("./aiWriter");

const OR_KEY = "sk-or-v1-" + "a".repeat(64);
const GEMINI_KEY = "AIza" + "x".repeat(35);
const reply = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const chat = (obj, finish = "stop") => reply(200, { choices: [{ message: { content: typeof obj === "string" ? obj : JSON.stringify(obj) }, finish_reason: finish }] });
const deps = (settings, over = {}) => ({ readSettings: async () => ({ voice: "", ...settings }), allow: async () => true, fetchImpl: vi.fn(), ...over });
const seo = { metaTitle: "Salt by Ana", metaDescription: "A book of poems about the sea, printed by hand." };

describe("AI writing assistant (OpenRouter)", () => {
  it("accepts OpenRouter keys and model names, refuses junk", () => {
    expect(openRouterKeyProblem(OR_KEY)).toBe("");
    expect(openRouterKeyProblem("")).toMatch(/Enter/);
    expect(openRouterKeyProblem(GEMINI_KEY)).toMatch(/sk-or-/);
    expect(openRouterModelProblem("")).toBe("");
    expect(openRouterModelProblem("google/gemini-2.5-flash")).toBe("");
    expect(openRouterModelProblem("meta-llama/llama-3.3-70b-instruct:free")).toBe("");
    expect(openRouterModelProblem("openrouter/auto")).toBe("");
    expect(openRouterModelProblem("gpt 4")).toMatch(/look like/);
    expect(openRouterModelProblem("https://evil/x")).toMatch(/look like/);
  });

  it("turns Gemini's schema into a standard JSON schema", () => {
    expect(toJsonSchema(TASKS.bookSeo.schema)).toEqual({
      type: "object",
      properties: { metaTitle: { type: "string" }, metaDescription: { type: "string" } },
      required: ["metaTitle", "metaDescription"],
      additionalProperties: false,
    });
  });

  it("builds a chat request with the honesty rules, house style, schema and photo", () => {
    const body = buildOpenRouterRequest("photoAlt", { title: "Salt" }, { voice: "British spelling.", image: { mimeType: "image/png", data: "AAAA" } }, "google/gemini-2.5-flash");
    expect(body.model).toBe("google/gemini-2.5-flash");
    expect(body.messages[0].content).toMatch(/Never invent/);
    expect(body.messages[0].content).toContain("British spelling.");
    expect(body.messages[0].content).toContain('"alt"');
    expect(body.messages[1].content[1]).toEqual({ type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } });
    expect(body.response_format.type).toBe("json_schema");
    expect(buildOpenRouterRequest("bookSeo", { title: "Salt" }, {}, "x/y", { structured: false }).response_format).toBeUndefined();
  });

  it("reads answers with fences or a stray line around the JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(chat("Here you go:\n```json\n" + JSON.stringify(seo) + "\n```"));
    const out = await generateOpenRouter({ apiKey: OR_KEY, task: "bookSeo", input: { title: "Salt" }, fetchImpl });
    expect(out).toMatchObject({ ...seo, model: OPENROUTER_MODELS[0] });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.headers.Authorization).toBe(`Bearer ${OR_KEY}`);
    expect(fromOpenRouter({ choices: [{ message: { content: "x" }, finish_reason: "length" }] }).candidates[0].finishReason).toBe("MAX_TOKENS");
  });

  it("uses the owner's model and never swaps it for another", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(404, { error: { code: 404, message: "No endpoints found for x/gone." } }));
    await expect(generateOpenRouter({ apiKey: OR_KEY, model: "x/gone", task: "bookSeo", input: { title: "Salt" }, fetchImpl })).rejects.toThrow(/doesn't offer the model x\/gone/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("moves to the next default model when one is retired", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply(404, { error: { code: 404, message: "No endpoints found." } }))
      .mockResolvedValueOnce(chat(seo));
    const out = await generateOpenRouter({ apiKey: OR_KEY, task: "bookSeo", input: { title: "Salt" }, fetchImpl });
    expect(out.model).toBe(OPENROUTER_MODELS[1]);
  });

  it("retries without structured output when a model refuses it", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply(400, { error: { code: 400, message: "response_format json_schema is not supported" } }))
      .mockResolvedValueOnce(chat(seo));
    await generateOpenRouter({ apiKey: OR_KEY, model: "x/y", task: "bookSeo", input: { title: "Salt" }, fetchImpl });
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).response_format).toBeUndefined();
  });

  it("explains refusals in plain words", async () => {
    const run = res => generateOpenRouter({ apiKey: OR_KEY, model: "x/y", task: "bookSeo", input: { title: "Salt" }, fetchImpl: vi.fn().mockResolvedValue(res) });
    await expect(run(reply(401, { error: { code: 401, message: "No auth" } }))).rejects.toThrow(/isn't valid/);
    await expect(run(reply(402, { error: { code: 402, message: "Insufficient credits" } }))).rejects.toThrow(/out of credits/);
    const limited = await run(reply(429, { error: { code: 429, message: "Rate limited" } })).catch(e => e);
    expect(limited.status).toBe(429);
    await expect(run(reply(200, { error: { code: 502, message: "Provider down" } }))).rejects.toThrow(/busy/);
    await expect(run(chat("not json at all"))).rejects.toThrow(/couldn't be read/);
  });

  it("picks the owner's choice, else OpenRouter, else Gemini", () => {
    expect(pickProvider({ apiKey: GEMINI_KEY })?.name).toBe("gemini");
    expect(pickProvider({ apiKey: GEMINI_KEY, openrouterKey: OR_KEY })?.name).toBe("openrouter");
    expect(pickProvider({ apiKey: GEMINI_KEY, openrouterKey: OR_KEY, provider: "gemini" })?.name).toBe("gemini");
    expect(pickProvider({ apiKey: GEMINI_KEY, provider: "openrouter" })?.name).toBe("gemini");
    expect(pickProvider({ openrouterKey: OR_KEY, openrouterModel: "bad model" })).toMatchObject({ name: "openrouter", model: "" });
    expect(pickProvider({ openrouterKey: "junk" })).toBeNull();
  });

  it("writes through OpenRouter when only its key is saved", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(chat(seo));
    const out = await handleAiWrite({ task: "bookSeo", input: { title: "Salt" } }, deps({ openrouterKey: OR_KEY, openrouterModel: "openai/gpt-4o-mini" }, { fetchImpl }));
    expect(out.status).toBe(200);
    expect(out.body.result).toMatchObject({ ...seo, model: "openai/gpt-4o-mini" });
    expect(fetchImpl.mock.calls[0][0]).toMatch(/openrouter\.ai/);
  });

  it("asks for a key when none is saved", async () => {
    const out = await handleAiWrite({ task: "bookSeo", input: { title: "Salt" } }, deps({}));
    expect(out.status).toBe(412);
    expect(out.body).toMatchObject({ needsKey: true });
    expect(out.body.error).toMatch(/OpenRouter/);
  });

  it("checks the key it was asked about", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(chat({ seoTitle: "About the press", metaDescription: "We publish poetry." }));
    const both = { apiKey: GEMINI_KEY, openrouterKey: OR_KEY };
    const out = await handleAiWrite({ op: "check", provider: "openrouter" }, deps(both, { fetchImpl }));
    expect(out.body).toMatchObject({ ok: true, provider: "openrouter", model: OPENROUTER_MODELS[0] });
    const missing = await handleAiWrite({ op: "check", provider: "openrouter" }, deps({ apiKey: GEMINI_KEY }));
    expect(missing.status).toBe(412);
  });
});
