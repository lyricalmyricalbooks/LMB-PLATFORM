// Orders › an order › Store credit: give the customer credit to spend in the shop (a gift card made out to them),
// for example in place of a refund. Pure rules here; the card is StoreCreditCard.tsx, the form is Gift cards' own.

const PAID = ["paid", "refunded", "partially_refunded", "refund_pending"];

/** Only for orders that were paid: credit for an unpaid or abandoned order would be money the shop never had. */
export function canGiveCredit(order: any): boolean {
  return PAID.includes(String(order?.paymentStatus || "").toLowerCase());
}

/** The gift card form, filled in for this customer and order. */
export function creditForm(order: any): { amount: string; recipientEmail: string; recipientName: string; note: string; message: string; sendEmail: boolean } {
  const id = String(order?.orderId || order?.id || "");
  const total = Math.max(0, Math.min(10000, Number(order?.total) || 0));
  const email = String(order?.customer?.email || "").trim();
  return {
    amount: total >= 1 ? total.toFixed(2) : "",
    recipientEmail: email,
    recipientName: String(order?.customer?.name || "").trim().slice(0, 100),
    note: `Store credit for order ${id}`.slice(0, 500),
    message: `Store credit for your order ${id}.`.slice(0, 300),
    sendEmail: Boolean(email),
  };
}
