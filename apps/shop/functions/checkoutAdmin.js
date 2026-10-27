// Admin actions of createStripeCheckoutSession: Stripe key test, Stripe webhook health and repair, Apple Pay / Google Pay
// domain registration, gift card changes and the inventory app link. Every one is admin-only (requireAdmin first) and
// none creates or marks a payment. Moved out of index.js as is (functions/CLAUDE.md › Cloud Functions › Action table):
// index.js passes in its own db, Stripe wrapper, secrets and guards, so the vm-based handler tests' fakes still apply.

function checkoutAdminActions({
  db, Stripe, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_WEBHOOK_URL, ALLOWED_ORIGINS, GIFT_CARD_BODIES, REQUIRED_WEBHOOK_EVENTS,
  webhookEndpointReport, emailGiftCard, expiryChange, giftCardId, last4, newGiftCardCode, withHistory, readAdminSecret,
  readBody, requireAdmin, shopTestMode, stripeSecretFor, withPrivateStripeKeys, inventoryLinkDeps,
}) {
  // Admin: "Test connection" — does each saved Stripe secret key work, which Stripe
  // account and mode is it, and do the publishable keys match their mode?
  async function handleVerifyStripeKeys(req, res) {
    if (!await requireAdmin(req, res)) return;
    try {
      const settingsDoc = await db.collection("settings").doc("website").get();
      const settings = settingsDoc.exists ? settingsDoc.data() || {} : {};
      const stripeSettings = settings.payments?.stripe || {};
      const priv = await readAdminSecret("stripe");
      const results = {};
      for (const mode of ["live", "test"]) {
        const stored = mode === "live" ? priv.secretKey : priv.testSecretKey;
        let fallback = "";
        if (mode === "live" && !stored) { try { fallback = STRIPE_SECRET_KEY.value() || ""; } catch { fallback = ""; } }
        const key = stored || fallback;
        const publishable = String((mode === "live" ? stripeSettings.publicKey : stripeSettings.testPublicKey) || "").trim();
        const r = {
          source: stored ? "stored" : fallback ? "functions" : "none",
          publishableKeyMode: /^pk_live_/.test(publishable) ? "live" : /^pk_test_/.test(publishable) ? "test" : publishable ? "invalid" : "missing",
        };
        if (key) {
          r.keyMode = /_live_/.test(key) ? "live" : /_test_/.test(key) ? "test" : "unknown";
          try {
            const account = await new Stripe(key).accounts.retrieve();
            Object.assign(r, { ok: true, accountId: account.id, accountName: account.settings?.dashboard?.display_name || account.business_profile?.name || null, chargesEnabled: account.charges_enabled !== false });
          } catch (err) {
            // Restricted keys may not read the account: a balance read still proves the key works.
            try { await new Stripe(key).balance.retrieve(); Object.assign(r, { ok: true, accountId: null }); }
            catch (err2) { Object.assign(r, { ok: false, error: err2?.message || err?.message || "Stripe rejected the key." }); }
          }
        }
        results[mode] = r;
      }
      const activeMode = settings.payments?.testMode ? "test" : "live";
      const sameAccount = results.live.accountId && results.test.accountId ? results.live.accountId === results.test.accountId : null;
      res.status(200).json({ activeMode, ...results, sameAccount });
    } catch (err) {
      console.error("Stripe key check failed:", err);
      res.status(500).json({ error: err.message });
    }
  }

  // Inventory › Inventory app link (docs/INVENTORY_LINK.md). Admin only; never a payment path.
  async function handleInventoryLinkAdmin(req, res) {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;
    try {
      const { inventoryLinkAdmin } = require("./inventoryLinkAdmin");
      const { status, body } = await inventoryLinkAdmin(inventoryLinkDeps(), req.body || {}, adminUser.email || "admin");
      res.status(status).json(body);
    } catch (err) {
      console.error("inventoryLink admin failed:", err);
      res.status(500).json({ error: "The inventory app link didn't answer. Try again in a minute." });
    }
  }

  // Admin › Gift cards: issue, disable/enable, adjust a balance or resend the email. The browser
  // can read gift cards (admin only) but never write them; every change goes through here.
  async function handleGiftCardAdmin(req, res) {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;
    const op = req.body?.op;
    if (typeof op !== "string" || !Object.hasOwn(GIFT_CARD_BODIES, op)) return res.status(400).json({ error: "Unknown gift card action." });
    const checked = readBody(req, res, GIFT_CARD_BODIES[op]);
    if (!checked) return;
    const body = { op, ...checked };
    const actor = adminUser.email || "admin";
    const now = new Date().toISOString();
    try {
      if (body.op === "issue") {
        const amountMinor = Math.floor(Number(body.amountMinor));
        if (!Number.isFinite(amountMinor) || amountMinor < 100 || amountMinor > 1000000) return res.status(400).json({ error: "Enter an amount between CA$1 and CA$10,000." });
        const recipientEmail = String(body.recipientEmail || "").trim().toLowerCase().slice(0, 320);
        if (recipientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(recipientEmail)) return res.status(400).json({ error: "Check the recipient's email address." });
        const expiresOn = String(body.expiresOn || "").slice(0, 10);
        if (expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) return res.status(400).json({ error: "Use a date for the expiry." });
        if (body.sendEmail === true && !recipientEmail) return res.status(400).json({ error: "Add the recipient's email address to send the code." });
        let code = "";
        let id = "";
        const data = {
          last4: "", initialMinor: amountMinor, balanceMinor: amountMinor, currency: "CAD", enabled: true,
          ...(expiresOn ? { expiresOn } : {}),
          recipientEmail, recipientName: String(body.recipientName || "").trim().slice(0, 100),
          senderName: String(body.senderName || "Lyricalmyrical Books").trim().slice(0, 100),
          message: String(body.message || "").trim().slice(0, 300), note: String(body.note || "").trim().slice(0, 500),
          source: "admin", issuedBy: actor, holds: {},
          history: [{ type: "issued", minor: amountMinor, actor, at: now }],
          createdAt: now, updatedAt: now,
        };
        // A fresh random code; create() refuses the (astronomically unlikely) duplicate.
        for (let attempt = 0; attempt < 3 && !id; attempt++) {
          code = newGiftCardCode();
          try {
            await db.collection("giftCards").doc(giftCardId(code)).create({ ...data, code, last4: last4(code) });
            id = giftCardId(code);
          } catch (err) {
            if (attempt === 2) throw err;
          }
        }
        let emailError = null;
        if (body.sendEmail === true) {
          try {
            await emailGiftCard(id, { ...data, code, last4: last4(code) });
          } catch (err) {
            emailError = err.message;
          }
        }
        return res.status(200).json({ id, code, last4: last4(code), ...(emailError ? { emailError } : {}) });
      }
      const id = typeof body.id === "string" && /^[a-f0-9]{40}$/.test(body.id) ? body.id : "";
      if (!id) return res.status(400).json({ error: "Missing gift card." });
      const ref = db.collection("giftCards").doc(id);
      if (body.op === "setEnabled") {
        await db.runTransaction(async tx => {
          const snap = await tx.get(ref);
          if (!snap.exists) throw new Error("Gift card not found.");
          const card = snap.data();
          const enabled = body.enabled === true;
          tx.update(ref, { enabled, history: withHistory(card, { type: enabled ? "enabled" : "disabled", minor: 0, actor, at: now }), updatedAt: now });
        });
        return res.status(200).json({ ok: true });
      }
      if (body.op === "adjust") {
        const delta = Math.trunc(Number(body.deltaMinor));
        const reason = String(body.reason || "").trim().slice(0, 300);
        if (!Number.isFinite(delta) || !delta || Math.abs(delta) > 1000000) return res.status(400).json({ error: "Enter an amount to add or remove." });
        if (!reason) return res.status(400).json({ error: "Add a reason for the change." });
        let balanceMinor = 0, appliedMinor = 0;
        await db.runTransaction(async tx => {
          const snap = await tx.get(ref);
          if (!snap.exists) throw new Error("Gift card not found.");
          const card = snap.data();
          const before = Math.floor(Number(card.balanceMinor) || 0);
          balanceMinor = Math.max(0, before + delta);
          // The history records what really changed (the balance never goes below zero), so it always sums to the balance.
          appliedMinor = balanceMinor - before;
          tx.update(ref, { balanceMinor, history: withHistory(card, { type: "adjusted", minor: appliedMinor, ...(appliedMinor !== delta ? { requestedMinor: delta } : {}), reason, actor, at: now }), updatedAt: now });
        });
        return res.status(200).json({ ok: true, balanceMinor, appliedMinor, clamped: appliedMinor !== delta });
      }
      if (body.op === "setExpiry") {
        let expiresOn = "";
        await db.runTransaction(async tx => {
          const snap = await tx.get(ref);
          if (!snap.exists) throw new Error("Gift card not found.");
          const update = expiryChange(snap.data(), body.expiresOn, { actor, reason: body.reason });
          expiresOn = update.expiresOn;
          tx.update(ref, update);
        });
        return res.status(200).json({ ok: true, expiresOn });
      }
      if (body.op === "resend") {
        const snap = await ref.get();
        if (!snap.exists) return res.status(404).json({ error: "Gift card not found." });
        const to = String(body.to || "").trim().toLowerCase();
        await emailGiftCard(id, snap.data(), { to });
        return res.status(200).json({ ok: true });
      }
      return res.status(400).json({ error: "Unknown gift card action." });
    } catch (err) {
      console.error("giftCardAdmin failed:", err);
      return res.status(400).json({ error: err.message });
    }
  }

  // Admin: checks (and with fix: true repairs) the Stripe webhook endpoint for the
  // mode the shop is using. Repair adds missing events, re-enables a disabled
  // endpoint, or creates the endpoint and saves its signing secret privately in
  // adminSecrets/stripeWebhook so stripeWebhook can verify it.
  async function handleWebhookHealth(req, res) {
    if (!await requireAdmin(req, res)) return;
    try {
      const testMode = await shopTestMode();
      const mode = testMode ? "test" : "live";
      const secret = await stripeSecretFor(mode);
      if (!secret) { res.status(400).json({ error: `Add your Stripe ${mode} secret key first.` }); return; }
      const stripe = new Stripe(secret);
      const listed = await stripe.webhookEndpoints.list({ limit: 100 });
      let report = webhookEndpointReport(listed.data, STRIPE_WEBHOOK_URL);
      const actions = [];
      // Stripe only reveals an endpoint's signing secret when it is created. If the
      // signatures keep failing, replace the endpoint so a known secret is saved.
      if (req.body?.recreate === true && report.found) {
        await stripe.webhookEndpoints.del(report.endpointId);
        report = webhookEndpointReport([], STRIPE_WEBHOOK_URL);
        actions.push("Removed the old webhook endpoint (its signing secret didn't match).");
      }
      if (req.body?.fix === true || req.body?.recreate === true) {
        if (!report.found) {
          const created = await stripe.webhookEndpoints.create({
            url: STRIPE_WEBHOOK_URL,
            enabled_events: REQUIRED_WEBHOOK_EVENTS,
            description: "Lyricalmyrical shop orders (created by Admin › Payments)",
          });
          await db.collection("adminSecrets").doc("stripeWebhook").set({ [mode]: created.secret, [`${mode}EndpointId`]: created.id, updatedAt: new Date().toISOString() }, { merge: true });
          // A fresh endpoint with a known secret: older signature failures no longer apply.
          await db.collection("adminSecrets").doc("stripeWebhookStatus").set({ lastFailureAt: null, lastFailure: null, resetAt: new Date().toISOString() }, { merge: true });
          actions.push("Created the webhook endpoint in Stripe and saved its signing secret.");
        } else {
          const update = {};
          if (report.missingEvents.length) {
            const current = (listed.data.find(e => e.id === report.endpointId)?.enabled_events) || [];
            update.enabled_events = Array.from(new Set([...current, ...report.missingEvents]));
            actions.push(`Turned on ${report.missingEvents.length} missing event${report.missingEvents.length === 1 ? "" : "s"}: ${report.missingEvents.join(", ")}.`);
          }
          if (!report.enabled) { update.disabled = false; actions.push("Re-enabled the endpoint."); }
          if (report.wrongUrl) { update.url = STRIPE_WEBHOOK_URL; actions.push("Pointed the endpoint at the shop's webhook address."); }
          if (Object.keys(update).length) await stripe.webhookEndpoints.update(report.endpointId, update);
        }
        const relisted = await stripe.webhookEndpoints.list({ limit: 100 });
        report = webhookEndpointReport(relisted.data, STRIPE_WEBHOOK_URL);
      }
      const status = (await db.collection("adminSecrets").doc("stripeWebhookStatus").get()).data() || {};
      const saved = await readAdminSecret("stripeWebhook");
      let deployedSecret = false;
      try { deployedSecret = !!STRIPE_WEBHOOK_SECRET.value(); } catch { deployedSecret = false; }
      const forMode = status[mode] || {};
      res.status(200).json({
        mode,
        url: STRIPE_WEBHOOK_URL,
        ...report,
        savedSecret: !!saved[mode],
        deployedSecret,
        // This account's own deliveries only (older records without per-mode data fall back).
        lastReceivedAt: forMode.lastReceivedAt || (status.lastMode === mode ? status.lastReceivedAt : null) || null,
        lastEventType: forMode.lastEventType || (status.lastMode === mode ? status.lastEventType : null) || null,
        lastProcessingFailureAt: status.lastProcessingFailureAt || null,
        lastProcessingFailure: status.lastProcessingFailure || null,
        lastFailureAt: status.lastFailureAt || null,
        lastFailure: status.lastFailure || null,
        actions,
      });
    } catch (err) {
      console.error("Webhook health check failed:", err);
      res.status(500).json({ error: err.message });
    }
  }

  // Admin-only: register the storefront domain with Stripe so Apple Pay and
  // Google Pay appear in the card form. Only allowed origins can be registered.
  async function handleRegisterPaymentDomain(req, res) {
    {
      if (!await requireAdmin(req, res)) return;
      const origin = ALLOWED_ORIGINS.find(o => o === req.body?.origin);
      if (!origin) {
        res.status(400).json({ error: "That address isn't an allowed storefront origin." });
        return;
      }
      const domainName = new URL(origin).hostname;
      if (domainName === "localhost" || domainName === "127.0.0.1") {
        res.status(400).json({ error: "Wallets can't be registered for localhost." });
        return;
      }
      try {
        const settingsDoc = await db.collection("settings").doc("website").get();
        const settings = settingsDoc.exists ? settingsDoc.data() : {};
        const testMode = settings.payments?.testMode || false;
        const stripeSettings = await withPrivateStripeKeys(settings.payments?.stripe);
        const stripeSecret = testMode
          ? stripeSettings.testSecretKey
          : (stripeSettings.secretKey || STRIPE_SECRET_KEY.value());
        if (!stripeSecret) throw new Error("Stripe is not configured.");
        const stripe = new Stripe(stripeSecret);
        const existing = await stripe.paymentMethodDomains.list({ domain_name: domainName, limit: 1 });
        let domain = existing.data[0];
        if (!domain) domain = await stripe.paymentMethodDomains.create({ domain_name: domainName, enabled: true });
        else domain = await stripe.paymentMethodDomains.validate(domain.id);
        res.status(200).json({
          domain: domainName,
          applePay: domain.apple_pay?.status || "unknown",
          googlePay: domain.google_pay?.status || "unknown",
        });
      } catch (err) {
        console.error("Payment domain registration failed:", err);
        res.status(500).json({ error: err.message });
      }
    }
  }

  return { handleVerifyStripeKeys, handleInventoryLinkAdmin, handleGiftCardAdmin, handleWebhookHealth, handleRegisterPaymentDomain };
}

module.exports = { checkoutAdminActions };
