// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { ErrorBoundary } from "./ErrorBoundary";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Studio preview: a setting that broke the page must not freeze the canvas until a reload.
let broken = true;
const Page = () => { if (broken) throw new Error("bad setting"); return h("p", null, "Shop is back"); };

afterEach(() => { document.body.innerHTML = ""; window.history.replaceState(null, "", "/"); broken = true; });

async function mount() {
  const el = document.createElement("div");
  document.body.append(el);
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  await act(async () => { createRoot(el).render(h(ErrorBoundary, { resetKey: "same" }, h(Page))); });
  errors.mockRestore();
  return el;
}

const snapshot = () => new MessageEvent("message", { data: { type: "STUDIO_PREVIEW_STATE", design: {} }, origin: window.location.origin, source: window.parent });

it("retries the page when Studio sends its next snapshot", async () => {
  window.history.replaceState(null, "", "/?preview=true");
  const el = await mount();
  expect(el.querySelector("[role='alert']")).not.toBeNull();
  broken = false;
  await act(async () => { window.dispatchEvent(snapshot()); });
  expect(el.textContent).toBe("Shop is back");
});

it("keeps the error panel for shoppers (no preview messages)", async () => {
  const el = await mount();
  broken = false;
  await act(async () => { window.dispatchEvent(snapshot()); });
  expect(el.querySelector("[role='alert']")).not.toBeNull();
});
