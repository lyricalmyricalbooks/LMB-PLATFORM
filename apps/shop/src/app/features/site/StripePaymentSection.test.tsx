// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { StripePaymentSection } from "./StripePaymentSection";
import { getCopy } from "./storeCopy";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
afterEach(() => { if (root) act(() => root.unmount()); host?.remove(); });
function render(props: Record<string, unknown> = {}) {
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  act(() => root.render(h(StripePaymentSection, {
    design: {}, selected: true, configured: true, canRetry: false,
    busy: false, onSelect() {}, onRetry() {}, children: h("input", { id: "provider-field" }), ...props,
  })));
  return host;
}

describe("inline Stripe payment section", () => {
  it("renders interactive payment fields inside checkout and outside the radio label", () => {
    const view = render();
    expect(view.querySelector("#provider-field")).not.toBeNull();
    expect(view.querySelector("#provider-field")?.closest("label")).toBeNull();
    expect(view.querySelector('input[type="radio"]')?.closest("label")).not.toBeNull();
    expect(view.querySelector('a')).toBeNull();
    expect(view.textContent).not.toContain(getCopy({}, "coStripeNote"));
  });
  it("shows editable configuration recovery and no payment fields for an invalid key", () => {
    const view = render({ configured: false });
    expect(view.querySelector('[role="alert"]')?.textContent).toBe(getCopy({}, "coStripeConfigError"));
    expect(view.querySelector("#provider-field")).toBeNull();
    expect(view.querySelector('button')).toBeNull();
  });
  it("reloads the inline form through an explicit retry action", () => {
    let retried = 0;
    const view = render({ canRetry: true, onRetry() { retried++; } });
    const retry = view.querySelector("button")!;
    expect(retry.textContent).toBe(getCopy({}, "coStripeRetry"));
    act(() => retry.click());
    expect(retried).toBe(1);
  });
  it("disables retry while processing and removes it after an attempt starts", () => {
    expect(render().querySelector("button")).toBeNull();
    act(() => root.unmount()); host.remove();
    let retried = 0;
    const button = render({ canRetry: true, busy: true, onRetry() { retried++; } }).querySelector("button")!;
    act(() => button.click());
    expect(retried).toBe(0);
  });
  it("uses Studio labels and optional badge visibility", () => {
    const view = render({ design: { regions: { stripeBrandsVisible: false }, copy: { coCard: "Pay with Stripe" } } });
    expect(view.textContent).toContain("Pay with Stripe");
    expect(view.textContent).not.toContain("VISA");
    expect(view.querySelector('[data-studio-target]')).not.toBeNull();
  });
});
it("never advertises configured wallets as eligible card brands", () => {
  const view = render({ design: { copy: { coCardBrands: "VISA, Apple Pay, Google Pay, Link" } } });
  expect(view.textContent).toContain("VISA");
  expect(view.textContent).not.toContain("Apple Pay");
  expect(view.textContent).not.toContain("Google Pay");
  expect(view.textContent).not.toContain("Link");
});
