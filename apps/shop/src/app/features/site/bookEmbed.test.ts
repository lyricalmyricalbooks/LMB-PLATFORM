// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { bookEmbedded, embedFromSearch, goToPayment } from "./bookEmbed";

const framedAs = (top: unknown) => vi.spyOn(window, "top", "get").mockReturnValue(top as Window);

describe("the booking page framed on another website (plan 4, 2.6)", () => {
  afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); });

  it("reads embed=1 only", () => {
    expect(embedFromSearch("?embed=1&service=cut")).toBe(true);
    expect(embedFromSearch("?embed=true")).toBe(false);
    expect(embedFromSearch("")).toBe(false);
  });

  it("is never embedded in its own window, even with the address", () => {
    expect(bookEmbedded("?embed=1")).toBe(false);
  });

  it("remembers the frame across the page's own links, but never in Studio's preview", () => {
    framedAs({});
    expect(bookEmbedded("?embed=1")).toBe(true);
    expect(bookEmbedded("?booking=b1&key=k")).toBe(true);
    expect(bookEmbedded("?preview=true&embed=1")).toBe(false);
    sessionStorage.clear();
    expect(bookEmbedded("")).toBe(false);
  });

  it("goes to the card page in the whole window when framed, else in its own", () => {
    const top = { location: { href: "" } };
    framedAs(top);
    goToPayment("https://pay.example/1", true);
    expect(top.location.href).toBe("https://pay.example/1");
  });
});
