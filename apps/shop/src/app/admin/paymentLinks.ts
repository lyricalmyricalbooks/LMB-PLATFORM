// Payment links (code plan 21.1, 21.2): the owner makes an order for a customer at prices they set, and sends a link the
// customer pays from. The server makes the order and keeps the agreed prices (functions/paymentLinks.js); this file
// holds the admin's side: the form's rows, the request, and what the order page shows about the link.
import { catalogUnitPrice } from "../CartContext";
import { isGiftCardProduct } from "../features/site/promotions";
import { customerTrackUrl } from "./orderLines";
import { fulfillmentMethod, queueOf } from "./fulfillment";

export type LinkRow = { key: string; bookId: string; variantId: string; quantity: string; price: string };
export type LinkForm = {
  name: string; email: string; phone: string;
  street: string; unit: string; city: string; state: string; zip: string; country: string;
  ship: boolean; shipping: string; note: string; days: string;
  rows: LinkRow[];
};

export const LINK_DAYS = [7, 14, 30, 60, 90];
let rowCount = 0;
export const newRow = (): LinkRow => ({ key: `row-${++rowCount}`, bookId: "", variantId: "", quantity: "1", price: "" });
export const emptyLinkForm = (country = "CA"): LinkForm => ({
  name: "", email: "", phone: "", street: "", unit: "", city: "", state: "", zip: "", country,
  ship: true, shipping: "", note: "", days: "30", rows: [newRow()],
});

/** Products a link can sell: anything but gift cards (their recipient form belongs to checkout). */
export const linkableBooks = (books: any[]) => (books || []).filter(book => book && !isGiftCardProduct(book));

/** The shop's price today for a row's product and edition, or null when it has none (or the edition is missing). */
export function shopPriceOf(book: any, variantId: string): number | null {
  if (!book) return null;
  const variants = Array.isArray(book.variants) ? book.variants : [];
  if (variants.length && !variantId) return null;
  const variant = variantId ? variants.find((v: any) => v.id === variantId) : undefined;
  if (variantId && !variant) return null;
  const price = catalogUnitPrice(book, variant);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

const money = (value: string) => {
  const text = value.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};

/** Every problem with the form, by field (row fields as `row-<key>`), in the owner's words. Empty = ready to send. */
export function linkFormProblems(form: LinkForm, books: any[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!form.name.trim()) out.name = "Add the customer's name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) out.email = "Check the customer's email address.";
  if (!form.country.trim()) out.country = "Add the country.";
  if (!form.state.trim()) out.state = "Add the province or state (tax depends on it).";
  if (form.ship) {
    const shipping = money(form.shipping);
    if (shipping === null || !(shipping >= 0 && shipping <= 10000)) out.shipping = "Enter what shipping costs, 0 for free.";
    if (!form.street.trim()) out.street = "Add the street address.";
    if (!form.city.trim()) out.city = "Add the city.";
    if (!form.zip.trim()) out.zip = "Add the postal code.";
  }
  const byId = new Map((books || []).map(book => [book.id, book]));
  const seen = new Set<string>();
  const used = form.rows.filter(row => row.bookId);
  if (!used.length) out.rows = "Add at least one product.";
  for (const row of used) {
    const book = byId.get(row.bookId);
    const quantity = Number(row.quantity);
    const price = money(row.price);
    const same = `${row.bookId}::${row.variantId}`;
    if (!book) out[`row-${row.key}`] = "This product can't be found any more.";
    else if (Array.isArray(book.variants) && book.variants.length && !row.variantId) out[`row-${row.key}`] = "Choose an edition.";
    else if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) out[`row-${row.key}`] = "Quantity is a whole number from 1 to 99.";
    else if (Number.isNaN(price) || (price !== null && !(price >= 0 && price <= 100000))) out[`row-${row.key}`] = "Enter a price, or leave it blank for the shop's price.";
    else if (seen.has(same)) out[`row-${row.key}`] = "This product is already on another line.";
    seen.add(same);
  }
  const days = Number(form.days);
  if (!LINK_DAYS.includes(days)) out.days = "Choose how long the link stays open.";
  return out;
}

