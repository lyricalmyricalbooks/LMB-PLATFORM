// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { ShareMenu } from "./ShareMenu";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

async function mount(props: Partial<Parameters<typeof ShareMenu>[0]> = {}) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const onCopied = vi.fn();
  await act(async () => { createRoot(el).render(h(ShareMenu, { title: "Night Moths", word: (k: string) => k, onCopied, ...props })); });
  return { el, onCopied, button: el.querySelector("button") as HTMLButtonElement };
}

describe("share menu on product pages (plan 27.7)", () => {
  it("opens the share links and Copy link, and closes on Escape", async () => {
    const { el, button } = await mount();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    await act(async () => { button.click(); });
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const links = [...el.querySelectorAll(".fm-pdp-share-menu a")].map((a) => a.getAttribute("data-share"));
    expect(links).toEqual(["facebook", "pinterest", "x", "whatsapp", "email"]);
    expect(el.querySelector("[data-share=facebook]")?.getAttribute("href")).toContain("utm_source%3Dfacebook");
    expect(el.textContent).toContain("bookShareCopyLink");
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(el.querySelector(".fm-pdp-share-menu")).toBeNull();
  });

  it("copies the link marked as a copy, and says when it couldn't", async () => {
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("blocked"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { el, button, onCopied } = await mount();
    for (const ok of [true, false]) {
      await act(async () => { button.click(); });
      await act(async () => { (el.querySelector("[data-share=copy]") as HTMLButtonElement).click(); });
      expect(onCopied).toHaveBeenLastCalledWith(ok);
    }
    expect(writeText.mock.calls[0][0]).toContain("utm_source=copy_link");
  });

  it("uses the phone's own share sheet on a touch screen", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    window.matchMedia = ((q: string) => ({ matches: q === "(pointer: coarse)" })) as any;
    const { el, button } = await mount();
    await act(async () => { button.click(); });
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ title: "Night Moths" }));
    expect(el.querySelector(".fm-pdp-share-menu")).toBeNull();
  });
});
