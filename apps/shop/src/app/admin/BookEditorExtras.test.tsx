import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AddOnsEditor, BoxSetEditor, ProductTypeCard, SaleWindowFields } from "./BookEditorExtras";

const noop = () => {};

describe("book editor extras", () => {
  it("explains blank sale dates and flags an end before the start", () => {
    const html = renderToStaticMarkup(<SaleWindowFields form={{ isOnSale: true, salePrice: 10, saleStartsAt: "2026-12-10", saleEndsAt: "2026-12-01" }} set={noop} />);
    expect(html).toContain("Sale starts");
    expect(html).toContain("Leave blank to start now.");
    expect(html).toContain("end date must be on or after");
    expect(renderToStaticMarkup(<SaleWindowFields form={{ isOnSale: true, salePrice: 10 }} set={noop} />)).toContain("Leave blank to never end.");
    expect(html).toContain("Scheduled");
  });
  it("offers the three quick-add presets", () => {
    const html = renderToStaticMarkup(<AddOnsEditor form={{ addOns: [] }} set={noop} />);
    for (const label of ["Signed copy", "Personal inscription", "Gift wrap"]) expect(html).toContain(label);
  });
  it("shows how many sets the books' stock allows", () => {
    const catalog = [{ id: "a", title: "Title A", status: "published", trackInventory: true, stockLevel: 5 }, { id: "b", title: "Title B", status: "published", trackInventory: true, stockLevel: 9 }];
    const html = renderToStaticMarkup(<BoxSetEditor form={{ bundleItems: [{ bookId: "a", quantity: 2 }, { bookId: "b", quantity: 1 }] }} set={noop} bookId="box" catalog={catalog} catalogError={false} on onToggle={noop} />);
    expect(html).toContain("Sets available from current stock: 2");
    expect(html).toContain("This product is a box set of other books");
  });
  it("describes gift-card amounts", () => {
    const html = renderToStaticMarkup(<ProductTypeCard form={{ productType: "giftCard" }} onChange={noop} />);
    expect(html).toContain("Each edition is an amount, e.g. CA$25");
  });
});
