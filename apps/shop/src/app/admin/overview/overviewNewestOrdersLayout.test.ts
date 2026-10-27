import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Newest orders in a narrow panel: amount + status go under the order (Overview UX, 22 October 2026).
const css = readFileSync(new URL("./overviewViz.css", import.meta.url), "utf8");

describe("Newest orders layout", () => {
  const narrow = css.match(/@container \(max-width: 600px\) \{([\s\S]*?)\n\}/)?.[1] || "";
  it("lets an order row wrap in a narrow panel", () => {
    expect(narrow).toMatch(/\.rp-viz-orders \.rp-viz-rank-row \{[^}]*flex-wrap: wrap;/);
  });
  it("puts the amount and status on their own full-width line, lined up with the name", () => {
    expect(narrow).toMatch(/\.rp-viz-orders \.rp-viz-order-end \{[^}]*flex: 1 0 100%;[^}]*flex-direction: row;[^}]*padding-left: calc\(32px \+ 10px\);/);
  });
  it("keeps the list a size container so the rule follows the panel's width", () => {
    expect(css).toMatch(/\.rp-viz-rank \{ container-type: inline-size; \}/);
  });
});
