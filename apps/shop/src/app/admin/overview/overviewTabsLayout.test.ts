import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The Overview topic tabs must never break into two ragged rows (Overview UX, 21 October 2026).
const css = readFileSync(new URL("../riso/riso.css", import.meta.url), "utf8");

describe("Overview topic tabs layout", () => {
  it("keeps the tabs on one line that scrolls sideways when it can't fit", () => {
    expect(css).toMatch(/\.rp-wb-tabs \.rp-tabs \{[^}]*flex-wrap: nowrap;[^}]*overflow-x: auto;/);
    expect(css).toMatch(/\.rp-wb-tabs \.rp-tabs \.rp-tab \{[^}]*white-space: nowrap;/);
  });
  it("lets the tab row take its full width before the board actions share the line", () => {
    expect(css).toMatch(/\.rp-wb-tabs \{[^}]*flex: 1 1 max-content;[^}]*max-width: 100%;/);
  });
});
