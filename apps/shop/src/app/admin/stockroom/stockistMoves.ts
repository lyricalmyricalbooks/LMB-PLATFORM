// Stockroom › Stockists › a shop › one title: Send copies, Record a sale, Take a return. Ports of the old stockroom's
// confirmSend, confirmSale and confirmReturn (main.js), step for step, as `mutate`s for saveBookState. The stockroom
// writer recomputes stock, revenue and running counts afterwards (recomputeAfters), as the old save did.
import { consignmentPaymentRecord, consignmentSaleAmounts, expectedConsignmentPayment } from "@stockroom/consignment-fx.js";
import { bookCurrencyCode } from "@stockroom/currency-migration.js";
import { deriveOnHand } from "@stockroom/inventory.js";
import { roundCents } from "@stockroom/money.js";

type Row = Record<string, any>;
const eventId = () => `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
const whole = (n: unknown) => Math.floor(Number(n) || 0);

/** The book's own record of this shop, matched by name (the Stockists page groups shops across books by name). */
export function storeIn(s: Row, name: string): Row {
  const want = name.trim().toLowerCase();
  const st = (s.stores || []).find((x: Row) => String(x.name || "").trim().toLowerCase() === want);
  if (!st) throw new Error(`${name} isn't set up for this title yet.`);
  return st;
}

/** A move filed by an earlier try of the same form (its id was made when the form opened): don't file it again. */
const filed = (s: Row, id?: number) => id != null && ((s.ledger as Row[]) || []).some((e) => e && e.id === id);

export function sendCopies(book: Row, name: string, f: { qty: number; rate?: number; date: string; notes?: string; id?: number }) {
  return (s: Row) => {
    if (filed(s, f.id)) return s;
    const st = storeIn(s, name);
    const qty = whole(f.qty);
    const stock = deriveOnHand(s, book);
    if (qty <= 0) throw new Error("Enter a quantity greater than 0.");
    if (qty > stock) throw new Error(`Only ${stock} in stock.`);
    const rate = Number.isFinite(Number(f.rate)) && f.rate !== undefined ? Number(f.rate) : st.rate;
    if (!(rate >= 0 && rate <= 100)) throw new Error("Commission must be between 0 and 100.");
    st.sent = (st.sent || 0) + qty; st.outstanding = (st.outstanding || 0) + qty;
    (s.ledger ||= []).push({ id: f.id ?? Date.now(), storeId: st.id, storeName: st.name, type: "Shipment", date: f.date, qty, rate, amountDue: 0, paid: "n/a", notes: (f.notes || "").trim(), status: "sent", sheetsId: eventId() });
    return s;
  };
}

export function recordStoreSale(book: Row, name: string, f: { qty: number; unitPrice: number; date: string; paid: "pending" | "paid"; notes?: string; saleCur?: string; fxRate?: number; id?: number }) {
  return (s: Row) => {
    if (filed(s, f.id)) return s;
    const st = storeIn(s, name);
    const qty = whole(f.qty);
    const bookCode = bookCurrencyCode(book);
    const saleCur = f.saleCur || bookCode;
    if (qty <= 0) throw new Error("Enter a quantity greater than 0.");
    if (qty > (st.outstanding || 0)) throw new Error(`Only ${st.outstanding || 0} on their shelf.`);
    if (!(Number(f.unitPrice) > 0)) throw new Error("Enter a price greater than 0.");
    const amounts = consignmentSaleAmounts({ qty, unitPrice: f.unitPrice, commission: st.rate, saleCur, bookCur: bookCode, fxRate: f.fxRate });
    if (!amounts) throw new Error(`Enter how many ${bookCode} one ${saleCur} is worth.`);
    const pub = amounts.due;
    st.sold = (st.sold || 0) + qty; st.outstanding -= qty;
    st.amountOwed = roundCents((st.amountOwed || 0) + (f.paid === "pending" ? pub : 0));
    const num = "CON-" + String(st.name).replace(/\s+/g, "").slice(0, 5).toUpperCase() + "-" + Date.now().toString().slice(-4);
    const sheetsId = eventId();
    const notes = (f.notes || "").trim();
    const entry: Row = { id: f.id ?? Date.now(), storeId: st.id, storeName: st.name, type: "Sale", date: f.date, qty, rate: st.rate, amountDue: pub, paid: f.paid, notes, status: f.paid, sheetsId, cur: bookCode };
    if (saleCur !== bookCode) st.currency = saleCur; else delete st.currency;
    if (amounts.sale) entry.sale = amounts.sale;
    if (f.paid === "paid") {
      const exp = expectedConsignmentPayment(entry, bookCode);
      const rec = consignmentPaymentRecord({ amountDue: pub, bookCur: bookCode, payCur: exp.currency, payAmount: exp.amount, fxRate: amounts.sale ? amounts.sale.rate : 1, date: f.date });
      if (rec && rec.currency !== bookCode) entry.payment = rec;
    }
    (s.hist ||= []).unshift({ num, chan: "Consignment", qty, price: pub / qty, notes: st.name, date: f.date, sheetsId, consignmentLink: true, cur: bookCode });
    (s.ledger ||= []).push(entry);
    return s;
  };
}

