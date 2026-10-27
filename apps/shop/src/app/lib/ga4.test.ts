import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./trackingGuard", () => ({ googleTrackingAllowed: vi.fn(async () => true) }));
import { googleTrackingAllowed } from "./trackingGuard";
import { __resetGa4ForTests, cleanLocation, cleanMeasurementId, configureGa4, ga4Event, ga4FilterUse, ga4Items, ga4PageNotFound, ga4PageView, ga4PdpInteract, ga4ViewCart, isUntrackedPath, pdpTabName, priceFilterValue, purchaseEvent } from "./ga4";

const flush = () => new Promise(r => setTimeout(r, 0));

describe("ga4 helpers", () => {
  it("accepts only GA4 measurement IDs", () => {
    expect(cleanMeasurementId(" g-abc123xyz ")).toBe("G-ABC123XYZ");
    expect(cleanMeasurementId("UA-12345-1")).toBe("");
    expect(cleanMeasurementId("123456789")).toBe("");
  });
  it("never lets emails, tokens, order keys or sign-in codes reach Google", () => {
    expect(cleanLocation("https://shop.test/track?unsubscribe=1&e=a%40b.c&t=sig")).toBe("https://shop.test/track");
    expect(cleanLocation("https://shop.test/track?orderId=LM-1&key=secret#x")).toBe("https://shop.test/track");
    expect(cleanLocation("https://shop.test/account?oobCode=abc&apiKey=k&mode=signIn")).toBe("https://shop.test/account");
    expect(cleanLocation("https://shop.test/checkout?cartId=active_a%40b.c")).toBe("https://shop.test/checkout");
    expect(cleanLocation("https://shop.test/books/salt?utm_source=news&ref=insta&e=x")).toBe("https://shop.test/books/salt?utm_source=news&ref=insta");
    expect(cleanLocation("not a url")).toBe("");
  });
  it("never counts admin pages", () => {
    expect(isUntrackedPath("/admin")).toBe(true);
    expect(isUntrackedPath("/shop/admin/orders")).toBe(true);
    expect(isUntrackedPath("/studio-fixture.html")).toBe(true);
    expect(isUntrackedPath("/books/administration")).toBe(false);
  });
  it("builds a CAD purchase from the stored order, never for test orders", () => {
    const order = { orderId: "LM-1", total: 41.5, tax: 2, shipping: 9, appliedDiscount: { code: "LAUNCH" }, items: [{ id: "b1", title: "Salt", price: 15.25, quantity: 2, variantName: "Signed" }] };
    expect(purchaseEvent("x", order)).toEqual({
      transaction_id: "LM-1", currency: "CAD", value: 41.5, tax: 2, shipping: 9, coupon: "LAUNCH",
      items: [{ item_id: "b1", item_name: "Salt", price: 15.25, quantity: 2, item_variant: "Signed" }],
    });
    expect(purchaseEvent("x", { ...order, isTest: true })).toBeNull();
    expect(purchaseEvent("x", { ...order, sandboxPayment: true })).toBeNull();
    expect(ga4Items([null, { title: "no id" }])).toEqual([]);
  });
  it("names price filters by which boxes are filled, never the amounts", () => {
    expect(priceFilterValue("10", "")).toBe("min");
    expect(priceFilterValue("", " 40 ")).toBe("max");
    expect(priceFilterValue(5, 40)).toBe("both");
    expect(priceFilterValue("", "  ")).toBe("");
    expect(priceFilterValue(undefined, null)).toBe("");
  });
  it("names book page tabs as the reports read them", () => {
    expect(pdpTabName("description")).toBe("description");
    expect(pdpTabName("specs")).toBe("details");
    expect(pdpTabName("reviews")).toBe("reviews");
  });
});

describe("ga4 navigation events", () => {
  beforeEach(() => {
    __resetGa4ForTests();
    const store = new Map<string, string>();
    (globalThis as any).window = {
      location: { pathname: "/books/nope", href: "https://shop.test/books/nope?e=a%40b.c" },
      addEventListener: vi.fn(),
      localStorage: { getItem: () => null },
      sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
    };
    (globalThis as any).document = { head: { appendChild: vi.fn() }, createElement: () => ({}), title: "Shop" };
  });
  const sent = () => ((globalThis as any).window.dataLayer || []).filter((a: any) => a[0] === "event").map((a: any) => [a[1], a[2]]);

  it("sends view_cart with the bag's lines in CAD, and a bare one for an empty bag", async () => {
    configureGa4("G-TEST1234");
    ga4ViewCart([{ id: "b1", title: "Salt", price: 15.25, quantity: 2 }, { id: "b2", title: "Ash", price: 9.5, quantity: 1 }]);
    ga4ViewCart([]);
    await flush();
    const [full, empty] = sent();
    expect(full[0]).toBe("view_cart");
    expect(full[1]).toMatchObject({ currency: "CAD", value: 40, items: [{ item_id: "b1", quantity: 2 }, { item_id: "b2", quantity: 1 }] });
    expect(empty[0]).toBe("view_cart");
    expect(empty[1].items).toBeUndefined();
  });

  it("counts a missing page once per address, and sends filter and book-page actions with fixed names", async () => {
    configureGa4("G-TEST1234");
    ga4PageNotFound();
    ga4PageNotFound();
    ga4FilterUse("category", "  Riso   prints ");
    ga4PdpInteract("tab_open", { tab: "details" });
    await flush();
    const events = sent();
    expect(events.filter((e: any) => e[0] === "page_not_found")).toHaveLength(1);
    expect(events.find((e: any) => e[0] === "filter_use")[1]).toMatchObject({ filter: "category", value: "Riso prints" });
    expect(events.find((e: any) => e[0] === "pdp_interact")[1]).toMatchObject({ action: "tab_open", tab: "details" });
    expect(JSON.stringify(events)).not.toMatch(/a%40b/);
  });
});

