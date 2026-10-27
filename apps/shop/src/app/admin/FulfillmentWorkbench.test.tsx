import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { FulfillmentWorkbench } from "./FulfillmentWorkbench";
import { addressKey, packingKey } from "./fulfillment";
const base = () => ({
  paymentStatus: "paid",
  status: "open",
  customer: {
    name: "Reader",
    address: {
      street: "1 Main",
      city: "Toronto",
      state: "ON",
      zip: "M6G3H1",
      country: "Canada",
    },
  },
  items: [{ id: "book", title: "Book", quantity: 2 }],
  operations: {} as any,
});
const render = (o: any, checked = new Set<number>()) =>
  renderToStaticMarkup(
    <FulfillmentWorkbench
      order={o}
      checked={checked}
      busy={false}
      onCheck={() => {}}
      onReview={() => {}}
      onCorrect={() => {}}
      onPack={() => {}}
      onLabel={() => {}}
      onDispatch={() => {}}
      onLocalAdvance={() => {}}
      onRelease={() => {}}
    />,
  );
describe("stuck label purchase", () => {
  it("offers the owner a way to allow a new label after checking Shippo", () => {
    const o = base();
    o.operations = { addressReviewed: addressKey(o), packed: packingKey(o), labelPurchasePending: true };
    const html = renderToStaticMarkup(
      <FulfillmentWorkbench order={o} checked={new Set()} busy={false} onCheck={() => {}} onReview={() => {}} onCorrect={() => {}}
        onPack={() => {}} onLabel={() => {}} onDispatch={() => {}} onLocalAdvance={() => {}} onRelease={() => {}} onClearLabelLock={() => {}} />,
    );
    expect(html).toContain("A label purchase needs checking");
    expect(html).toContain("I&#x27;ve checked Shippo — allow a new label");
    expect(html).not.toContain("Buy Shippo label");
  });
});
describe("focused publisher workflow", () => {
  it("starts at the address with no premature shipping actions", () => {
    const html = render(base());
    expect(html).toContain("Confirm address");
    expect(html).not.toContain("Buy Shippo label");
    expect(html).not.toContain("Preset name");
    expect(html).not.toContain("Refund");
  });
  it("makes packing the only primary action after review", () => {
    const o = base();
    o.operations.addressReviewed = addressKey(o);
    const html = render(o);
    expect(html).toContain("Confirm packed");
    expect(html).not.toContain("Confirm address</button>");
    expect(html).not.toContain("Buy Shippo label");
    expect(html.match(/rp-btn-primary/g)).toHaveLength(1);
  });
  it("shows one label action and a secondary manual-carrier path", () => {
    const o = base();
    o.operations = { addressReviewed: addressKey(o), packed: packingKey(o) };
    const html = render(o);
    expect(html.match(/Buy Shippo label/g)).toHaveLength(1);
    expect(html).toContain("Enter tracking &amp; mark shipped");
  });
  it("shows the service the customer chose at checkout", () => {
    const o: any = base();
    o.operations = { addressReviewed: addressKey(o), packed: packingKey(o) };
    o.shippingMethod = "Canada Post Expedited Parcel"; o.shipping = 14.5;
    const html = render(o);
    expect(html).toContain("Canada Post Expedited Parcel");
    expect(html).toContain("paid CA$14.50");
  });
  it("offers dispatch rather than another label purchase after purchase", () => {
    const o: any = base();
    o.operations = { addressReviewed: addressKey(o), packed: packingKey(o) };
    o.labelUrl = "https://example.com/label";
    const html = render(o);
    expect(html).toContain("Parcel handed over");
    expect(html).not.toContain("Buy Shippo label");
  });
  it("does not show address blockers or shipping prompts on cancelled orders", () => {
    const o = { ...base(), status: "cancelled", customer: {} };
    const html = render(o);
    expect(html).not.toContain("Confirm address");
    expect(html).not.toContain("Parcel handed over");
  });
});

