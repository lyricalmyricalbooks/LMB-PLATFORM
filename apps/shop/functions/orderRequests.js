// Shopper and admin order actions of createStripeCheckoutSession: the checkout return page's status check, order
// tracking and the emailed tracking link, a shopper's cancel/return request, and the admin's cancel-unpaid-order and
// payment-problem-resolved actions. None marks an order paid: the Stripe webhook stays the only path that does. Moved
// out of index.js as is (functions/CLAUDE.md › Cloud Functions › Action table): index.js passes in its own db, admin
// SDK, Stripe helpers and guards, so the vm-based handler tests' fakes still apply.

function orderRequestActions({
  db, admin, crypto, ADMIN_TO, LIMITS, RESEND_API_KEY, canViewOrder, cancelRefusal, chargedRedemptions,
  checkStripeReversal, claimEmailSend, escapeHtml, getStripeClientForMode, hitLimit, intentAsSession,
  normMarketingEmail, orderActionBody, orderRequestIdentity, orderRequestKey, orderRequestProblem,
  orderRequestRecord, publicErrorMessage, publicOrderView, readBody, recordStripeReconciliation,
  releaseGiftCards, releaseStock, requireAdmin, retrieveOrderPayment, sendEmail, siteLink, stripePaymentTaken,
}) {
  // Admin: cancel an unpaid order. Done in a transaction so an order that was paid a moment
  // ago (webhook) is refused instead of quietly hidden, then the payment the shopper may still
  // be completing is stopped (Stripe PaymentIntent cancelled / Checkout Session expired).
  async function handleCancelOrder(req, res) {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;
    const body = readBody(req, res, orderActionBody);
    if (!body) return;
    const { orderId } = body;
    const ref = db.collection("orders").doc(orderId);
    try {
      // Ask Stripe first: an order still "unpaid" here may already be paid there (missed webhook).
      // Cancelling it would leave a charged customer with no books and no alert.
      const before = await ref.get();
      const pre = before.exists ? before.data() : null;
      const intentId = String(pre?.stripePaymentIntentId || "");
      const sessionId = String(pre?.stripeCheckoutSessionId || "");
      let stripeCtx = null, intent = null, session = null;
      if (pre && !cancelRefusal(pre) && (intentId.startsWith("pi_") || sessionId.startsWith("cs_"))) {
        try {
          stripeCtx = await getStripeClientForMode(pre.stripeMode === "test" ? "test" : "live", pre.stripeAccountId || null);
          if (intentId.startsWith("pi_")) intent = await stripeCtx.stripe.paymentIntents.retrieve(intentId, {}, stripeCtx.requestOptions);
          if (sessionId.startsWith("cs_")) session = await stripeCtx.stripe.checkout.sessions.retrieve(sessionId, {}, stripeCtx.requestOptions);
        } catch (err) {
          if (!(err?.code === "resource_missing" || err?.statusCode === 404)) {
            return res.status(503).json({ error: "Couldn't check this payment with Stripe. Try again in a minute.", code: "stripe_unreachable" });
          }
        }
        if (stripePaymentTaken(intent, session)) {
          await recordStripeReconciliation(orderId, { id: session?.id || null, payment_intent: intent?.id || session?.payment_intent || null }).catch(() => {});
          return res.status(409).json({ error: "Stripe shows this order as paid. Don't cancel it: resend the payment event from Stripe (Webhook health), then ship or refund it.", code: "paid_in_stripe" });
        }
      }
      const order = await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const current = snap.exists ? snap.data() : null;
        const refusal = cancelRefusal(current);
        if (refusal) {
          const message = refusal === "paid" ? "This order has just been paid. Refund it instead of cancelling."
            : refusal === "refunded" ? "This order is being refunded." : refusal === "missing" ? "Order not found" : "This order is already closed.";
          const err = new Error(message); err.status = refusal === "missing" ? 404 : 409; err.code = refusal; throw err;
        }
        const now = new Date().toISOString();
        tx.update(ref, {
          status: "cancelled", cancelledAt: now, cancelledBy: adminUser.email || adminUser.uid, updatedAt: now,
          activity: admin.firestore.FieldValue.arrayUnion({ type: "event", message: `Unpaid order cancelled by ${adminUser.email || "administrator"}.`, createdAt: now }),
        });
        return current;
      });
      // Best effort: stop a payment the shopper may still finish. A payment that slips through
      // anyway is recorded as "paid after cancelling" by the webhook, and the sweep still checks
      // cancelled orders with a Stripe payment.
      const stopped = [];
      try {
        if (stripeCtx) {
          const { stripe, requestOptions } = stripeCtx;
          if (session && session.status === "open") {
            await stripe.checkout.sessions.expire(session.id, {}, requestOptions).then(() => stopped.push("checkout")).catch(() => {});
          }
          if (intent && ["requires_payment_method", "requires_confirmation", "requires_action"].includes(intent.status)) {
            await stripe.paymentIntents.cancel(intent.id, {}, requestOptions).then(() => stopped.push("card")).catch(() => {});
          }
        }
      } catch (err) {
        console.warn(`cancelOrder ${orderId}: could not stop the Stripe payment:`, err.message);
      }
      await releaseStock(db, orderId, order.items || []);
      await releaseGiftCards(db, orderId, [...chargedRedemptions(order), ...(order.giftCardRedemptions || [])]);
      return res.status(200).json({ cancelled: true, stopped });
    } catch (err) {
      return res.status(err.status || 500).json({ error: err.message, code: err.code });
    }
  }

  // Admin: the extra/late payment on this order has been refunded in Stripe or PayPal.
  async function handleResolveMismatch(req, res) {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;
    const body = readBody(req, res, orderActionBody);
    if (!body) return;
    const { orderId } = body;
    const ref = db.collection("orders").doc(orderId);
    const snap = await ref.get();
    const current = snap.exists ? snap.data() : null;
    if (!current || (!current.paymentMismatch && !current.giftCardConflict)) return res.status(404).json({ error: "Nothing to resolve on this order." });
    const now = new Date().toISOString();
    const by = adminUser.email || adminUser.uid;
    await ref.update({
      ...(current.paymentMismatch ? { "paymentMismatch.resolvedAt": now, "paymentMismatch.resolvedBy": by } : {}),
      ...(current.giftCardConflict ? { "giftCardConflict.resolvedAt": now, "giftCardConflict.resolvedBy": by } : {}),
      updatedAt: now,
      activity: admin.firestore.FieldValue.arrayUnion({ type: "event", message: `Payment problem marked as refunded/resolved by ${adminUser.email || "administrator"}.`, createdAt: now }),
    });
    return res.status(200).json({ resolved: true });
  }

  // Read-only status check for the checkout return page. Only reports on a
  // session that belongs to the given order, and never marks anything paid —
  // the webhook stays the single source of truth for payment.
  async function handleCheckoutStatus(req, res) {
    let { orderId, sessionId, paymentIntentId } = req.body || {};
    if (typeof orderId !== "string" || !orderId || orderId.includes("/")) {
      res.status(400).json({ error: "Missing orderId" });
      return;
    }
    // Each call can reach Stripe (live and test), so it is limited per visitor like the other order-key actions.
    if (!(await hitLimit(db, "status", req, LIMITS.status))) { res.status(429).json({ error: "Too many requests. Please wait a few minutes and try again." }); return; }
    try {
      const orderSnap = await db.collection("orders").doc(orderId).get();
      if (!orderSnap.exists) { res.status(404).json({ error: "Order not found" }); return; }
      const saved = orderSnap.data() || {};
      if (!canViewOrder(saved, { key: orderRequestKey(req), identity: await orderRequestIdentity(req) })) return res.status(403).json({ error: "access_required" });
      if (saved.paymentStatus === "paid") {
        // Already paid: still ask Stripe whether it was since refunded or disputed (this is what the
        // admin's "Sync with Stripe" relies on). Throttled to once a minute per order.
        let paymentStatus = "paid";
        if (String(saved.stripePaymentIntentId || "").startsWith("pi_") && !(Date.now() - Date.parse(saved.stripeCheckedAt || "") < 60 * 1000)) {
          try {
            await checkStripeReversal(orderId, saved, "status check");
            paymentStatus = (await db.collection("orders").doc(orderId).get()).data()?.paymentStatus || "paid";
          } catch (err) {
            console.warn(`Refund/dispute check failed for ${orderId}:`, err.message);
          }
        }
        res.status(200).json({ status: "complete", paymentStatus });
        return;
      }
      // The tracking page and the admin may only know the order number: fall back to
      // the payment ids this server saved on the order when it created the payment.
      // Only the payment ids this server saved on the order are looked up: an id typed into the request
      // that the order doesn't carry never triggers a Stripe call (#106).
      const savedIntent = typeof saved.stripePaymentIntentId === "string" && saved.stripePaymentIntentId.startsWith("pi_") ? saved.stripePaymentIntentId : "";
      const savedSession = typeof saved.stripeCheckoutSessionId === "string" && saved.stripeCheckoutSessionId.startsWith("cs_") ? saved.stripeCheckoutSessionId : "";
      paymentIntentId = typeof paymentIntentId === "string" && paymentIntentId === savedIntent ? savedIntent : "";
      sessionId = typeof sessionId === "string" && sessionId === savedSession ? savedSession : "";
      if (!paymentIntentId && !sessionId) {
        paymentIntentId = savedIntent;
        sessionId = savedSession;
      }
      if (!paymentIntentId && !sessionId) {
        res.status(200).json({ status: "open", paymentStatus: "unpaid" });
        return;
      }

      const found = await retrieveOrderPayment(orderId, saved, paymentIntentId ? { paymentIntentId } : { sessionId });
      if (!found) { res.status(404).json({ error: "Payment not found" }); return; }

      if (found.intent) {
        const intent = found.intent;
        const settled = intent.status === "succeeded";
        if (settled) await recordStripeReconciliation(orderId, intentAsSession(intent));
        const status = settled ? "complete" : intent.status === "processing" ? "processing" : "open";
        res.status(200).json({ status, paymentStatus: saved.paymentStatus, providerPaymentStatus: intent.status, awaitingWebhook: settled, mode: found.mode });
        return;
      }
      const session = found.session;
      if (session.payment_status === "paid") {
        await recordStripeReconciliation(orderId, session);
      }
      res.status(200).json({ status: session.status, paymentStatus: saved.paymentStatus, providerPaymentStatus: session.payment_status, awaitingWebhook: session.payment_status === "paid", mode: found.mode });
    } catch (err) {
      console.error("Stripe status check failed:", err);
      res.status(500).json({ error: publicErrorMessage(err, "Something went wrong. Please try again.") });
    }
  }

  // Guest order lookup (tracking page + checkout thank-you page). Orders are not
  // publicly readable in Firestore; this returns one only to its owner: the
  // matching customer email or the private key from the order email link.
  // Served through createStripeCheckoutSession (body.action): no new public function.
  async function handleTrackingLink(req, res) {
    const { orderId, email } = req.body || {};
    const accepted = () => res.status(200).json({ accepted: true });
    if (typeof orderId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(orderId) || typeof email !== "string" || email.length > 254) return accepted();
    if (!(await hitLimit(db, "tracking-link", req, { max: 5, windowMs: 10 * 60 * 1000 }))) return res.status(429).json({ error: "too_many" });
    try {
      const ref = db.collection("orders").doc(orderId);
      let order = null;
      await db.runTransaction(async tx => {
        order = null;
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const saved = snap.data();
        if (normMarketingEmail(saved.customer?.email) !== normMarketingEmail(email)) return;
        if (Date.now() - Date.parse(saved.trackingLinkSentAt || "") < 60_000) return;
        const trackingKey = typeof saved.trackingKey === "string" && /^[a-f0-9]{32,64}$/.test(saved.trackingKey) ? saved.trackingKey : crypto.randomBytes(32).toString("hex");
        tx.update(ref, { trackingKey, trackingLinkSentAt: new Date().toISOString() });
        order = { ...saved, trackingKey };
      });
      if (order) {
        const settings = (await db.collection("settings").doc("website").get()).data() || {};
        const copy = settings.design?.copy || {};
        const url = siteLink(`/track?orderId=${encodeURIComponent(orderId)}&key=${order.trackingKey}`);
        await sendEmail({ to: order.customer.email, secret: RESEND_API_KEY.value(),
          subject: String(copy.trackLinkEmailSubject ?? "Your secure order link"),
          html: `<p>${escapeHtml(copy.trackLinkEmailIntro ?? "Use this private link to view your order and delivery updates.")}</p><p><a href="${escapeHtml(url)}">${escapeHtml(copy.trackLinkEmailButton ?? "View my order")}</a></p>` });
      }
    } catch (err) { console.warn("Tracking link could not be sent:", err.message); }
    return accepted();
  }

  async function handleTrackOrder(req, res) {
    const { orderId } = req.body || {};
    if (typeof orderId !== "string" || !orderId || orderId.length > 64 || orderId.includes("/")) {
      res.status(400).json({ error: "not_found" });
      return;
    }
    if (!(await hitLimit(db, "track", req, LIMITS.track))) {
      res.status(429).json({ error: "too_many" });
      return;
    }
    try {
      const snap = await db.collection("orders").doc(orderId).get();
      if (!snap.exists) { res.status(404).json({ error: "not_found" }); return; }
      const order = snap.data() || {};
      if (!canViewOrder(order, { key: orderRequestKey(req), identity: await orderRequestIdentity(req) })) {
        res.status(403).json({ error: "email_mismatch" });
        return;
      }
      res.status(200).json({ order: publicOrderView(snap.id, order) });
    } catch (err) {
      console.error("Order lookup failed:", err);
      res.status(500).json({ error: "failed" });
    }
  }

  // A shopper asks to cancel an order or to return it. Same proof as order tracking (email
  // or the emailed key). Nothing about money or stock changes here: the request is put on
  // the order (Orders › Needs attention) and the shop is emailed to decide.
  async function handleOrderRequest(req, res) {
    const { orderId, type, message } = req.body || {};
    if (typeof orderId !== "string" || !orderId || orderId.length > 64 || orderId.includes("/")) {
      res.status(400).json({ error: "not_found" });
      return;
    }
    if (!(await hitLimit(db, "track", req, LIMITS.track))) {
      res.status(429).json({ error: "too_many" });
      return;
    }
    try {
      const orderRef = db.collection("orders").doc(orderId);
      let problem = null;
      let order = null;
      const identity = await orderRequestIdentity(req);
      await db.runTransaction(async tx => {
        const snap = await tx.get(orderRef);
        order = snap.exists ? snap.data() : null;
        if (order && !canViewOrder(order, { key: orderRequestKey(req), identity })) {
          problem = "email_mismatch";
          return;
        }
        problem = orderRequestProblem(order, type);
        if (problem) return;
        const record = orderRequestRecord(type, message);
        tx.update(orderRef, {
          customerRequest: record,
          updatedAt: record.createdAt,
          activity: [...(order.activity || []), { type: "event", message: `Customer asked to ${type === "cancel" ? "cancel this order" : "return this order"}${record.message ? `: "${record.message}"` : "."}`, createdAt: record.createdAt }],
        });
        order = { ...order, customerRequest: record };
      });
      if (problem) {
        res.status(problem === "not_found" ? 404 : problem === "email_mismatch" ? 403 : 409).json({ error: problem });
        return;
      }
      const request = order.customerRequest;
      // The request itself is saved on the order; the shop-wide email budget only decides whether it is also mailed.
      if (await claimEmailSend(db, "orderRequestNotify", orderId, { failOpen: true })) await sendEmail({
        queue: "orderRequest",
        secret: RESEND_API_KEY.value(),
        to: ADMIN_TO,
        subject: `${request.type === "cancel" ? "Cancellation" : "Return"} request · order ${orderId}`,
        html: `<p>${escapeHtml(order.customer?.name || order.customer?.email || "A customer")} asked to <strong>${request.type === "cancel" ? "cancel" : "return"}</strong> order <strong>${escapeHtml(orderId)}</strong>.</p>${request.message ? `<blockquote>${escapeHtml(request.message)}</blockquote>` : ""}<p>Open it in Admin › Orders (Needs me). Refunds and cancellations are done from the order as usual; mark the request handled when you have replied.</p>`,
      }).catch(err => console.warn("order request email failed:", err.message));
      res.status(200).json({ order: publicOrderView(orderId, order) });
    } catch (err) {
      console.error("Order request failed:", err);
      res.status(500).json({ error: "failed" });
    }
  }

  return { handleCancelOrder, handleResolveMismatch, handleCheckoutStatus, handleTrackingLink, handleTrackOrder, handleOrderRequest };
}

module.exports = { orderRequestActions };
