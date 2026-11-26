// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChooseLookWelcome, SHORTLIST } from "./ChooseLookWelcome";
import { startersForKind } from "../websiteChoice";
import { STARTER_SITES } from "../lookGallery";

// Every starter shown, as the control room does once each is ticked.
const ALL = { known: STARTER_SITES, hidden: [] };

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; });
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)); }); };
const mount = async (props: Record<string, unknown> = {}) => {
  const onDone = vi.fn(async () => {});
  const apply = vi.fn(async () => {});
  const host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(h(ChooseLookWelcome, { publishes: "books", settings: { info: { name: "Moth Press" } }, onDone, apply, ...props })));
  await flush();
  return { onDone, apply };
};
const text = () => document.body.textContent || "";
const cards = (list: string) => [...document.querySelectorAll(`ul[aria-label='${list}'] [data-starter-card]`)].map(li => li.getAttribute("data-starter-card"));
const useOn = (id: string) => [...document.querySelectorAll(`[data-starter-card='${id}'] button`)].find(b => b.textContent?.trim() === "Use this") as HTMLButtonElement;
const button = (label: string) => [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === label) as HTMLButtonElement;

describe("Choose your website (one website picker, step 4)", () => {
  it("shows the same starter cards as Online store: three picked for the shop, then the rest, with no categories", async () => {
    await mount();
    expect(text()).toContain("Welcome to Moth Press. Choose your website");
    const all = startersForKind("products");
    expect(cards("Your shortlist")).toEqual(all.slice(0, SHORTLIST));
    expect(cards("More websites")).toEqual(all.slice(SHORTLIST));
    expect(text()).not.toMatch(/See every look|Quiet & classic|Bold & loud/);
    // Each card has a real picture and its colour versions.
    expect(document.querySelector(`[data-starter-card='${all[0]}'] img`)?.getAttribute("src")).toMatch(/starters\/thumbs\//);
    expect(document.querySelector(`[data-starter-card='${all[0]}'] [role=radiogroup]`)).not.toBeNull();
  });

  it("a services shop sees the starters made for appointments first", async () => {
    await mount({ publishes: "services", kind: "services", starters: ALL });
    expect(cards("Your shortlist")).toEqual(["starter-salon", "starter-workshop", "starter-commission"]);
    expect(text()).toContain("Made for services.");
  });

  it("Use this records the starter in the colour picked", async () => {
    const { onDone, apply } = await mount();
    const id = startersForKind("products")[0];
    const radios = document.querySelectorAll<HTMLButtonElement>(`[data-starter-card='${id}'] [role=radio]`);
    await act(async () => { radios[radios.length - 1].click(); });
    await act(async () => { useOn(id).click(); });
    await flush();
    expect(apply).toHaveBeenCalledTimes(1);
    const theme: any = (apply.mock.calls[0] as any[])[0];
    expect(theme.id).toBe(id);
    expect(theme.styleId || theme.style || "").not.toBe("");
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ theme: id }));
  });

  it("Skip for now takes the first of the shortlist and says it was skipped", async () => {
    const { onDone } = await mount();
    await act(async () => { button("Skip for now").click(); });
    await flush();
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ theme: startersForKind("products")[0], skipped: true }));
  });

  it("opens on the website chosen before the shop was made, and setup mode shows it settled with no Use this", async () => {
    await mount({ chosen: { theme: "starter-larder" }, starters: ALL });
    expect(text()).toContain("Here's the website you chose");
    expect(cards("The website you chose")).toEqual(["starter-larder"]);
    expect(cards("Your shortlist")).not.toContain("starter-larder");
    act(() => root?.unmount()); document.body.innerHTML = "";
    await mount({ chosen: { theme: "starter-larder" }, settled: true, starters: ALL });
    expect(text()).toContain("Your website: Larder");
    expect(useOn("starter-larder")).toBeUndefined();
  });

  it("setup mode has no shop to preview, so its cards have no Preview", async () => {
    await mount();
    expect(button("Preview")).toBeUndefined();
  });
});
