// @vitest-environment jsdom
// Checkout's delivery step: choosing local pickup asks for the billing province (it sets the tax on a pickup order,
// because there is no shipping address), and the shopper's pick reaches checkout's details. A pickup location that
// needs the shopper's own address asks for the full address instead, so the province box stays hidden.
import { act, createElement as h, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { CheckoutDeliveryStep } from "./CheckoutDeliveryStep";
import type { CheckoutCustomer } from "./CheckoutAddressStep";
import type { FulfillmentSelection } from "./FulfillmentMethodPicker";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const pickupQuote = { id: "pickup-studio", method: "pickup" as const, name: "Studio pickup", price: 0, instructions: "", estimate: "",
  address: { street: "1 Queen St", city: "Toronto", state: "ON", zip: "M5H 2N2", country: "Canada" } };
const blank: CheckoutCustomer = { name: "", email: "", phone: "",
  address: { street: "", unit: "", city: "", state: "", zip: "", country: "Canada" }, billingAddress: { state: "", country: "Canada" } };

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; });

function show(pickupNeedsAddress: boolean) {
  const seen: { customer: CheckoutCustomer } = { customer: blank };
  function Harness() {
    const [customer, setCustomer] = useState(blank);
    const [selection, setSelection] = useState<FulfillmentSelection>({ method: "shipping", optionId: "" });
    seen.customer = customer;
    return h(CheckoutDeliveryStep, {
      c: (key: string) => key, mark: () => null, checkoutDesign: {}, physicalItems: [{}],
      fulfillmentSelection: selection, selectFulfillment: setSelection,
      availableRates: [{ id: "post", name: "Canada Post", price: 12 }], localQuotes: [pickupQuote], availableFulfillmentMethods: ["shipping", "pickup"],
      shippoRatesLoading: false, formatPrice: (n: number) => `$${n.toFixed(2)}`, pickupNeedsAddress, labelsAbove: true, pinnedCountryCodes: [],
      customer, setCustomer, selectedLocalQuote: selection.method === "pickup" ? pickupQuote : undefined,
    });
  }
  const el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  act(() => root!.render(h(Harness)));
  const pickPickup = () => act(() => (el.querySelector("input[value='pickup-studio']") as HTMLInputElement).click());
  return { el, seen, pickPickup };
}

it("asks a pickup order for its billing province and keeps the pick", () => {
  const { el, seen, pickPickup } = show(false);
  expect(el.textContent).not.toContain("coBillingTitle");
  pickPickup();
  expect(el.textContent).toContain("coBillingTitle");
  expect(el.textContent).toContain("coFulfillmentTaxLocation Toronto, ON");
  const province = el.querySelector("select") as HTMLSelectElement;
  expect(province.required).toBe(true);
  act(() => { province.value = "QC"; province.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(seen.customer.billingAddress).toEqual({ state: "QC", country: "Canada" });
  expect(seen.customer.address).toEqual(blank.address);
});

it("leaves the province box out when the pickup location needs the shopper's address", () => {
  const { el, pickPickup } = show(true);
  pickPickup();
  expect(el.textContent).not.toContain("coBillingTitle");
});
