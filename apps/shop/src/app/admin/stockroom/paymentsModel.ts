// Stockroom › Bookkeeping › Payments (v4): money coming in by card. Three tiles (paid out in the last 30 days, on its
// way, payment links waiting), the payouts and the shop's pay-by-QR and pay links. Pure: payouts come from the shop's
// orders through Reconcile's own rule (reconcileModel.ts), links from the stockroom's records (each item's card payment
// link, the invoices' card pay links). Nothing here is saved or sent.
import { addMoney, type Owed } from "./stockists";
import { reconcileModel, type PayoutRow } from "./reconcileModel";
import { paymentLinkOf } from "./qrCodes";
import { invoiceList } from "./invoiceMake";
import { cardLinkOf } from "./invoiceCardPay";
import { isTestBook, type StockroomRecords } from "./stockroomData";

export type PayLink = { id: string; name: string; sub: string; state: "active" | "unpaid" | "paid"; amount?: number; code?: string };

export type PaymentsModel = {
  currency: string;
  payouts: PayoutRow[];
  paidOut30Cents: number; paidOut30Count: number;
  onWayCents: number; onWayCount: number;
  /** Paid card sales the payment service hasn't put in a payout yet. */
  waiting: number;
  links: PayLink[];
  unpaidLinks: number; unpaidOwed: Owed[];
};

const DAY = 24 * 60 * 60 * 1000;
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function paymentsModel({ orders, records, now = Date.now() }: { orders: Record<string, any>[]; records: StockroomRecords; now?: number }): PaymentsModel {
  const rec = reconcileModel(orders);
  const since = dayKey(now - 30 * DAY);
  const today = dayKey(now + DAY);
  let paidOut30Cents = 0, paidOut30Count = 0, onWayCents = 0, onWayCount = 0;
  for (const p of rec.payouts) {
    if (!p.date) { onWayCents += p.netCents; onWayCount += 1; }
    else if (p.date >= since && p.date <= today) { paidOut30Cents += p.netCents; paidOut30Count += 1; }
  }
  const links: PayLink[] = [];
  for (const book of records.books) {
    if (isTestBook(book) || !paymentLinkOf(book)) continue;
    links.push({ id: `item-${book.id}`, name: book.title || "Untitled", sub: "QR code · opens a card checkout", state: "active" });
  }
  const unpaidOwed: Owed[] = [];
  let unpaidLinks = 0;
  for (const row of invoiceList(records, new Date(now))) {
    if (!cardLinkOf(row.inv) || row.status === "draft") continue;
    const paid = row.status === "paid";
    if (!paid) { unpaidLinks += 1; addMoney(unpaidOwed, row.code, row.total); }
    links.push({ id: `inv-${row.id}`, name: `Invoice link · ${row.billedTo}`, sub: row.num ? `Invoice ${row.num}` : "Invoice", state: paid ? "paid" : "unpaid", amount: row.total, code: row.code });
  }
  // Unpaid links first, then items, then paid links.
  const order = { unpaid: 0, active: 1, paid: 2 } as const;
  links.sort((a, b) => order[a.state] - order[b.state]);
  return { currency: rec.currency, payouts: rec.payouts, paidOut30Cents, paidOut30Count, onWayCents, onWayCount, waiting: rec.waiting, links, unpaidLinks, unpaidOwed };
}
