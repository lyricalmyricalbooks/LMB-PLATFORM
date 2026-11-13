// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { CountStock } from "./CountStock";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | null = null;
let host: HTMLDivElement;
afterEach(() => { if (root) act(() => root!.unmount()); root = null; host?.remove(); localStorage.clear(); });

const click = (el: Element | null | undefined) => act(() => { (el as HTMLElement).click(); });
const button = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);

it("shows the difference report after finishing, with values at cost", async () => {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const onFinish = vi.fn(async () => []);
  const onClose = vi.fn();
  const items = [{ id: "a", title: "Zine", expected: 3, cost: 2 }, { id: "b", title: "Tee", expected: 5, cost: 10 }];
  act(() => root!.render(h(CountStock, { items, onFinish, onClose, money: (n: number) => `$${n.toFixed(2)}` })));
  click(host.querySelector('[aria-label="Start counting Zine"]'));
  click(host.querySelector('[aria-label="Start counting Tee"]'));
  click(host.querySelector('[aria-label="One fewer Tee"]'));
  click(host.querySelector('[aria-label="One fewer Tee"]'));
  await act(async () => { button("Finish count")!.click(); });
  expect(onFinish).toHaveBeenCalledWith([{ id: "b", from: 5, to: 3 }]);
  expect(onClose).not.toHaveBeenCalled();
  const text = host.textContent || "";
  expect(text).toContain("Tee");
  expect(text).toContain("−2 · $20.00");
  expect(button("Download report")).toBeTruthy();
  click(button("Done"));
  expect(onClose).toHaveBeenCalledOnce();
});
