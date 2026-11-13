import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SHOP_PROFILE } from "../../lib/shopProfile";

// The admin reads the shop's currency once, when the page opens: each case opens a fresh "page".
const open = async (currency?: string) => {
  vi.resetModules();
  vi.stubGlobal("window", { __SHOP_PROFILE__: { ...DEFAULT_SHOP_PROFILE, ...(currency ? { currency } : {}) } });
  return {
    sign: await import("./moneySign"),
    giftCards: await import("./giftCardsAdmin"),
    discounts: await import("./discountMove"),
  };
};

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe("the admin's money sign", () => {
  it("is CA$ in a shop that sells in Canadian dollars, as before", async () => {
    const { sign, giftCards } = await open();
    expect(sign.MONEY_SIGN).toBe("CA$");
    expect(sign.MONEY_NAME).toBe("Canadian dollars");
    expect(giftCards.formatMinor(1250)).toBe("CA$12.50");
  });

  it("is US$ across the admin in a shop that sells in US dollars", async () => {
    const { sign, giftCards, discounts } = await open("USD");
    expect(sign.MONEY_SIGN).toBe("US$");
    expect(sign.MONEY_NAME).toBe("US dollars");
    expect(giftCards.formatMinor(1250)).toBe("US$12.50");
    expect(discounts.describeMoved({ type: "fixed", value: 5 } as any)).toBe("US$5.00 off");
  });
});
