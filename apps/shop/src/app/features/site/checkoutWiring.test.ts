// SOURCE-TEXT tests: Checkout.tsx is too heavy to render in vitest (Stripe, Firebase, router), so
// these pin that the page actually uses the pure, separately-tested helpers. Each note names the
// behaviour the helper tests prove.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(__dirname, "..", "..", "Checkout.tsx"), "utf8");
// The form fields (text boxes, address box with suggestions, field errors) live in CheckoutFields.tsx.
const fields = readFileSync(join(__dirname, "CheckoutFields.tsx"), "utf8");
const currency = readFileSync(join(__dirname, "..", "..", "CurrencyContext.tsx"), "utf8");
const country = readFileSync(join(__dirname, "CountryField.tsx"), "utf8");
// Checkout.tsx draws its three steps with these (display only; the state and checks stay in Checkout.tsx).
const address = readFileSync(join(__dirname, "CheckoutAddressStep.tsx"), "utf8");
const delivery = readFileSync(join(__dirname, "CheckoutDeliveryStep.tsx"), "utf8");
const payment = readFileSync(join(__dirname, "CheckoutPaymentStep.tsx"), "utf8");
const summary = readFileSync(join(__dirname, "CheckoutOrderSummary.tsx"), "utf8");
const page = src + address + delivery + payment + summary;

describe("Checkout wiring (source text)", () => {
  it("#74 never calls an IP-geolocation service or sends the street to a third party on load", () => {
    expect(page + fields).not.toMatch(/ipapi|ip-api|ipinfo|geojs|ipgeolocation/i);
    expect(page + fields).not.toMatch(/fetch\(\s*["'`]https?:/);
  });

  it("#76 the street box uses address-line1, never street-address", () => {
    expect(page + fields).not.toContain('autoComplete="street-address"');
    expect(((page + fields).match(/autoComplete="address-line1"/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it("#24 the form is a real <form noValidate> with a submit button and per-field errors", () => {
    expect(src).toMatch(/<form noValidate onSubmit=/);
    expect(payment).toMatch(/type="submit"/);
    expect(src).toContain("checkoutDetailProblems(");
    expect(fields).toContain("aria-invalid={error ? true : undefined}");
    expect(src).toMatch(/document\.getElementById\(detailInputId\(first\)\)\?\.focus\(\)/);
  });

  it("#22 the old every-field-required destination rule is gone", () => {
    expect(src).not.toContain("[customer.address.street, customer.address.city, customer.address.state, customer.address.zip, customer.address.country].every");
  });

  it("#75 the express wallet is gated on the details check", () => {
    expect(src).toMatch(/expressEnabled=\{expressWalletEnabled\(/);
  });

  it("#77 the fulfilment heading is hidden for e-book-only bags", () => {
    expect(src).toMatch(/\{!digitalOnly && \(\s*<CheckoutDeliveryStep /);
    expect(delivery).toMatch(/return \(\s*<section className="fm-co-section">\s*<SectionHead [^>]*title=\{c\("coDelivery"\)\}/);
  });

  it("#23 a page restored from the back/forward cache unlocks Pay", () => {
    expect(src).toMatch(/onPageRestored\(window, \(\) => \{[^}]*purchaseNavigating\.current = false;[^}]*submitPurchase\.current\.reset\(\);[^}]*dispatchFlow\(\{ type: "restored" \}\)/s);
  });

  it("#84 live rates ignore stale answers and time out", () => {
    expect(src).toContain("ratesGuard.current.isCurrent(ticket)");
    expect(src).toContain("signal: request.signal");
  });

  it("#21 the retry key includes the order note", () => {
    expect(src).toMatch(/cardAttemptKey\(\{[^}]*orderNote:/);
  });

  it("#45 the bag warns before Pay about copies over the hold cap", () => {
    expect(payment).toContain('regionProps("checkoutHoldWarning")');
    expect(src).toContain("holdWarnings(cart, booksMap, holdLimitsFrom(settings))");
  });

  it("the packed & tracked note under the total is a Studio region (show/hide + click-to-edit)", () => {
    expect(summary).toContain('regionProps("checkoutReassurance")');
  });

  it("#79 the country list and address list wire combobox ARIA", () => {
    expect(country).toContain("comboboxInputProps(");
    expect(country).toContain("id={optionId(listId, i)}");
    expect(fields).toContain("comboboxInputProps(");
    expect(fields).toContain("id={optionId(listId, i)}");
  });

  it("#88 the browser rates come from the timed, cached loader", () => {
    expect(currency).toContain("loadRates()");
    expect(currency).not.toContain("await fetch(");
  });
});
