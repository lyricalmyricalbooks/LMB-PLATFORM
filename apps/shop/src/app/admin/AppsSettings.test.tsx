// @vitest-environment jsdom
// Settings › Apps: app changes newest first, a refusal with the shop's reason, and the empty state.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/firebase", () => ({ db: {} }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { AppsSettings } = await import("./AppsSettings");

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; });
async function show(recent: () => Promise<any[]>) {
  const el = document.body.appendChild(document.createElement("div"));
  root = createRoot(el);
  await act(async () => { root!.render(h(AppsSettings, { api: { recent } })); });
  return el;
}

describe("Settings › Apps", () => {
  it("shows each change, with the reason when the shop refused it", async () => {
    const el = await show(async () => [
      { id: "r2", app: "Parcel Pal", what: "Marked order A-2 sent (UPS 1Z)", when: "2026-11-04T16:00:00Z", state: "refused", reason: "Order on hold: author" },
      { id: "r1", app: "Parcel Pal", what: "Marked order A-1 sent (UPS 1Y)", when: "2026-11-04T15:00:00Z", state: "done", reason: "" },
    ]);
    expect(el.textContent).toContain("Order on hold: author");
    expect(el.textContent).toContain("Refused");
    expect(el.textContent).toContain("Done");
  });
  it("says so when there's nothing yet, or it can't load", async () => {
    expect((await show(async () => [])).textContent).toContain("No app activity yet");
    act(() => root?.unmount());
    expect((await show(async () => { throw new Error("offline"); })).textContent).toContain("Couldn't load app activity");
  });
});