/** What the server is sent (createStripeCheckoutSession `action: "paymentLink"`, `op: "create"`). Check the form first. */
export function linkRequest(form: LinkForm, shipsWith = "") {
  return {
    ...(shipsWith ? { shipsWith } : {}),
    customer: {
      name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(),
      address: { street: form.street.trim(), unit: form.unit.trim(), city: form.city.trim(), state: form.state.trim(), zip: form.zip.trim(), country: form.country.trim() },
    },
    lines: form.rows.filter(row => row.bookId).map(row => ({ id: row.bookId, variantId: row.variantId || null, quantity: Number(row.quantity), price: money(row.price) })),
    shipping: form.ship ? money(form.shipping) : null,
    note: form.note.trim(),
    days: Number(form.days),
  };
}

/** The order's products and shipping before tax, as the form stands (blank prices at the shop's price). */
export function linkSubtotal(form: LinkForm, books: any[]): number {
  const byId = new Map((books || []).map(book => [book.id, book]));
  let sum = 0;
  for (const row of form.rows) {
    if (!row.bookId) continue;
    const price = money(row.price);
    const unit = price === null ? shopPriceOf(byId.get(row.bookId), row.variantId) : price;
    const quantity = Number(row.quantity);
    if (unit == null || Number.isNaN(unit) || !Number.isFinite(quantity)) continue;
    sum += unit * quantity;
  }
  const shipping = form.ship ? money(form.shipping) : 0;
  return Math.round((sum + (shipping && shipping > 0 ? shipping : 0)) * 100) / 100;
}

/** Most copies one line of a link can hold (the server's limit, functions/paymentLinks.js). */
export const MAX_LINE_QUANTITY = 99;

/** A bulk-price request sent from a product page (extras/pdp-bulk-quote), read back from its Messages row. */
export type QuoteRequest = { name: string; email: string; phone: string; quantity: number; slug: string; title: string; edition: string };

/**
 * The request in a Messages row, or null when the row isn't one. The form writes "Quantity: N" then "Book: <title>" as
 * the message's first lines and sends it from the product's own page (/books/<slug>); the edition, when there is one, is
 * in brackets at the end of the subject.
 */
export function quoteRequestOf(m: { name?: string; email?: string; phone?: string; subject?: string; message?: string; page?: string }): QuoteRequest | null {
  const lines = String(m?.message || "").split("\n");
  const qty = /^Quantity:\s*(\d{1,6})\s*$/.exec(lines[0] || "");
  const title = /^Book:\s*(.+?)\s*$/.exec(lines[1] || "");
  if (!qty || !title || !(Number(qty[1]) >= 1)) return null;
  const slug = /\/(?:books|products)\/([^/?#]+)/.exec(String(m?.page || ""));
  const edition = /\(([^()]+)\)\s*$/.exec(String(m?.subject || ""));
  let decoded = "";
  try { decoded = slug ? decodeURIComponent(slug[1]) : ""; } catch { decoded = slug ? slug[1] : ""; }
  return {
    name: String(m.name || "").trim(), email: String(m.email || "").trim(), phone: String(m.phone || "").trim(),
    quantity: Number(qty[1]), slug: decoded, title: title[1], edition: edition ? edition[1].trim() : "",
  };
}

/**
 * A payment-link form started from a bulk-price request: the customer, and the product they asked about at the copies
 * they asked for (up to a line's limit). The product is found by its page address, else by its exact title; the edition
 * by its name. Nothing found leaves an empty line to choose.
 */
export function linkFormFromQuote(request: QuoteRequest, books: any[], country = "CA"): LinkForm {
  const form = emptyLinkForm(country);
  const list = linkableBooks(books);
  const lower = (v: unknown) => String(v || "").trim().toLowerCase();
  const book = (request.slug && list.find(b => b.slug === request.slug)) || list.find(b => lower(b.title) === lower(request.title));
  const variants = Array.isArray(book?.variants) ? book.variants : [];
  const variant = variants.find((v: any) => request.edition && lower(v.name) === lower(request.edition));
  const quantity = Math.min(MAX_LINE_QUANTITY, Math.max(1, Math.floor(request.quantity) || 1));
  return {
    ...form,
    name: request.name, email: request.email, phone: request.phone,
    rows: [{ ...form.rows[0], bookId: book?.id || "", variantId: variant?.id || "", quantity: String(quantity) }],
  };
}

/**
 * The day a link closes ("November 5, 2026") in the shop's time zone: the same day the server writes in the order's
 * history and the reminder email (functions/paymentLinks.js closingDay), so the customer's emails agree.
 */
export function closingDay(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "long", day: "numeric" }).format(at);
}

