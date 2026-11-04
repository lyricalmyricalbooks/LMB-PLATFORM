import { describe, expect, it } from "vitest";
import { CARD_CHOICE_NOTE, CARD_PROVIDER_CHOICES, SQUARE_COUNTRIES, cardProviderName, chosenCardProvider, squareAvailable } from "./cardChoice";
import { readFileSync } from "node:fs";
import { guideSteps, PAYMENTS_PAGE, setupLocked } from "./pages";
import type { SetupPress } from "./door";

const press = (over: Partial<SetupPress> = {}): SetupPress => ({
  pressId: "press-moth", status: "setup", plan: "shop", pressName: "Moth Press", sells: "zines", country: "CA", look: "", adminLook: "", stagedImport: null, ...over,
});

describe("Stripe or Square in setup", () => {
  it("offers exactly Stripe and Square, and a press that picks nothing starts on Stripe", () => {
    expect(CARD_PROVIDER_CHOICES.map((c) => c.id)).toEqual(["stripe", "square"]);
    expect(chosenCardProvider({ cardProvider: "" })).toBe("stripe");
    expect(chosenCardProvider({})).toBe("stripe");
    expect(chosenCardProvider({ cardProvider: "square" })).toBe("square");
    expect(cardProviderName("square")).toBe("Square");
  });

  it("Settings › Payments works in setup, and the guide has an optional step for it on a website plan only", () => {
    expect(setupLocked(PAYMENTS_PAGE)).toBe(false);
    const step = guideSteps(press()).find((s) => s.id === "cards")!;
    expect([step.done, step.optional, step.page]).toEqual([false, true, PAYMENTS_PAGE]);
    expect(guideSteps(press({ cardProvider: "square" })).find((s) => s.id === "cards")!.done).toBe(true);
    expect(guideSteps(press({ plan: "stockroom" })).map((s) => s.id)).not.toContain("cards");
  });

  it("speaks plainly: no keys, accounts set up here, or technical words", () => {
    const text = [...CARD_PROVIDER_CHOICES.map((c) => c.line), CARD_CHOICE_NOTE].join(" ");
    expect(text).not.toMatch(/\b(key|api|webhook|token|oauth|firebase|server|deploy)\b/i);
    // Short: one line per choice (owner's note, 4 Nov 2026: no extra description text).
    for (const line of [...CARD_PROVIDER_CHOICES.map((c) => c.line), CARD_CHOICE_NOTE]) expect(line.split(/\s+/).length).toBeLessThanOrEqual(12);
  });

  it("offers Square only where the platform does, with the same list", () => {
    const platform = readFileSync(new URL("../../../../signup/form.js", import.meta.url), "utf8");
    const list = /SQUARE_COUNTRIES = Object\.freeze\((\[[^\]]*\])\)/.exec(platform)?.[1];
    expect(JSON.parse(list ?? "null")).toEqual([...SQUARE_COUNTRIES]);
    expect(squareAvailable("CA")).toBe(true);
    expect(squareAvailable("GB")).toBe(false);
    expect(squareAvailable("")).toBe(true);
  });
});
