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

export function sendCopies(book: Row, name: string, f: { qty: number; rate?: number; date: string; notes?: string }) {
  return (s: Row) => {
    const st = storeIn(s, name);
    const qty = whole(f.qty);
    const stock = deriveOnHand(s, book);
    if (qty <= 0) throw new Error("Enter a quantity greater than 0.");
    if (qty > stock) throw new Error(`Only ${stock} in stock.`);
    const rate = Number.isFinite(Number(f.rate)) && f.rate !== undefined ? Number(f.rate) : st.rate;
    if (!(rate >= 0 && rate <= 100)) throw new Error("Commission must be between 0 and 100.");
    st.sent = (st.sent || 0) + qty; st.outstanding = (st.outstanding || 0) + qty;
    (s.ledger ||= []).push({ id: Date.now(), storeId: st.id, storeName: st.name, type: "Shipment", date: f.date, qty, rate, amountDue: 0, paid: "n/a", notes: (f.notes || "").trim(), status: "sent", sheetsId: eventId() });
    return s;
  };
}

export function recordStoreSale(book: Row, name: string, f: { qty: number; unitPrice: number; date: string; paid: "pending" | "paid"; notes?: string; saleCur?: string; fxRate?: number }) {
  return (s: Row) => {
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
    const entry: Row = { id: Date.now(), storeId: st.id, storeName: st.name, type: "Sale", date: f.date, qty, rate: st.rate, amountDue: pub, paid: f.paid, notes, status: f.paid, sheetsId, cur: bookCode };
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

export function takeReturn(name: string, f: { qty: number; date: string; good: boolean; notes?: string }) {
  return (s: Row) => {
    const st = storeIn(s, name);
    const qty = whole(f.qty);
    if (qty <= 0) throw new Error("Enter a quantity greater than 0.");
    if (qty > (st.outstanding || 0)) throw new Error(`Only ${st.outstanding || 0} on their shelf.`);
    st.returned = (st.returned || 0) + qty; st.outstanding -= qty;
    const cond = f.good ? "Good — return to stock" : "Damaged — write off";
    const notes = (f.notes || "").trim();
    (s.ledger ||= []).push({ id: Date.now(), storeId: st.id, storeName: st.name, type: "Return", date: f.date, qty, rate: st.rate, amountDue: 0, paid: "n/a", notes: (notes ? notes + " · " : "") + cond, status: f.good ? "restocked" : "written off", sheetsId: eventId() });
    return s;
  };
}
