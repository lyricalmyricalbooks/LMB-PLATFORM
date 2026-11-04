import { describe, expect, it } from "vitest";
import { SHARE_TARGETS, shareHref, sharedUrl } from "./shareLinks";
import { COPY_SCHEMA } from "./storeCopy";
import { FRENCH_COPY } from "./frenchCopy";

const PAGE = "https://moth-press.web.app/books/night-moths?utm_source=newsletter#reviews";

describe("share links on product pages (plan 27.7)", () => {
  it("marks the shared address with where it went, dropping older marks and the fragment", () => {
    expect(sharedUrl(PAGE, "facebook")).toBe("https://moth-press.web.app/books/night-moths?utm_source=facebook&utm_medium=share");
    expect(sharedUrl("not a url", "x")).toBe("not a url");
  });
  it("opens each site's own share page with the product", () => {
    const p = { url: PAGE, title: "Night Moths", image: "https://img.example/a.jpg" };
    expect(shareHref("facebook", p)).toBe(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(sharedUrl(PAGE, "facebook"))}`);
    expect(shareHref("pinterest", p)).toContain(`&media=${encodeURIComponent(p.image)}&description=Night%20Moths`);
    expect(shareHref("pinterest", { ...p, image: "data:image/svg+xml,x" })).not.toContain("media=");
    expect(shareHref("x", p)).toMatch(/^https:\/\/x\.com\/intent\/tweet\?url=.+&text=Night%20Moths$/);
    expect(decodeURIComponent(shareHref("whatsapp", p))).toBe(`https://wa.me/?text=Night Moths ${sharedUrl(PAGE, "whatsapp")}`);
    expect(shareHref("email", p)).toMatch(/^mailto:\?subject=Night%20Moths&body=/);
  });
  it("has each site's word in Text & labels, in English and French", () => {
    const keys = new Set(COPY_SCHEMA.flatMap((g) => g.fields.map((f) => f.key)));
    for (const { copyKey } of SHARE_TARGETS) {
      expect(keys.has(copyKey), copyKey).toBe(true);
      expect((FRENCH_COPY as any)[copyKey], copyKey).toBeTruthy();
    }
    expect(keys.has("bookShareCopyLink")).toBe(true);
    expect((FRENCH_COPY as any).bookShareCopyLink).toBeTruthy();
  });
});
