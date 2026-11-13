// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./afterPageLoad", () => ({ afterPageLoad: (fn: () => void) => fn() }));
vi.mock("../../lib/authSession", () => ({ restoredUser: vi.fn(async () => null) }));
vi.mock("./ownerDevice", () => ({ isOwnerDevice: vi.fn(() => false), isShopOwner: vi.fn(() => false), looksAutomated: vi.fn(() => false) }));
vi.mock("../features/site/themePreview", () => ({ inThemePreview: () => false }));
import { isOwnerDevice } from "./ownerDevice";
import { __resetAdPixelsForTests, adIdsOf, adPixelsPurchase, adPixelsRoute, adsAllowedPath, cleanMetaPixelId, cleanPinterestTagId, cleanTiktokPixelId, configureAdPixels } from "./adPixels";
import { CONSENT_EVENT, CONSENT_KEY } from "./consent";

const flush = () => new Promise(r => setTimeout(r, 0));
const IDS = { analytics: { metaPixelId: "1234567890123456", pinterestTagId: "2612345678901", tiktokPixelId: "c4abcd1234efgh5678ij" } };
const scripts = () => Array.from(document.head.querySelectorAll("script")).map(s => s.getAttribute("src"));
const say = (marketing: boolean) => {
  localStorage.setItem(CONSENT_KEY, JSON.stringify({ necessary: true, analytics: true, marketing }));
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT));
};

describe("ad tracking codes", () => {
  it("accepts only real-looking IDs", () => {
    expect(cleanMetaPixelId(" 1234567890123456 ")).toBe("1234567890123456");
    expect(cleanMetaPixelId("<script>")).toBe("");
    expect(cleanPinterestTagId("2612345678901")).toBe("2612345678901");
    expect(cleanPinterestTagId("abc")).toBe("");
    expect(cleanTiktokPixelId("c4abcd1234efgh5678ij")).toBe("C4ABCD1234EFGH5678IJ");
    expect(cleanTiktokPixelId("C4AB-12")).toBe("");
    expect(adIdsOf(null)).toEqual({ meta: "", pinterest: "", tiktok: "" });
  });

  it("never sends page views from the admin or pages with a shopper's own details", () => {
    for (const p of ["/admin", "/admin/orders", "/account", "/account/orders", "/track", "/studio-fixture.html"]) expect(adsAllowedPath(p), p).toBe(false);
    for (const p of ["/", "/books/salt", "/checkout", "/collections/new"]) expect(adsAllowedPath(p), p).toBe(true);
  });

  describe("loading", () => {
    beforeEach(() => {
      __resetAdPixelsForTests();
      document.head.innerHTML = "";
      localStorage.clear();
      for (const k of ["fbq", "_fbq", "pintrk", "ttq", "TiktokAnalyticsObject"]) delete (window as any)[k];
      vi.mocked(isOwnerDevice).mockReturnValue(false);
      window.history.replaceState(null, "", "/");
    });

    it("loads nothing before the shopper says yes to marketing, then everything", async () => {
      localStorage.setItem(CONSENT_KEY, JSON.stringify({ necessary: true, analytics: true, marketing: false }));
      configureAdPixels(IDS);
      await flush();
      expect(scripts()).toEqual([]);
      expect((window as any).fbq).toBeUndefined();

      say(true);
      await flush();
      expect(scripts()).toEqual([
        "https://connect.facebook.net/en_US/fbevents.js",
        "https://s.pinimg.com/ct/core.js",
        "https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=C4ABCD1234EFGH5678IJ&lib=ttq",
      ]);
      expect((window as any).fbq.queue).toEqual([["consent", "grant"], ["init", "1234567890123456"], ["track", "PageView"]]);
      expect((window as any).pintrk.queue).toEqual([["load", "2612345678901"], ["page"]]);
      expect((window as any).ttq).toContainEqual(["page"]);
    });

    it("stops sending after the shopper changes their mind", async () => {
      localStorage.setItem(CONSENT_KEY, JSON.stringify({ marketing: true }));
      configureAdPixels(IDS);
      await flush();
      say(false);
      await flush();
      expect((window as any).fbq.queue).toContainEqual(["consent", "revoke"]);
      const before = (window as any).pintrk.queue.length;
      window.history.replaceState(null, "", "/books/salt");
      await adPixelsRoute();
      await adPixelsPurchase("o1", 25, "CAD");
      expect((window as any).pintrk.queue.length).toBe(before);
    });

    it("never runs in the owner's own browser", async () => {
      vi.mocked(isOwnerDevice).mockReturnValue(true);
      localStorage.setItem(CONSENT_KEY, JSON.stringify({ marketing: true }));
      configureAdPixels(IDS);
      await flush();
      expect(scripts()).toEqual([]);
    });

    it("sends one page view per page and a purchase with only the amount", async () => {
      localStorage.setItem(CONSENT_KEY, JSON.stringify({ marketing: true }));
      configureAdPixels({ analytics: { metaPixelId: "1234567890123456" } });
      await flush();
      await adPixelsRoute();
      const fbq = (window as any).fbq.queue;
      expect(fbq.filter((c: unknown[]) => c[1] === "PageView")).toHaveLength(1);
      window.history.replaceState(null, "", "/account");
      await adPixelsRoute();
      expect(fbq.filter((c: unknown[]) => c[1] === "PageView")).toHaveLength(1);
      await adPixelsPurchase("o9", 42.5, "CAD");
      expect(fbq).toContainEqual(["track", "Purchase", { value: 42.5, currency: "CAD" }, { eventID: "o9" }]);
    });
  });
});
