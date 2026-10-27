import { createRequire } from "module";
import { describe, expect, it } from "vitest";
import { DEFAULT_OPENROUTER_MODEL, aiKeyProblem, openRouterKeyProblem, openRouterModelProblem } from "./aiWriter";

const server = createRequire(import.meta.url)("../../../functions/aiWriter.js");

// The Settings card checks keys before saving; the server checks them again before use. Same answers.
describe("AI key rules match the server", () => {
  const keys = ["AIza" + "x".repeat(35), "sk-or-v1-" + "a".repeat(64), "sk-or-short", "not a key", "sk-proj-" + "b".repeat(40)];
  const models = ["google/gemini-2.5-flash", "meta-llama/llama-3.3-70b-instruct:free", "openrouter/auto", "gpt 4", "x", "https://evil/x", "a/" + "b".repeat(130)];

  it("agrees on Google and OpenRouter keys", () => {
    for (const k of keys) {
      expect(aiKeyProblem(k) === "").toBe(server.aiKeyProblem(k) === "");
      if (k.startsWith("sk-or-")) expect(aiKeyProblem(k)).toBe(server.aiKeyProblem(k));
      expect(openRouterKeyProblem(k)).toBe(server.openRouterKeyProblem(k));
    }
  });

  it("agrees on model names and the default model", () => {
    for (const m of models) expect(openRouterModelProblem(m)).toBe(server.openRouterModelProblem(m));
    expect(DEFAULT_OPENROUTER_MODEL).toBe(server.OPENROUTER_MODELS[0]);
  });
});
