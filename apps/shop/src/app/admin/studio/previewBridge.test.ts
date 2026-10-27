import { describe, expect, it } from "vitest";
import { PREVIEW_BRIDGE_SOURCE } from "./previewBridge";

// The bridge is JavaScript shipped as a string into the preview iframe; a plain template literal would
// swallow `\s`. Check the code that actually arrives, not the TypeScript that wrote it.
describe("studio preview bridge source", () => {
  it("is valid JavaScript", () => {
    expect(() => new Function(PREVIEW_BRIDGE_SOURCE)).not.toThrow();
  });

  it("collapses whitespace without touching letters", () => {
    const m = PREVIEW_BRIDGE_SOURCE.match(/function norm\(t\)\{[^}]*\}/);
    expect(m).not.toBeNull();
    const norm = new Function(`return ${m![0]}`)() as (t: string) => string;
    expect(norm("  Add  to\n  cart,\tplease ")).toBe("add to cart, please");
  });
});

it("preserves line breaks in plain-text editing without using visually transformed innerText", () => {
  const match = PREVIEW_BRIDGE_SOURCE.match(/function plainText\(n\)\{[\s\S]*?\n  \}/);
  expect(match).not.toBeNull();
  const read = new Function(`return ${match![0]}`)();
  const text = (value: string) => ({nodeType:3,nodeValue:value});
  const element = (tagName: string, ...childNodes: any[]) => ({nodeType:1,tagName,childNodes});
  expect(read(element("SPAN", text("Mixed Case"), element("DIV", text("Second line"))))).toBe("Mixed Case\nSecond line");
  expect(read(element("SPAN", text("First"), element("BR"), text("Second")))).toBe("First\nSecond");
});

it("maps navigation and composition gaps to real CSS properties",()=>{
 const match=PREVIEW_BRIDGE_SOURCE.match(/function spacingProperty\(key,target\)\{[^}]*\}/);
 expect(match).not.toBeNull();
 const property=new Function(`return ${match![0]}`)();
 expect(property("navGap",{getAttribute:()=>null})).toBe("gap");
 expect(property("gridGap",{getAttribute:()=>"gap"})).toBe("gap");
 expect(property("paddingLeft",{getAttribute:()=>null})).toBe("padding-left");
});
