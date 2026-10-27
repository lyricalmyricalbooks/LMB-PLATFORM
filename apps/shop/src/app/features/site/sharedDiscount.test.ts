import { describe, expect, it } from "vitest";
import { captureSharedDiscount, clearSharedDiscount, discountShareLink, rememberDiscountCode, sharedDiscount } from "./sharedDiscount";

function fakeWindow(href: string) {
  const store = new Map<string, string>();
  const sessionStorage: any = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
  const win: any = { location: { href }, sessionStorage, history: { state: null, replaceState: (_s: any, _t: string, url: string) => { win.location.href = `https://x.test${url}`; } } };
  return win;
}

describe("shared discount links", () => {
  it("remembers the code and strips it from the address", () => {
    const win = fakeWindow("https://x.test/LyricalmyricalWebsiteTrial/books/odes?discount=save10&ref=ig#reviews");
    expect(captureSharedDiscount(win)).toBe("SAVE10");
    expect(win.location.href).toBe("https://x.test/LyricalmyricalWebsiteTrial/books/odes?ref=ig#reviews");
    expect(sharedDiscount(win.sessionStorage)).toBe("SAVE10");
    clearSharedDiscount(win.sessionStorage);
    expect(sharedDiscount(win.sessionStorage)).toBe("");
  });
  it("ignores junk and survives blocked storage", () => {
    expect(captureSharedDiscount(fakeWindow("https://x.test/?discount=<script>"))).toBe("");
    const win = fakeWindow("https://x.test/?discount=OK123");
    win.sessionStorage.setItem = () => { throw new Error("blocked"); };
    expect(captureSharedDiscount(win)).toBe("OK123");
    expect(sharedDiscount({ getItem: () => { throw new Error("blocked"); } } as any)).toBe("");
  });
  it("remembers a code typed in the bag for checkout, refusing anything that can't be a code", () => {
    const win = fakeWindow("https://x.test/");
    expect(rememberDiscountCode("  spring-10 ", win.sessionStorage)).toBe("SPRING-10");
    expect(sharedDiscount(win.sessionStorage)).toBe("SPRING-10");
    expect(rememberDiscountCode("a b", win.sessionStorage)).toBe("");
    expect(rememberDiscountCode("X", win.sessionStorage)).toBe("");
    expect(sharedDiscount(win.sessionStorage)).toBe("SPRING-10");
    expect(rememberDiscountCode("OK123", { setItem: () => { throw new Error("blocked"); } } as any)).toBe("");
  });
  it("builds a sub-path aware link", () => {
    expect(discountShareLink("save10", "https://a.github.io", "/LyricalmyricalWebsiteTrial/")).toBe("https://a.github.io/LyricalmyricalWebsiteTrial/?discount=SAVE10");
    expect(discountShareLink("X1Y", "https://shop.ca/", "/")).toBe("https://shop.ca/?discount=X1Y");
  });
});
