import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SHOP_PROFILE } from "../../../lib/shopProfile";

// The stockroom's ledger counts in the shop's own currency. Each case opens a fresh "page", as the admin reads the
// currency once when it opens.
const open = async (currency?: string) => {
  vi.resetModules();
  vi.stubGlobal("window", { __SHOP_PROFILE__: { ...DEFAULT_SHOP_PROFILE, ...(currency ? { currency } : {}) } });
  return { rates: await import("./taxRates"), expense: await import("./taxExpense") };
};
const feed = (rates: Record<string, number>) => {
  const asked: string[] = [];
  const get = (async (url: string) => { asked.push(String(url)); return { ok: true, json: async () => ({ rates }) }; }) as any;
  return { asked, get };
};

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe("the stockroom's home currency", () => {
  it("is Canadian dollars in a shop that sells in them, as before", async () => {
    const { rates, expense } = await open();
    const { asked, get } = feed({ USD: 0.5, CAD: 1 });
    const saved = await rates.fetchDailyRates(get);
    expect(asked).toEqual(["https://open.er-api.com/v6/latest/CAD"]);
    expect(saved).toMatchObject({ USD_CAD: 2, CAD_CAD: 1 });
    expect(expense.baseCurrencyOf(null)).toBe("CAD");
  });

  it("is US dollars in a shop that sells in them: rates are asked from and kept against the US dollar", async () => {
    const { rates, expense } = await open("USD");
    const { asked, get } = feed({ CAD: 1.25, USD: 1 });
    const saved = await rates.fetchDailyRates(get);
    expect(asked).toEqual(["https://open.er-api.com/v6/latest/USD"]);
    expect(saved).toMatchObject({ CAD_USD: 0.8, USD_USD: 1 });
    expect(saved).not.toHaveProperty("USD_CAD");
    expect(expense.baseCurrencyOf(null)).toBe("USD");
  });
});