export type LinkState = "open" | "expired" | "paid" | "cancelled";
/** Where an order's payment link stands, or null for an order that wasn't made with one. */
export function linkState(order: any, now = Date.now()): LinkState | null {
  if (!order?.paymentLink) return null;
  if (order.paymentStatus === "paid" || ["refunded", "refund_pending", "partially_refunded"].includes(order.paymentStatus)) return "paid";
  if (order.status === "cancelled") return "cancelled";
  return Date.parse(order.paymentLink.expiresAt) > now ? "open" : "expired";
}

/** The link the customer pays from: the order's own private page, which shows Pay now while the link is open. */
export const paymentLinkUrl = customerTrackUrl;

/** A mailto: that opens the owner's own email with the link written in, or "" when the email can't be used. */
export function paymentLinkMailto(order: any, url: string, shopName = ""): string {
  const email = String(order?.customer?.email || "").trim();
  if (!email || /[\s<>"?&]/.test(email) || !url) return "";
  const first = String(order?.customer?.name || "").trim().split(/\s+/)[0] || "";
  const until = order?.paymentLink?.expiresAt ? closingDay(order.paymentLink.expiresAt) : "";
  const subject = `Your order${shopName ? ` from ${shopName}` : ""}: ready to pay`;
  const body = [
    `Hi${first ? ` ${first}` : ""},`,
    "",
    "Your order is ready. You can see it and pay by card here:",
    url,
    "",
    ...(order?.paymentLink?.note ? [order.paymentLink.note, ""] : []),
    ...(until ? [`The link is open until ${until}.`, ""] : []),
    "Thank you!",
    ...(shopName ? [shopName] : []),
  ].join("\n");
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Add items to a paid order (code plan 24.6, part B): why this order can't take more items, or "". The extra items are a
 * new order to pay, linked to this one (`shipsWith`), so the customer pays only for what's added and both go in one
 * parcel. Only a paid, active order that hasn't left yet; the server checks the same (functions/paymentLinks.js).
 */
export function addItemsProblem(order: any): string {
  if (!order || order.isTest) return "Test orders can't take more items.";
  if (!["paid", "partially_refunded"].includes(order.paymentStatus) || ["cancelled", "refunded"].includes(order.status)) return "Only an active paid order can take more items.";
  const q = queueOf(order);
  if (q === "In transit" || q === "Completed") return "This order has already left. Make a new order to pay instead.";
  return "";
}

/** The form for items added to `order`: its customer and address, shipping 0 (they go in the same parcel) and a note. */
export function linkFormForAddOn(order: any, country = "CA"): LinkForm {
  const form = emptyLinkForm(country);
  const c = order?.customer || {};
  const a = c.address || {};
  const ship = fulfillmentMethod(order || {}) === "shipping";
  return {
    ...form,
    name: String(c.name || ""), email: String(c.email || ""), phone: String(c.phone || ""),
    street: String(a.street || ""), unit: String(a.unit || ""), city: String(a.city || ""), state: String(a.state || ""),
    zip: String(a.zip || ""), country: String(a.country || country),
    ship, shipping: ship ? "0" : "",
    days: "14",
    note: `These items are added to your order ${order?.orderId || order?.id || ""}${ship ? " and ship with it" : ""}.`.replace(/\s+\./, "."),
  };
}
