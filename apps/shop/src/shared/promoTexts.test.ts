// Promo texts (plan 4, 5.6). Run against the shop's copy and the server's.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";
import * as shop from "./promoTexts";

const server = createRequire(import.meta.url)("../../functions/shared/promoTexts.js") as typeof shop;

describe.each([["shop", shop], ["server", server]] as const)("promo texts (%s copy)", (_name, p) => {
  test("the owner's words are trimmed onto one line and kept within limits", () => {
    expect(p.cleanPromo("  Openings\n this   Friday ")).toEqual({ text: "Openings this Friday" });
    expect(p.cleanPromo("Hi")).toHaveProperty("problem");
    expect(p.cleanPromo("x".repeat(p.MAX_PROMO + 1))).toHaveProperty("problem");
  });

  test("the text carries the shop's name first and how to stop last, in English or French", () => {
    expect(p.promoBody("Openings Friday.", "Moth Press")).toBe("Moth Press: Openings Friday. Reply STOP to stop texts.");
    expect(p.promoBody("Places libres.", "Moth", "fr")).toBe("Moth: Places libres. Répondez STOP pour ne plus recevoir de textos.");
    expect(p.promoBody("Openings Friday.", "")).toBe("Openings Friday. Reply STOP to stop texts.");
  });

  test("parts: 160 plain letters in one, 70 with an emoji", () => {
    expect(p.textParts("a".repeat(160))).toBe(1);
    expect(p.textParts("a".repeat(161))).toBe(2);
    expect(p.textParts("🎉" + "a".repeat(69))).toBe(1);
    expect(p.textParts("🎉" + "a".repeat(70))).toBe(2);
  });

  test("daytime only, on the shop's own clock", () => {
    expect(p.promoHours(Date.parse("2026-11-17T14:00:00Z"), "America/Toronto")).toBe(true); // 9 a.m.
    expect(p.promoHours(Date.parse("2026-11-17T13:59:00Z"), "America/Toronto")).toBe(false);
    expect(p.promoHours(Date.parse("2026-11-18T01:00:00Z"), "America/Toronto")).toBe(false); // 8 p.m.
    expect(p.promoHours(Date.parse("2026-11-17T21:00:00Z"), "America/Vancouver")).toBe(true); // 1 p.m.
  });

  test("one phone written two ways is one person; groups fall back to everyone", () => {
    expect(p.phoneKey("+1 (416) 555-0199")).toBe(p.phoneKey("416 555 0199"));
    expect(p.cleanGroup("recent")).toBe("recent");
    expect(p.cleanGroup("nonsense")).toBe("all");
  });
});
