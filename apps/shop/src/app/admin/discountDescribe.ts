// Admin › Discounts: one plain sentence for what shoppers get, e.g.
// "20% off Poetry, up to CA$15 · min CA$40 · 1 per customer · Oct 1–31". Pure, tested.
// Dates are the shop's calendar days (Toronto), the same days the server checks.

const money = (n: any) => {
  const v = Number(n) || 0;
  return `CA$${Number.isInteger(v) ? v : v.toFixed(2)}`;
};

const PLAIN = /^\d{4}-\d{2}-\d{2}$/;
const parts = (d: string) => { const [y, m, day] = d.split("-").map(Number); return { y, m, day }; };
const monthName = (m: number) => new Date(Date.UTC(2000, m - 1, 15)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });

/** "Oct 31, 2026" for a plain shop day (never shifted by the viewer's time zone). */
export function shopDayLabel(date: string, withYear = true): string {
  if (!PLAIN.test(date || "")) return date ? String(date) : "";
  const { y, m, day } = parts(date);
  return `${monthName(m)} ${day}${withYear ? `, ${y}` : ""}`;
}

/** "Oct 1–31", "Oct 28 – Nov 3", "from Oct 1", "until Oct 31". Years shown only when not `thisYear`. */
export function dateRangeLabel(start = "", end = "", thisYear = new Date().getFullYear()): string {
  const s = PLAIN.test(start) ? parts(start) : null;
  const e = PLAIN.test(end) ? parts(end) : null;
  if (!s && !e) return "";
  if (s && !e) return `from ${shopDayLabel(start, s.y !== thisYear)}`;
  if (!s && e) return `until ${shopDayLabel(end, e!.y !== thisYear)}`;
  const year = s!.y !== thisYear || e!.y !== thisYear;
  if (s!.y === e!.y && s!.m === e!.m) return `${monthName(s!.m)} ${s!.day}–${e!.day}${year ? `, ${s!.y}` : ""}`;
  return `${shopDayLabel(start, year)} – ${shopDayLabel(end, year)}`;
}

const pct = (v: any) => `${Number(v) || 0}%`;

/** "10% off over CA$50, CA$20 off over CA$100" */
export function tierSummary(tiers: any[] = []): string {
  return [...(tiers || [])].sort((a, b) => Number(a.minSpend) - Number(b.minSpend))
    .map(t => `${(t.type || "percentage") === "fixed" ? money(t.value) : pct(t.value)} off over ${money(t.minSpend)}`).join(", ");
}

export function describeDiscount(d: any, books: any[] = [], thisYear = new Date().getFullYear()): string {
  if (!d) return "";
  const titleOf = (id: string) => books.find(b => b.id === id)?.title;
  let target = "";
  if (d.appliesTo === "categories" && (d.selectedCategories || []).length) target = d.selectedCategories.join(", ");
  else if (d.appliesTo === "products" && (d.selectedProducts || []).length) {
    const ids: string[] = d.selectedProducts;
    target = ids.length === 1 ? titleOf(ids[0]) || "1 book" : `${ids.length} books`;
  }
  const on = target ? ` ${target}` : "";
  let offer: string;
  switch (d.type) {
    case "percentage": offer = `${pct(d.value)} off${on}`; break;
    case "fixed": offer = `${money(d.value)} off${on}`; break;
    case "freeship": offer = `Free shipping${target ? ` on ${target}` : ""}`; break;
    case "bogo": {
      const off = d.getDiscountValue ?? 100;
      offer = `Buy ${d.buyQuantity || 1} get ${d.getQuantity || 1} ${Number(off) >= 100 ? "free" : `${pct(off)} off`}${target ? ` (${target})` : ""}`;
      break;
    }
    case "tiered": offer = `${tierSummary(d.tiers) || "Tiered discount"}${target ? ` on ${target}` : ""}`; break;
    case "gift": {
      const book = books.find(b => b.id === d.giftBookId);
      const edition = book && d.giftVariantId ? (book.variants || []).find((v: any) => v.id === d.giftVariantId)?.name : "";
      offer = `Free gift: ${book ? `${book.title}${edition ? ` (${edition})` : ""}` : "a book"}`;
      break;
    }
    default: offer = String(d.type || "Discount");
  }
  const cap = Number(d.maxDiscountAmount);
  if (cap > 0 && d.type !== "freeship" && d.type !== "gift") offer += `, up to ${money(cap)}`;
  const extras: string[] = [];
  if (Number(d.minOrderAmount) > 0) extras.push(`min ${money(d.minOrderAmount)}`);
  if (Number(d.minQuantity) > 0) extras.push(`min ${d.minQuantity} items`);
  if (d.onePerCustomer && d.method !== "automatic") extras.push("1 per customer");
  if (Number(d.usageLimit) > 0) extras.push(`${d.usageLimit} use${Number(d.usageLimit) === 1 ? "" : "s"} total`);
  if (d.method !== "automatic" && (String(d.allowedEmailDomains || "").trim() || String(d.allowedCustomerEmails || "").trim())) extras.push("chosen emails only");
  const dates = dateRangeLabel(d.startDate || "", d.expiryDate || "", thisYear);
  if (dates) extras.push(dates);
  return [offer, ...extras].join(" · ");
}
