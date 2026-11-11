// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { LETTERHEAD_KEY, letterheadPrintHtml, readLetterhead } from "./letterhead";

const mem = (saved?: unknown) => ({ getItem: (k: string) => (k === LETTERHEAD_KEY && saved ? JSON.stringify(saved) : null) });

describe("letterhead", () => {
  it("fills blanks from the invoice details, as the old app did", () => {
    const l = readLetterhead({ name: "Moth Press", addr: "1 Main St", email: "hi@example.com", web: "moth.example" }, mem());
    expect(l).toMatchObject({ name: "Moth Press", address: "1 Main St", email: "hi@example.com", website: "moth.example", accent: "#a87042" });
  });
  it("reads a letter saved by the old app on the same device", () => {
    const l = readLetterhead({ name: "Other" }, mem({ name: "Saved Press", subject: "Hello", body: "Line one" }));
    expect(l.name).toBe("Saved Press");
    expect(letterheadPrintHtml(l)).toContain("Line one");
  });
  it("prints escaped words on letter paper", () => {
    const html = letterheadPrintHtml(readLetterhead({}, mem({ name: "<b>x</b>", body: "a & b" })));
    expect(html).toContain("@page{size:letter");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("a &amp; b");
  });
});
