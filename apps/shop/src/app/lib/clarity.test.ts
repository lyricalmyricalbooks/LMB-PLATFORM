import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./trackingGuard", () => ({ googleTrackingAllowed: vi.fn(async () => true) }));
import { googleTrackingAllowed } from "./trackingGuard";
import { __resetClarityForTests, clarityAllowedPath, clarityRoute, clarityUrls, cleanClarityId, configureClarity } from "./clarity";
import { CONSENT_EVENT, CONSENT_KEY } from "./consent";

const flush = () => new Promise(r => setTimeout(r, 0));

describe("clarity helpers", () => {
  it("accepts Clarity project IDs and pasted project links", () => {
    expect(cleanClarityId(" AbC12dEf34 ")).toBe("abc12def34");
    expect(cleanClarityId("https://clarity.microsoft.com/projects/view/abc12def34/dashboard?date=3")).toBe("abc12def34");
    expect(cleanClarityId("G-ABC123")).toBe("");
    expect(cleanClarityId("abc")).toBe("");
    expect(cleanClarityId("<script>")).toBe("");
    expect(cleanClarityId(undefined)).toBe("");
  });
  it("never records pages with personal details", () => {
    for (const p of ["/admin", "/admin/orders", "/studio-fixture.html", "/checkout", "/checkout?order_id=1", "/account", "/account/orders", "/track"]) {
      expect(clarityAllowedPath(p.split("?")[0]), p).toBe(false);
    }
    for (const p of ["/", "/books/salt", "/books/track-and-field", "/collections/account-books", "/page/about", "/wishlist", "/cart"]) {
      expect(clarityAllowedPath(p), p).toBe(true);
    }
  });
  it("understands a site sub-path", () => {
    expect(clarityAllowedPath("/shop/checkout", "/shop")).toBe(false);
    expect(clarityAllowedPath("/shop/books/salt", "/shop")).toBe(true);
    expect(clarityAllowedPath("/shop", "/shop")).toBe(true);
  });
  it("links to the project's dashboard, heatmaps and recordings", () => {
    expect(clarityUrls("abc12def34")).toEqual({
      dashboard: "https://clarity.microsoft.com/projects/view/abc12def34/dashboard",
      heatmaps: "https://clarity.microsoft.com/projects/view/abc12def34/heatmaps",
      recordings: "https://clarity.microsoft.com/projects/view/abc12def34/impressions",
    });
  });
});

describe("clarity loading", () => {
  let listeners: Record<string, Array<() => void>>;
  let store: Record<string, string>;
  const calls = () => ((globalThis as any).window.clarity?.q || []).map((a: IArguments) => Array.from(a));

  beforeEach(() => {
    __resetClarityForTests();
    vi.mocked(googleTrackingAllowed).mockClear();
    listeners = {};
    store = {};
    (globalThis as any).window = {
      location: { pathname: "/", href: "https://shop.test/" },
      addEventListener: (name: string, fn: () => void) => { (listeners[name] ||= []).push(fn); },
      localStorage: { getItem: (k: string) => store[k] ?? null },
    };
    (globalThis as any).document = { head: { appendChild: vi.fn() }, createElement: () => ({}) };
  });

  const scripts = () => vi.mocked((globalThis as any).document.head.appendChild).mock.calls.map((c: any[]) => c[0].src);

  it("loads Clarity's tag once the ID is set and the visit may be counted", async () => {
    configureClarity("abc12def34");
    await flush();
    expect(scripts()).toEqual(["https://www.clarity.ms/tag/abc12def34"]);
    // Never shares with Microsoft Ads; no analytics grant unless the shopper accepted.
    expect(calls()).toEqual([["consentv2", { ad_Storage: "denied" }]]);
    configureClarity("zzz99yyy88");
    clarityRoute();
    await flush();
    expect(scripts()).toHaveLength(1);
  });

  it("tells Clarity analytics storage is granted only after an explicit yes", async () => {
    store[CONSENT_KEY] = JSON.stringify({ analytics: true, marketing: false });
    configureClarity("abc12def34");
    await flush();
    expect(calls()[0]).toEqual(["consentv2", { ad_Storage: "denied", analytics_Storage: "granted" }]);
  });

  it("stays off without a valid ID, when tracking isn't allowed, or after a decline", async () => {
    configureClarity("");
    configureClarity("not an id!");
    await flush();
    expect(scripts()).toEqual([]);

    vi.mocked(googleTrackingAllowed).mockResolvedValueOnce(false);
    configureClarity("abc12def34");
    await flush();
    expect(scripts()).toEqual([]);

    __resetClarityForTests();
    store[CONSENT_KEY] = JSON.stringify({ analytics: false });
    configureClarity("abc12def34");
    await flush();
    expect(scripts()).toEqual([]);
  });

  it("never starts on checkout, account, tracking or admin pages", async () => {
    (globalThis as any).window.location.pathname = "/checkout";
    configureClarity("abc12def34");
    await flush();
    expect(scripts()).toEqual([]);
    expect(googleTrackingAllowed).not.toHaveBeenCalled();
    (globalThis as any).window.location.pathname = "/books/salt";
    clarityRoute();
    await flush();
    expect(scripts()).toHaveLength(1);
  });

  it("stops on private pages and starts again on public ones", async () => {
    configureClarity("abc12def34");
    await flush();
    (globalThis as any).window.location.pathname = "/account/orders";
    clarityRoute();
    (globalThis as any).window.location.pathname = "/track";
    clarityRoute();
    await flush();
    expect(calls().filter((c: any[]) => c[0] === "stop")).toHaveLength(1);
    (globalThis as any).window.location.pathname = "/books/salt";
    clarityRoute();
    await flush();
    expect(calls().map((c: any[]) => c[0])).toEqual(["consentv2", "stop", "start"]);
  });

  it("stops when the shopper declines analytics later", async () => {
    configureClarity("abc12def34");
    await flush();
    store[CONSENT_KEY] = JSON.stringify({ analytics: false });
    listeners[CONSENT_EVENT].forEach(fn => fn());
    await flush();
    expect(calls().slice(1)).toEqual([["consentv2", { ad_Storage: "denied", analytics_Storage: "denied" }], ["stop"]]);
  });

  it("does not start when the shopper moves to checkout while the check runs", async () => {
    let release: (v: boolean) => void = () => {};
    vi.mocked(googleTrackingAllowed).mockReturnValueOnce(new Promise<boolean>(r => { release = r; }));
    configureClarity("abc12def34");
    (globalThis as any).window.location.pathname = "/checkout";
    release(true);
    await flush();
    expect(scripts()).toEqual([]);
  });
});