it("keeps purchased labels accessible on held and dispatched orders", () => {
  const reviewed = base();
  reviewed.operations = {
    addressReviewed: addressKey(reviewed),
    packed: packingKey(reviewed),
  };
  for (const patch of [
    { operations: { ...reviewed.operations, hold: "Await reply" } },
    { status: "completed", fulfillmentStatus: "shipped" },
    { status: "completed", fulfillmentStatus: "delivered" },
    { paymentStatus: "refunded" },
  ]) {
    expect(
      render({ ...reviewed, labelUrl: "https://example.com/label", ...patch }),
    ).toContain("Reprint label");
  }
});

it("shows pickup readiness without requiring or exposing shipping actions", () => {
  const o: any = base();
  o.customer.address = {};
  o.fulfillmentSelection = { method: "pickup", optionId: "pickup:main" };
  o.fulfillment = { name: "Main Street", address: { street: "5 Main", city: "Toronto", state: "ON" }, instructions: "Ring the bell" };
  o.operations = { packed: packingKey(o) };
  const html = render(o);
  expect(html).toContain("Mark ready for pickup");
  expect(html).toContain("5 Main, Toronto, ON");
  expect(html).toContain("Ring the bell");
  expect(html).not.toContain("Confirm address");
  expect(html).not.toContain("Buy Shippo label");
});

it("allows the final local delivery transition after the driver departs", () => {
  const o: any = base();
  o.fulfillmentSelection = { method: "local_delivery", optionId: "delivery:west" };
  o.fulfillmentStatus = "out_for_delivery";
  o.operations = { addressReviewed: addressKey(o), packed: packingKey(o) };
  const html = render(o);
  expect(html).toContain("Confirm delivered");
  expect(html).not.toContain("Buy Shippo label");
  expect(html).not.toContain("Enter tracking &amp; mark shipped");
});

describe("special order lines on the packing checklist", () => {
  it("shows add-ons with inscription wording, box-set contents, gift cards and the free gift", () => {
    const o = base();
    o.operations.addressReviewed = addressKey(o);
    o.items = [
      { id: "book", title: "Book", quantity: 1, addOns: [{ id: "sig", label: "Signed copy", price: 5 }, { id: "ins", label: "Personal inscription", price: 10, text: "For Sam" }] } as any,
      { id: "box", title: "Trilogy", quantity: 1, bundle: true, components: [{ id: "a", quantity: 2, title: "Title A" }, { id: "b", quantity: 1, title: "Title B", variantName: "Hardcover" }] } as any,
      { id: "gc", title: "Gift card", quantity: 1, giftCard: true, giftCardDetails: { recipientEmail: "sam@x.com" } } as any,
      { id: "gift", title: "Bookmark", quantity: 1, promoGift: true } as any,
    ];
    const html = render(o);
    expect(html).toContain("Signed copy");
    expect(html).toContain("Personal inscription: “For Sam”");
    expect(html).toContain("Box set — includes 2 × Title A, 1 × Title B (Hardcover)");
    expect(html).toContain("Gift card for sam@x.com");
    expect(html).toContain("Free gift");
    // The gift card is emailed: no packing checkbox for it.
    expect(html).not.toContain("Packed 1 × Gift card");
  });
});

describe("ship station steps", () => {
  it("shows where the order is in three steps", () => {
    const o = base();
    o.operations = { addressReviewed: addressKey(o) };
    const html = render(o);
    expect(html).toContain("Address checked");
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("Step 2 · now");
    expect(html).toContain("2 books");
  });
  it("draws the label step inside step 3 instead of the Buy Shippo label button", () => {
    const o = base();
    o.operations = { addressReviewed: addressKey(o), packed: packingKey(o) };
    const html = renderToStaticMarkup(
      <FulfillmentWorkbench order={o} checked={new Set()} busy={false} onCheck={() => {}} onReview={() => {}} onCorrect={() => {}} onPack={() => {}}
        onDispatch={() => {}} onLocalAdvance={() => {}} onRelease={() => {}} labelStep={<div>inline label step</div>} />,
    );
    expect(html).toContain("inline label step");
    expect(html).not.toContain("Buy Shippo label");
    expect(html).toContain("Step 3 · now");
  });
});

