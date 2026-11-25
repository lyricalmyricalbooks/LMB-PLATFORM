// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { ShopOpenedCard, publicAddress, tellEmailHref } from "./ShopOpenedCard";

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

  it("offers three ready ways to tell people", async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    const onOpen = vi.fn();
    const el = document.createElement("div");
    document.body.append(el);
    const root = createRoot(el);
    act(() => root.render(h(ShopOpenedCard, { address: "https://lmb-test-shop.web.app", name: "Moth Press", onClose: () => {}, onOpen })));
    const mail = el.querySelector(".rp-sb-tell a") as HTMLAnchorElement;
    expect(mail.getAttribute("href")).toBe(tellEmailHref("https://lmb-test-shop.web.app", "Moth Press"));
    expect(decodeURIComponent(mail.getAttribute("href")!)).toContain("subject=Moth Press is open");
    const tell = (words: string) => [...el.querySelectorAll(".rp-sb-tell button")].find((b) => b.textContent?.includes(words)) as HTMLButtonElement;
    act(() => tell("Post it").click());
    expect(onOpen).toHaveBeenCalledWith("channels");
    await act(async () => { tell("Put it in your bio").click(); });
    expect(writeText).toHaveBeenCalledWith("https://lmb-test-shop.web.app");
    expect(el.querySelector('[role="status"]')?.textContent).toMatch(/bio/);
    expect(el.textContent).toContain("When your first order comes in");
    act(() => root.unmount());
  });
});
