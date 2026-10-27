// Settings › Notifications › Live preview › "Preview with a real order" (pure, tested).
// Turns a recent order into the placeholder values the server would send, and draws the
// order table in the chosen email theme (light newsprint / dark Riso Noir).
import { risoPalette } from "./emailTheme";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function money(value: unknown, currency = "CAD"): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  const prefix = currency.toUpperCase() === "CAD" ? "CA$" : currency.toUpperCase() === "USD" ? "US$" : currency.toUpperCase() === "EUR" ? "€" : `${currency.toUpperCase()} `;
  return `${prefix}${n.toFixed(2)}`;
}

/** Placeholder values from a real order. Missing details stay out, so the sample value shows. */
export function orderPreviewVars(order: any): Record<string, string> {
  if (!order) return {};
  const currency = String(order.expectedCurrency || order.currency || "CAD");
  const out: Record<string, string> = {};
  const put = (key: string, value: unknown) => { const text = String(value ?? "").trim(); if (text) out[key] = text; };
  put("customer_name", order.customer?.name);
  put("email", order.customer?.email);
  put("order_id", order.orderId || order.id);
  put("total_price", money(order.total, currency));
  put("payment_method", order.paymentMethod);
  put("shipping_method", order.shippingMethod);
  put("tracking_carrier", order.trackingCarrier);
  put("tracking_number", order.trackingNumber);
  put("status", order.fulfillmentStatus);
  return out;
}

/** The order table as the preview shows it, coloured from the email theme palette. */
export function previewItemsTable(order: any, theme?: string): string {
  const p = risoPalette(theme);
  const currency = String(order?.expectedCurrency || order?.currency || "CAD");
  const items: any[] = order?.items?.length ? order.items : [{ title: "Visions of Toronto - Limited Edition", quantity: 1, price: 35 }];
  const subtotal = order ? order.subtotal : 35;
  const shipping = order ? order.shipping : 10;
  const total = order ? order.total : 45;
  const row = (label: string, value: string, strong = false) =>
    `<tr${strong ? ` style="font-size:15px;font-weight:bold;border-top:1px solid ${p.rule};"` : ""}><td style="padding:${strong ? 15 : 8}px 0;color:${strong ? p.text : p.muted};">${label}</td><td style="padding:${strong ? 15 : 8}px 0;text-align:right;font-family:monospace;color:${p.text};">${value}</td></tr>`;
  return `<div style="margin:30px 0;border-top:1px solid ${p.hair};padding-top:20px;">`
    + `<h4 style="margin-top:0;">Order Details</h4>`
    + `<table style="width:100%;border-collapse:collapse;font-size:13px;color:${p.text};">`
    + items.map((i) => `<tr style="border-bottom:1px solid ${p.hair};"><td style="padding:10px 0;font-weight:bold;color:${p.text};">${esc(i.title || i.name || "Book")}${i.variantName ? ` (${esc(i.variantName)})` : ""} (x${Number(i.quantity) || 1})</td><td style="padding:10px 0;text-align:right;font-family:monospace;color:${p.text};">${money((Number(i.price) || 0) * (Number(i.quantity) || 1), currency)}</td></tr>`).join("")
    + row("Subtotal", money(subtotal, currency))
    + row("Shipping", money(shipping, currency))
    + row("Total", money(total, currency), true)
    + `</table></div>`;
}
