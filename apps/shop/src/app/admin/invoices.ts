// Trade invoices (code plan 12.10): a trade account with terms orders now and pays later. The order is recorded as a sale
// when it is placed (so stock, revenue and packing work as for any order); this record only tracks the money still owed.
//   order.invoice  { days, dueAt, paidAt }   written by the server at checkout; the owner sets paidAt on the order

/** The invoice is still unpaid: the money is owed and the order wasn't cancelled or refunded. */
export function invoiceOpen(order: any): boolean {
  const invoice = order?.invoice;
  if (!invoice || typeof invoice !== "object" || invoice.paidAt) return false;
  return order.status !== "cancelled" && !["refunded", "refund_pending"].includes(order.paymentStatus);
}

/** The invoice is unpaid and its due date has passed. */
export function invoiceOverdue(order: any, now = Date.now()): boolean {
  if (!invoiceOpen(order)) return false;
  const due = Date.parse(order.invoice.dueAt || "");
  return Number.isFinite(due) && due < now;
}

const dateWords = (iso: string) => {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "";
};

/** One plain line for the order page: when the invoice is due, or when it was paid. */
export function invoiceLine(order: any, now = Date.now()): string {
  const invoice = order?.invoice;
  if (!invoice) return "";
  if (invoice.paidAt) return `Invoice paid on ${dateWords(invoice.paidAt)}.`;
  const due = dateWords(invoice.dueAt);
  if (!due) return "";
  return invoiceOverdue(order, now) ? `Invoice was due ${due}. It is overdue.` : `Invoice due ${due}.`;
}
