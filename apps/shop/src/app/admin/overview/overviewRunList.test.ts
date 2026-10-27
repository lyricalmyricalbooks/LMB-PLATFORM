import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Needs you rows line up with the panel's big total (Overview UX, 22 October 2026).
const css = readFileSync(new URL("./overviewViz.css", import.meta.url), "utf8");

describe("Needs you list layout", () => {
  it("beats the shared list padding so rows start level with the total, with one line between rows", () => {
    expect(css).toMatch(/\.rp-ov-run \.rp-list > \.rp-ov-run-row \{ padding: 12px 0; border-bottom: 0; \}/);
  });
  it("gives the words more room on a phone", () => {
    expect(css).toMatch(/@media \(max-width: 767px\) \{\s*\.rp-ov-run \{ padding: 16px; \}/);
  });
});
