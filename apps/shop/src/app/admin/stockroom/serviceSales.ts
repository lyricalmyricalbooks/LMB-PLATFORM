// Service sales (Bookings plan phase 4, 17 November 2026): what bookings brought in, as lines for Bookkeeping and the
// Tax centre. Pure. A booking counts on its visit day in the shop's time zone (as the Bookings Figures tab counts it),
// once the visit day has come, with what the shop kept: paid by card, gift card or at the shop, a missed-booking fee,
// less refunds (`moneyKept`). A tip is its own line: money in, but never a sale and never taxed. Held bookings and
// bookings that kept nothing are left out. A service that charges sales tax (`chargeTax`) has the tax inside its price;
// the tax in what was kept is the same share of the booking's tax (`taxIn`), and the ledger row's sale is net of it.
import { dayOf, moneyKept, taxIn, tipTaken } from "../../../shared/bookingTimes";

type Row = Record<string, any>;

export type ServiceSale = {
  /** The booking's id. */
  id: string;
  /** The visit day, YYYY-MM-DD in the shop's time zone. */
  date: string;
  serviceName: string;
  /** What the shop kept for the visit, in whole cents of `currency`. */
  keptMinor: number;
  /** A tip the client added by card, in whole cents. */
  tipMinor: number;
  /** The sales tax inside `keptMinor`, in whole cents (0 for a service without tax). */
  taxMinor: number;
  /** That tax by name (e.g. "HST ON"), adding up to `taxMinor`. */
  taxLines: { name: string; cents: number }[];
  currency: string;
  /** "pack" for a pack of visits sold (its visits are then booked at no price, so they never count twice). */
  kind?: "pack";
};

type BookingLike = {
  id: string; serviceName?: string; start?: string; status?: string; currency?: string;
  payment?: string; priceMinor?: number; depositMinor?: number; paid?: boolean; depositPaid?: boolean;
  refund?: { amountMinor?: number } | null; fee?: { amountMinor?: number } | null; rest?: { amountMinor?: number } | null;
  giftCard?: { amountMinor?: number; returned?: boolean } | null; tip?: { amountMinor?: number } | null;
  taxMinor?: number; taxLines?: { name?: string; cents?: number }[] | null;
};

/** The booking's tax lines scaled to `taxMinor` (the part in what was kept); any rounding left goes on the first. */
function keptTaxLines(b: { taxLines?: { name?: string; cents?: number }[] | null }, taxMinor: number): { name: string; cents: number }[] {
  if (!(taxMinor > 0)) return [];
  const lines = (Array.isArray(b.taxLines) ? b.taxLines : []).filter((l) => l && Number(l.cents) > 0);
  const whole = lines.reduce((sum, l) => sum + Number(l.cents), 0);
  if (!whole) return [{ name: "Sales tax", cents: taxMinor }];
  const out = lines.map((l) => ({ name: String(l.name || "Sales tax"), cents: Math.floor((Number(l.cents) * taxMinor) / whole) }));
  out[0].cents += taxMinor - out.reduce((sum, l) => sum + l.cents, 0);
  return out.filter((l) => l.cents > 0);
}

