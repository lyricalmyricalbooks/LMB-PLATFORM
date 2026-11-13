import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BulkSaleDialog } from "./BulkSaleDialog";

describe("Put on sale window", () => {
  it("starts at 20% off from today and previews the new price", () => {
    const html = renderToStaticMarkup(
      <BulkSaleDialog books={[{ id: "a", title: "Zine", retailPrice: 20 }, { id: "g", title: "Card", productType: "giftCard" }]}
        onClose={() => {}} onSave={async () => {}} />,
    );
    expect(html).toContain("Put on sale");
    expect(html).toContain("Zine: $20.00 → $16.00");
    expect(html).toContain("Put 1 on sale");
    expect(html).toContain("Left out: Card (gift card)");
  });
});
