import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { ChangeList } from "./OverviewParts";

// What changed in a narrow panel: the badge goes above its title (Overview UX, 22 October 2026).
const css = readFileSync(new URL("./overviewViz.css", import.meta.url), "utf8");

describe("What changed layout", () => {
  const narrow = css.match(/@container \(max-width: 480px\) \{\n  \.rp-ov-change \{([\s\S]*?)\n\}/)?.[0] || "";
  it("makes the list a size container so the rule follows the panel's width", () => {
    expect(css).toMatch(/\.rp-ov-changes \{ container-type: inline-size; \}/);
    const html = renderToStaticMarkup(createElement(ChangeList, { changes: [{ id: "a", title: "Revenue rose", detail: "More orders", tone: "up" } as any] }));
    expect(html).toContain('class="rp-list rp-ov-changes"');
  });
  it("gives the title the whole width and puts the badge above it in a narrow panel", () => {
    expect(narrow).toMatch(/\.rp-ov-change \{ grid-template-columns: minmax\(0, 1fr\);/);
    expect(narrow).toMatch(/\.rp-ov-change > \.rp-badge \{ order: -1; justify-self: start; min-width: 0; \}/);
  });
});
