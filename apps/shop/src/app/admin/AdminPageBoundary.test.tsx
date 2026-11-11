// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdminPageBoundary } from "./AdminPageBoundary";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let fail = true;
function Page({ label }: { label: string }) {
  if (fail) throw new Error("boom");
  return <p>{label}</p>;
}
beforeEach(() => {
  fail = true;
  container = document.createElement("div");
  document.body.replaceChildren(container);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

it("keeps a broken page inside the admin, and Try again redraws it", async () => {
  const root = createRoot(container);
  await act(async () => root.render(<div><nav>Menu</nav><AdminPageBoundary resetKey="orders"><Page label="Orders" /></AdminPageBoundary></div>));
  expect(container.textContent).toContain("Menu");
  expect(container.textContent).toContain("This page hit a problem");
  fail = false;
  const retry = Array.from(container.querySelectorAll("button")).find(b => b.textContent === "Try again")!;
  await act(async () => retry.click());
  expect(container.textContent).toContain("Orders");
  expect(container.textContent).not.toContain("hit a problem");
});

it("clears when another page is opened", async () => {
  const root = createRoot(container);
  await act(async () => root.render(<AdminPageBoundary resetKey="orders"><Page label="Orders" /></AdminPageBoundary>));
  expect(container.textContent).toContain("This page hit a problem");
  fail = false;
  await act(async () => root.render(<AdminPageBoundary resetKey="books"><Page label="Books" /></AdminPageBoundary>));
  expect(container.textContent).toContain("Books");
});

it("says the admin was updated when a page's code is gone after an update", async () => {
  const reload = vi.fn();
  vi.stubGlobal("location", { ...window.location, reload });
  function Stale(): React.ReactElement { throw new TypeError("Failed to fetch dynamically imported module: /assets/Orders-old.js"); }
  const root = createRoot(container);
  await act(async () => root.render(<AdminPageBoundary resetKey="orders"><Stale /></AdminPageBoundary>));
  expect(container.textContent).toContain("The admin was updated");
  vi.unstubAllGlobals();
});