/** Every booking that brought money in by `today` (YYYY-MM-DD, the shop's day), oldest first. */
export function serviceSales(bookings: readonly BookingLike[], zone: string, today: string, currency: string): ServiceSale[] {
  const out: ServiceSale[] = [];
  for (const b of bookings) {
    if (!b || b.status === "held" || !b.start) continue;
    const ms = Date.parse(b.start);
    if (!Number.isFinite(ms)) continue;
    const date = dayOf(ms, zone);
    if (date > today) continue;
    const keptMinor = moneyKept(b);
    const tipMinor = b.status === "cancelled" ? 0 : tipTaken(b);
    if (keptMinor <= 0 && tipMinor <= 0) continue;
    const taxMinor = taxIn(b, keptMinor);
    out.push({ id: String(b.id), date, serviceName: String(b.serviceName || "Booking"), keptMinor, tipMinor, taxMinor, taxLines: keptTaxLines(b, taxMinor), currency: String(b.currency || currency).toUpperCase() });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
}

/** A pack of visits as the admin's `packs` op lists it (bookingsApi PackRow). */
type PackLike = {
  id: string; serviceName?: string; visits?: number; status?: string; priceMinor?: number; currency?: string;
  paidAt?: string | null; refundMinor?: number; taxMinor?: number; taxLines?: { name?: string; cents?: number }[] | null;
};

/**
 * Every pack of visits sold by `today`, as sales on the day it was paid: what the shop kept (the price less any refund
 * on closing it), with the sales tax in that part when the pack was taxed. The visits booked with it carry no price.
 */
export function packSales(packs: readonly PackLike[], zone: string, today: string, currency: string): ServiceSale[] {
  const out: ServiceSale[] = [];
  for (const p of packs) {
    if (!p || !p.paidAt) continue;
    const ms = Date.parse(p.paidAt);
    if (!Number.isFinite(ms)) continue;
    const date = dayOf(ms, zone);
    if (date > today) continue;
    const keptMinor = Math.max(0, Math.round(Number(p.priceMinor) || 0) - Math.round(Number(p.refundMinor) || 0));
    if (keptMinor <= 0) continue;
    const taxMinor = taxIn(p, keptMinor);
    const visits = Math.round(Number(p.visits) || 0);
    const name = `${String(p.serviceName || "Visits")}${visits > 0 ? `, pack of ${visits}` : ", pack"}`;
    out.push({ id: `pack-${p.id}`, date, serviceName: name, keptMinor, tipMinor: 0, taxMinor, taxLines: keptTaxLines(p, taxMinor), currency: String(p.currency || currency).toUpperCase(), kind: "pack" });
  }
  return out;
}

/** Bookings and packs together, oldest first (the order `serviceSales` keeps). */
export function withPackSales(sales: readonly ServiceSale[], packs: readonly ServiceSale[]): ServiceSale[] {
  return [...sales, ...packs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
}

/** Booking ledger rows look like this (`sourceType`). */
export const SERVICE_SOURCE = "booking";
export const TIP_SOURCE = "bookingTip";

/**
 * The ledger rows for a year ('all' or 'YYYY'), shaped like the stockroom's own sale rows. A sale row's amount is what
 * was kept less the sales tax in it; the tax rides along as `taxAmount` and `taxes` ({ name: cents }). Amounts in another
 * currency than the books' are left out (a shop's bookings are always in its own currency).
 */
export function serviceLedgerRows(sales: readonly ServiceSale[] | undefined, year: string, baseCurrency: string): Row[] {
  const rows: Row[] = [];
  for (const s of sales || []) {
    if (year !== "all" && s.date.slice(0, 4) !== year) continue;
    if (s.currency !== String(baseCurrency).toUpperCase()) continue;
    const common = { date: s.date, cat: "Income", ref: s.id.slice(-6).toUpperCase(), origCurrency: s.currency, voided: false, hasRateError: false, isIncome: true, sourceId: "bookings" };
    if (s.keptMinor > 0) {
      const tax = s.taxMinor || 0;
      const amount = (s.keptMinor - tax) / 100;
      const taxes = Object.fromEntries((s.taxLines || []).map((l) => [l.name, l.cents]));
      rows.push({ ...common, type: "Sale", desc: s.kind === "pack" ? s.serviceName : `${s.serviceName} (booking)`, origAmount: amount, baseAmount: amount, qty: 1, sourceType: SERVICE_SOURCE, itemId: s.id, taxAmount: tax / 100, taxes });
    }
    if (s.tipMinor > 0) {
      const amount = s.tipMinor / 100;
      rows.push({ ...common, type: "Tip", desc: `Tip (${s.serviceName})`, origAmount: amount, baseAmount: amount, qty: 0, sourceType: TIP_SOURCE, itemId: `${s.id}-tip` });
    }
  }
  return rows;
}

/** Service sales of a year in the books' currency: count, kept (net of tax), tax and tips (whole currency units). */
export function serviceYear(sales: readonly ServiceSale[] | undefined, year: string, baseCurrency: string) {
  let count = 0, kept = 0, tax = 0, tips = 0;
  for (const r of serviceLedgerRows(sales, year, baseCurrency)) {
    if (r.sourceType === SERVICE_SOURCE) { count += 1; kept += r.baseAmount; tax += r.taxAmount || 0; } else tips += r.baseAmount;
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return { count, kept: round(kept), tax: round(tax), tips: round(tips) };
}
