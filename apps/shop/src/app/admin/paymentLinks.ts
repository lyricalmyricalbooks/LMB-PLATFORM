// Payment links (code plan 21.1, 21.2): the owner makes an order for a customer at prices they set, and sends a link the
// customer pays from. The server makes the order and keeps the agreed prices (functions/paymentLinks.js); this file
// holds the admin's side: the form's rows, the request, and what the order page shows about the link.
import { catalogUnitPrice } from "../CartContext";
import { isGiftCardProduct } from "../features/site/promotions";
import { customerTrackUrl } from "./orderLines";

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
export function linkRequest(form: LinkForm) {
  return {
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
  const until = String(order?.paymentLink?.expiresAt || "").slice(0, 10);
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