export function takeReturn(name: string, f: { qty: number; date: string; good: boolean; notes?: string; id?: number }) {
  return (s: Row) => {
    if (filed(s, f.id)) return s;
    const st = storeIn(s, name);
    const qty = whole(f.qty);
    if (qty <= 0) throw new Error("Enter a quantity greater than 0.");
    if (qty > (st.outstanding || 0)) throw new Error(`Only ${st.outstanding || 0} on their shelf.`);
    st.returned = (st.returned || 0) + qty; st.outstanding -= qty;
    const cond = f.good ? "Good — return to stock" : "Damaged — write off";
    const notes = (f.notes || "").trim();
    (s.ledger ||= []).push({ id: f.id ?? Date.now(), storeId: st.id, storeName: st.name, type: "Return", date: f.date, qty, rate: st.rate, amountDue: 0, paid: "n/a", notes: (notes ? notes + " · " : "") + cond, status: f.good ? "restocked" : "written off", sheetsId: eventId() });
    return s;
  };
}

// Add a stockist / Edit its details: ports of the old addStore and confirmEditStore. The old form's fields and its
// defaults (commission 40 when left blank). A shop's own sale currency stays as it was (set by recording a sale).
export const STORE_FIELDS = ["name", "contact", "email", "phone", "address", "city", "region", "postal", "country", "website", "terms", "notes"] as const;
export type StoreForm = Record<(typeof STORE_FIELDS)[number], string> & { rate: string };

export function storeFormOf(st?: Row | null): StoreForm {
  const f = { rate: st && st.rate !== undefined ? String(st.rate) : "40" } as StoreForm;
  for (const k of STORE_FIELDS) f[k] = st ? String(st[k] ?? "") : "";
  return f;
}

function storeProblem(f: StoreForm) {
  if (!f.name.trim()) return "Store name is required.";
  if (f.rate.trim() !== "") { const n = parseFloat(f.rate); if (isNaN(n) || n < 0 || n > 100) return "Commission must be between 0 and 100."; }
  return "";
}

/** `oldName` null adds the shop to this book; otherwise updates the book's record of `oldName`. */
export function withStore(oldName: string | null, f: StoreForm) {
  return (s: Row) => {
    const problem = storeProblem(f);
    if (problem) throw new Error(problem);
    const stores: Row[] = (s.stores ||= []);
    const name = f.name.trim();
    const clash = stores.find((x) => String(x.name || "").trim().toLowerCase() === name.toLowerCase());
    const st: Row = oldName === null ? {} : storeIn(s, oldName);
    if (clash && clash !== st) throw new Error(`${clash.name} is already set up for this title.`);
    for (const k of STORE_FIELDS) st[k] = f[k].trim();
    const r = parseFloat(f.rate);
    if (oldName === null) {
      st.rate = Number.isFinite(r) ? r : 40;
      Object.assign(st, { id: Date.now(), sent: 0, sold: 0, returned: 0, outstanding: 0, amountOwed: 0 });
      stores.push(st);
    } else if (Number.isFinite(r)) st.rate = r;
    return s;
  };
}

/** Port of exportConsignmentLedgerCSV for one stockist across its titles: oldest first, the old columns plus Title. */
export function stockistLedgerRows(name: string, ledger: Array<{ bookTitle: string; date: string; type: string; qty: number; rate: number | null; amountDue: number; code: string; status: string; voided: boolean; invoiceNum: string; notes: string }>) {
  const header = ["Date", "Store", "Title", "Type", "Qty", "Commission %", "Due to you", "Currency", "Status", "Voided", "Invoice", "Notes"];
  const sorted = [...ledger].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return [header, ...sorted.map((e) => [e.date || "", name, e.bookTitle || "", e.type || "", e.qty ?? "", e.type === "Sale" ? (e.rate ?? "") : "",
    e.amountDue ? Number(e.amountDue).toFixed(2) : "", e.code, e.voided ? "VOID" : (e.status || ""), e.voided ? "YES" : "", e.invoiceNum || "", e.notes || ""])];
}
