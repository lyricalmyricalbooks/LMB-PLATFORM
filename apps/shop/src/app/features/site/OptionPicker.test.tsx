import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OptionPicker, variantBuyable } from "./OptionPicker";

const shirt = {
  id: "tee",
  kind: "clothing",
  options: [{ name: "Size", values: ["S", "M"] }, { name: "Colour", values: ["Black", "White"] }],
  variants: [
    { id: "s-b", name: "S / Black", options: { Size: "S", Colour: "Black" }, price: 25, stock: 0 },
    { id: "s-w", name: "S / White", options: { Size: "S", Colour: "White" }, price: 25, stock: 0 },
    { id: "m-b", name: "M / Black", options: { Size: "M", Colour: "Black" }, price: 25, stock: 2 },
    { id: "m-w", name: "M / White", options: { Size: "M", Colour: "White" }, price: 25, stock: 0, onBackorder: true },
  ],
};

const html = (picks: Record<string, string>, error?: string) =>
  renderToStaticMarkup(<OptionPicker design={{}} product={shirt} picks={picks} onPick={() => {}} error={error} align="start" />);

describe("option buttons (plan 10.2)", () => {
  it("shows one row per option with the press's own words and the picked value", () => {
    const out = html({ Size: "M" });
    expect(out).toContain("Size: M");
    expect(out).toContain(">Colour<");
    expect(out).toMatch(/aria-pressed="true"[^>]*>M</);
  });
  it("marks a size with nothing left as sold out, and counts back-orders as buyable", () => {
    const out = html({});
    expect(out).toContain('aria-label="S · Sold out"');
    expect(out).toContain('aria-label="M"');
    expect(variantBuyable(shirt.variants[3])).toBe(true);
    expect(variantBuyable(shirt.variants[0])).toBe(false);
  });
  it("shows the choose-first message as an alert", () => {
    expect(html({}, "Please choose a Size first.")).toContain('role="alert"');
  });
});
