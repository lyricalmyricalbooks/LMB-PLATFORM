import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { checkSocialLinks, handleSocialCheck, verdict } = require("./socialCheck");
const { socialEmailSection } = require("./emailSocial");

describe("social link check", () => {
  it("calls only a clear 404 or 410 missing", () => {
    expect(verdict(404)).toBe("missing");
    expect(verdict(410)).toBe("missing");
    expect(verdict(200)).toBe("ok");
    expect(verdict(403)).toBe("unknown");
    expect(verdict(429)).toBe("unknown");
  });
  it("checks each saved account's tidy address and ignores unknown networks", async () => {
    const asked = [];
    const status = async (url) => { asked.push(url); if (url.includes("gone")) return 404; if (url.includes("slow")) throw new Error("timeout"); return 200; };
    const out = await checkSocialLinks({ instagram: "@shop", tiktok: "@gone", youtube: "@slow", evil: "https://x.example", facebook: "https://evil.example/x" }, { status });
    expect(out).toEqual({ instagram: "ok", tiktok: "missing", youtube: "unknown", facebook: "unknown" });
    expect(asked).toEqual(expect.arrayContaining(["https://www.instagram.com/shop/", "https://www.tiktok.com/@gone"]));
    expect(asked.some((u) => u.includes("evil"))).toBe(false);
  });
  it("respects the rate limit", async () => {
    const r = await handleSocialCheck({ links: {} }, { allow: async () => false });
    expect(r.status).toBe(429);
  });
});

describe("social links in order emails", () => {
  it("lists filled accounts in the owner's order, escaped, in the email's language", () => {
    const html = socialEmailSection({ social: { instagram: "@a", youtube: "@b" }, socialOrder: ["youtube"] }, (t) => (t === "Follow us" ? "Suivez-nous" : t));
    expect(html).toContain("Suivez-nous");
    expect(html.indexOf("YouTube")).toBeLessThan(html.indexOf("Instagram"));
    expect(socialEmailSection({})).toBe("");
  });
});
