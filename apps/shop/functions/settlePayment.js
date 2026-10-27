// The one step that turns a verified payment into a paid order, for every provider (Stripe
// webhook, PayPal capture, manual/free orders). Callers prove the money is real first; this
// module does everything after that, once: gift-card debit, paid status, stock, discount use,
// revenue and releasing the checkout hold. Tested in settlePayment.test.js.
const crypto = require("crypto");
const { readBooks, writeStock } = require("./inventory");
const { chargedRedemptions, readGiftCards, debitShortfall, writeGiftCardChange } = require("./giftCards");
const { discountUsedUp } = require("./paymentGuards");
const { releaseStockForOrder } = require("./stockHolds");

function createSettlement({ db, increment }) {
  // Inside the payment transaction, after every read: takes the order's gift-card amounts off the
  // cards once. Returns false (and records giftCardConflict) when a card can no longer pay its part.
  function settleGiftCards(transaction, orderRef, orderId, order, cards, provider, now) {
    const redemptions = chargedRedemptions(order);
    if (!redemptions.length || order.giftCardsDebitedAt) return true;
    const short = debitShortfall(redemptions, cards);
    if (short) {
      transaction.update(orderRef, {
        giftCardConflict: { provider, reason: "balance", cardId: short, at: now },
        activity: [...(order.activity || []), { type: "event", message: `${provider} confirmed payment, but a gift card on this order no longer had enough balance. The order was not marked paid; refund or reconcile the payment and contact the customer.`, createdAt: now }],
        updatedAt: now,
      });
      return false;
    }
    writeGiftCardChange(transaction, db, orderId, redemptions, cards, -1, now);
    transaction.update(orderRef, { giftCardsDebitedAt: now });
    return true;
  }

  // provider: the name shown in the order's activity ("Stripe", "PayPal", "Checkout").
  // message:  the activity line for the payment.
  // receipt:  the provider's ids, written with the paid status (and kept when a gift card falls short).
  // sandbox:  order => true for a test-mode payment: a paid test order that touches nothing real.
  // verify:   order => null to go ahead, or { reason, update? } to stop (written as is). Runs first,
  //           inside the transaction, so it also decides what a repeat on a paid order does.
  // Returns { paid: true } or { paid: false, reason: "missing" | "already-paid" | "gift-card-short" | <verify's reason> }.
  async function settlePayment(orderId, { provider, message, receipt = {}, sandbox = () => false, verify = null }) {
    const orderRef = db.collection("orders").doc(orderId);
    let result = null;
    let revenue = null;
    await db.runTransaction(async transaction => {
      revenue = null; // a retried attempt must not keep the last attempt's value
      const orderDoc = await transaction.get(orderRef);
      if (!orderDoc.exists) { result = { paid: false, reason: "missing" }; return; }
      const order = orderDoc.data();
      const now = new Date().toISOString();
      const stop = verify ? verify(order, now) : null;
      if (stop) {
        if (stop.update) transaction.update(orderRef, stop.update);
        result = { paid: false, reason: stop.reason };
        return;
      }
      if (order.paymentStatus === "paid") { result = { paid: false, reason: "already-paid" }; return; }

      // Firestore transactions require all reads before any write.
      const test = !!sandbox(order);
      const items = order.items || [];
      const takeStock = !test && order.inventoryDecrementedAt == null;
      const books = takeStock ? await readBooks(transaction, db, items) : new Map();
      const discountRef = !test && order.appliedDiscount?.id && order.discountUsageCountedAt == null
        ? db.collection("discounts").doc(order.appliedDiscount.id) : null;
      const discountDoc = discountRef ? await transaction.get(discountRef) : null;
      const giftCards = test ? new Map() : await readGiftCards(transaction, db, chargedRedemptions(order));

      if (!test && !settleGiftCards(transaction, orderRef, orderId, order, giftCards, provider, now)) {
        if (Object.keys(receipt).length) transaction.update(orderRef, receipt);
        result = { paid: false, reason: "gift-card-short" };
        return;
      }

      const update = {
        ...receipt,
        paymentStatus: "paid",
        fulfillmentStatus: "paid",
        status: "open",
        reconciliationPending: null,
        ...(test ? { isTest: true, sandboxPayment: true } : {}),
        // Single-use token securing digital download links in emails.
        downloadToken: crypto.randomBytes(32).toString("hex"),
        paidAt: now,
        updatedAt: now,
        activity: [...(order.activity || []), { type: "event", message, createdAt: now }],
      };
      // One write per book, so two editions of a book both count. The stamp stops anything
      // (onOrderUpdated, a repeat) taking the stock out again.
      if (takeStock) {
        if (writeStock(transaction, db, items, books, -1, now)) update.oversold = true;
        update.inventoryDecrementedAt = now;
      }
      // Counted at payment so usage limits hold; two shoppers can pass the limit check at once,
      // so a paid order past the limit is flagged for the admin.
      if (discountDoc?.exists) {
        transaction.update(discountRef, { usageCount: (Number(discountDoc.data().usageCount) || 0) + 1, updatedAt: now });
        update.discountUsageCountedAt = now;
        if (discountUsedUp(discountDoc.data())) update.discountOverLimit = true;
      }
      transaction.update(orderRef, update);
      revenue = test ? null : Number(order.total) || 0;
      result = { paid: true };
    });

    // Revenue is recorded at payment time, never in the browser. Sandbox payments are not revenue.
    if (revenue !== null) {
      const today = new Date().toISOString().split("T")[0];
      await db.collection("analytics").doc(today).set({ date: today, orders: increment(1), revenue: increment(revenue) }, { merge: true });
    }
    // The stock is now taken for real; the checkout hold has done its job.
    if (result.paid || result.reason === "already-paid") await releaseStockForOrder(db, orderId);
    return result;
  }

  return { settlePayment };
}

module.exports = { createSettlement };
