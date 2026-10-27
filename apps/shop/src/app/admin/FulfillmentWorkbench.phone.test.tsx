// @vitest-environment jsdom
// Phone use of the order workbench: a tap on a book line ticks it, and a tap on a step jumps to it.
import { afterEach, expect, it, vi } from "vitest";
import { createElement as h, act } from "react";
import { createRoot } from "react-dom/client";
import { addressKey } from "./fulfillment";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { FulfillmentWorkbench } = await import("./FulfillmentWorkbench");

const order = () => {
  const o: any = {
    paymentStatus: "paid",
    status: "paid",
    customer: { name: "Reader", address: { street: "1 Main", city: "Toronto", state: "ON", zip: "M6G3H1", country: "CA" } },
    items: [
      { id: "a", title: "First", quantity: 1 },
      { id: "b", title: "Second", quantity: 2 },
    ],
    operations: {},
  };
  o.operations.addressReviewed = addressKey(o);
  return o;
};

afterEach(() => { document.body.innerHTML = ""; });

async function mount(onCheck: (i: number) => void, busy = false) {
  const el = document.createElement("div");
  document.body.append(el);
  const noop = () => {};
  await act(async () => {
    createRoot(el).render(h(FulfillmentWorkbench as any, {
      order: order(), checked: new Set<number>(), busy, onCheck,
      onReview: noop, onCorrect: noop, onPack: noop, onLabel: noop, onDispatch: noop, onLocalAdvance: noop, onRelease: noop,
    }));
  });
  return el;
}

it("ticks a book line when the line itself is tapped, once when the checkbox is tapped", async () => {
  const onCheck = vi.fn();
  const el = await mount(onCheck);
  const lines = el.querySelectorAll<HTMLLIElement>(".fw-items li[data-tick]");
  expect(lines).toHaveLength(2);
  await act(async () => { (lines[1].querySelector(".fw-item-name") as HTMLElement).click(); });
  expect(onCheck).toHaveBeenCalledWith(1);
  onCheck.mockClear();
  await act(async () => { (lines[0].querySelector("input") as HTMLInputElement).click(); });
  expect(onCheck).toHaveBeenCalledTimes(1);
  expect(onCheck).toHaveBeenCalledWith(0);
});

it("doesn't tick a line when its text is being selected", async () => {
  const onCheck = vi.fn();
  const el = await mount(onCheck);
  const spy = vi.spyOn(window, "getSelection").mockReturnValue({ isCollapsed: false } as Selection);
  await act(async () => { (el.querySelector(".fw-items li[data-tick] .fw-item-name") as HTMLElement).click(); });
  spy.mockRestore();
  expect(onCheck).not.toHaveBeenCalled();
});

it("doesn't tick lines while the order is busy", async () => {
  const onCheck = vi.fn();
  const el = await mount(onCheck, true);
  expect(el.querySelectorAll(".fw-items li[data-tick]")).toHaveLength(0);
  await act(async () => { (el.querySelector(".fw-items .fw-item-name") as HTMLElement).click(); });
  expect(onCheck).not.toHaveBeenCalled();
});

it("scrolls to a step when it is tapped in the step row", async () => {
  const el = await mount(() => {});
  const scrolled: string[] = [];
  el.querySelectorAll<HTMLElement>(".fw-step[data-step]").forEach((s) => { s.scrollIntoView = () => { scrolled.push(s.dataset.step || ""); }; });
  const steps = el.querySelectorAll<HTMLButtonElement>(".fw-strip-go");
  expect(steps).toHaveLength(3);
  await act(async () => { steps[2].click(); });
  expect(scrolled).toEqual(["ship"]);
});
