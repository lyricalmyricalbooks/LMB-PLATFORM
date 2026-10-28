// The release check's server-side reads and its one admin action, on the test shop's own project, built on
// clients/firestore.js (the platform's token) and the shop's own refund endpoint (the test owner's sign-in).
//
// Where the data lives in the shop copy:
//   orders/{id}                 paymentStatus, sandboxPayment, isTest, createdAt  (apps/shop/functions/index.js)
//   books/{id}                  stockLevel
//   emailLog                    { orderId, kind: "orderConfirmed", status: "sent", to }  (functions/email/index.js)
//   refundOrder                 POST { orderId, reason, restock }, Bearer ID token of an admin (index.js refundOrder)
// and in the stockroom's database (its own named database in the shop's project, plan 1.20):
//   websiteOrders/{order id}    imported, pending   (the stockroom marks an order it brought in)
//   websiteStockFeed/{book id}  onHand              (the count it publishes while open)

/** `firestore` is the shop's database (clients/firestore.js). */
export function shopReads(firestore) {
  return {
    order: (id) => firestore.get(`orders/${id}`),
    book: (id) => firestore.get(`books/${id}`),
    orderEmails: async (orderId) => (await firestore.query("emailLog", { where: [["orderId", "==", orderId]], limit: 20 })).map((row) => row.data),
    // Test orders only (isTest, paid in test mode), older than `iso`. The date is compared here, not in the query, so
    // no extra index is needed.
    async testOrdersBefore(iso) {
      const rows = await firestore.query("orders", { where: [["isTest", "==", true]], limit: 500 });
      return rows.filter((row) => row.data.sandboxPayment === true && typeof row.data.createdAt === "string" && row.data.createdAt < iso).map((row) => row.id);
    },
    removeOrder: (id) => firestore.remove(`orders/${id}`),
  };
}

/** `firestore` is the stockroom's database. */
export function stockroomReads(firestore) {
  return {
    feed: (bookId) => firestore.get(`websiteStockFeed/${bookId}`),
    websiteOrder: (orderId) => firestore.get(`websiteOrders/${orderId}`),
  };
}

/** The shop's refund, as the test owner. `functionsBase` is like https://<region>-<project>.cloudfunctions.net. */
export function shopAdmin({ fetch, functionsBase, session }) {
  return {
    async refund(orderId) {
      const response = await fetch(`${functionsBase}/refundOrder`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, reason: "Release check", restock: true }),
      });
      if (!response.ok) {
        let reason = "";
        try { reason = (await response.json()).error ?? ""; } catch { /* no body */ }
        throw new Error(`the shop refused the refund (${response.status}${reason ? `: ${reason}` : ""})`);
      }
      return true;
    },
  };
}