describe("ga4 loading", () => {
  beforeEach(() => {
    __resetGa4ForTests();
    (globalThis as any).window = { location: { pathname: "/", href: "https://shop.test/" }, addEventListener: vi.fn(), localStorage: { getItem: () => null } };
    (globalThis as any).document = { head: { appendChild: vi.fn() }, createElement: () => ({}), title: "Shop" };
  });

  it("sends queued events once configured and allowed", async () => {
    ga4Event("page_view", { page_title: "Home" });
    configureGa4("G-TEST1234");
    await flush();
    const w = (globalThis as any).window;
    expect((globalThis as any).document.head.appendChild).toHaveBeenCalledTimes(1);
    expect(w.dataLayer.some((args: any) => args[0] === "event" && args[1] === "page_view")).toBe(true);
  });

  it("sends only the cleaned address, also to Google's own events", async () => {
    (globalThis as any).window.location.href = "https://shop.test/track?unsubscribe=1&e=a%40b.c&t=sig";
    configureGa4("G-TEST1234");
    ga4Event("view_item", { value: 1 });
    await flush();
    const calls = (globalThis as any).window.dataLayer.map((a: any) => [...a]);
    expect(JSON.stringify(calls)).not.toMatch(/a%40b|sig|unsubscribe/);
    expect(calls.find((a: any) => a[0] === "config")[2].page_location).toBe("https://shop.test/track");
    expect(calls.find((a: any) => a[0] === "event")[2].page_location).toBe("https://shop.test/track");
  });

  it("cleans the referrer of the first page, also in the tag's own config", async () => {
    (globalThis as any).document.referrer = "https://shop.test/track?orderId=A1&key=secret";
    configureGa4("G-TEST1234");
    ga4PageView();
    await flush();
    const calls = (globalThis as any).window.dataLayer.map((a: any) => [...a]);
    expect(JSON.stringify(calls)).not.toMatch(/secret|orderId/);
    expect(calls.find((a: any) => a[0] === "config")[2].page_referrer).toBe("https://shop.test/track");
    expect(calls.find((a: any) => a[0] === "event" && a[1] === "page_view")[2].page_referrer).toBe("https://shop.test/track");
  });

  it("names the previous page on in-app moves, cleaned, and nothing on a first page opened directly", async () => {
    const w = (globalThis as any).window;
    configureGa4("G-TEST1234");
    ga4PageView();
    w.location.href = "https://shop.test/books/salt?e=a%40b.c";
    ga4PageView();
    w.location.href = "https://shop.test/books/salt";
    ga4PageView();
    await flush();
    const views = w.dataLayer.filter((a: any) => a[0] === "event" && a[1] === "page_view").map((a: any) => a[2]);
    expect(views[0].page_referrer).toBeUndefined();
    expect(views[1].page_referrer).toBe("https://shop.test/");
    expect(views[1].page_location).toBe("https://shop.test/books/salt");
    // The same page again (a query-only change) names no referrer.
    expect(views[2].page_referrer).toBeUndefined();
  });

  it("keeps waiting events while the settings are still loading", async () => {
    ga4Event("page_view", { page_title: "Landing" });
    configureGa4(undefined);
    configureGa4("G-TEST1234");
    await flush();
    expect((globalThis as any).window.dataLayer.some((a: any) => a[0] === "event" && a[1] === "page_view")).toBe(true);
  });

  it("loads nothing when the visit may not be counted", async () => {
    vi.mocked(googleTrackingAllowed).mockResolvedValueOnce(false);
    configureGa4("G-TEST1234");
    ga4Event("page_view");
    await flush();
    expect((globalThis as any).document.head.appendChild).not.toHaveBeenCalled();
  });

  it("stays off without a valid ID", async () => {
    configureGa4("not-an-id");
    ga4Event("page_view");
    await flush();
    expect((globalThis as any).document.head.appendChild).not.toHaveBeenCalled();
  });
});
