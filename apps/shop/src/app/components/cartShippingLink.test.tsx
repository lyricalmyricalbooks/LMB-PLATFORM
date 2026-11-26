// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { CartShippingPreview } from "./CartShippingPreview";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const cart = [{ id: "a", quantity: 1 }];
const price = (n: number) => `$${n}`;
function draw(design: any) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<CartShippingPreview cart={cart} design={design} formatPrice={price} onEstimate={() => {}} />));
  return { host, root };
}

// Plan "Starters on par", step 5: a calmer bag shows the shipping estimate behind one link.
describe("shipping estimate behind a link", () => {
  beforeEach(() => { document.body.replaceChildren(); sessionStorage.clear(); });

  it("shows the form straight away by default", () => {
    const { host } = draw({});
    expect(host.querySelector("form")).not.toBeNull();
  });

  it("shows one link first, opens the form on a click and moves to the country box", () => {
    const { host } = draw({ cartDrawerShippingPreviewLayout: "link" });
    expect(host.querySelector("form")).toBeNull();
    const link = host.querySelector("button")!;
    expect(link.textContent).toBe("Estimate shipping");
    expect(link.getAttribute("aria-expanded")).toBe("false");
    act(() => link.click());
    expect(host.querySelector("form")).not.toBeNull();
    expect(document.activeElement?.tagName).toBe("SELECT");
  });

  it("follows Studio live: switching back to open shows the form without a reload", () => {
    const { host, root } = draw({ cartDrawerShippingPreviewLayout: "link" });
    act(() => root.render(<CartShippingPreview cart={cart} design={{}} formatPrice={price} onEstimate={() => {}} />));
    expect(host.querySelector("form")).not.toBeNull();
  });

  it("opens straight away for a shopper who already estimated", () => {
    sessionStorage.setItem("lm-cart-destination-v1", JSON.stringify({ country: "Canada", postalCode: "A1A 1A1" }));
    const { host } = draw({ cartDrawerShippingPreviewLayout: "link" });
    expect(host.querySelector("form")).not.toBeNull();
  });
});
