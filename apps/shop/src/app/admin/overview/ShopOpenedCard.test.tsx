// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { ShopOpenedCard, publicAddress } from "./ShopOpenedCard";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("Your shop is open", () => {
  it("uses the press's own web address once it's connected, else the free one", () => {
    expect(publicAddress({ domain: { custom: "https://shop.yourpress.example/" } }, "https://lmb-test-shop.web.app")).toBe("https://shop.yourpress.example");
    expect(publicAddress({}, "https://lmb-test-shop.web.app")).toBe("https://lmb-test-shop.web.app");
  });

  it("shows the address, copies it and goes away on Done", async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    const onClose = vi.fn();
    const el = document.createElement("div");
    document.body.append(el);
    const root = createRoot(el);
    act(() => root.render(h(ShopOpenedCard, { address: "https://lmb-test-shop.web.app", onClose })));
    expect(el.textContent).toContain("Your shop is open");
    expect(el.textContent).toContain("lmb-test-shop.web.app");
    const button = (words: string) => [...el.querySelectorAll("button")].find((b) => b.textContent === words) as HTMLButtonElement;
    await act(async () => { button("Copy the address").click(); });
    expect(writeText).toHaveBeenCalledWith("https://lmb-test-shop.web.app");
    expect(el.querySelector('[role="status"]')?.textContent).toMatch(/^Copied/);
    act(() => button("Done").click());
    expect(onClose).toHaveBeenCalled();
    act(() => root.unmount());
  });
});
