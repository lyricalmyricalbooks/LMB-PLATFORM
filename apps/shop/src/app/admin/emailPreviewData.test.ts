import { describe, expect, it } from "vitest";
import { orderPreviewVars, previewItemsTable } from "./emailPreviewData";
import { fillSample, problemTemplates } from "./emailTemplateChecks";
import { RISO_THEMES } from "./emailTheme";

describe("preview with a real order", () => {
  const order = { id: "x1", orderId: "LM-1", customer: { name: "Ada <b>", email: "a@b.co" }, total: 12.5, subtotal: 10, shipping: 2.5, items: [{ title: "Book <i>", quantity: 2, price: 5 }] };

  it("fills placeholders from the order and keeps samples for missing details", () => {
    const vars = orderPreviewVars(order);
    expect(fillSample("order_confirmation", "{{customer_name}} {{order_id}} {{total_price}}", vars)).toBe("Ada <b> LM-1 CA$12.50");
    expect(fillSample("shipping_confirmation", "{{tracking_carrier}}", vars)).toBe("Canada Post");
  });

  it("draws the table in the dark theme and escapes titles", () => {
    const html = previewItemsTable(order, "dark");
    expect(html).toContain(RISO_THEMES.dark.text);
    expect(html).not.toContain("#eeeeee");
    expect(html).toContain("Book &lt;i&gt; (x2)");
    expect(html).toContain("CA$10.00");
  });
});

describe("problems across every template", () => {
  it("lists only templates with a problem", () => {
    const out = problemTemplates({
      order_confirmation: { subject: "", body: "x", buttonText: "", signoff: "" },
      order_refunded: { subject: "s", body: "b", buttonText: "", signoff: "" },
    });
    expect(Object.keys(out)).toEqual(["order_confirmation"]);
  });
});
