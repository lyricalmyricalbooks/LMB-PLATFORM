// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VariantGrid } from "./VariantGrid";
import { ShopWordsContext } from "./shopWords";
import { goodsWords } from "./sells";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const form = {
  options: [{ name: "Size", values: ["S", "M"] }, { name: "Colour", values: ["Black"] }],
  variants: [
    { id: "s", name: "S / Black", options: { Size: "S", Colour: "Black" }, price: 30, sku: "TEE-S", stockLevel: 4 },
    { id: "m", name: "M / Black", options: { Size: "M", Colour: "Black" }, price: 32, sku: "TEE-M", stockLevel: 0 },
  ],
};

let root: Root | null = null;
async function mount(locked: string[] = []) {
  const onChange = vi.fn();
  const onReplace = vi.fn();
  const el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el);
  await act(async () => {
    root!.render(h(ShopWordsContext.Provider, { value: goodsWords },
      h(VariantGrid, { form, lowLine: 5, onChange, onReplace, stockLocked: (id: string) => locked.includes(id), stockLockHint: () => undefined })));
  });
  return { el, onChange, onReplace };
}
afterEach(async () => { await act(async () => root?.unmount()); root = null; document.body.innerHTML = ""; });

const type = async (input: HTMLInputElement, value: string) => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { set.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
};

describe("Every combination", () => {
  it("shows one row per combination with its own price, SKU and stock, in a product shop's words", async () => {
    const { el } = await mount();
    expect(el.textContent).toContain("Shoppers pick them on the product page.");
    expect(el.textContent).toContain("items across all of them");
    expect(el.querySelectorAll("tbody tr")).toHaveLength(2);
    expect((el.querySelector('[aria-label="SKU of M / Black"]') as HTMLInputElement).value).toBe("TEE-M");
    expect((el.querySelector('[aria-label="Stock of S / Black"]') as HTMLInputElement).value).toBe("4");
    expect(el.textContent).toContain("Price fromCA$30.00up to CA$32.00");
  });

  it("edits one combination and fills every row", async () => {
    const { el, onChange, onReplace } = await mount(["m"]);
    await type(el.querySelector('[aria-label="Price of S / Black"]') as HTMLInputElement, "28");
    expect(onChange).toHaveBeenCalledWith("s", "price", 28);
    expect((el.querySelector('[aria-label="Stock of M / Black"]') as HTMLInputElement).disabled).toBe(true);
    const stockFill = el.querySelector('input[placeholder="e.g. 10"]') as HTMLInputElement;
    await type(stockFill, "7");
    const setStock = [...el.querySelectorAll("button")].find((b) => b.textContent === "Set stock")!;
    await act(async () => setStock.click());
    expect(onReplace.mock.calls[0][0].map((v: any) => v.stockLevel)).toEqual([7, 0]);
  });
});
