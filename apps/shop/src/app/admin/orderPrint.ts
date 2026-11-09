import { buildPickList, itemsToPack } from "./fulfillment";
import { lineDetails } from "./orderLines";
const escape = (v: any) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
// Add-ons (sign / inscribe / wrap) and the books inside a box set print under their line, in bold
// enough to notice: the packer has to act on them.
const details = (i: any, o?: any) => {
 const tally = Object.entries(i.addOnCounts || {}).map(([label, n]) => `Add-on: ${label} × ${n}`);
 const lines = [...lineDetails(i, o), ...tally];
 return lines.length ? `<ul class="extras">${lines.map(l => `<li>${escape(l)}</li>`).join("")}</ul>` : "";
};
const rows = (items: any[], o?: any) => items.map(i => `<tr><td>${escape(i.title)}${i.variantName ? ` — ${escape(i.variantName)}` : ""}${i.sku ? `<br><small>${escape(i.sku)}</small>` : ""}${details(i, o)}</td><td>${escape(i.quantity)}</td><td>&#9633;</td></tr>`).join("");

/** Who the parcel is from, printed on every packing slip (Settings › General › Location). */
/** `goods`: the shop sells something other than books (shopSells.ts), so the item column and the pick list use its words. */
export type SlipShop = { name?: string; location?: any; thanks?: string; goods?: boolean };
const itemHeading = (shop: SlipShop) => (shop.goods ? "Item / option" : "Book / edition");
export const shopAddressLines = (location: any): string[] => {
 const l = location || {};
 return [[l.street, l.unit].filter(Boolean).join(", "), [l.city, [l.state, l.zip].filter(Boolean).join(" ")].filter(Boolean).join(", "), l.country]
  .map(v => String(v || "").trim()).filter(Boolean);
};

/**
 * Items the customer added after paying (code plan 24.6): orders with `shipsWith` = this order. Paid ones print under their
 * own heading so they go in the same parcel; unpaid ones print a line saying not to pack them yet.
 */
function addedHtml(added: any[], shop: SlipShop = {}): string {
 const paid = added.filter(a => a?.paymentStatus === "paid");
 const waiting = added.filter(a => a && a.paymentStatus !== "paid" && a.status !== "cancelled");
 return paid.map(a => `<h3>Added later (${escape(a.orderId || a.id)}), pack in this parcel</h3><table><thead><tr><th>${itemHeading(shop)}</th><th>Quantity</th><th>Packed</th></tr></thead><tbody>${rows(itemsToPack(a), a)}</tbody></table>`).join("")
  + (waiting.length ? `<p class="note">${waiting.length === 1 ? "One more order of added items is" : `${waiting.length} more orders of added items are`} waiting for payment. Don't pack ${waiting.length === 1 ? "it" : "them"} yet.</p>` : "");
}

/** One packing slip's HTML (pure, tested). `added`: orders of items added to it later (code plan 24.6). */
export function packingSlipHtml(o: any, shop: SlipShop = {}, added: any[] = []): string {
 const a = o.customer?.address || {};
 const from = [shop.name, ...shopAddressLines(shop.location)].filter(Boolean);
 const fromBlock = from.length ? `<div class="from"><strong>${escape(from[0])}</strong>${from.slice(1).map(l => `<br>${escape(l)}`).join("")}${shopAddressLines(shop.location).length ? "<br><small>Return address</small>" : ""}</div>` : "";
 const thanks = shop.thanks === undefined ? `Thank you for your order${shop.name ? ` from ${shop.name}` : ""}!` : shop.thanks;
 return `<section>${fromBlock}<h1>Packing slip</h1><h2>${escape(o.orderId || o.id)}</h2><p>${escape(o.customer?.name)}<br>${escape([a.street, a.unit].filter(Boolean).join(", "))}<br>${escape(a.city)}, ${escape(a.state)} ${escape(a.zip)}<br>${escape(a.country)}</p>${(() => {
  const items = itemsToPack(o);
  return `<table><thead><tr><th>${itemHeading(shop)}</th><th>Quantity</th><th>Packed</th></tr></thead><tbody>${rows(items, o)}</tbody></table>${addedHtml(added, shop)}`;
 })()}${o.orderNote ? `<div class="note"><strong>Note / gift message from the customer</strong><p>${escape(o.orderNote)}</p></div>` : ""}${thanks ? `<p class="thanks">${escape(thanks)}</p>` : ""}</section>`;
}

export function printOrders(orders: any[], pickList = false, shop: SlipShop = {}, added: Record<string, any[]> = {}) {
 const table = (items: any[], o?: any) => `<table><thead><tr><th>${itemHeading(shop)}</th><th>Quantity</th><th>Packed</th></tr></thead><tbody>${rows(items, o)}</tbody></table>`;
 const body = pickList ? `<section><h1>${shop.goods ? "Pick list" : "Publisher pick list"}</h1><p>${orders.length} orders</p>${table(buildPickList(orders))}<p>Orders: ${orders.map(o => escape(o.orderId || o.id)).join(", ")}</p></section>` : orders.map(o => packingSlipHtml(o, shop, added[o.id] || [])).join("");
 const frame = document.createElement("iframe");
 frame.title = "Packing documents"; frame.style.cssText = "position:fixed;width:1px;height:1px;left:-9999px";
 frame.onload = () => { frame.contentWindow?.addEventListener("afterprint", () => frame.remove(), { once: true }); frame.contentWindow?.focus(); frame.contentWindow?.print(); };
 frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>Packing documents</title><style>body{font:16px Arial;margin:30px;color:#000}table{width:100%;border-collapse:collapse}td,th{padding:12px;text-align:left;border-bottom:1px solid #aaa}.extras{margin:6px 0 0;padding-left:18px;font-weight:bold}.from{float:right;text-align:right;font-size:14px}.note{margin-top:20px;padding:12px;border:1px solid #000;white-space:pre-wrap}.thanks{margin-top:24px;font-style:italic}section{break-after:page}section:last-child{break-after:auto}</style></head><body>${body}</body></html>`;
 document.body.appendChild(frame);
}
