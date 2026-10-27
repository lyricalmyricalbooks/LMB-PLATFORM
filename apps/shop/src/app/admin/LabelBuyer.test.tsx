import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { LabelBuyer } from "./LabelBuyer";

const parcel = { length: "10", width: "8", height: "2", weight: "640", distance_unit: "in", mass_unit: "g" };
const render = (extra: any = {}) => renderToStaticMarkup(
  <LabelBuyer
    order={{ shippingMethod: "Canada Post Expedited Parcel", shipping: 14 }}
    parcel={parcel}
    onParcel={() => {}}
    presets={[{ name: "Book mailer", parcel: { length: "10", width: "8", height: "2" } }, { name: "Small box", parcel: { length: "12", width: "9", height: "4" } }]}
    onPreset={() => {}}
    suggestedWeight={640}
    rates={[]}
    searched={false}
    selectedRate=""
    onSelectRate={() => {}}
    finding={false}
    buying={false}
    busy={false}
    problem=""
    onFindRates={() => {}}
    onBuy={() => {}}
    onDispatch={() => {}}
    onSavePreset={async () => true}
    {...extra}
  />,
);

describe("LabelBuyer (ship station step 3)", () => {
  it("starts with the parcel: saved sizes as chips, the matching one pressed", () => {
    const html = render();
    expect(html).toMatch(/aria-pressed="true"[^>]*>Book mailer/);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Small box/);
    expect(html).toContain("Find label rates");
    expect(html).toContain("Ship without a label");
    expect(html).not.toContain("Buy label");
  });

  it("shows the rates with the customer's service, and the price on the Buy button", () => {
    const rates = [
      { id: "r1", name: "Regular Parcel", carrier: "Canada Post", amount: 12.4, currency: "CAD", estimatedDays: 4 },
      { id: "r2", name: "Expedited Parcel", carrier: "Canada Post", amount: 13.86, currency: "CAD", estimatedDays: 2 },
    ];
    const html = render({ rates, searched: true, selectedRate: "r2" });
    expect(html).toContain("Customer chose");
    expect(html).toContain("Cheapest");
    expect(html).toContain("Buy label · $13.86");
    expect(html).toContain("The customer is emailed only when you mark the parcel shipped");
  });

  it("never offers a purchase while the order can't ship or no rate is picked", () => {
    const rates = [{ id: "r1", name: "Regular Parcel", amount: 12.4, currency: "CAD" }];
    expect(render({ rates, searched: true, selectedRate: "" })).toMatch(/<button[^>]*disabled=""[^>]*>Choose a rate/);
    expect(render({ rates, searched: true, selectedRate: "r1", problem: "Open dispute" })).toMatch(/<button[^>]*disabled=""[^>]*>Buy label/);
    expect(render({ searched: true })).toContain("No label rates came back");
  });
});
