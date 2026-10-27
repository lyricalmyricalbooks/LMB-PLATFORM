// @vitest-environment jsdom
// Footer currency picker (Studio › Style › Footer & social links › showFooterCurrency): off by default; when on it
// shows the Text & labels words and switches the shop's currency like the header picker.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { CurrencyProvider, useCurrency } from "../../../../CurrencyContext";
import { FooterCurrency, footerCurrencyOn } from "./FooterCurrency";

vi.mock("../../exchangeRates", async (orig) => ({ ...(await orig<any>()), loadRates: () => new Promise(() => {}) }));
vi.mock("../../visitorCurrency", async (orig) => ({ ...(await orig<any>()), loadVisitorCountry: () => new Promise(() => {}) }));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null; let el: HTMLElement | null = null;
let seen = "";
function Probe() { seen = useCurrency().currency; return null; }
afterEach(async () => { await act(async () => root?.unmount()); el?.remove(); try { localStorage.clear(); } catch { /* none */ } });

it("is off unless switched on", () => {
  expect(footerCurrencyOn({})).toBe(false);
  expect(footerCurrencyOn({ showFooterCurrency: true })).toBe(true);
});

it("uses the Text & labels words and changes the currency", async () => {
  el = document.createElement("div"); document.body.appendChild(el);
  root = createRoot(el);
  const design = { showFooterCurrency: true, copy: { footerCurrencyLabel: "Prices in", footerCurrencyEUR: "Euro" } };
  await act(async () => root!.render(h(CurrencyProvider, null, h(FooterCurrency, { design }), h(Probe))));
  expect(el.textContent).toContain("Prices in");
  const select = el.querySelector("select")!;
  expect([...select.options].map((o) => o.value)).toEqual(["CAD", "USD", "EUR"]);
  expect(select.options[2].textContent).toBe("Euro");
  await act(async () => { select.value = "EUR"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(seen).toBe("EUR");
});
