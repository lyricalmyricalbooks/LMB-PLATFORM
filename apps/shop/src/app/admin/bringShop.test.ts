import { describe, expect, it } from "vitest";
import { BRING_ANSWERS, bringAnswerOf, bringHelp, bringMarker, type BringAnswer } from "./bringShop";

// Words a press reads on this step never name another shop system (the platform's customer-facing rule).
const RIVALS = /big cartel|shopify|squarespace|wix|etsy|woocommerce|bigcommerce|ecwid|gumroad/i;

describe("bring your shop with you: the question and the plain steps (plan 17.3, 17.4)", () => {
  it("offers the six answers in order, with unique ids", () => {
    expect(BRING_ANSWERS.map(a => a.id)).toEqual(["online", "marketplace", "fairs", "bookshops", "spreadsheet", "nowhere"]);
    expect(new Set(BRING_ANSWERS.map(a => a.id)).size).toBe(BRING_ANSWERS.length);
  });

  it("every answer has its own steps, each a full sentence, ending with the preview note", () => {
    for (const { id } of BRING_ANSWERS) {
      const steps = bringHelp(id);
      expect(steps.length, id).toBeGreaterThanOrEqual(3);
      for (const step of steps) expect(step.endsWith(".") || step.endsWith("."), `${id}: ${step}`).toBe(true);
      expect(steps.at(-1)).toContain("Nothing is saved until you press Import");
    }
  });

  it("no step names another shop system", () => {
    for (const { id, label } of BRING_ANSWERS) {
      expect(RIVALS.test(label), label).toBe(false);
      for (const step of bringHelp(id)) expect(RIVALS.test(step), step).toBe(false);
    }
  });

  it("accepts only the six answers from the marker or the form", () => {
    expect(bringAnswerOf("fairs")).toBe("fairs");
    expect(bringAnswerOf("shopify")).toBeUndefined();
    expect(bringAnswerOf(undefined)).toBeUndefined();
    expect(bringAnswerOf("")).toBeUndefined();
  });

  it("records the answer only when there is one, and skipped only when the press starts fresh", () => {
    expect(bringMarker("then", "online" as BringAnswer, false)).toEqual({ at: "then", from: "online" });
    expect(bringMarker("then", "", true)).toEqual({ at: "then", skipped: true });
    expect(bringMarker("then", "", false)).toEqual({ at: "then" });
  });
});
