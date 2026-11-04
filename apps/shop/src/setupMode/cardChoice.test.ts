import { describe, expect, it } from "vitest";
import { CARD_CHOICE_NOTES, CARD_PROVIDER_CHOICES, cardProviderName, chosenCardProvider } from "./cardChoice";
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
    const text = [...CARD_PROVIDER_CHOICES.map((c) => c.line), ...CARD_CHOICE_NOTES].join(" ");
    expect(text).not.toMatch(/\b(key|api|webhook|token|oauth|firebase|server|deploy)\b/i);
  });
});
