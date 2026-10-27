// @vitest-environment jsdom
import { act, createElement as h, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { StudioProductBlocks } from "./StudioProductBlocks";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let latest: any;
function Harness({ initial, templateId }: { initial: any; templateId: string }) {
  const [design, setDesign] = useState(initial);
  latest = design;
  return h(StudioProductBlocks, { design, templateId, change: (fn: any) => setDesign((d: any) => fn(d)) });
}
async function mount(initial: any, templateId = "productPage") {
  const el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root!.render(h(Harness, { initial, templateId })); });
  return el;
}
const byLabel = (el: HTMLElement, label: string) => [...el.querySelectorAll("[aria-label]")].find(n => n.getAttribute("aria-label") === label) as HTMLButtonElement | undefined;
const click = (el: HTMLElement, label: string) => act(async () => byLabel(el, label)!.click());
const pick = (select: HTMLSelectElement, value: string) => act(async () => { select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); });
afterEach(async () => { await act(async () => root?.unmount()); root = null; document.body.innerHTML = ""; });

describe("Page layout › Buy box blocks", () => {
  it("moves and hides built-in blocks on the default book page, keeping Add to bag always shown", async () => {
    const el = await mount({});
    await click(el, "Move Price, sale end & stock up");
    const list = latest.productPage.productInfoBlocks.map((b: any) => b.type);
    expect(list.slice(0, 3)).toEqual(["tag", "price", "heading"]);
    await click(el, "Hide Category tag");
    expect(latest.productPage.productInfoBlocks.find((b: any) => b.type === "tag").hidden).toBe(true);
    expect(byLabel(el, "Hide Quantity, Add to bag, wishlist & share")).toBeUndefined();
    expect(el.textContent).toContain("Always shown");
  });
  it("adds, edits and removes a collapsible note", async () => {
    const el = await mount({});
    await pick(el.querySelector(".studio-pdp-add select") as HTMLSelectElement, "collapsible");
    const added = latest.productPage.productInfoBlocks.at(-1);
    expect(added).toMatchObject({ type: "collapsible", settings: { heading: "Shipping & returns" } });
    await click(el, "Remove Collapsible note");
    expect(latest.productPage.productInfoBlocks.some((b: any) => b.type === "collapsible")).toBe(false);
  });
  it("an alternate template follows the default until edited, and can go back to it", async () => {
    const design = { alternateTemplates: { productPage: [{ id: "poetry", name: "Poetry" }] }, productPage: { productInfoBlocks: [{ id: "b", type: "buy" }, { id: "heading", type: "heading" }] } };
    const el = await mount(design, "productPage~poetry");
    expect(el.textContent).toContain("follows the default book page");
    expect(el.querySelector(".studio-pdp-block-name")?.textContent).toBe("Quantity, Add to bag, wishlist & share");
    await click(el, "Move Title, subtitle & author up");
    expect(latest["productPage~poetry"].productInfoBlocks[0].type).toBe("heading");
    expect(latest.productPage.productInfoBlocks[0].type).toBe("buy");
    await act(async () => ([...el.querySelectorAll("button")].find(b => b.textContent === "Use the default book page's blocks") as HTMLButtonElement).click());
    expect(latest["productPage~poetry"]?.productInfoBlocks).toBeUndefined();
  });
  it("is only for book page templates", async () => {
    const el = await mount({}, "heroPage");
    expect(el.querySelector("[data-studio-panel=product-blocks]")).toBeNull();
  });
});
