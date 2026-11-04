// @vitest-environment jsdom
// Settings › Google against a pretend Google link: the headline and the parts that need a look, Try again on a part that
// didn't work, extras switched on and saved with Google in one go, Disconnect behind a question, and the coming-soon page.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/firebase", () => ({ auth: { currentUser: null }, db: {} }));
vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("../../lib/shopProfile", async (real) => ({ ...(await real<any>()), hasStockroom: () => true, runsOnColophon: () => true }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { googleConnectApi, readGoogleStatus } = await import("./googleConnect");
const { GoogleHub } = await import("./GoogleSettings");

const STATUS = readGoogleStatus({
  enabled: true, connected: true, accountEmail: "owner@example.com", connectedAt: "2026-11-03T15:00:00Z",
  extrasOffered: ["businessProfile", "drive", "youtube"], extrasChosen: ["drive"],
  steps: [
    { step: "analytics", state: "done", detail: "" }, { step: "searchConsole", state: "failed", detail: "Google said no." },
    { step: "merchantCenter", state: "done", detail: "" }, { step: "email", state: "done", detail: "" },
    { step: "domain", state: "done", detail: "" }, { step: "drive", state: "done", detail: "" },
  ],
});

let root: Root | null = null;
let calls: any[];
beforeEach(() => {
  calls = [];
  googleConnectApi.tryAgain = vi.fn(async (part: string) => { calls.push(["tryAgain", part]); return STATUS; });
  googleConnectApi.connectLink = vi.fn(async (extras: any) => { calls.push(["connectLink", extras]); return "about:blank"; });
  googleConnectApi.disconnect = vi.fn(async () => { calls.push(["disconnect"]); return STATUS; });
  googleConnectApi.turnOff = vi.fn(async (extras: any) => { calls.push(["turnOff", extras]); return STATUS; });
  googleConnectApi.shoppingProblems = vi.fn(async () => ({ available: true, problems: [] }));
  googleConnectApi.sendStockSheet = vi.fn(async () => ({ available: true }));
  Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, href: "http://localhost/admin#settings/google", assign: vi.fn() } });
});
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; });

async function mount(status = STATUS) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => { root!.render(h(GoogleHub, { status })); });
}
const text = () => document.body.textContent || "";
const button = (name: string) => [...document.querySelectorAll("button")].find((b) => (b.textContent || b.getAttribute("aria-label") || "").trim() === name) as HTMLButtonElement | undefined;
const card = (id: string) => document.getElementById(`gg-card-${id}`)!;

describe("Settings › Google", () => {
  it("leads with what needs a look and who is signed in", async () => {
    await mount();
    expect(document.querySelector("h2")?.textContent).toBe("1 part needs a look");
    expect(text()).toContain("owner@example.com");
    expect(text()).toContain("5of 6 working");
    expect(document.querySelector(".gg-need")?.textContent).toContain("Google search · Didn't work");
  });

  it("shows Google's own G and each product's own logo, with a plain icon where the kit has none", async () => {
    await mount();
    expect(document.querySelector(".gg-hero [data-brand='google']")).not.toBeNull();
    expect(card("analytics").querySelector("[data-brand='googleanalytics']")).not.toBeNull();
    expect(card("email").querySelector("[data-brand='gmail']")).not.toBeNull();
    expect(card("merchantCenter").querySelector(".gg-icon")).not.toBeNull();
  });

  it("asks Google again for a part that didn't work", async () => {
    await mount();
    const retry = [...card("searchConsole").querySelectorAll("button")].find((b) => b.textContent === "Try again")!;
    await act(async () => { retry.click(); });
    expect(calls).toEqual([["tryAgain", "searchConsole"]]);
    // A working part offers Google's own page instead.
    expect(card("analytics").querySelector("a[target=_blank]")?.getAttribute("href")).toBe("https://analytics.google.com/");
  });

  it("switches extras on and saves them with Google in one go", async () => {
    await mount();
    expect(document.querySelector("[aria-label='Extras not saved yet']")).toBeNull();
    const maps = card("businessProfile").querySelector("[role=switch]") as HTMLButtonElement;
    await act(async () => { maps.click(); });
    expect(text()).toContain("1 extra changed.");
    await act(async () => { button("Save with Google")!.click(); });
    expect(calls).toEqual([["connectLink", ["drive", "businessProfile"]]]);
    expect(window.location.assign).toHaveBeenCalledWith("about:blank");
  });

  it("switching an extra off saves at once, with no trip to Google", async () => {
    await mount();
    await act(async () => { (card("drive").querySelector("[role=switch]") as HTMLButtonElement).click(); });
    expect(text()).toContain("Switching off saves straight away, with no new sign-in.");
    await act(async () => { button("Save")!.click(); });
    expect(calls).toEqual([["turnOff", ["drive"]]]);
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it("switching one on and one off goes to Google once, with the full list", async () => {
    await mount();
    await act(async () => { (card("drive").querySelector("[role=switch]") as HTMLButtonElement).click(); });
    await act(async () => { (card("youtube").querySelector("[role=switch]") as HTMLButtonElement).click(); });
    expect(text()).toContain("on the same Google account");
    await act(async () => { button("Save with Google")!.click(); });
    expect(calls).toEqual([["connectLink", ["youtube"]]]);
  });

  it("offers the stock list on a saved Drive", async () => {
    await mount();
    expect(card("drive").textContent).toContain("Send my stock list");
  });

  it("disconnects only after the press says yes", async () => {
    await mount();
    await act(async () => { button("Disconnect Google")!.click(); });
    expect(calls).toEqual([]);
    const yes = [...document.querySelectorAll("button")].filter((b) => b.textContent === "Disconnect").pop()!;
    await act(async () => { yes.click(); });
    expect(calls).toEqual([["disconnect"]]);
  });

  it("before Google is switched on, it shows every service and says it's coming, with nothing to press", async () => {
    await mount(readGoogleStatus({ enabled: false }));
    expect(document.querySelector("h2")?.textContent).toBe("Google is coming soon");
    expect(document.querySelectorAll(".gg-card")).toHaveLength(10);
    expect(button("Connect Google")).toBeUndefined();
    expect([...document.querySelectorAll("[role=switch]")].every((s) => (s as HTMLButtonElement).disabled)).toBe(true);
  });

  it("before connecting, one button connects with the extras the press switched on", async () => {
    await mount(readGoogleStatus({ enabled: true, connected: false, extrasOffered: ["drive", "ads"] }));
    await act(async () => { (card("ads").querySelector("[role=switch]") as HTMLButtonElement).click(); });
    expect(document.querySelector("[aria-label='Extras not saved yet']")).toBeNull();
    await act(async () => { button("Connect Google")!.click(); });
    expect(calls).toEqual([["connectLink", ["ads"]]]);
  });
});
