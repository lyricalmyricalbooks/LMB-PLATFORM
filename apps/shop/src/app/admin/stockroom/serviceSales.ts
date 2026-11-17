// Service sales (Bookings plan phase 4, 17 November 2026): what bookings brought in, as lines for Bookkeeping and the
// Tax centre. Pure. A booking counts on its visit day in the shop's time zone (as the Bookings Figures tab counts it),
// once the visit day has come, with what the shop kept: paid by card, gift card or at the shop, a missed-booking fee,
// less refunds (`moneyKept`). A tip is its own line: money in, but never a sale and never taxed. Held bookings and
// bookings that kept nothing are left out. No tax is charged on bookings yet, so the Tax centre lists them as such.
import { dayOf, moneyKept, tipTaken } from "../../../shared/bookingTimes";

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
  currency: string;
};

type BookingLike = {
  id: string; serviceName?: string; start?: string; status?: string; currency?: string;
  payment?: string; priceMinor?: number; depositMinor?: number; paid?: boolean; depositPaid?: boolean;
  refund?: { amountMinor?: number } | null; fee?: { amountMinor?: number } | null; rest?: { amountMinor?: number } | null;
  giftCard?: { amountMinor?: number; returned?: boolean } | null; tip?: { amountMinor?: number } | null;
};

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
    out.push({ id: String(b.id), date, serviceName: String(b.serviceName || "Booking"), keptMinor, tipMinor, currency: String(b.currency || currency).toUpperCase() });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
}

/** Booking ledger rows look like this (`sourceType`). */
export const SERVICE_SOURCE = "booking";
export const TIP_SOURCE = "bookingTip";

/**
 * The ledger rows for a year ('all' or 'YYYY'), shaped like the stockroom's own sale rows. Amounts in another currency
 * than the books' are left out (a shop's bookings are always in its own currency).
 */
export function serviceLedgerRows(sales: readonly ServiceSale[] | undefined, year: string, baseCurrency: string): Row[] {
  const rows: Row[] = [];
  for (const s of sales || []) {
    if (year !== "all" && s.date.slice(0, 4) !== year) continue;
    if (s.currency !== String(baseCurrency).toUpperCase()) continue;
    const common = { date: s.date, cat: "Income", ref: s.id.slice(-6).toUpperCase(), origCurrency: s.currency, voided: false, hasRateError: false, isIncome: true, sourceId: "bookings" };
    if (s.keptMinor > 0) {
      const amount = s.keptMinor / 100;
      rows.push({ ...common, type: "Sale", desc: `${s.serviceName} (booking)`, origAmount: amount, baseAmount: amount, qty: 1, sourceType: SERVICE_SOURCE, itemId: s.id });
    }
    if (s.tipMinor > 0) {
      const amount = s.tipMinor / 100;
      rows.push({ ...common, type: "Tip", desc: `Tip (${s.serviceName})`, origAmount: amount, baseAmount: amount, qty: 0, sourceType: TIP_SOURCE, itemId: `${s.id}-tip` });
    }
  }
  return rows;
}

/** Service sales of a year in the books' currency: count, kept and tips (whole currency units). */
export function serviceYear(sales: readonly ServiceSale[] | undefined, year: string, baseCurrency: string) {
  let count = 0, kept = 0, tips = 0;
  for (const r of serviceLedgerRows(sales, year, baseCurrency)) {
    if (r.sourceType === SERVICE_SOURCE) { count += 1; kept += r.baseAmount; } else tips += r.baseAmount;
  }
  return { count, kept: Math.round(kept * 100) / 100, tips: Math.round(tips * 100) / 100 };
}
