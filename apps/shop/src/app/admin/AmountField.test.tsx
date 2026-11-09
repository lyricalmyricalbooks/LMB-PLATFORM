// @vitest-environment jsdom
// Settings › Payments › Check big orders: typing "499.99" must save 499.99, not 49999 (the point used to vanish).
import { act, createElement as h, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { AmountField } from "./AmountField";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(async () => { await act(async () => root?.unmount()); root = null; document.body.innerHTML = ""; });

function type(input: HTMLInputElement, text: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  for (let i = 1; i <= text.length; i++) {
    set.call(input, text.slice(0, i));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

it("keeps the decimal point while typing and saves the amount typed", async () => {
  const saved: number[] = [];
  function Host() {
    const [value, setValue] = useState(0);
    return h(AmountField, { label: "Hold at", value, onValue: (v: number) => { saved.push(v); setValue(v); } });
  }
  const div = document.body.appendChild(document.createElement("div"));
  root = createRoot(div);
  await act(async () => root!.render(h(Host)));
  const input = div.querySelector("input")!;
  await act(async () => type(input, "499.99"));
  expect(input.value).toBe("499.99");
  expect(saved.at(-1)).toBe(499.99);
});
