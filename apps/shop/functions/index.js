/**
 * Firebase Cloud Functions for the shop
 *
 *   1. createStripeCheckoutSession (HTTP) -> Secure session creation
 *   2. stripeWebhook (HTTP)               -> Secure payment webhook
 *   3. downloadDigitalAsset (HTTP)        -> Secure digital ebook downloads
 *   4. onOrderPaid (Firestore update)     -> Email customer + admin on payment success
 *   5. onOrderShipped (Firestore update)  -> Email customer with tracking
 *   6. abandonedCartSweep (scheduled)     -> Send recovery email after 1h
 */

const { onDocumentUpdated, onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2/options");
const { defineSecret } = require("firebase-functions/params");
const admin = require("./adminSdk")(require("firebase-admin"));
const crypto = require("crypto");
const { browserRequestHandler } = require("./appCheck");
const { risoButton, risoLayout, placeItemsTable } = require("./emailTheme");
// Stripe, nodemailer and Resend load on first use, so the many functions that never pay or mail start faster.
// `new Stripe(key)` / `new Resend(key)` work unchanged (a constructor that returns an object hands that object back).
function Stripe(...args) { return new (require("stripe"))(...args); }
function Resend(...args) { return new (require("resend").Resend)(...args); }
const nodemailer = { createTransport: (...args) => require("nodemailer").createTransport(...args) };
const { calculateShipping } = require("./orderMath");
const { quoteShipping, pickQuote, parseWeightGrams } = require("./shared/shippingEngine");
const { addressKey: guardAddressKey, advancesTracking } = require("./fulfillmentGuard");
const { transactionRefundState, openRefunds, applyRefundChecks } = require("./labelVoid");
const { buildOrderDigest, TRANSIT_DAYS } = require("./orderDigest");
const { checkoutRate } = require("./checkoutRate");
const { liveRateExtra, withLiveRateExtra, cleanLiveRateExtra } = require("./liveRateExtra");
const { FALLBACK_COPY_GRAMS, parcelGrams } = require("./parcelWeight");
const { addressMissing } = require("./shared/addressRules");
const { discountedPhysicalSubtotal, resolveLocalSelection, isPhysicalItem } = require("./shared/localFulfillment");
const { catalogUnitPrice } = require("./catalogPrice");
const { expandDiscountCategories } = require("./shared/discountCategories");
const { discountableItems, discountAmountFor, pickAutomaticDiscount } = require("./shared/discountMath");
const { taxLinesFor } = require("./shared/taxBooks");
const { addOnSelection, bundleComponents, bundleAvailable, isGiftCardProduct, giftCardDetails } = require("./shared/promotions");
const { expiryChange } = require("./giftCards");
const { MAX_CARDS_PER_ORDER, GIFT_CARD_MESSAGES, GiftCardError, newGiftCardCode, normalizeGiftCardCode, giftCardId, last4, giftCardProblem, availableMinor, allocateGiftCards, chargedRedemptions, reserveGiftCards, releaseGiftCards, readGiftCards, debitShortfall, writeGiftCardChange, cardsForOrder, withHistory } = require("./giftCards");
const { readBooks, writeStock } = require("./inventory");
const { resolveCountry } = require("./shared/shippingZones");
const { emailIdentity, openClaims, limitReached } = require("./discountClaims");
const { REQUIRED_WEBHOOK_EVENTS, intentAsSession, paidIntentOrderId, webhookEndpointReport, signingSecrets, reversalState, failedRefundId } = require("./stripeRecovery");
const { orderMoneyFmt, chargedTotalFmt, refundAmountText, withoutTrackingLines, withoutCarrierLines, refundEmailFacts, withoutBankRefundSentences, forDigitalOnlyOrder } = require("./emailMoney");
const { pendingRecord, confirmedRecord, confirmationEmail } = require("./newsletter");
const { findByEmail: findByEmailData, neverPaid, redactedOrderFields, redactedOperationsFields, giftCardsFor, reviewErasure, GIFT_CARD_PERSONAL } = require("./privacyData");
const { optOutId, unsubscribeToken, tokenMatches, purposeToken, purposeTokenMatches, footerAddress, normEmail: normMarketingEmail } = require("./marketingOptOut");
const { runReviewRequests, REVIEW_REQUEST_TEMPLATE } = require("./reviewRequests");
const { checkoutCurrencyOf, paidAmountCheck, toMinor, discountDateState, purchaseProblem, paypalCreateRequestId, lateFailureMayMarkFailed, refundProviderOf, paypalReversalCaptureId, checkoutRefusal, manualPaidRefusal, stripeIntentKey, cancelRefusal, mismatchResolved, stripePaymentTaken, previousAttemptPaid, paypalRefundedTotalMinor, sameOrderLines, shopDate } = require("./paymentGuards");
const { canViewOrder, publicOrderView } = require("./orderAccess");
const { encodeAcquisition } = require("./acquisition");
const { returnTransition, publicReturn, returnRestockItems } = require("./returns");
const { refundRetrySuffix, refundPlan, refundedSoFar, restockLinesFor, withoutRestocked, partialRefundKey } = require("./partialRefund");
const { leftTheShop, restockRefundedOrder } = require("./refundRestock");
const { orderRequestProblem, orderRequestRecord, privacyRequestRecord } = require("./customerRequests");
const { hitLimit, LIMITS, clientIpOf, serverGeoCountry } = require("./rateLimit");
const { cleanReport, recordClientError } = require("./clientErrors");
const { ADDRESS_ACTIONS, addressKeyProblem, handleAddressLookup } = require("./addressLookup");
const { adminReportActions } = require("./adminReports");
const { checkoutAdminActions } = require("./checkoutAdmin");
const { customDomainActions } = require("./customDomains");
const { practiceCheckoutActions } = require("./practiceCheckout");
const { checkoutPaymentActions } = require("./checkoutPayment");
const { createPayments } = require("./payments");
const { isPaymentId, isCheckoutId } = require("./payments/ids");
const { createEmail } = require("./email");
const { createPlatformSender } = require("./email/platformSender");
const { tellPlatformTeamChanged } = require("./teamNotice");
const { shippoEndpoints } = require("./shippoEndpoints");
const { scheduledJobs } = require("./scheduledJobs");
const { shopEmails } = require("./shopEmails");
const { digitalDownloadEndpoint } = require("./digitalDownloadEndpoint");
const { privacyActions } = require("./privacyRequests");
const { orderRequestActions } = require("./orderRequests");
const { shippingLabelEndpoints } = require("./shippingLabels");
const { publicErrorMessage } = require("./publicErrors");
const { reserveStock, releaseStock, StockHoldError, holdOwner, holdLimitsFrom } = require("./stockHolds");
const { preorderActive, preorderLine, preorderEmailLines, releaseDateOf } = require("./shared/preorder");
const { check: checkBody } = require("./shared/edge");
const { orderActionBody, refundOrderBody } = require("./shared/orderActions");
const { GIFT_CARD_BODIES } = require("./shared/giftCardActions");
const digitalDelivery = require("./digitalDelivery");
const { claimEmailSend, claimEmailSendDetailed, reminderFirstName, nextDailyCount } = require("./emailThrottle");
const { paypalCredentials } = require("./paypalCredentials");
const { shopOrigin, checkoutClosed, dailyDigestEnabled, backupStatusRecord } = require("./shopSettings");
const { runInBatches, backupFoldersToPrune } = require("./sweepLimits");
const { MAX_ATTEMPTS, LEASE_MS, LOG_RETENTION_DAYS, GAVE_UP_RETENTION_DAYS, cleanRecipients, nextRetryAt, isPermanentEmailError, canSendNow, publicOutboxEntry, staleOrderEmailReason, daysAgoIso, withRequiredPlaceholders, blankUnknownPlaceholders } = require("./emailOutbox");

// Cost ceiling for every function (#147): an anonymous flood can scale a public endpoint or a
// Firestore trigger only this far. A function that sets its own maxInstances overrides it.
// Every function runs in the shop's own region (shopConfig.js SHOP_FUNCTIONS_REGION; us-central1 when unset).
// On a shop that uses the platform's services (payments through the platform, its email sender), every function gets
// the shop's platform key (platformKey.js); a function's own `secrets` list adds it again with withPlatformKey.
const { usesPlatformServices, withPlatformKey, platformServiceKey } = require("./platformKey");
setGlobalOptions({ maxInstances: 10, region: require("./shopConfig").shopConfig.region, ...(usesPlatformServices() ? { secrets: withPlatformKey([]) } : {}) });

admin.initializeApp();
const db = admin.firestore();
// On the platform's test shop (shopConfig.testShop) and for practice orders (plan 7.6), sandbox payments take stock and
// their refunds put it back.
const { createSettlement, sandboxStockTaken, sandboxTakesStock } = require("./settlePayment");
const { recordOrderMoney, recordPayout } = require("./orderMoney");
const { settlePayment } = createSettlement({ db, increment: n => admin.firestore.FieldValue.increment(n), testShop: require("./shopConfig").shopConfig.testShop });

const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === "true";

// Server-only bookkeeping documents (webhook events, email claims, send throttles) carry an `expiresAt` that
// Firestore's TTL policy (firestore.indexes.json fieldOverrides) uses to delete them, so they cannot grow forever.
const retainFor = days => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

const { adminRole, booksReader, supportOf, syncMemberRole } = require("./roles");
const { shopConfig, functionLink } = require("./shopConfig");

// Who may call the functions from a browser: local dev, this shop's Hosting address and its own domain (shopConfig.js).
const ALLOWED_ORIGINS = shopConfig.allowedOrigins;

// Returns true when the request was an OPTIONS preflight (already answered).
function applyCors(req, res) {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Firebase-AppCheck, X-Order-Key");
    res.set("Access-Control-Max-Age", "3600");
    res.status(204).send("");
    return true;
  }
  return false;
}

// All browser endpoints share attestation; their existing authorization still runs afterwards.
function onBrowserRequest(...args) {
  const handler = args.pop();
  const protectedHandler = browserRequestHandler(handler, {
    mode: () => process.env.APP_CHECK_MODE || "monitor",
    appId: () => "1:100000000001:web:0000000000000000000001",
    emulator: IS_EMULATOR,
    verifyToken: token => admin.appCheck().verifyToken(token),
    applyCors,
    log: fields => console.info(fields),
  });
  return onRequest(...args, protectedHandler);
}

// Verifies the Firebase ID token in the Authorization header and that it
// belongs to an admin. Sends the error response itself; returns null on failure.
// Checks a request body against its shared schema (src/shared/orderActions.ts): the parsed body, or null after a 400.
function readBody(req, res, schema) {
  const result = checkBody(schema, req.body);
  if (result.ok) return result.value;
  res.status(400).json({ error: `This request is missing or has the wrong ${result.error.path || "body"} (expected ${result.error.expected}).`, code: "bad_request" });
  return null;
}

async function requireAdmin(req, res) {
  const match = (req.headers.authorization || "").match(/^Bearer (.+)$/);
  if (!match) {
    res.status(401).json({ error: "Missing Authorization token" });
    return null;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(match[1]);
    if (!adminRole(decoded)) {
      res.status(403).json({ error: "Admin access required" });
      return null;
    }
    return decoded;
  } catch (err) {
    res.status(401).json({ error: "Invalid Authorization token" });
    return null;
  }
}

// The bookkeeper's reads (roles.js booksReader): the admin, or the Team's bookkeeper role. Only read-only actions use it.
async function requireBooksReader(req, res) {
  const match = (req.headers.authorization || "").match(/^Bearer (.+)$/);
  if (!match) {
    res.status(401).json({ error: "Missing Authorization token" });
    return null;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(match[1]);
    if (!booksReader(decoded)) {
      res.status(403).json({ error: "Admin access required" });
      return null;
    }
    return decoded;
  } catch (err) {
    res.status(401).json({ error: "Invalid Authorization token" });
    return null;
  }
}

// Team (functions/roles.js). Adding, changing or removing someone in Settings › Team updates their sign-in pass at once.
// On a platform shop (PLATFORM_ACCOUNTS_URL), the platform is then told, so the person sees the shop in its account
// switcher (teamNotice.js); a failed notice is logged and never undoes the change.
exports.syncMemberRole = onDocumentWritten("members/{email}", async event => {
  await syncMemberRole({ auth: admin.auth(), db, email: event.params.email });
  if (shopConfig.platformAccountsUrl) {
    const notice = await tellPlatformTeamChanged({ url: shopConfig.platformAccountsUrl, shopId: shopConfig.project, serviceKey: platformServiceKey });
    if (!notice.ok) console.warn("The platform wasn't told about the Team change:", notice.reason);
  }
});

// The admin calls this right after Google sign-in: someone added before they ever signed in gets their role now.
exports.refreshMyRole = onBrowserRequest(async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }
  const match = (req.headers.authorization || "").match(/^Bearer (.+)$/);
  let decoded;
  try {
    decoded = match && await admin.auth().verifyIdToken(match[1]);
  } catch { decoded = null; }
  if (!decoded) {
    res.status(401).json({ error: "Sign in first." });
    return;
  }
  // Platform support (roles.js supportOf) has no Team entry to sync: staff until its time runs out. A "view" visit
  // (plan 9.8) opens the admin to look only: the rules and every admin action refuse its changes.
  const support = supportOf(decoded);
  if (support) {
    res.json({ role: "staff", support: true, viewOnly: support.mode !== "edit", ownerEmail: shopConfig.ownerEmail });
    return;
  }
  if (decoded.email_verified !== true) {
    res.json({ role: null });
    return;
  }
  const result = await syncMemberRole({ auth: admin.auth(), db, email: decoded.email });
  const role = adminRole(decoded) === "owner" ? "owner" : result.role ?? null;
  // The admin learns the owner's address here (shopConfig.js SHOP_OWNER_EMAIL) instead of from a public file: only
  // people who can open the admin get it, to leave the owner's own orders and visits out of the figures.
  const opensAdmin = role === "owner" || role === "staff";
  res.json({ role, changed: result.status === "updated", ...(opensAdmin ? { ownerEmail: shopConfig.ownerEmail } : {}) });
});

exports.deleteTestOrders = onBrowserRequest(async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }
  if (!await requireAdmin(req, res)) return;

  const orderIds = Array.isArray(req.body?.orderIds) ? req.body.orderIds : [];
  if (!orderIds.length || orderIds.length > 100 || orderIds.some(id => typeof id !== "string" || !id)) {
    res.status(400).json({ error: "Provide between 1 and 100 valid order IDs." });
    return;
  }

  const refs = orderIds.map(id => db.collection("orders").doc(id));
  const snapshots = await db.getAll(...refs);
  if (snapshots.some(snapshot => snapshot.exists && snapshot.data()?.isTest !== true)) {
    res.status(400).json({ error: "Only records carrying isTest: true may be bulk deleted." });
    return;
  }

  const existing = snapshots.filter(snapshot => snapshot.exists);
  const batch = db.batch();
  existing.forEach(snapshot => batch.delete(snapshot.ref));
  await batch.commit();
  res.json({ deleted: existing.length });
});

const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
const STRIPE_WEBHOOK_URL = functionLink(shopConfig, "stripeWebhook");
const PAYPAL_CLIENT_ID = defineSecret("PAYPAL_CLIENT_ID");
const PAYPAL_CLIENT_SECRET = defineSecret("PAYPAL_CLIENT_SECRET");
const PAYPAL_WEBHOOK_ID = defineSecret("PAYPAL_WEBHOOK_ID");
const SHIPPO_API_TOKEN = defineSecret("SHIPPO_API_TOKEN");
const SHIPPO_CONFIG_DOC = db.collection("private-integrations").doc("shippo");

async function getShippoToken() {
  const configDoc = await SHIPPO_CONFIG_DOC.get();
  const savedToken = configDoc.exists ? configDoc.data()?.apiToken : null;
  if (typeof savedToken === "string" && savedToken.trim()) {
    const trimmed = savedToken.trim();
    return trimmed !== "dummy_value" && trimmed !== "your_shippo_api_token" ? trimmed : null;
  }

  try {
    const secretToken = SHIPPO_API_TOKEN.value();
    return secretToken && secretToken !== "your_shippo_api_token" && secretToken !== "dummy_value" ? secretToken : null;
  } catch (err) {
    console.warn("SHIPPO_API_TOKEN secret not configured.");
    return null;
  }
}

// Secret keys entered in the admin live in the admin-only adminSecrets/* docs.
// Older saves put them in public settings/*; those are still honoured until the
// admin next opens Settings (which moves them), but adminSecrets wins.
async function readAdminSecret(id) {
  try {
    const snap = await db.collection("adminSecrets").doc(id).get();
    return snap.exists ? snap.data() || {} : {};
  } catch (err) {
    console.warn(`Could not read adminSecrets/${id}:`, err);
    return {};
  }
}

// The shop's card payment provider (Stripe unless its shopConfig names another) is reached only through
// functions/payments (code plans 1.11-1.12; the provider interface is listed there). In platform mode (plan 2.2) every
// call goes through the platform's payment service instead, as this shop (its project id is its registry id).
const payments = createPayments({
  provider: shopConfig.paymentProvider, mode: shopConfig.paymentMode,
  service: { url: shopConfig.paymentsServiceUrl, shopId: shopConfig.project, serviceKey: platformServiceKey },
  db, Stripe, liveSecretKey: STRIPE_SECRET_KEY, readAdminSecret,
});
const { testMode: shopTestMode } = payments;

// Asks the payment provider (test and live accounts, the order's own mode first) for one of the
// order's saved payments. Returns { intent | session, mode } or null when no account knows it.
// Only a payment that names this order counts. `keys` (payments.readKeys) skips the settings reads.
async function retrieveOrderPayment(orderId, order, ids = {}, keys = null) {
  return payments.findOrderPayment(orderId, order, ids, keys);
}

const ADMIN_TO = shopConfig.ownerEmail;

function moneyFmt(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}

// The customer's items + totals table, in the currency they paid.
function customerTotalsTable(order) {
  const m = v => orderMoneyFmt(v, order);
  return `
        <table style="width:100%;border-collapse:collapse;margin:24px 0;font-size:13px;">
          ${orderRowsHtml(order.items, order)}
          <tr><td colspan="2" style="padding:8px 0;text-align:right;color:#666;">Subtotal</td><td style="text-align:right;">${m(order.subtotal)}</td></tr>
          <tr><td colspan="2" style="padding:8px 0;text-align:right;color:#666;">Shipping</td><td style="text-align:right;">${m(order.shipping)}</td></tr>
          ${order.tax ? `<tr><td colspan="2" style="padding:8px 0;text-align:right;color:#666;">Tax</td><td style="text-align:right;">${m(order.tax)}</td></tr>` : ""}
          ${order.discount ? `<tr><td colspan="2" style="padding:8px 0;text-align:right;color:#0a7;">${discountLabel(order)}</td><td style="text-align:right;color:#0a7;">−${m(order.discount)}</td></tr>` : ""}
          ${order.giftCardAmount ? `<tr><td colspan="2" style="padding:8px 0;text-align:right;color:#666;">Gift card${(order.giftCardRedemptions || []).length > 1 ? "s" : ""} ${escapeHtml((order.giftCardRedemptions || []).map(r => `••••${r.last4 || ""}`).join(", "))}</td><td style="text-align:right;">−${m(order.giftCardAmount)}</td></tr>` : ""}
          <tr><td colspan="2" style="padding:12px 0;text-align:right;font-weight:bold;">Total</td><td style="text-align:right;font-weight:bold;">${chargedTotalFmt(order)}</td></tr>
        </table>
      `;
}

// "Discount" / "Discount (SPRING)" / the automatic offer's title.
function discountLabel(order) {
  const applied = order.appliedDiscount || {};
  const name = applied.automatic ? applied.title : applied.code;
  return name ? `Discount (${escapeHtml(name)})` : "Discount";
}

// Add-ons, box-set contents, free gift and gift-card recipient under an order line (escaped).
function lineExtrasHtml(i) {
  const notes = [];
  if (i.promoGift) notes.push("Free gift");
  for (const addOn of Array.isArray(i.addOns) ? i.addOns : []) notes.push(`${escapeHtml(addOn.label)}${addOn.text ? `: “${escapeHtml(addOn.text)}”` : ""}`);
  if (Array.isArray(i.components) && i.components.length) notes.push(`Includes ${i.components.map(c => `${Number(c.quantity) > 1 ? `${Number(c.quantity)} × ` : ""}${escapeHtml(c.title || "")}${c.variantName ? ` (${escapeHtml(c.variantName)})` : ""}`).join(", ")}`);
  if (i.giftCard && i.giftCardDetails?.recipientEmail) notes.push(`For ${escapeHtml(i.giftCardDetails.recipientName || i.giftCardDetails.recipientEmail)}`);
  return notes.length ? `<div style="color:#888;font-size:12px;margin-top:4px;">${notes.join("<br/>")}</div>` : "";
}

function orderRowsHtml(items = [], order = null) {
  return items
    .map(
      i => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #eee;">
          ${escapeHtml(i.title)}${i.variantName ? ` <span style="color:#888;">(${escapeHtml(i.variantName)})</span>` : ""}${lineExtrasHtml(i)}
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #eee;text-align:right;color:#888;">×${i.quantity}</td>
        <td style="padding:12px 0;border-bottom:1px solid #eee;text-align:right;">${order ? orderMoneyFmt(i.price * i.quantity, order) : moneyFmt(i.price * i.quantity)}</td>
      </tr>`,
    )
    .join("");
}

// Every email the server sends goes through functions/email (code plan 1.13). `sendEmail` stays index.js's own name for
// it (handler tests swap it out). resendSecretValue is a const further down, so it is read at send time.
// On a platform shop (PLATFORM_EMAIL_URL set), the backup after the press's own Gmail is the platform's shared sender.
const mailer = createEmail({
  db, crypto, Resend, nodemailer, ownerEmail: ADMIN_TO, senderName: shopConfig.senderName, senderEmail: shopConfig.senderEmail,
  readAdminSecret, resendSecretValue: () => resendSecretValue(), escapeHtml,
  platformSender: shopConfig.platformEmailUrl
    ? createPlatformSender({ url: shopConfig.platformEmailUrl, shopId: shopConfig.project, serviceKey: platformServiceKey,
      fetch: (url, options) => fetchWithTimeout(url, options, 20000) })
    : null,
});
const { logEmailAttempt } = mailer;

// One order email of each kind, even when Firestore re-runs the trigger: the send is claimed
// first in the server-only `email-claims` collection (firestore.rules deny every client) and
// the claim is released when the send fails, so a retry can still deliver it.
const emailClaimId = (orderId, kind) => `${orderId}_${kind}`.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 400);
async function sendOrderEmailOnce(orderId, kind, message) {
  const ref = db.collection("email-claims").doc(emailClaimId(orderId, kind));
  let claimed = true;
  try {
    claimed = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (snap.exists) return false;
      tx.set(ref, { orderId, kind, claimedAt: new Date().toISOString(), expiresAt: retainFor(400) });
      return true;
    });
  } catch (err) {
    // Without a claim store we cannot tell; a rare duplicate beats a lost order email.
    console.warn(`Could not claim ${kind} email for ${orderId}; sending anyway:`, err);
  }
  if (!claimed) {
    console.log(`${kind} email for ${orderId} was already sent; skipping duplicate.`);
    return null;
  }
  try {
    return await sendEmail({ queue: kind, ...message, claimId: ref.id, about: { orderId } });
  } catch (err) {
    // Parked in the retry queue: keep the claim so a re-run trigger can't send a second copy.
    if (err?.queued) {
      await ref.set({ queuedAs: err.queued }, { merge: true }).catch(() => {});
      throw err;
    }
    await ref.delete().catch(releaseErr => console.warn(`Could not release ${kind} email claim for ${orderId}:`, releaseErr));
    throw err;
  }
}

// `queue` (a short kind, e.g. "orderConfirmed"): when every sender refuses, park the email in
// the server-only retry queue (emailOutbox) instead of losing it; the thrown error carries
// `.queued` (the queue id). `outboxId` marks a send made by the retry queue itself.
// `attachments` ([{ filename, content: Buffer, contentType }]) go with the email but never into the retry queue (pass no `queue`).
async function sendEmail(message) {
  return mailer.send(message);
}


// ── Email retry queue (server-only emailOutbox; rules in ./emailOutbox) ──
const resendSecretValue = () => { try { return RESEND_API_KEY.value(); } catch { return ""; } };

// Sends one queued email (due, or `force` for the admin's Retry now). Takes a short lease in a
// transaction first so two runs can never send the same email twice.
async function sendQueuedEmail(id, { force = false } = {}) {
  const ref = db.collection("emailOutbox").doc(id);
  let entry = null;
  const now = Date.now();
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists || !canSendNow(snap.data(), now, { force })) return;
    entry = snap.data();
    tx.update(ref, { leaseUntil: new Date(now + LEASE_MS).toISOString() });
  });
  if (!entry) return { status: "skipped" };
  const toText = Array.isArray(entry.to) ? entry.to.join(", ") : String(entry.to || "");
  // Hours may have passed: an order confirmation must not arrive after the refund email.
  const stale = await queuedEmailStale(entry).catch(err => { console.warn(`Could not re-check queued email ${id}:`, err.message); return ""; });
  if (stale) {
    await ref.delete().catch(err => console.warn(`Could not drop queued email ${id}:`, err.message));
    await logEmailAttempt({ to: toText, subject: entry.subject, kind: entry.kind || "", outboxId: id, status: "cancelled", error: `Not sent: ${stale}.` });
    return { status: "cancelled", reason: stale };
  }
  const attempt = (Number(entry.attempts) || 1) + 1;
  try {
    await sendEmail({ to: entry.to, subject: entry.subject, html: entry.html, secret: resendSecretValue(), queue: entry.kind || "retry", outboxId: id, attempt, about: { orderId: entry.orderId || "" } });
  } catch (err) {
    const message = String(err?.message || err).slice(0, 1000);
    const at = new Date().toISOString();
    const retryAt = err?.permanent || isPermanentEmailError(message) ? null : nextRetryAt(attempt, Date.now());
    await ref.update({ attempts: attempt, lastError: message, lastAttemptAt: at, nextAttemptAt: retryAt, status: retryAt ? "pending" : "failed", leaseUntil: null, ...(retryAt ? {} : { gaveUpAt: at }) })
      .catch(updateErr => console.warn(`Could not update queued email ${id}:`, updateErr.message));
    await logEmailAttempt({ to: toText, subject: entry.subject, kind: entry.kind || "", outboxId: id, attempt,
      status: retryAt ? "queued" : "failed", retryAt,
      error: retryAt ? `Try ${attempt} of ${MAX_ATTEMPTS} failed: ${message} Trying again automatically.` : `Gave up after ${attempt} tries: ${message}` });
    return { status: retryAt ? "queued" : "failed", error: message, retryAt };
  }
  // Delivered. Nothing below may send it again: mark it done before removing it, and never fall
  // back into the retry branch if a bookkeeping write fails.
  const at = new Date().toISOString();
  await ref.update({ status: "sent", nextAttemptAt: null, leaseUntil: null, sentAt: at })
    .catch(err => console.warn(`Could not mark queued email ${id} sent:`, err.message));
  await ref.delete().catch(err => console.warn(`Could not remove sent email ${id} from the queue:`, err.message));
  if (entry.claimId) await db.collection("email-claims").doc(entry.claimId).set({ sentAt: at, queuedAs: null }, { merge: true }).catch(() => {});
  if (entry.giftCardId) {
    // Gift cards › Last emailed, as for a first-time send (emailGiftCard).
    try {
      const cardRef = db.collection("giftCards").doc(entry.giftCardId);
      const card = await cardRef.get();
      if (card.exists) await cardRef.update({ emailedAt: at, history: withHistory(card.data(), { type: "emailed", minor: 0, to: toText, at }), updatedAt: at });
    } catch (err) { console.warn(`Could not record gift card ${entry.giftCardId} as emailed:`, err.message); }
  }
  return { status: "sent" };
}

// "" when a queued email still fits, else why it no longer does.
async function queuedEmailStale(entry) {
  if (entry.orderId) {
    const order = await db.collection("orders").doc(entry.orderId).get();
    const reason = staleOrderEmailReason(entry.kind, order.exists ? order.data() : null);
    if (reason) return reason;
  }
  if (entry.giftCardId) {
    const card = await db.collection("giftCards").doc(entry.giftCardId).get();
    if (!card.exists) return "the gift card no longer exists";
    if (card.data().enabled === false) return "the gift card was disabled since";
  }
  return "";
}

// Every 15 minutes (from unpaidPaymentSweep): send due queued emails, then drop old delivery
// rows and given-up queue entries so personal data isn't kept forever.
// `budgetMs` caps the sending so a backlog can never run the sweep out of time; the rest wait.
async function runEmailOutbox(now = Date.now(), { budgetMs = 30000 } = {}) {
  const started = Date.now();
  const due = await db.collection("emailOutbox").where("nextAttemptAt", "<=", new Date(now).toISOString())
    .orderBy("nextAttemptAt").limit(25).get();
  let sent = 0;
  for (const doc of due.docs) {
    if (Date.now() - started > budgetMs) break;
    const result = await sendQueuedEmail(doc.id).catch(err => ({ status: "error", error: err.message }));
    if (result.status === "sent") sent += 1;
  }
  const prune = async (collection, field, before, max) => {
    const old = await db.collection(collection).where(field, "<", before).limit(max).get();
    await Promise.all(old.docs.map(d => d.ref.delete()));
    return old.docs.length;
  };
  const prunedLog = await prune("emailLog", "at", daysAgoIso(LOG_RETENTION_DAYS, now), 300).catch(err => { console.warn("emailLog prune failed:", err.message); return 0; });
  const prunedOutbox = await prune("emailOutbox", "gaveUpAt", daysAgoIso(GAVE_UP_RETENTION_DAYS, now), 100).catch(err => { console.warn("emailOutbox prune failed:", err.message); return 0; });
  // Newsletter signups nobody confirmed within 30 days are strangers' addresses: drop them.
  // Only rows already past the cutoff are read (index: newsletter status + requestedAt), not every pending row each run.
  const prunedPending = await db.collection("newsletter").where("status", "==", "pending")
    .where("requestedAt", "<", daysAgoIso(30, now)).limit(300).get()
    .then(async snap => {
      await Promise.all(snap.docs.map(d => d.ref.delete()));
      return snap.docs.length;
    }).catch(err => { console.warn("pending newsletter prune failed:", err.message); return 0; });
  return { tried: due.docs.length, sent, prunedLog, prunedOutbox, prunedPending };
}

// ──────────────────────────────────────────────────────────────
// Shippo API Normalizers & Helpers
// ──────────────────────────────────────────────────────────────
const US_STATES = {
  "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR", "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE", "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID", "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS", "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD", "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS", "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", "ohio": "OH", "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT", "vermont": "VT", "virginia": "VA", "washington": "WA", "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY"
};

const CA_PROVINCES = {
  "ontario": "ON", "quebec": "QC", "nova scotia": "NS", "new brunswick": "NB", "manitoba": "MB", "british columbia": "BC", "prince edward island": "PE", "saskatchewan": "SK", "alberta": "AB", "newfoundland and labrador": "NL", "newfoundland": "NL", "labrador": "NL", "northwest territories": "NT", "yukon": "YT", "nunavut": "NU"
};

// Country name or code -> ISO code. Unknown names give "" (never a guess: the
// old fallback turned every unrecognised country into "US", so French
// addresses were quoted as American and US-allowlisted live rates leaked abroad).
function getCountryCode(countryName) {
  const resolved = resolveCountry(countryName);
  if (resolved) return resolved.code;
  const clean = String(countryName || "").trim();
  return /^[a-z]{2}$/i.test(clean) ? clean.toUpperCase() : "";
}

function getStateCode(stateName) {
  const clean = (stateName || "").trim().toLowerCase();
  if (clean.length === 2) {
    return clean.toUpperCase();
  }
  return US_STATES[clean] || CA_PROVINCES[clean] || String(stateName || "").toUpperCase();
}

// Shippo "address_from": Settings › General › Location (street, city, province, postal code,
// country, phone), each blank field falling back to the original Toronto address.
function originAddress(settings) {
  const origin = shopOrigin(settings);
  return { ...origin, state: getStateCode(origin.state), country: getCountryCode(origin.country) || "CA" };
}

// fetch() with a hard timeout so a slow/hung third party can never stall a
// request that sits on the checkout critical path. Resolves/rejects like fetch;
// aborts (and throws) after `ms` milliseconds.
async function fetchWithTimeout(url, options = {}, ms = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Timeout: a hung Shippo call must never hold a function open until it is killed. Label purchases
// are the one place an aborted request may still have been processed, so they stay "uncertain".
async function callShippo(endpoint, method, body, token, timeoutMs = 15000) {
  const headers = {
    "Authorization": `ShippoToken ${token}`,
    "Content-Type": "application/json"
  };
  const res = await fetchWithTimeout(`https://api.goshippo.com/${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  }, timeoutMs);
  if (!res.ok) {
    const errorText = await res.text();
    const error = new Error(`Shippo API error: ${res.status} - ${errorText}`);
    error.shippoStatus = res.status;
    throw error;
  }
  return await res.json();
}

// `calculateShipping` now lives in ./orderMath (pure + unit-tested).

// Region-aware tax matching: prefer a rate whose region matches the
// destination state/province, otherwise fall back to the country-wide rate.
function matchTaxRate(rates, country, state) {
  const normalizeCountry = value => {
    const clean = String(value || '').trim().toLowerCase();
    if (clean === 'ca' || clean === 'canada') return 'ca';
    if (['us', 'usa', 'united states', 'united states of america'].includes(clean)) return 'us';
    return clean;
  };
  const c = normalizeCountry(country);
  const countryRates = (rates || []).filter(
    r => normalizeCountry(r.country) === c
  );
  if (countryRates.length === 0) return null;
  const stateCode = getStateCode(state || "");
  const regional = countryRates.find(r => {
    const region = (r.region || "").trim();
    return region && getStateCode(region) === stateCode;
  });
  return regional || countryRates.find(r => !r.region) || null;
}

// Loads a discount by code and enforces active / expiry / usage limits.
// Throws with a customer-readable message when the code cannot be used.
async function fetchValidDiscount(code) {
  // Pasted/autocorrected codes often carry spaces ("SUMMER25 ").
  const clean = String(code || "").trim().toUpperCase();
  if (!clean) throw new Error("Invalid or expired discount code");
  const snap = await db
    .collection("discounts")
    .where("code", "==", clean)
    .limit(10)
    .get();
  if (snap.empty) throw new Error("Invalid or expired discount code");
  // A code re-created for a new campaign can sit beside its expired/used-up predecessor:
  // use whichever copy is usable, and only report a problem when none is.
  let firstProblem = null;
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    // An automatic offer is never redeemed by typing a code (even one left over from before).
    if (data.method === "automatic") continue;
    const problem = discountProblem(data);
    if (!problem) return { id: docSnap.id, ...data };
    firstProblem = firstProblem || problem;
  }
  throw new Error(firstProblem || "Invalid or expired discount code");
}

function discountProblem(data) {
  const isActive = data.isActive ?? data.active ?? true;
  if (!isActive) return "This code is not currently active";
  const dateState = discountDateState(data);
  if (dateState === "not_started") return "This code is not active yet";
  if (dateState === "expired") return "This code has expired";
  if (data.usageLimit && (data.usageCount || 0) >= data.usageLimit) return "This code has reached its usage limit";
  return null;
}

// "One use per customer" and the code's usage limit, on the trusted server path. A customer is the
// mailbox behind the address (name+2@gmail.com and n.ame@gmail.com are name@gmail.com), and a use is
// held from the moment an order that used the code is paid, waiting for a manual payment, or has a
// card/PayPal payment under way (functions/discountClaims.js) — so two tabs, or a crowd checking out at
// once, cannot all get a "first 50 customers" price before the first of them has paid.
async function assertDiscountNotUsedByCustomer(discount, email, orderId = "") {
  const limited = Number(discount.usageLimit) > 0;
  if (!discount.onePerCustomer && !limited) return;
  const normalized = String(email || "").trim().toLowerCase();
  if (discount.onePerCustomer && !normalized) throw new Error("Enter your email address to use this code.");
  const identity = emailIdentity(normalized);
  const snap = await db.collection("orders")
    .where("appliedDiscount.id", "==", discount.id)
    .where("paymentStatus", "in", ["paid", "pending", "unpaid"])
    .limit(1000)
    .get();
  const rows = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  if (discount.onePerCustomer) {
    const mine = rows.filter(row => row.id !== orderId && emailIdentity(row.customer?.email) === identity);
    if (mine.some(row => row.paymentStatus === "paid" || openClaims([row], { orderId }).some(claim => claim.paymentStatus === "pending"))) {
      throw new Error("You have already used this code.");
    }
  }
  if (limited && limitReached(discount, openClaims(rows, { orderId }), identity)) throw new Error("This code has reached its usage limit");
}

// Enforce customer targeting on the trusted server path. Client validation is
// only an early UX hint and must never authorize a restricted promotion.
function validateDiscountCustomer(discount, email) {
  const normalized = String(email || "").trim().toLowerCase();
  const emails = String(discount.allowedCustomerEmails || "").split(",").map(v => v.trim().toLowerCase()).filter(Boolean);
  const domains = String(discount.allowedEmailDomains || "").split(",").map(v => v.trim().toLowerCase().replace(/^[@.]+/, "")).filter(Boolean);
  if ((emails.length || domains.length) && !normalized) throw new Error("Enter your email address to use this code.");
  if (emails.length && !emails.includes(normalized)) throw new Error("This code is restricted to selected customers.");
  if (domains.length) {
    const customerDomain = normalized.split("@")[1] || "";
    if (!domains.some(domain => customerDomain === domain || customerDomain.endsWith(`.${domain}`))) throw new Error("This code is restricted to selected email domains.");
  }
}

// Exchange rates (functions/exchangeRates.js): checkout charges the saved daily copy in settings/exchangeRates,
// the same numbers the storefront shows. The scheduled job below refreshes it.
const { FALLBACK_RATES, createRateReader, refreshStoredRates } = require("./exchangeRates");
const getExchangeRates = createRateReader({ db });

exports.refreshExchangeRates = onSchedule({ schedule: "every 3 hours", timeoutSeconds: 60 }, async () => {
  const saved = await refreshStoredRates({ db });
  if (saved) console.log(`Exchange rates saved: 1 CAD = ${saved.usd} USD, ${saved.eur} EUR (feed updated ${saved.providerUpdatedAt || "unknown"}).`);
  else console.warn("Exchange-rate refresh failed: the shop keeps its last saved rates.");
});

// ──────────────────────────────────────────────────────────────
// PayPal Orders API helpers
// ──────────────────────────────────────────────────────────────
function paypalBaseUrl(testMode) {
  return testMode ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
}

async function getPayPalConfig() {
  const settingsDoc = await db.collection("settings").doc("website").get();
  const settings = settingsDoc.data() || {};
  return {
    settings,
    testMode: Boolean(settings.payments?.testMode),
    // The Functions secrets stay the live fallback; Settings › Payments › PayPal (client ids) and the private
    // adminSecrets/paypal (client secrets) are read when the token is requested, once the order's mode is known.
    clientId: PAYPAL_CLIENT_ID.value(),
    clientSecret: PAYPAL_CLIENT_SECRET.value(),
    settingsPaypal: settings.payments?.paypal || {},
    privateSecrets: await readAdminSecret("paypal"),
  };
}

async function getPayPalAccessToken(config) {
  const creds = paypalCredentials({
    testMode: config.testMode, settingsPaypal: config.settingsPaypal, privateSecrets: config.privateSecrets,
    fallback: { clientId: config.clientId, clientSecret: config.clientSecret },
  });
  if (!creds.ok) throw new Error(creds.error);
  const response = await fetch(`${paypalBaseUrl(config.testMode)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || "PayPal authentication failed.");
  return data.access_token;
}

async function paypalRequest(config, path, options = {}) {
  const accessToken = await getPayPalAccessToken(config);
  const response = await fetch(`${paypalBaseUrl(config.testMode)}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.details?.[0]?.description || data.message || "PayPal request failed.";
    throw new Error(detail);
  }
  return data;
}

// What the customer is told to expect, saved on the order for the thank-you page,
// tracking page and emails. `days` is a carrier number or a profile range ("3-7").
function shippingEstimateOf(days, terms) {
  const cleanDays = days === undefined || days === null || days === "" ? "" : String(days).trim().slice(0, 20);
  const cleanTerms = String(terms || "").trim().slice(0, 200);
  return cleanDays || cleanTerms ? { days: cleanDays, terms: cleanTerms } : null;
}

// Server-authoritative shipping: quotes every configured rate for the cart and
// charges the one the customer selected (order.shippingMethod), else the
// cheapest. Profiles without zones keep the legacy flat calculation. Returns
// { cost, method } or throws when the destination can't be served.
async function resolveShipping(items, order, profiles, freeShipping, settings, discountedPhysical) {
  const address = order.customer && order.customer.address;
  const selection = order.fulfillmentSelection;
  const physicalItems = items.filter(isPhysicalItem);
  if (selection && selection.method !== 'shipping') {
    return resolveLocalSelection(settings.localFulfillment, selection, address, discountedPhysical, physicalItems, freeShipping);
  }
  if (!physicalItems.length) {
    if (selection && selection.method !== 'shipping') throw new Error('That fulfillment option is unavailable for digital orders.');
    return { cost: 0, method: null, fulfillment: null };
  }
  if (selection && (selection.method !== 'shipping' || /^(pickup|local_delivery):/.test(String(selection.optionId || '')))) throw new Error('Choose an available fulfillment option.');
  let liveRatesTried = false;
  if (address) {
    const configDoc = await SHIPPO_CONFIG_DOC.get();
    const config = configDoc.exists ? configDoc.data() || {} : {};
    const destinationCountry = getCountryCode(address.country);
    const enabledCountries = Array.isArray(config.dynamicRateCountries) ? config.dynamicRateCountries : [];
    if (config.dynamicRatesEnabled === true && enabledCountries.includes(destinationCountry)) {
      // A free-shipping code covers whichever live carrier rate the shopper picked;
      // the profile rates below never contain carrier names, so they can't match it.
      if (freeShipping) return { cost: 0, method: String(selection?.optionId || order.shippingMethod || '').slice(0, 200) || null };
      liveRatesTried = true;
      const shippoToken = await getShippoToken();
      // No usable live rates (no token, Shippo down, no carrier quotes, or the shopper
      // was shown profile rates instead): fall through to the profile/zone rates below,
      // exactly as checkout does in the browser. The charge is still priced here.
      const liveQuote = shippoToken ? await (async () => {
      const settingsDoc = await db.collection("settings").doc("website").get();
      const settings = settingsDoc.data() || {};
      const totalWeightG = physicalItems.reduce((sum, item) => {
        const grams = Number(item.weightGrams);
        return sum + ((Number.isFinite(grams) && grams > 0 ? grams : FALLBACK_COPY_GRAMS) * (item.quantity || 1));
      }, 0);
      const shipment = await callShippo("shipments/", "POST", {
        address_from: originAddress(settings),
        address_to: {
          name: order.customer?.name || "Customer",
          street1: address.street,
        street2: address.unit || "",
          city: address.city,
          state: getStateCode(address.state),
          zip: address.zip,
          country: destinationCountry,
        },
        parcels: [{ length: "10", width: "8", height: "2", distance_unit: "in", weight: parcelGrams(totalWeightG), mass_unit: "g" }],
        async: false,
      }, shippoToken);
      const carrierQuotes = (shipment.rates || []).map(rate => ({
        name: `${rate.provider || ""} ${rate.servicelevel?.name || rate.servicelevel?.token || "Shipping"}`.trim(),
        // Same extra the shopper was shown (getShippoRates), so the charge matches the quote.
        price: withLiveRateExtra(Number(rate.amount), liveRateExtra(config)),
        estimate: shippingEstimateOf(rate.estimated_days, rate.duration_terms),
      })).filter(rate => Number.isFinite(rate.price)).sort((a, b) => a.price - b.price);
      if (!carrierQuotes.length) return null;
      const selectedCarrier = selection?.optionId || order.shippingMethod;
      const pickedCarrier = selection ? carrierQuotes.find(quote => quote.name === selectedCarrier) : pickQuote(carrierQuotes, selectedCarrier);
      if (pickedCarrier) return { cost: pickedCarrier.price, method: pickedCarrier.name, estimate: pickedCarrier.estimate };
      // The shopper picked a profile rate (browser fallback) — price it from profiles below.
      // Live rates exist now, so a cheaper profile rate may not stand in for them: the shop would pay the
      // carrier's real price for the label and collect the profile price. The profile fallback is only for
      // when the carrier gave no rates at all (handled above) or could not be reached.
      // Coded so checkout fetches the live rates again and shows them (it may have fallen back to profile
      // rates because its own rate request failed or timed out).
      throw Object.assign(new Error("That live carrier rate is no longer available. Please review the shipping options and try again."), { code: "shipping_rates_changed" });
      })().catch(err => {
        if (/no longer available/.test(err.message)) throw err;
        console.warn("Live carrier rates unavailable, using profile rates:", err.message);
        return null;
      }) : null;
      if (liveQuote) return liveQuote;
    }
  }
  const hasZones = profiles.some((p) => Array.isArray(p.zones) && p.zones.length);
  // The shopper picked a carrier rate but the carrier couldn't be reached (or returned nothing): say so,
  // instead of claiming the shop doesn't ship there.
  const carrierUnavailable = () => new Error("Live carrier shipping rates are temporarily unavailable. Please try again in a few minutes.");
  if (!hasZones) {
    if (selection) {
      const choices = quoteShipping(physicalItems, address, profiles, { freeAll: !!freeShipping }).filter(quote => quote.type !== 'pickup');
      const chosen = choices.find(quote => quote.id === selection.optionId || quote.name === selection.optionId);
      if (!chosen && liveRatesTried) throw carrierUnavailable();
      if (!chosen) throw new Error('That shipping rate is no longer available. Please review the options and try again.');
      return { cost: chosen.price, method: chosen.name, estimate: shippingEstimateOf(chosen.deliveryDays) };
    }
    return { cost: freeShipping ? 0 : calculateShipping(physicalItems, address, profiles), method: order.shippingMethod || null };
  }
  const quotes = quoteShipping(physicalItems, address, profiles, { freeAll: !!freeShipping }).filter(quote => quote.type !== 'pickup');
  const selectedRate = selection?.optionId || order.shippingMethod;
  const picked = selection ? quotes.find(quote => quote.id === selectedRate || quote.name === selectedRate) : pickQuote(quotes, selectedRate);
  if (!picked && selection && liveRatesTried) throw carrierUnavailable();
  if (!picked) {
    throw new Error(`We don't currently ship these items to ${(address && address.country) || "that destination"}. Please contact us for a custom quote.`);
  }
  return { cost: picked.price, method: picked.name, estimate: shippingEstimateOf(picked.deliveryDays) };
}

// Mirrors taxCollectionOn in src/app/features/site/taxRate.ts (missing = on).
function taxCollectionOn(settings) {
  return settings?.taxes?.collect !== false;
}

// Returns the tax charged and its split by each rate's name in the books (`taxLines`, cents; src/shared/taxBooks.ts).
function authoritativeTax(items, discountAmount, discount, booksById, settings, order, fulfillment) {
  // Settings › Taxes › "Collect sales tax" off: no tax on any order. Rates stay saved for turning it back on.
  if (!taxCollectionOn(settings)) return { tax: 0, taxLines: [] };
  const rates = settings.taxes?.rates || [];
  const discountedPhysical = discountedPhysicalSubtotal(items, discountAmount, discount, booksById);
  const taxableTotal = Math.max(0, items.reduce((sum, item) => sum + item.price * item.quantity, 0) - discountAmount);
  const address = order.customer?.address || {};
  const charged = parts => ({ tax: parts.reduce((sum, part) => sum + part.amount, 0), taxLines: taxLinesFor(parts) });
  if (fulfillment?.method === 'pickup') {
    const pickup = fulfillment.address;
    // Pickup limited to an area collects the shopper's address instead of a separate billing location.
    const given = order.customer?.billingAddress;
    const billing = given?.country && given?.state ? given : order.customer?.address;
    if (!billing || !billing.country || !billing.state) throw new Error('Billing country and province or state are required for pickup.');
    const physicalRate = matchTaxRate(rates, pickup.country, pickup.state);
    const digitalRate = matchTaxRate(rates, billing.country, billing.state);
    return charged([
      { rate: physicalRate, amount: discountedPhysical * (Number(physicalRate?.rate || 0) / 100) },
      { rate: digitalRate, amount: (taxableTotal - discountedPhysical) * (Number(digitalRate?.rate || 0) / 100) },
    ]);
  }
  const basis = Object.keys(address).length ? address : order.customer?.billingAddress || {};
  if (!basis.country) throw new Error('Destination country is required for tax.');
  const taxRate = matchTaxRate(rates, basis.country, basis.state);
  // Not silent: a country with rates but none for this province is flagged in Ready to sell.
  if (!taxRate && taxableTotal > 0 && rates.length) console.warn(`No tax rate matches ${basis.country}/${basis.state || "-"}; charging no tax.`);
  return charged([{ rate: taxRate, amount: taxableTotal * (Number(taxRate?.rate || 0) / 100) }]);
}

function itemWeightGrams(book, variant) {
  return parseWeightGrams(variant && variant.weight) ?? parseWeightGrams(book.weight);
}
function catalogFormat(book, variant) {
  if (variant?.format) return variant.format;
  if (/digital|ebook|e-book|epub|pdf|audiobook|paperback|hardcover|hardback|softcover/i.test(String(variant?.name || ''))) return variant.name;
  return book.format || '';
}
function catalogDigital(book, variant) {
  // A gift card is emailed, never shipped.
  if (isGiftCardProduct(book)) return true;
  return variant?.digital === true || variant?.isDigital === true || (!variant && (book.digital === true || book.isDigital === true));
}

// One line's pre-order state from several catalog books (a box set and its parts): on pre-order
// when any is; the release date is the latest, and "date to be announced" when any has none.
function combinedPreorder(books) {
  const lines = books.filter(Boolean).map(b => preorderLine(b)).filter(line => line.preorder);
  if (!lines.length) return { preorder: false, releaseDate: null };
  if (lines.some(line => !line.releaseDate)) return { preorder: true, releaseDate: null };
  return { preorder: true, releaseDate: lines.map(line => line.releaseDate).sort().at(-1) };
}

// A checkout refusal the shopper can act on (sold out, discount refused…): answered with 400.
class PricingError extends Error {
  constructor(message, code) {
    super(message);
    this.status = 400;
    if (code) this.code = code;
  }
}

// Active automatic discounts (Discounts › Automatic): no code, applied by checkout itself.
async function loadAutomaticDiscounts() {
  const snap = await db.collection("discounts").where("method", "==", "automatic").limit(50).get();
  return snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })).filter(discount => !discountProblem(discount));
}

// The public "automaticDiscounts" answer only: shared by every caller of this instance for 30 s. Pricing an
// order always calls loadAutomaticDiscounts() fresh.
let automaticDiscountsCache = { at: 0, promise: null };
function cachedAutomaticDiscounts(now = Date.now()) {
  if (!automaticDiscountsCache.promise || now - automaticDiscountsCache.at > 30_000) {
    const promise = loadAutomaticDiscounts();
    promise.catch(() => { if (automaticDiscountsCache.promise === promise) automaticDiscountsCache = { at: 0, promise: null }; });
    automaticDiscountsCache = { at: now, promise };
  }
  return automaticDiscountsCache.promise;
}

// Prices an order from the live catalog for every checkout path (card, PayPal, manual, free).
// Nothing the browser sends decides a price: books, editions, add-ons, box-set parts, the
// discount (a code, else the best automatic offer, including a free gift), shipping, tax and
// gift-card amounts are all worked out here. Throws PricingError for a shopper-fixable problem.
async function priceOrder(order, { orderId = "", settings: knownSettings = null } = {}) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(order.customer?.email || "").trim())) {
    throw new PricingError("Check the email address: it doesn't look complete.");
  }
  const booksById = {};
  const getBook = async id => {
    if (typeof id !== "string" || !id || id.includes("/")) return null;
    if (!(id in booksById)) {
      const snap = await db.collection("books").doc(id).get();
      booksById[id] = snap.exists ? snap.data() : null;
    }
    return booksById[id];
  };
  const items = [];
  for (const requested of order.items || []) {
    // A free gift is never taken from the browser: it is re-added below when the order earns it.
    if (!requested || requested.promoGift === true) continue;
    const label = requested.title || requested.id;
    const book = await getBook(requested.id);
    if (!book) throw new PricingError(`Book ${label} not found in library catalog.`);
    const problem = purchaseProblem(book, requested.variantId);
    if (problem === "choose_edition") throw new PricingError(`Choose an edition of "${book.title || label}" before checking out.`);
    if (problem) throw new PricingError(`"${book.title || label}" is not available to buy right now. Please remove it from your bag.`);
    const quantity = Math.max(1, Math.min(99, Math.floor(Number(requested.quantity) || 1)));
    const variant = requested.variantId ? (book.variants || []).find(v => v.id === requested.variantId) || null : null;
    if (requested.variantId && !variant) throw new PricingError(`Selected edition for "${book.title || label}" is no longer available.`);
    const parts = bundleComponents(book);
    const components = [];
    if (parts.length) {
      for (const part of parts) {
        const partBook = await getBook(part.id);
        const partVariant = part.variantId ? (partBook?.variants || []).find(v => v.id === part.variantId) || null : null;
        if (!partBook || (part.variantId && !partVariant)) throw new PricingError(`"${book.title || label}" is not available to buy right now. Please remove it from your bag.`);
        components.push({ id: part.id, variantId: part.variantId, quantity: part.quantity, title: partBook.title || "", ...(partVariant?.name ? { variantName: partVariant.name } : {}) });
      }
      const sets = bundleAvailable(book, id => booksById[id] || undefined);
      if (sets < quantity) throw new PricingError(`Insufficient stock for ${book.title || label}. Only ${Math.max(0, sets)} left.`);
    } else if (book.trackInventory && !book.allowBackorder) {
      const available = variant ? Number(variant.stock || 0) : Number(book.stockLevel || 0);
      if (available < quantity) throw new PricingError(`Insufficient stock for ${book.title || label}${variant?.name ? ` (${variant.name})` : ""}. Only ${available} left.`);
    }
    const basePrice = catalogUnitPrice(book, variant);
    if (!Number.isFinite(basePrice) || basePrice < 0) throw new PricingError(`"${book.title || label}" is temporarily unavailable for purchase (pricing error).`);
    let picked;
    try {
      picked = addOnSelection(book, requested.addOns);
    } catch (err) {
      throw new PricingError(err.message);
    }
    const giftCard = isGiftCardProduct(book);
    if (giftCard && !(basePrice > 0)) throw new PricingError(`"${book.title || label}" is not available to buy right now. Please remove it from your bag.`);
    let giftCardInfo = null;
    if (giftCard) {
      try {
        giftCardInfo = giftCardDetails(requested.giftCardDetails);
      } catch (err) {
        throw new PricingError(err.message);
      }
    }
    // Only fields the browser may describe are kept; everything that prices or ships comes from the catalog.
    const { components: _c, promoGift: _p, giftCard: _g, giftCardDetails: _d, addOns: _a, bundle: _b, basePrice: _bp, ...rest } = requested;
    // Each part weighs what its chosen edition weighs (falling back to the book).
    const partWeights = components.map(part => {
      const partBook = booksById[part.id] || {};
      const partVariant = part.variantId ? (partBook.variants || []).find(v => v.id === part.variantId) || null : null;
      return itemWeightGrams(partBook, partVariant) ?? null;
    });
    const bundleWeight = components.length && partWeights.every(w => w != null) ? partWeights.reduce((sum, w, i) => sum + w * components[i].quantity, 0) : null;
    items.push({
      ...rest,
      // Names come from the catalog, never from the browser (they go into emails).
      title: book.title || requested.title || "",
      variantName: variant ? (variant.name || null) : null,
      quantity,
      price: Math.round((basePrice + picked.price) * 100) / 100,
      ...(picked.addOns.length ? { basePrice, addOns: picked.addOns } : {}),
      ...(components.length ? { bundle: true, components } : {}),
      ...(giftCard ? { giftCard: true, giftCardDetails: giftCardInfo } : {}),
      format: giftCard ? "Gift card" : catalogFormat(book, variant),
      digital: catalogDigital(book, variant),
      isDigital: catalogDigital(book, variant),
      shippingProfileId: book.shippingProfileId || null,
      weightGrams: itemWeightGrams(book, variant) ?? bundleWeight,
      // Pre-order state comes from the catalog at checkout (never from the browser). A box set
      // waits for the latest pre-order book inside it.
      ...combinedPreorder([book, ...components.map(part => booksById[part.id])]),
    });
  }
  if (!items.length) throw new PricingError("Order has no items.");

  const settings = knownSettings || (await db.collection("settings").doc("website").get()).data() || {};
  // Settings › General › Store status › Maintenance: every checkout path is priced here, so this stops them all.
  if (checkoutClosed(settings)) throw new PricingError("The shop is paused for maintenance, so checkout is closed for now. Please try again soon.", "store_closed");
  const testMode = settings.payments?.testMode === true;
  const email = order.customer?.email;
  const discountable = discountableItems(items);

  // Discount: a code the shopper entered, else the best automatic offer. One per order.
  let discount = 0;
  let appliedDiscount = null;
  let verifiedDiscount = null;
  let freeShipping = false;
  const giftPrices = {};
  const giftLineFor = async offer => {
    const giftBook = await getBook(offer.giftBookId);
    const giftVariant = offer.giftVariantId ? (giftBook?.variants || []).find(v => v.id === offer.giftVariantId) || null : null;
    if (!giftBook || purchaseProblem(giftBook, offer.giftVariantId || null) || (offer.giftVariantId && !giftVariant)) return null;
    if (isGiftCardProduct(giftBook) || bundleComponents(giftBook).length) return null;
    if (giftBook.trackInventory && !giftBook.allowBackorder) {
      const inBag = items.filter(i => i.id === offer.giftBookId && (i.variantId || null) === (offer.giftVariantId || null)).reduce((sum, i) => sum + i.quantity, 0);
      const stock = giftVariant ? Number(giftVariant.stock || 0) : Number(giftBook.stockLevel || 0);
      if (stock < inBag + 1) return null;
    }
    const price = catalogUnitPrice(giftBook, giftVariant);
    if (!Number.isFinite(price) || price < 0) return null;
    return {
      id: offer.giftBookId, variantId: offer.giftVariantId || null, title: giftBook.title || "", variantName: giftVariant?.name || null,
      quantity: 1, price, promoGift: true, photoUrl: giftVariant?.photoUrl || giftBook.photos?.[0]?.url || "",
      format: catalogFormat(giftBook, giftVariant), digital: catalogDigital(giftBook, giftVariant), isDigital: catalogDigital(giftBook, giftVariant),
      shippingProfileId: giftBook.shippingProfileId || null, weightGrams: itemWeightGrams(giftBook, giftVariant), ...preorderLine(giftBook),
    };
  };
  const giftLines = {};
  const priceGift = async offer => {
    if (!(offer.id in giftLines)) giftLines[offer.id] = await giftLineFor(offer);
    giftPrices[offer.id] = giftLines[offer.id] ? giftLines[offer.id].price : NaN;
  };
  if (order.appliedDiscount?.code) {
    // Same "Discount code error:" prefix on every path, so checkout can drop the code and explain.
    try {
      const verified = expandDiscountCategories(await fetchValidDiscount(order.appliedDiscount.code), settings.design?.categories);
      verifiedDiscount = verified;
      validateDiscountCustomer(verified, email);
      await assertDiscountNotUsedByCustomer(verified, email, orderId);
      if (verified.type === "gift") await priceGift(verified);
      discount = discountAmountFor(verified, discountable, booksById, { giftPrice: giftPrices[verified.id] });
      freeShipping = verified.type === "freeship";
      appliedDiscount = { id: verified.id, code: verified.code, type: verified.type, value: verified.value ?? null };
    } catch (discountErr) {
      throw new PricingError(`Discount code error: ${discountErr.message}`, "discount_rejected");
    }
  } else {
    const offers = [];
    for (const rawOffer of await loadAutomaticDiscounts()) {
      // Category offers cover the storefront's category membership (aliases, sub-categories).
      const offer = expandDiscountCategories(rawOffer, settings.design?.categories);
      try {
        validateDiscountCustomer(offer, email);
        await assertDiscountNotUsedByCustomer(offer, email, orderId);
      } catch {
        continue;
      }
      if (offer.type === "gift") await priceGift(offer);
      offers.push(offer);
    }
    const best = pickAutomaticDiscount(offers, discountable, booksById, offer => giftPrices[offer.id]);
    if (best) {
      verifiedDiscount = best.discount;
      discount = best.amount;
      freeShipping = best.freeShipping;
      appliedDiscount = { id: best.discount.id, code: null, automatic: true, title: String(best.discount.title || "").slice(0, 120), type: best.discount.type, value: best.discount.value ?? null };
    }
  }
  if (verifiedDiscount?.type === "gift" && giftLines[verifiedDiscount.id]) items.push(giftLines[verifiedDiscount.id]);
  discount = Math.round(discount * 100) / 100;

  // Gift cards are paid at face value: no tax and no discount on them.
  const taxable = items.filter(item => item.giftCard !== true);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const profilesSnap = await db.collection("shipping-profiles").get();
  const profiles = profilesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const discountedPhysical = discountedPhysicalSubtotal(taxable, discount, verifiedDiscount, booksById);
  let shipResult;
  try {
    shipResult = await resolveShipping(items, order, profiles, freeShipping, settings, discountedPhysical);
  } catch (err) {
    throw new PricingError(err.message, err.code === "shipping_rates_changed" ? err.code : undefined);
  }
  const shipping = shipResult.cost;
  let tax, taxLines;
  try {
    ({ tax, taxLines } = authoritativeTax(taxable, discount, verifiedDiscount, booksById, settings, order, shipResult.fulfillment));
  } catch (err) {
    throw new PricingError(err.message);
  }
  const beforeGiftCards = subtotal - discount + shipping + tax;

  // Gift cards (checkout's "Gift card" box) pay what is left, except other gift cards in the bag.
  const giftCardLines = items.filter(item => item.giftCard === true).reduce((sum, item) => sum + item.price * item.quantity, 0);
  const coverableMinor = Math.max(0, Math.round((beforeGiftCards - giftCardLines) * 100));
  const codes = [...new Set((Array.isArray(order.giftCards) ? order.giftCards : []).map(card => normalizeGiftCardCode(card && card.code)).filter(Boolean))];
  if (codes.length > MAX_CARDS_PER_ORDER) throw new PricingError(`Use up to ${MAX_CARDS_PER_ORDER} gift cards on one order.`, "gift_card_rejected");
  const cardsAvailable = [];
  const nowMs = Date.now();
  const owner = holdOwner(order);
  let testCardUsed = false;
  for (const code of codes) {
    const id = giftCardId(code);
    const snap = await db.collection("giftCards").doc(id).get();
    const card = snap.exists ? snap.data() : null;
    const problem = giftCardProblem(card, { testMode });
    if (problem) throw new PricingError(`Gift card error: ${GIFT_CARD_MESSAGES[problem]}`, "gift_card_rejected");
    if (card.isTest === true) testCardUsed = true;
    cardsAvailable.push({ id, last4: last4(code), availableMinor: availableMinor(card, orderId, nowMs, owner) });
  }
  const redemptions = allocateGiftCards(cardsAvailable, coverableMinor).map(r => ({ ...r, last4: cardsAvailable.find(c => c.id === r.id).last4 }));
  const giftCardAmount = redemptions.reduce((sum, r) => sum + r.minor, 0) / 100;
  const total = Math.round((beforeGiftCards - giftCardAmount) * 100) / 100;
  return {
    items, booksById, settings, testMode, subtotal, discount, appliedDiscount, verifiedDiscount,
    shipping, shippingMethod: shipResult.method || null, shippingEstimate: shipResult.estimate || null, fulfillment: shipResult.fulfillment || null,
    tax, taxLines, giftCardAmount, giftCardRedemptions: redemptions, total, testCardUsed,
  };
}

async function recalculateOrder(orderRef, order, checkoutCurrency, orderId = "") {
  const priced = await priceOrder(order, { orderId });
  const { items, subtotal, discount, appliedDiscount, shipping, tax, total, settings } = priced;
  const rates = await getExchangeRates();
  const exchangeRate = rates[checkoutCurrency] || FALLBACK_RATES[checkoutCurrency] || 1;
  const convertedTotal = Math.round(total * exchangeRate * 100) / 100;
  const update = {
    items: items.map(({ shippingProfileId, ...item }) => item), subtotal, discount, appliedDiscount,
    shipping, tax, taxLines: priced.taxLines, total, checkoutCurrency: checkoutCurrency.toUpperCase(), exchangeRate,
    giftCardAmount: priced.giftCardAmount, giftCardRedemptions: priced.giftCardRedemptions,
    ...(priced.shippingMethod ? { shippingMethod: priced.shippingMethod } : {}),
    shippingEstimate: priced.shippingEstimate,
    fulfillment: priced.fulfillment,
    updatedAt: new Date().toISOString(),
  };
  await orderRef.update(update);
  return { ...update, convertedTotal, settings, testMode: priced.testMode, testCardUsed: priced.testCardUsed };
}

// A shopper who retries (switches card ↔ PayPal ↔ e-Transfer, or edits the bag) gets a new
// order; their own earlier unpaid attempt must not keep the last copy held against them for
// 30 minutes. The browser names that earlier order; it is released only when it is still
// unpaid and belongs to the same customer email.
// Returns { paidOrderId } when that earlier attempt already took (or is taking) the shopper's
// money: the caller refuses the new attempt (refusePreviousAttemptPaid) so nobody pays twice.
async function releaseSupersededAttempt(req, email, currentOrderId, currentItems = null) {
  const prevId = req.body?.previousOrderId;
  if (typeof prevId !== "string" || !prevId || prevId.includes("/") || prevId === currentOrderId) return {};
  try {
    const snap = await db.collection("orders").doc(prevId).get();
    if (!snap.exists) return {};
    const prev = snap.data();
    const same = String(prev.customer?.email || "").trim().toLowerCase() === String(email || "").trim().toLowerCase();
    if (!same) return {};
    // Paid, or a payment that may have gone through (webhook not here yet): keep its hold and
    // stop this retry, so the shopper isn't charged twice and the last copy isn't sold twice.
    // Only a repeat of the same purchase is a duplicate: a different bag is a new order, and the
    // earlier paid order's holds are left exactly as they are.
    const sameBag = currentItems == null || sameOrderLines(prev.items, currentItems);
    if (previousAttemptPaid(prev, null, null)) return sameBag ? { paidOrderId: prevId } : {};
    if (prev.paymentStatus !== "unpaid" || checkoutRefusal(prev)) return {};
    const intentId = String(prev.stripePaymentIntentId || ""), sessionId = String(prev.stripeCheckoutSessionId || "");
    if (isPaymentId(intentId) || isCheckoutId(sessionId)) {
      const account = await payments.clientForMode(prev.stripeMode === "test" ? "test" : "live", prev.stripeAccountId || null);
      const found = await payments.readAttempt(account, { intentId, sessionId });
      const intent = found.intent || null, session = found.session || null;
      if (previousAttemptPaid(prev, intent, session)) return sameBag ? { paidOrderId: prevId } : {};
      if (intent && !["requires_payment_method", "canceled"].includes(intent.status)) return {};
    }
    await releaseStock(db, prevId, prev.items || []);
    await releaseGiftCards(db, prevId, [...chargedRedemptions(prev), ...(prev.giftCardRedemptions || [])]);
  } catch (err) {
    console.warn(`Could not release superseded attempt ${prevId}:`, err.message);
  }
  return {};
}

// 409 for a retry whose earlier attempt already has the shopper's money. The browser opens that
// order's confirmation (Text & labels › Checkout › coPreviousPaid) instead of charging again.
function refusePreviousAttemptPaid(res, superseded) {
  if (!superseded?.paidOrderId) return false;
  res.status(409).json({ error: "Your earlier payment for this order already went through.", code: "previous_attempt_paid", previousOrderId: superseded.paidOrderId });
  return true;
}

// Holds the order's tracked stock, then its gift-card amounts, for the payment window.
// A gift card that can no longer cover its part gives the stock back and throws GiftCardError.
// A shopper starting checkout is held to the per-shopper caps (stockHolds HOLD_LIMITS, keyed by
// email and, with `req`, the connecting address); HoldLimitError is a StockHoldError ("hold_limit").
// The per-shopper caps the owner set in Settings › General › Checkout stock holds (defaults when unset).
async function loadHoldLimits() {
  try {
    return holdLimitsFrom((await db.collection("settings").doc("website").get()).data() || {});
  } catch (err) {
    console.warn("Could not read the stock-hold limits; using the defaults:", err.message);
    return holdLimitsFrom({});
  }
}

async function reserveCheckout(orderId, items, order, giftCardRedemptions, testMode, req = null) {
  await reserveStock(db, orderId, items, Date.now(), holdOwner(order), { limits: true, ip: req ? clientIpOf(req) : "", holdLimits: await loadHoldLimits() });
  if (!(giftCardRedemptions || []).length) return;
  try {
    await reserveGiftCards(db, orderId, giftCardRedemptions, { testMode, owner: holdOwner(order) });
  } catch (err) {
    await releaseStock(db, orderId, items);
    throw err;
  }
}

async function reserveForConfirmedPayment(orderId, provider, paymentId) {
  const ref = db.collection("orders").doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) return true;
  const order = snap.data();
  // A sandbox payment takes no stock, so it needs none, except on the platform's test shop (shopConfig.testShop) and for
  // a practice order (sandboxTakesStock), where it takes stock like a live one and so is checked like one: sold out
  // after its hold lapsed = not marked paid.
  const sandbox = order.paypalMode === "test" || order.stripeMode === "test";
  if (order.paymentStatus === "paid" || order.status === "cancelled" || order.isTest === true || (sandbox && !sandboxTakesStock(order, shopConfig.testShop))) return true;
  try {
    await reserveStock(db, orderId, order.items || [], Date.now(), holdOwner(order));
    return true;
  } catch (err) {
    if (!(err instanceof StockHoldError)) throw err;
    const at = new Date().toISOString();
    await ref.update({
      inventoryConflict: { provider, paymentId: paymentId || null, reason: err.code, at },
      activity: [...(order.activity || []), { type: "event", message: `${provider} confirmed payment, but stock was no longer available. The order was not marked paid or fulfilled; reconcile the captured payment and contact the customer.`, createdAt: at }],
      updatedAt: at,
    });
    return false;
  }
}

async function markOrderPaidFromPayPal(orderId, paypalData) {
  const initialOrder = await db.collection("orders").doc(orderId).get();
  if (initialOrder.exists && (initialOrder.data().paypalMode !== "test" || shopConfig.testShop)
      && !await reserveForConfirmedPayment(orderId, "PayPal", paypalData.captureId)) return false;
  const result = await settlePayment(orderId, {
    provider: "PayPal",
    message: "Payment completed (verified PayPal capture)",
    // PayPal sandbox capture: a rehearsal — test order, no stock, discount or revenue.
    sandbox: order => order.paypalMode === "test",
    receipt: {
      paypalCaptureId: paypalData.captureId || null,
      paypalPayerId: paypalData.payerId || null,
      paypalTransactionId: paypalData.transactionId || paypalData.captureId || null,
      paypalCaptureStatus: paypalData.captureStatus || "COMPLETED",
      paypalCapture: paypalData.capture || null,
    },
    verify: (order, at) => {
      if (order.paymentStatus === "paid") return { reason: "already-paid" };
      if (order.paypalOrderId !== paypalData.paypalOrderId) throw new Error("PayPal order does not match checkout order.");
      if (order.status === "cancelled") {
        if (order.paymentMismatch?.paidAfterCancel) return { reason: "cancelled" };
        return { reason: "cancelled", update: {
          paypalCaptureId: paypalData.captureId || null,
          paymentMismatch: { paidAfterCancel: true, provider: "paypal", captureId: paypalData.captureId || null, at },
          activity: [...(order.activity || []), { type: "event", message: "PayPal payment arrived after this order was cancelled. Not marked paid — refund it in PayPal.", createdAt: at }],
          updatedAt: at,
        } };
      }
      const amountCheck = paidAmountCheck(order, toMinor(paypalData.capture?.amount?.value), paypalData.capture?.amount?.currency_code);
      if (!amountCheck.ok) {
        console.error(`PayPal amount mismatch on order ${orderId}`, amountCheck);
        return { reason: "amount-mismatch", update: {
          paymentMismatch: { ...amountCheck, provider: "paypal", captureId: paypalData.captureId || null, at },
          activity: [...(order.activity || []), { type: "event", message: `PayPal capture did not match the order total (expected ${amountCheck.expected.minor} ${amountCheck.expected.currency}, got ${amountCheck.paid.minor} ${amountCheck.paid.currency}). Not marked paid — review in PayPal.`, createdAt: at }],
          updatedAt: at,
        } };
      }
      return null;
    },
  });
  if (result.reason === "missing") throw new Error("Order not found.");
  return result.paid || result.reason === "already-paid";
}

exports.createPayPalOrder = onBrowserRequest(
  // SHIPPO_API_TOKEN: live carrier rates are re-priced here; an undeclared secret reads as empty.
  { secrets: withPlatformKey([PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, SHIPPO_API_TOKEN, STRIPE_SECRET_KEY]) },
  async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
    if (!(await hitLimit(db, "paypal", req, LIMITS.paypal))) return res.status(429).json({ error: "Too many tries. Please wait a few minutes and try again." });
    try {
      const { orderId, currency: requestedCurrency, returnUrl } = req.body || {};
      if (!orderId) return res.status(400).json({ error: "Missing orderId" });
      const currency = checkoutCurrencyOf(requestedCurrency);
      if (!currency) return res.status(400).json({ error: "Unsupported currency." });
      const orderRef = db.collection("orders").doc(orderId);
      const orderDoc = await orderRef.get();
      if (!orderDoc.exists) return res.status(404).json({ error: "Order not found" });
      const order = orderDoc.data();
      if (!canViewOrder(order, { key: orderRequestKey(req), identity: await orderRequestIdentity(req) })) return res.status(403).json({ error: "access_required" });
      const refusal = checkoutRefusal(order);
      if (refusal === "paid") return res.status(409).json({ error: "Order is already paid" });
      if (refusal) return res.status(409).json({ error: "This order was cancelled. Please start a new order from your bag.", code: "order_closed" });
      // Before anything is re-priced or held: the shopper's earlier attempt may already be paid.
      if (refusePreviousAttemptPaid(res, await releaseSupersededAttempt(req, order.customer?.email, orderId, order.items))) return;
      let priced;
      try {
        priced = await recalculateOrder(orderRef, order, currency, orderId);
      } catch (pricingErr) {
        return res.status(400).json({ error: pricingErr.message, ...(pricingErr.code ? { code: pricingErr.code } : {}) });
      }
      if (!(priced.convertedTotal > 0)) return res.status(400).json({ error: "Your gift card covers this order. Review your bag and place the order again.", code: "nothing_to_charge" });
      const config = await getPayPalConfig();
      if (!config.testMode) {
        try {
          // Priced lines (with box-set parts), not the browser's lines.
          await reserveCheckout(orderId, priced.items, order, priced.giftCardRedemptions, config.testMode, req);
        } catch (holdErr) {
          if (holdErr instanceof StockHoldError) return res.status(409).json({ error: holdErr.message, code: holdErr.code });
          if (holdErr instanceof GiftCardError) return res.status(409).json({ error: holdErr.message, code: "gift_card_rejected" });
          throw holdErr;
        }
      }
      let checkoutBase = `${req.headers.origin || "http://localhost:5173"}/checkout`;
      if (typeof returnUrl === "string" && ALLOWED_ORIGINS.some(origin => returnUrl === origin || returnUrl.startsWith(`${origin}/`))) checkoutBase = returnUrl;
      const joiner = checkoutBase.includes("?") ? "&" : "?";
      const paypalOrder = await paypalRequest(config, "/v2/checkout/orders", {
        method: "POST",
        // The request id includes the amount: a retry with a new total must not get the old PayPal order back.
        headers: { "PayPal-Request-Id": paypalCreateRequestId(orderId, currency, priced.convertedTotal) },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{
            reference_id: orderId,
            custom_id: orderId,
            invoice_id: orderId,
            amount: { currency_code: currency.toUpperCase(), value: priced.convertedTotal.toFixed(2) },
          }],
          payment_source: { paypal: { experience_context: {
            user_action: "PAY_NOW",
            return_url: `${checkoutBase}${joiner}paypal_return=true&order_id=${encodeURIComponent(orderId)}`,
            cancel_url: `${checkoutBase}${joiner}canceled=true&order_id=${encodeURIComponent(orderId)}`,
          } } },
        }),
      });
      const approvalUrl = paypalOrder.links?.find(link => link.rel === "payer-action" || link.rel === "approve")?.href;
      await orderRef.update({
        paymentMethod: "PayPal", paypalOrderId: paypalOrder.id, paypalOrderStatus: paypalOrder.status,
        paypalCurrency: currency.toUpperCase(),
        paypalMode: config.testMode ? "test" : "live",
        // Capture marks the order paid only for exactly this amount and currency.
        expectedAmountMinor: toMinor(priced.convertedTotal.toFixed(2)), expectedCurrency: currency,
        chargedGiftCards: priced.giftCardRedemptions,
        updatedAt: new Date().toISOString(),
      });
      // The amount PayPal will ask for, so checkout can show a changed total before sending the shopper there.
      res.json({ orderToken: paypalOrder.id, approvalUrl, amount: toMinor(priced.convertedTotal.toFixed(2)), currency: String(currency).toLowerCase() });
    } catch (err) {
      console.error("PayPal order creation failed:", err);
      res.status(500).json({ error: publicErrorMessage(err, "Something went wrong. Please try again.") });
    }
  }
);

exports.capturePayPalOrder = onBrowserRequest(
  { secrets: withPlatformKey([PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET]) },
  async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
    if (!(await hitLimit(db, "paypal", req, LIMITS.paypal))) return res.status(429).json({ error: "Too many tries. Please wait a few minutes and try again." });
    try {
      const { orderId, paypalOrderId } = req.body || {};
      if (!orderId || !paypalOrderId) return res.status(400).json({ error: "Missing order identifiers" });
      const orderDoc = await db.collection("orders").doc(orderId).get();
      if (!orderDoc.exists || orderDoc.data().paypalOrderId !== paypalOrderId) return res.status(400).json({ error: "PayPal order mismatch" });
      // The PayPal order id (checked above) is the proof here: it only reaches a browser through
      // PayPal's own approval redirect, which may land in a new tab without this tab's order key.
      // Capturing can only complete the shop's own order; it reveals nothing about it.
      if (orderDoc.data().paymentStatus === "paid") return res.json({ paid: true });
      // A cancelled or refunded order must not take the shopper's money.
      if (checkoutRefusal(orderDoc.data()) === "closed") return res.status(409).json({ error: "This order was cancelled. Your payment was not taken.", code: "order_closed" });
      if (!await reserveForConfirmedPayment(orderId, "PayPal", paypalOrderId)) return res.status(409).json({ error: "Stock is no longer available. Your payment was not taken.", code: "stock_unavailable" });
      const config = await getPayPalConfig();
      // Capture in the PayPal account the order was created in, even if the shop switched
      // sandbox/live while the shopper was approving (same rule as refunds).
      if (orderDoc.data().paypalMode === "test") config.testMode = true;
      else if (orderDoc.data().paypalMode === "live") config.testMode = false;
      const captured = await paypalRequest(config, `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
        // One id per PayPal order: a new PayPal order (new total, new attempt) gets its own capture.
        method: "POST", headers: { "PayPal-Request-Id": `capture-${orderId}-${paypalOrderId}` }, body: "{}",
      });
      const capture = captured.purchase_units?.[0]?.payments?.captures?.[0];
      if (captured.status !== "COMPLETED" || capture?.status !== "COMPLETED") throw new Error("PayPal capture has not completed.");
      const markedPaid = await markOrderPaidFromPayPal(orderId, {
        paypalOrderId, captureId: capture.id, transactionId: capture.id,
        payerId: captured.payer?.payer_id || null, captureStatus: capture.status, capture,
      });
      res.json({ paid: markedPaid === true, paymentReview: markedPaid !== true });
    } catch (err) {
      console.error("PayPal capture failed:", err);
      res.status(500).json({ error: publicErrorMessage(err, "Something went wrong. Please try again.") });
    }
  }
);

exports.paypalWebhook = onRequest(
  { secrets: withPlatformKey([PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID]) },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
    try {
      const config = await getPayPalConfig();
      const verification = await paypalRequest(config, "/v1/notifications/verify-webhook-signature", {
        method: "POST",
        body: JSON.stringify({
          auth_algo: req.headers["paypal-auth-algo"], cert_url: req.headers["paypal-cert-url"],
          transmission_id: req.headers["paypal-transmission-id"], transmission_sig: req.headers["paypal-transmission-sig"],
          transmission_time: req.headers["paypal-transmission-time"], webhook_id: PAYPAL_WEBHOOK_ID.value(),
          webhook_event: req.body,
        }),
      });
      if (verification.verification_status !== "SUCCESS") return res.status(400).send("Invalid PayPal webhook signature");
      const eventRef = db.collection("payment-webhook-events").doc(`paypal-${req.body.id}`);
      if ((await eventRef.get()).exists) return res.json({ received: true, duplicate: true });
      if (req.body.event_type === "PAYMENT.CAPTURE.COMPLETED") {
        const capture = req.body.resource;
        const orderId = capture.custom_id || capture.invoice_id;
        const paypalOrderId = capture.supplementary_data?.related_ids?.order_id;
        if (orderId && paypalOrderId) await markOrderPaidFromPayPal(orderId, {
          paypalOrderId, captureId: capture.id, transactionId: capture.id,
          payerId: capture.supplementary_data?.related_ids?.payer_id || null,
          captureStatus: capture.status, capture,
        });
      }
      const reversedCaptureId = paypalReversalCaptureId(req.body);
      if (reversedCaptureId) {
        const match = await db.collection("orders").where("paypalCaptureId", "==", reversedCaptureId).limit(1).get();
        if (!match.empty) {
          const refund = req.body.resource || {};
          const fullAmount = req.body.event_type !== "PAYMENT.CAPTURE.REFUNDED";
          const order = match.docs[0].data();
          // Running total across every PayPal refund of this capture, not just this one.
          const refundedMinor = fullAmount ? (refund.amount?.value != null ? toMinor(refund.amount.value) : null) : paypalRefundedTotalMinor(order, refund);
          const orderMinor = Number(order.expectedAmountMinor) || null;
          if (fullAmount || refundedMinor == null || orderMinor == null || refundedMinor >= orderMinor) {
            await applyOrderRefund(match.docs[0].id, {
              provider: "paypal", refundId: refund.id || null, amountMinor: refundedMinor, currency: refund.amount?.currency_code || null,
              status: "succeeded", actor: "paypal", note: req.body.event_type === "PAYMENT.CAPTURE.REFUNDED" ? "refunded in PayPal" : "payment reversed by PayPal",
            });
          } else {
            const now = new Date().toISOString();
            await match.docs[0].ref.update({
              refundedAmountMinor: refundedMinor, partiallyRefunded: true, updatedAt: now,
              ...(refund.id ? { paypalRefundIds: admin.firestore.FieldValue.arrayUnion(refund.id) } : {}),
              activity: admin.firestore.FieldValue.arrayUnion({ type: "event", message: `Partial refund in PayPal: ${(refundedMinor / 100).toFixed(2)} ${refund.amount?.currency_code || ""} refunded so far. Order stays paid — adjust what you ship.`, createdAt: now }),
            });
          }
        }
      }
      await eventRef.set({ eventType: req.body.event_type, paypalEventId: req.body.id, processedAt: new Date().toISOString(), expiresAt: retainFor(90) });
      res.json({ received: true });
    } catch (err) {
      console.error("PayPal webhook failed:", err);
      res.status(500).send("Webhook processing failed.");
    }
  }
);

const { handleVerifyStripeKeys, handleInventoryLinkAdmin, handleGiftCardAdmin, handleWebhookHealth, handleRegisterPaymentDomain, handlePlatformPayments } = checkoutAdminActions({
  db, payments, STRIPE_WEBHOOK_SECRET, STRIPE_WEBHOOK_URL, ALLOWED_ORIGINS, GIFT_CARD_BODIES, REQUIRED_WEBHOOK_EVENTS, webhookEndpointReport, emailGiftCard, expiryChange, giftCardId, last4, newGiftCardCode, withHistory, readAdminSecret, readBody, requireAdmin, requireBooksReader, inventoryLinkDeps,
});

// The press's own web address, through the platform's domain service (customDomains.js, plan 2.9).
const { handleCustomDomains } = customDomainActions({ url: shopConfig.platformDomainsUrl, shopId: shopConfig.project, serviceKey: platformServiceKey, requireAdmin });

// Practice orders on a platform shop while it is private, for the owner only (practiceCheckout.js, plan 7.6).
const { handlePracticeCheckout, practiceFor } = practiceCheckoutActions({ db, platform: payments.mode === "platform", requireAdmin, orderRequestIdentity });

// Handler tests replace sendEmail after loading index.js; this keeps the moved handlers on the current one.
const lateSendEmail = (...args) => sendEmail(...args);

const { handleCancelOrder, handleResolveMismatch, handleCheckoutStatus, handleTrackingLink, handleTrackOrder, handleOrderRequest } = orderRequestActions({
  db, admin, crypto, ADMIN_TO, LIMITS, RESEND_API_KEY, canViewOrder, cancelRefusal, chargedRedemptions,
  checkStripeReversal, claimEmailSend, escapeHtml, hitLimit, intentAsSession,
  normMarketingEmail, orderActionBody, orderRequestIdentity, orderRequestKey, orderRequestProblem,
  orderRequestRecord, payments, publicErrorMessage, publicOrderView, readBody, recordStripeReconciliation,
  releaseGiftCards, releaseStock, requireAdmin, sendEmail: lateSendEmail, siteLink, stripePaymentTaken,
});

const { handleNewsletterSignup, handleNewsletterConfirm, handlePrivacyRequest, handlePrivacyAdmin } = privacyActions({
  db, admin, ADMIN_TO, GIFT_CARD_PERSONAL, LIMITS, RESEND_API_KEY, claimEmailSendDetailed, confirmationEmail,
  confirmedRecord, escapeHtml, findByEmailData, footerAddress, giftCardsFor, hitLimit, marketingUnsubscribeKey,
  neverPaid, normMarketingEmail, optOutId, pendingRecord, privacyRequestRecord, publicOutboxEntry,
  purposeToken, purposeTokenMatches, readAdminSecret, redactedOperationsFields, redactedOrderFields,
  requireAdmin, reviewErasure, sendEmail: lateSendEmail, siteLink, unsubscribeToken,
});

// The actions createStripeCheckoutSession answers before its checkout rate limit, by body.action. Payment
// creation, manual local orders, unsubscribe and free orders (checkoutPayment.js) run below the limit.
const CHECKOUT_FUNCTION_ACTIONS = {
  newsletterSignup: handleNewsletterSignup,
  newsletterConfirm: handleNewsletterConfirm,
  status: handleCheckoutStatus,
  track: handleTrackOrder,
  trackingLink: handleTrackingLink,
  registerPaymentDomain: handleRegisterPaymentDomain,
  platformPayments: handlePlatformPayments,
  customDomains: handleCustomDomains,
  practiceCheckout: handlePracticeCheckout,
  webhookHealth: handleWebhookHealth,
  giftCardAdmin: handleGiftCardAdmin,
  inventoryLink: handleInventoryLinkAdmin,
  backupNow: handleBackupNow,
  restockRefunded: handleRestockRefunded,
  ...adminReportActions({ db, admin, requireAdmin, readAdminSecret, hitLimit, LIMITS }),
  cancelOrder: handleCancelOrder,
  resolvePaymentMismatch: handleResolveMismatch,
  orderRequest: handleOrderRequest,
  privacyRequest: handlePrivacyRequest,
  privacyExport: handlePrivacyAdmin,
  privacyErase: handlePrivacyAdmin,
  verifyStripeKeys: handleVerifyStripeKeys,
};

const { handleManualLocalOrder, handleUnsubscribe, handleCompleteFreeOrder, handleStripeCheckout } = checkoutPaymentActions({
  ALLOWED_ORIGINS, canViewOrder, checkoutCurrencyOf, checkoutRefusal, clientIpOf, completeOrderWithoutCard,
  crypto, db, encodeAcquisition, FALLBACK_RATES, getCountryCode, getExchangeRates, GiftCardError, holdOwner,
  loadHoldLimits, normMarketingEmail, optOutId, orderRequestIdentity, orderRequestKey, priceOrder,
  PricingError, publicErrorMessage, readAdminSecret, recalculateOrder, refusePreviousAttemptPaid, releaseStock,
  releaseSupersededAttempt, reserveCheckout, reserveStock, serverGeoCountry, StockHoldError, payments,
  stripeIntentKey, testShop: shopConfig.testShop, tokenMatches, practiceFor,
});

// ──────────────────────────────────────────────────────────────
// 1. HTTP Endpoint: Create Stripe Checkout Session (Secure)
// ──────────────────────────────────────────────────────────────
exports.createStripeCheckoutSession = onBrowserRequest(
  // SHIPPO_API_TOKEN: live carrier rates are re-priced here; STRIPE_WEBHOOK_SECRET: webhook health reports it.
  // RESEND_API_KEY: Admin › Gift cards emails codes through this function (Gmail first, Resend fallback).
  { secrets: withPlatformKey([STRIPE_SECRET_KEY, SHIPPO_API_TOKEN, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY]) },
  async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const action = req.body?.action;
    // Own keys only: a body action like "constructor" or ["aiWrite"] must never reach a handler.
    if (typeof action === "string" && Object.hasOwn(CHECKOUT_FUNCTION_ACTIONS, action)) {
      return CHECKOUT_FUNCTION_ACTIONS[action](req, res);
    }
    // Payment creation is limited per visitor so bots can't test stolen cards here.
    if (!(await hitLimit(db, "checkout", req, LIMITS.checkout))) {
      res.status(429).json({ error: "Too many checkout attempts. Please wait a few minutes and try again." });
      return;
    }
    if (req.body?.action === 'createManualLocalOrder') return handleManualLocalOrder(req, res);
    if (req.body?.action === "unsubscribe") return handleUnsubscribe(req, res);
    if (req.body?.action === "completeFreeOrder") return handleCompleteFreeOrder(req, res);
    return handleStripeCheckout(req, res);
  }
);


// Stripe signs every delivery with "t=<timestamp>,v1=<signature>[,…]".
function looksLikeStripeSignature(sig) {
  return typeof sig === "string" && /(^|,)t=\d+/.test(sig) && /(^|,)v1=[0-9a-f]+/.test(sig);
}

// A delivery that verified but failed while updating the order (Stripe will retry):
// shown in Webhook health so "Working" never hides a failing handler.
async function recordWebhookProcessingFailure(event, err) {
  await db.collection("adminSecrets").doc("stripeWebhookStatus").set({
    lastProcessingFailureAt: new Date().toISOString(),
    lastProcessingFailure: `${event?.type || "event"}: ${String(err?.message || err).slice(0, 300)}`,
  }, { merge: true }).catch(() => {});
}
// Inventory › Inventory app link (docs/INVENTORY_LINK.md). Admin only; never a payment path.
function inventoryLinkDeps() {
  const store = require("./inventoryLinkStore");
  return { db, store, now: () => new Date(), adminUrl: siteLink("/admin") };
}

// Marks a Stripe-paid order paid: stock, discount usage, download token and
// analytics, once (idempotent — a repeat sees "paid" and only refreshes the
// Stripe ids). `session` is a Checkout Session, or a PaymentIntent shaped like
// one, that the server itself fetched from Stripe or received in a signed
// webhook — never browser data. The amount and currency must match the payment
// this order was created for.
const STRIPE_WEBHOOK_AUTHORITY = Symbol("verified Stripe webhook");
async function markStripeOrderPaid(orderId, session, opts = {}) {
    if (opts.authority !== STRIPE_WEBHOOK_AUTHORITY) throw new Error("Stripe orders require a verified webhook.");
    let duplicateAlert = null;
    const initialOrder = await db.collection("orders").doc(orderId).get();
    if (initialOrder.exists) {
      const initial = initialOrder.data();
      const amountCheck = paidAmountCheck(initial, session.amount_total, session.currency);
      // Sandbox payments skip the stock check, except on the test shop and for practice orders (see reserveForConfirmedPayment).
      if (amountCheck.ok && ((session.livemode !== false && initial.stripeMode !== "test") || sandboxTakesStock(initial, shopConfig.testShop))
          && initial.paymentStatus !== "paid" && initial.status !== "cancelled"
          && !await reserveForConfirmedPayment(orderId, "Stripe", typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id)) return false;
    }

    const paymentIntentId = typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id || null;
    const receipt = at => ({
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: paymentIntentId,
      stripeAccountId: opts.account || null,
      stripeMode: session.livemode ? "live" : "test",
      stripeAmountTotal: session.amount_total,
      stripeCurrency: session.currency,
      updatedAt: at,
    });
    const result = await settlePayment(orderId, {
      provider: "Stripe",
      message: opts.message,
      receipt: receipt(new Date().toISOString()),
      // A sandbox (test-mode) payment is a rehearsal: flag the order as a test order
      // (kept out of fulfillment, revenue and launch readiness) and never touch
      // real stock or discount usage.
      sandbox: order => session.livemode === false || order.stripeMode === "test",
      verify: (order, now) => {
        duplicateAlert = null; // a retried attempt must not keep the last attempt's value
        if (order.paymentStatus === "paid") {
          const samePayment = !order.stripePaymentIntentId || !paymentIntentId || order.stripePaymentIntentId === paymentIntentId;
          if (samePayment) return { reason: "already-paid", update: receipt(now) };
          // A second, separate Stripe payment for an order that is already paid (two tabs, a retry):
          // keep the original ids so refunds and disputes still find the first charge, and flag it.
          if ((order.duplicatePayments || []).some(p => p.paymentIntentId === paymentIntentId)) return { reason: "duplicate" };
          duplicateAlert = { orderId, paymentIntentId, amount: session.amount_total, currency: session.currency };
          return { reason: "duplicate", update: {
            duplicatePayments: [...(order.duplicatePayments || []), { provider: "stripe", paymentIntentId, sessionId: session.id, amountMinor: session.amount_total, currency: session.currency, at: now }],
            paymentMismatch: { duplicate: true, provider: "stripe", paymentIntentId, at: now },
            updatedAt: now,
            activity: [...(order.activity || []), { type: "event", message: `A second Stripe payment (${paymentIntentId || session.id}) arrived for this already-paid order. Refund it in the Stripe Dashboard.`, createdAt: now }],
          } };
        }
        // Money arrived for an order the shop had already cancelled: don't revive it (stock, emails,
        // fulfillment). Record the payment and leave it in Needs attention so the admin refunds it.
        if (order.status === "cancelled") {
          if (order.paymentMismatch?.paidAfterCancel && order.paymentMismatch.paymentIntentId === paymentIntentId) return { reason: "cancelled" };
          return { reason: "cancelled", update: {
            ...receipt(now),
            paymentMismatch: { paidAfterCancel: true, provider: "stripe", paymentIntentId, at: now },
            activity: [...(order.activity || []), { type: "event", message: `Stripe payment ${paymentIntentId || session.id} arrived after this order was cancelled. Not marked paid — refund it in the Stripe Dashboard or reopen the order with the customer.`, createdAt: now }],
          } };
        }
        const amountCheck = paidAmountCheck(order, session.amount_total, session.currency);
        if (!amountCheck.ok) {
          console.error(`Stripe amount mismatch on order ${orderId}`, amountCheck);
          return { reason: "amount-mismatch", update: {
            ...receipt(now),
            paymentMismatch: { ...amountCheck, provider: "stripe", paymentIntentId, at: now },
            activity: [...(order.activity || []), { type: "event", message: `Stripe payment did not match the order total (expected ${amountCheck.expected.minor} ${amountCheck.expected.currency}, got ${amountCheck.paid.minor} ${amountCheck.paid.currency}). Not marked paid — refund or review in Stripe.`, createdAt: now }],
          } };
        }
        return null;
      },
    });

    if (duplicateAlert) {
      await sendEmail({
        queue: "paidTwiceAlert",
        secret: RESEND_API_KEY.value(),
        to: ADMIN_TO,
        subject: `⚠ Order ${duplicateAlert.orderId} was paid twice`,
        html: `<p>Stripe took a second payment (${escapeHtml(duplicateAlert.paymentIntentId || "")}, ${(Number(duplicateAlert.amount) / 100).toFixed(2)} ${escapeHtml(String(duplicateAlert.currency || "").toUpperCase())}) for order <strong>${escapeHtml(duplicateAlert.orderId)}</strong>, which was already paid.</p><p>Refund the second payment in the Stripe Dashboard. The order keeps its first payment.</p>`,
      }).catch(err => console.warn("duplicate payment alert failed:", err.message));
    }
  return result.paid;
}

// Records a refund on an order, whoever made it (admin, Stripe/PayPal dashboard, a lost
// dispute): stock back (unless declined), the discount use given back and revenue
// reversed — each at most once. A pending refund does all of that now and only
// flips paymentStatus to "refunded" when it completes.
async function applyOrderRefund(orderId, { provider, refundId = null, amountMinor = null, currency = null, status = "succeeded", restock, reason = "", actor = "system", note = "" }) {
  const orderRef = db.collection("orders").doc(orderId);
  let reversal = null;
  let alreadyRecorded = false;
  await db.runTransaction(async transaction => {
    reversal = null;
    alreadyRecorded = false;
    const snap = await transaction.get(orderRef);
    if (!snap.exists) { alreadyRecorded = true; return; }
    const order = snap.data();
    const now = new Date().toISOString();
    const done = status === "succeeded";
    const label = provider === "stripe" ? "Stripe" : provider === "paypal" ? "PayPal" : provider === "dispute" ? "Lost dispute" : "Manual";
    const amountText = amountMinor != null ? ` for ${(amountMinor / 100).toFixed(2)} ${String(currency || "").toUpperCase()}` : "";

    if (order.paymentStatus === "refunded") { alreadyRecorded = true; return; }
    if (order.paymentStatus === "refund_pending") {
      // Stock, discount and revenue were handled when the refund started.
      if (!done) { alreadyRecorded = true; return; }
      transaction.update(orderRef, {
        paymentStatus: "refunded",
        ...(provider === "dispute" && order.customerRequest?.status === "open" ? { customerRequest: { ...order.customerRequest, status: "handled" } } : {}),
      ...(order.returnProgress && !["rejected", "closed"].includes(order.returnProgress.state) && provider !== "dispute" ? { returnProgress: { ...order.returnProgress, state: "completed", updatedAt: now }, customerRequest: { ...order.customerRequest, status: "handled" } } : {}),
        ...(order.refund ? { refund: { ...order.refund, status: "succeeded" } } : {}),
        updatedAt: now,
        activity: [...(order.activity || []), { type: "event", message: `${label} refund completed${amountText}${note ? ` — ${note}` : ""}.`, createdAt: now }],
      });
      return;
    }
    if (order.paymentStatus !== "paid") { alreadyRecorded = true; return; }

    const opsSnap = order.returnProgress ? await transaction.get(db.collection("order-operations").doc(orderId)) : null;
    // Copies an earlier partial refund already put back are not restocked a second time.
    const itemList = withoutRestocked(returnRestockItems(order, opsSnap?.data()?.returnCase), order);
    const sandboxPaid = order.sandboxPayment === true;
    // Without an explicit choice (Dashboard/PayPal refunds, sweeps) books that already left the shop
    // are not put back on the shelf; the admin's saved choice or an explicit flag always wins.
    const wantsRestock = restock !== undefined ? restock !== false
      : typeof order.refundRequest?.restock === "boolean" ? order.refundRequest.restock
      : !leftTheShop(order);
    // A sandbox payment took no stock, so there is none to put back, except on the test shop (sandboxStockTaken).
    const shouldRestock = (!sandboxPaid || sandboxStockTaken(order, shopConfig.testShop)) && wantsRestock && itemList.length > 0 && order.inventoryRestockedAt == null;
    const books = shouldRestock ? await readBooks(transaction, db, itemList) : new Map();
    const shouldReverseDiscount = !sandboxPaid && order.appliedDiscount?.id && order.discountUsageReversedAt == null;
    const discountRef = shouldReverseDiscount ? db.collection("discounts").doc(order.appliedDiscount.id) : null;
    const discountDoc = discountRef ? await transaction.get(discountRef) : null;
    // A full refund also gives back what gift cards paid, once.
    const charged = chargedRedemptions(order);
    const shouldRestoreGiftCards = !!order.giftCardsDebitedAt && !order.giftCardsRestoredAt && charged.length > 0;
    const giftCards = shouldRestoreGiftCards ? await readGiftCards(transaction, db, charged) : new Map();
    // Gift cards this order bought stop working once their purchase is refunded.
    const issuedCards = !order.giftCardsVoidedAt ? await readGiftCards(transaction, db, order.giftCardsIssued) : new Map();

    if (shouldRestock) writeStock(transaction, db, itemList, books, 1, now);
    if (shouldRestoreGiftCards) writeGiftCardChange(transaction, db, orderId, charged, giftCards, 1, now);
    for (const [cardId, card] of issuedCards) {
      if (card.enabled === false) continue;
      transaction.update(db.collection("giftCards").doc(cardId), { enabled: false, history: withHistory(card, { type: "disabled", minor: 0, orderId, reason: "Purchase refunded", at: now }), updatedAt: now });
    }
    if (discountRef && discountDoc?.exists) {
      transaction.update(discountRef, { usageCount: Math.max(0, (Number(discountDoc.data().usageCount) || 0) - 1), updatedAt: now });
    }
    transaction.update(orderRef, {
      paymentStatus: done ? "refunded" : "refund_pending",
      ...(provider === "dispute" && order.customerRequest?.status === "open" ? { customerRequest: { ...order.customerRequest, status: "handled" } } : {}),
      ...(order.returnProgress && !["rejected", "closed"].includes(order.returnProgress.state) && provider !== "dispute" ? { returnProgress: { ...order.returnProgress, state: done ? "completed" : "refund_pending", updatedAt: now }, customerRequest: { ...order.customerRequest, status: "handled" } } : {}),
      status: "cancelled",
      // What the order looked like before the refund, so a refund the bank later rejects can be undone.
      preRefund: { status: order.status || null, returnProgress: order.returnProgress || null, customerRequest: order.customerRequest || null },
      refund: {
        id: refundId,
        provider,
        amount: amountMinor != null ? amountMinor / 100 : Number(order.total) || 0,
        // A manual refund records the order total, which is CAD; a provider refund is in the currency it reports.
        currency: amountMinor != null ? String(currency || order.checkoutCurrency || "CAD").toUpperCase() : "CAD",
        reason: String(reason || order.refundRequest?.reason || "").slice(0, 500),
        status: done ? "succeeded" : "pending",
        actor,
        createdAt: now,
      },
      refundedAt: now,
      refundedBy: actor,
      ...(amountMinor != null ? { refundedAmountMinor: amountMinor } : {}),
      ...(shouldRestock ? {
        inventoryRestockedAt: now,
        restockedItems: itemList.map(item => ({ id: item.id, variantId: item.variantId || null, quantity: Number(item.quantity) || 0,
          ...(Array.isArray(item.components) && item.components.length ? { components: item.components.map(part => ({ id: part.id, variantId: part.variantId || null, quantity: Number(part.quantity) || 1 })) } : {}) })),
      } : {}),
      ...(discountRef ? { discountUsageReversedAt: now } : {}),
      ...(shouldRestoreGiftCards ? { giftCardsRestoredAt: now } : {}),
      ...(issuedCards.size ? { giftCardsVoidedAt: now } : {}),
      updatedAt: now,
      activity: [...(order.activity || []), {
        type: "event",
        message: `${label} refund ${done ? "completed" : "started"}${amountText}${shouldRestock ? "; inventory restocked" : ""}${shouldRestoreGiftCards ? `; ${charged.reduce((sum, r) => sum + (Number(r.minor) || 0), 0) / 100} CAD put back on gift cards` : ""}${note ? ` — ${note}` : ""}.`,
        createdAt: now,
        actor,
      }],
    });
    // Revenue was recorded as order.total (base currency) at payment time; reverse that figure.
    reversal = sandboxPaid ? null : { revenue: Number(order.total) || 0, paidDay: typeof order.paidAt === "string" ? order.paidAt.split("T")[0] : null };
  });

  if (reversal) {
    const day = reversal.paidDay || new Date().toISOString().split("T")[0];
    await db.collection("analytics").doc(day).set({
      date: day,
      orders: admin.firestore.FieldValue.increment(-1),
      revenue: admin.firestore.FieldValue.increment(-(reversal.revenue || 0)),
      refunds: admin.firestore.FieldValue.increment(1),
      refundedRevenue: admin.firestore.FieldValue.increment(reversal.revenue || 0),
    }, { merge: true });
  }
  return { alreadyRecorded };
}

// A partial refund the admin made (Order detail › Refund with a smaller amount, or a return where
// only some books came back). The order stays paid with `partiallyRefunded` and a running
// `refundedAmountMinor` — the same state a Stripe Dashboard partial refund leaves — and only the
// lines the owner ticked (or the inspected resellable copies of a return) go back to stock.
// Recorded once per provider refund id; discount use, gift cards and revenue are left alone.
async function applyPartialRefund(orderId, { provider, refundId = null, amountMinor, already = 0, currency = null, status = "succeeded", restockLines = [], fromReturn = false, reason = "", actor = "system", claimedAt = null }) {
  const orderRef = db.collection("orders").doc(orderId);
  let alreadyRecorded = false;
  await db.runTransaction(async transaction => {
    alreadyRecorded = false;
    const snap = await transaction.get(orderRef);
    if (!snap.exists) { alreadyRecorded = true; return; }
    const order = snap.data();
    const records = Array.isArray(order.partialRefunds) ? order.partialRefunds : [];
    if (order.paymentStatus !== "paid" || (refundId && records.some(r => r && r.id === refundId))) { alreadyRecorded = true; return; }
    const now = new Date().toISOString();
    // Sandbox payments never touch real stock, except on the test shop (sandboxStockTaken).
    const lines = order.sandboxPayment === true && !sandboxStockTaken(order, shopConfig.testShop) ? [] : restockLines;
    const books = lines.length ? await readBooks(transaction, db, lines) : new Map();
    if (lines.length) writeStock(transaction, db, lines, books, 1, now);
    const label = provider === "stripe" ? "Stripe" : provider === "paypal" ? "PayPal" : "Manual";
    const cur = String(currency || order.expectedCurrency || "CAD").toUpperCase();
    // Stripe/PayPal may already have reported this refund (webhook first): never count it twice.
    const total = Math.max(refundedSoFar(order), already + amountMinor);
    const finishReturn = fromReturn && order.returnProgress?.state === "inspected";
    transaction.update(orderRef, {
      partiallyRefunded: true,
      refundedAmountMinor: total,
      partialRefunds: [...records, { id: refundId, provider, amountMinor, currency: cur, status, reason: String(reason || "").slice(0, 500), actor, createdAt: now,
        restocked: lines.map(line => ({ index: line.index, quantity: line.quantity })) }],
      ...(lines.length ? { partialRestockedItems: [...(Array.isArray(order.partialRestockedItems) ? order.partialRestockedItems : []),
        ...lines.map(line => ({ index: line.index, id: line.id, variantId: line.variantId || null, quantity: line.quantity, at: now }))] } : {}),
      ...(provider === "paypal" && refundId ? { paypalRefundIds: [...(Array.isArray(order.paypalRefundIds) ? order.paypalRefundIds : []), refundId] } : {}),
      ...(!claimedAt || order.refundRequest?.at === claimedAt ? { refundRequest: null } : {}),
      ...(finishReturn ? { returnProgress: { ...order.returnProgress, state: "completed", updatedAt: now }, customerRequest: { ...order.customerRequest, status: "handled" } } : {}),
      updatedAt: now,
      activity: [...(order.activity || []), {
        type: "event",
        message: `${label} partial refund ${status === "pending" ? "started" : "made"}: ${(amountMinor / 100).toFixed(2)} ${cur} (${(total / 100).toFixed(2)} ${cur} refunded so far)${lines.length ? `; ${lines.reduce((n, l) => n + l.quantity, 0)} cop${lines.reduce((n, l) => n + l.quantity, 0) === 1 ? "y" : "ies"} back in stock` : ""}${reason ? ` — ${String(reason).slice(0, 200)}` : ""}. The order stays paid.`,
        createdAt: now,
        actor,
      }],
    });
  });
  return { alreadyRecorded };
}

// A refund Stripe accepted (order went to refund_pending, stock back, discount use and revenue
// reversed) that then failed at the bank: the customer still paid, so undo exactly what
// applyOrderRefund did, once. Only for a refund_pending order; the "failed" refund is recorded.
// An order put back to paid without a new payment (a refund the bank rejected, maybe weeks later) may
// not be on the refund/dispute safety net's record; this asks the next sweep to re-read every paid order
// (reversalSchedule.js scanPlan) instead of waiting up to 6 hours for the regular re-read.
const reversalRecheckRef = () => db.collection("systemStatus").doc("stripeReversalRecheck");
async function requestReversalRecheck(orderId) {
  await reversalRecheckRef().set({ at: new Date().toISOString(), orderId })
    .catch(err => console.warn(`Could not ask the refund/dispute check to re-read orders (${orderId}):`, err.message));
}

async function revertFailedRefund(orderId, { refundId = null, source = "", chargeUnrefunded = false } = {}) {
  const orderRef = db.collection("orders").doc(orderId);
  let revenue = null;
  let reverted = false;
  await db.runTransaction(async transaction => {
    revenue = null;
    reverted = false;
    const snap = await transaction.get(orderRef);
    if (!snap.exists) return;
    const order = snap.data();
    // A refund Stripe reported as succeeded (card refunds usually do) or one made in the Dashboard can
    // still be rejected by the issuer later. Undo a "refunded" Stripe order only when this is that
    // refund's id, or the caller read the charge and saw nothing was refunded.
    const refundedByStripe = order.paymentStatus === "refunded" && order.refund?.provider === "stripe" && order.refund?.status !== "failed"
      && ((refundId && order.refund.id === refundId) || (chargeUnrefunded === true && (!refundId || !order.refund.id || order.refund.id === refundId)));
    if (order.paymentStatus !== "refund_pending" && !refundedByStripe) return;
    // Another refund on this order failed, not the one it is waiting for.
    if (refundId && order.refund?.id && order.refund.id !== refundId) return;
    const now = new Date().toISOString();
    const sandboxPaid = order.sandboxPayment === true;
    const restocked = order.inventoryRestockedAt != null && Array.isArray(order.restockedItems) ? order.restockedItems : [];
    const books = restocked.length ? await readBooks(transaction, db, restocked) : new Map();
    const discountRef = order.discountUsageReversedAt != null && order.appliedDiscount?.id ? db.collection("discounts").doc(order.appliedDiscount.id) : null;
    const discountDoc = discountRef ? await transaction.get(discountRef) : null;
    const charged = order.giftCardsRestoredAt ? chargedRedemptions(order) : [];
    const cards = charged.length ? await readGiftCards(transaction, db, charged) : new Map();
    const voided = order.giftCardsVoidedAt ? await readGiftCards(transaction, db, order.giftCardsIssued) : new Map();
    const giftShort = charged.length ? debitShortfall(charged, cards) : null;
    const notes = [];

    if (restocked.length && writeStock(transaction, db, restocked, books, -1, now)) notes.push("some of the restocked copies had already sold, so stock may be oversold");
    if (discountRef && discountDoc?.exists) transaction.update(discountRef, { usageCount: (Number(discountDoc.data().usageCount) || 0) + 1, updatedAt: now });
    if (charged.length && !giftShort) writeGiftCardChange(transaction, db, orderId, charged, cards, -1, now);
    if (giftShort) notes.push("a gift card's balance was spent after the refund, so its part could not be taken back — reconcile it in Gift cards");
    for (const [cardId, card] of voided) {
      const last = Array.isArray(card.history) ? card.history[card.history.length - 1] : null;
      if (card.enabled !== false || !last || last.type !== "disabled" || last.orderId !== orderId) continue;
      transaction.update(db.collection("giftCards").doc(cardId), { enabled: true, history: withHistory(card, { type: "enabled", minor: 0, orderId, reason: "Refund failed", at: now }), updatedAt: now });
    }
    const before = order.preRefund || {};
    transaction.update(orderRef, {
      paymentStatus: "paid",
      status: before.status && before.status !== "cancelled" ? before.status : "processing",
      ...(before.returnProgress ? { returnProgress: before.returnProgress } : {}),
      ...(before.customerRequest ? { customerRequest: before.customerRequest } : {}),
      refund: { ...(order.refund || {}), status: "failed", failedAt: now },
      refundFailedAt: now,
      refundRequest: null,
      refundedAt: null,
      refundedAmountMinor: null,
      preRefund: null,
      ...(restocked.length ? { inventoryRestockedAt: null, restockedItems: null } : {}),
      ...(discountRef ? { discountUsageReversedAt: null } : {}),
      ...(charged.length && !giftShort ? { giftCardsRestoredAt: null } : {}),
      ...(voided.size ? { giftCardsVoidedAt: null } : {}),
      updatedAt: now,
      activity: [...(order.activity || []), {
        type: "event",
        message: `Stripe refund failed${source ? ` (${source})` : ""}: the customer was not refunded. The order is paid again${restocked.length ? "; restocked copies taken back out of stock" : ""}${notes.length ? `; ${notes.join("; ")}` : ""}. Refund again or contact the customer.`,
        createdAt: now,
      }],
    });
    reverted = true;
    revenue = sandboxPaid ? null : { amount: Number(order.total) || 0, paidDay: typeof order.paidAt === "string" ? order.paidAt.split("T")[0] : null };
  });
  // Ask the refund/dispute sweep to re-read every paid order before anything else can
  // throw: a retried webhook finds the order already paid again and can't ask a second time.
  if (reverted) await requestReversalRecheck(orderId);
  if (revenue) {
    const day = revenue.paidDay || new Date().toISOString().split("T")[0];
    await db.collection("analytics").doc(day).set({
      date: day,
      orders: admin.firestore.FieldValue.increment(1),
      revenue: admin.firestore.FieldValue.increment(revenue.amount),
      refunds: admin.firestore.FieldValue.increment(-1),
      refundedRevenue: admin.firestore.FieldValue.increment(-revenue.amount),
    }, { merge: true });
  }
  return { reverted };
}

// Brings a paid order in line with what Stripe says happened to its charge after
// payment: a full refund (order refunded + cancelled, stock back, revenue
// reversed — once), a partial refund (amount recorded, order stays paid), or a
// dispute (status recorded). Used by the charge.refunded webhook AND by the
// direct Stripe checks, so a missed webhook can't leave a refunded order "Paid".
async function syncStripeReversal(orderId, { charge, dispute = null, source }) {
  const r = reversalState(charge, dispute);
  const orderRef = db.collection("orders").doc(orderId);
  let fullRefund = null;
  await db.runTransaction(async transaction => {
    fullRefund = null;
    const orderDoc = await transaction.get(orderRef);
    if (!orderDoc.exists) return;
    const order = orderDoc.data();
    const now = new Date().toISOString();
    const notes = [];
    const update = {};

    if (r.disputeStatus && r.disputeStatus !== order.disputeStatus) {
      update.disputeStatus = r.disputeStatus;
      if (dispute?.id) update.disputeId = dispute.id;
      notes.push(`Stripe dispute ${r.disputeStatus.replace(/_/g, " ")} (${source}).`);
    }

    // Money taken after the order was cancelled (or for the wrong amount), now fully refunded:
    // the problem is dealt with, so it leaves Needs attention and the alerts.
    if (r.fullyRefunded && order.paymentMismatch && !mismatchResolved(order) && order.paymentStatus !== "paid") {
      update["paymentMismatch.resolvedAt"] = now;
      update["paymentMismatch.resolvedBy"] = "stripe-refund";
      notes.push(`The unexpected Stripe payment was refunded (${source}).`);
    }

    // The card payment for an order whose gift card fell short, now refunded: nothing left to settle.
    if (r.fullyRefunded && order.giftCardConflict && !order.giftCardConflict.resolvedAt && order.paymentStatus !== "paid") {
      update["giftCardConflict.resolvedAt"] = now;
      update["giftCardConflict.resolvedBy"] = "stripe-refund";
      notes.push(`The payment for this order (gift card couldn't cover its part) was refunded (${source}).`);
    }

    if ((r.fullyRefunded || r.disputeStatus === "lost") && ["paid", "refund_pending"].includes(order.paymentStatus)) {
      fullRefund = r.fullyRefunded ? "refund" : "dispute";
    } else if (r.partiallyRefunded && order.paymentStatus === "paid" && (order.refundedAmountMinor || 0) !== r.refundedMinor) {
      update.refundedAmountMinor = r.refundedMinor;
      update.partiallyRefunded = true;
      notes.push(`Partial refund in Stripe: ${(r.refundedMinor / 100).toFixed(2)} ${r.currency} of ${(r.amountMinor / 100).toFixed(2)}. Order stays paid — adjust what you ship (${source}).`);
    }

    if (!notes.length) return;
    transaction.update(orderRef, {
      ...update,
      updatedAt: now,
      activity: [...(order.activity || []), ...notes.map(message => ({ type: "event", message, createdAt: now }))],
    });
  });

  if (fullRefund === "refund") {
    // Refunds made in the Stripe Dashboard follow the admin's restock choice when one was saved.
    await applyOrderRefund(orderId, { provider: "stripe", refundId: null, amountMinor: r.refundedMinor, currency: r.currency, status: "succeeded", actor: "stripe-dashboard", note: source });
  } else if (fullRefund === "dispute") {
    // A lost chargeback: the money is gone, so the order is reversed like a refund. The books were sent; no restock.
    await applyOrderRefund(orderId, { provider: "dispute", amountMinor: r.amountMinor, currency: r.currency, status: "succeeded", restock: false, actor: "stripe-dispute", note: source });
  }
  return r;
}

// Asks Stripe for a paid order's charge (and any dispute) and syncs refunds/disputes.
// `keys` (payments.readKeys) skips the settings reads. With `onChecked` the caller records the check
// itself (the sweep keeps one schedule record, reversalSchedule.js) and the order is not written just to
// stamp it; onChecked runs after the refund/dispute sync.
async function checkStripeReversal(orderId, order, source, { keys = null, onChecked = null } = {}) {
  return payments.checkReversal(orderId, order, { keys }, async ({ charge, dispute, listRefunds }) => {
    if (!onChecked) await db.collection("orders").doc(orderId).update({ stripeCheckedAt: new Date().toISOString() });
    // A pending refund that moved no money: ask Stripe whether it failed (missed charge.refund.updated).
    if (["refund_pending", "refunded"].includes(order.paymentStatus) && Number(charge.amount_refunded) === 0) {
      const failed = failedRefundId(order, charge, await listRefunds());
      if (failed) await revertFailedRefund(orderId, { refundId: failed === "unknown" ? null : failed, source, chargeUnrefunded: true });
    }
    const synced = await syncStripeReversal(orderId, { charge, dispute, source });
    // Counted as checked only once anything Stripe showed has been applied, so a failed apply is retried.
    if (onChecked) onChecked();
    return synced;
  });
}

async function orderRequestIdentity(req) {
  const match = String(req.headers?.authorization || "").match(/^Bearer (.+)$/);
  if (!match) return null;
  try { return await admin.auth().verifyIdToken(match[1]); } catch { return null; }
}
function orderRequestKey(req) {
  return typeof req.body?.key === "string" ? req.body.key : String(req.headers?.["x-order-key"] || "");
}
async function recordStripeReconciliation(orderId, session) {
  const ref = db.collection("orders").doc(orderId);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().paymentStatus === "paid") return;
    tx.update(ref, { reconciliationPending: { provider: "stripe", providerStatus: "paid", paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null, sessionId: session.id || null, checkedAt: new Date().toISOString() } });
  });
}

// ──────────────────────────────────────────────────────────────
// 2. HTTP Endpoint: Stripe Payment Webhook (Secure)
// ──────────────────────────────────────────────────────────────
exports.stripeWebhook = onRequest(
  { secrets: withPlatformKey([STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY]) },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    // The shop's key for its current mode, else the deployed secret (functions/payments).
    const client = await payments.webhookClient();
    const sig = req.headers["stripe-signature"];

    // Test and live endpoints each sign with their own secret: accept the deployed
    // Functions secret and the endpoint secrets saved by Settings › Payments ›
    // "Check & fix webhook". A signature must still verify against one of them.
    const savedSecrets = await readAdminSecret("stripeWebhook");
    let deployedSecret = "";
    try { deployedSecret = STRIPE_WEBHOOK_SECRET.value(); } catch { /* not set */ }
    const secrets = signingSecrets(deployedSecret, savedSecrets.live, savedSecrets.test);
    // Awaited: in platform mode the event is fetched again through the payment service before anything trusts it.
    const { event, lastError } = await payments.verifyWebhookEvent(client, req.rawBody, sig, secrets);
    if (!event) {
      const message = lastError?.message || "No webhook signing secret is configured.";
      console.error("Signature verification failed:", message);
      // Leave a trace the admin can see (Settings › Payments › Webhook health) — but only
      // for requests that look like Stripe's (a signed header), so bots and scanners
      // hitting this public URL can't make a working webhook look broken.
      if (looksLikeStripeSignature(sig)) {
        await db.collection("adminSecrets").doc("stripeWebhookStatus").set({
          lastFailureAt: new Date().toISOString(),
          lastFailure: `Signature check failed: ${String(message).slice(0, 300)}`,
        }, { merge: true }).catch(() => {});
      }
      res.status(400).send(`Webhook Error: ${message}`);
      return;
    }

    // Event-level idempotency: Stripe can deliver the same event more than once.
    // Mirror the PayPal webhook's dedupe so each event is processed at most once.
    const stripeEventRef = db.collection("payment-webhook-events").doc(`stripe-${event.id}`);
    if ((await stripeEventRef.get()).exists) {
      res.json({ received: true, duplicate: true });
      return;
    }

    // Stripe-side outcomes that never mark an order paid: record them on the
    // order timeline so the admin can see what happened.
    const noteOnOrder = async (orderId, message, extra = {}) => {
      if (!orderId) return;
      const ref = db.collection("orders").doc(orderId);
      await db.runTransaction(async t => {
        const snap = await t.get(ref);
        if (!snap.exists) return;
        const now = new Date().toISOString();
        const fields = typeof extra === "function" ? extra(snap.data()) : extra;
        t.update(ref, {
          ...fields,
          updatedAt: now,
          activity: [...(snap.data().activity || []), { type: "event", message, createdAt: now }],
        });
      });
    };

    try {
      if (event.type === "checkout.session.expired") {
        await noteOnOrder(event.data.object.client_reference_id, "Stripe Checkout session expired without payment.");
      } else if (event.type === "checkout.session.async_payment_failed") {
        const failedSession = event.data.object;
        // A late failure from an old session must never undo a paid order or one paid through another session.
        await noteOnOrder(failedSession.client_reference_id, "Delayed payment failed (Stripe).", current =>
          lateFailureMayMarkFailed(current, failedSession.id) ? { paymentStatus: "failed" } : {});
      } else if (event.type === "payment_intent.payment_failed" && event.data.object?.metadata?.checkout === "payment_element") {
        const reason = event.data.object.last_payment_error?.message || "unknown reason";
        await noteOnOrder(event.data.object.metadata.order_id, `Card payment attempt failed (Stripe): ${reason}`);
      } else if (event.type.startsWith("charge.dispute.")) {
        const dispute = event.data.object;
        const piId = typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id;
        if (piId) {
          const snap = await db.collection("orders").where("stripePaymentIntentId", "==", piId).limit(1).get();
          if (!snap.empty) {
            await noteOnOrder(snap.docs[0].id,
              event.type === "charge.dispute.created"
                ? `Stripe dispute opened (${(dispute.amount / 100).toFixed(2)} ${(dispute.currency || "").toUpperCase()}, reason: ${dispute.reason || "unknown"}). Respond in the Stripe Dashboard before the evidence deadline.`
                : `Stripe dispute is now ${String(dispute.status || "updated").replace(/_/g, " ")}.`,
              { disputeStatus: dispute.status || "needs_response", disputeId: dispute.id });
            if (event.type === "charge.dispute.closed" && dispute.status === "lost") {
              await applyOrderRefund(snap.docs[0].id, { provider: "dispute", amountMinor: dispute.amount, currency: dispute.currency, status: "succeeded", restock: false, actor: "stripe-dispute", note: "chargeback lost" });
            }
          }
        }
      }
    } catch (err) {
      console.error(`Failed to record ${event.type}:`, err);
      await recordWebhookProcessingFailure(event, err);
          res.status(500).send(`Webhook failure: ${err.message}`);
      return;
    }

    // Any succeeded PaymentIntent that names one of our orders settles it (card form
    // or hosted Checkout — a duplicate of checkout.session.completed is a no-op).
    const isElementPayment = !!paidIntentOrderId(event);
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded" || isElementPayment) {
      // A succeeded intent is shaped into the session fields used below.
      const session = isElementPayment ? intentAsSession(event.data.object) : event.data.object;
      const orderId = session.client_reference_id;
      // completed can fire before delayed methods settle; only paid sessions count.
      const settled = session.payment_status === "paid" || session.payment_status === "no_payment_required";

      if (orderId && settled) {
        try {
          await markStripeOrderPaid(orderId, session, { authority: STRIPE_WEBHOOK_AUTHORITY, account: event.account || null, message: isElementPayment ? "Payment completed (Stripe card form)" : "Payment completed (Stripe Webhook)" });
          console.log(`Order ${orderId} successfully processed via webhook.`);
          // The real card fee, once the provider has it (code plan 7.10). Best effort: the payout fills it in later.
          await recordOrderMoney({ db, payments, orderId }).catch(err => console.warn(`Order ${orderId}: the card fee wasn't read yet (${err?.message || err}).`));
        } catch (err) {
          console.error("Failed to process order update in transaction:", err);
          await recordWebhookProcessingFailure(event, err);
          res.status(500).send(`Transaction failure: ${err.message}`);
          return;
        }
      }
    }

    // A refund the bank rejected after Stripe accepted it: the order goes back to paid.
    if (event.type === "charge.refund.updated") {
      const refund = event.data.object;
      const paymentIntentId = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id || null;
      if (paymentIntentId && ["failed", "canceled"].includes(String(refund.status))) {
        try {
          const snap = await db.collection("orders")
            .where("stripePaymentIntentId", "==", paymentIntentId).limit(1).get();
          if (!snap.empty) await revertFailedRefund(snap.docs[0].id, { refundId: refund.id || null, source: `Stripe webhook${refund.failure_reason ? `: ${String(refund.failure_reason).replace(/_/g, " ")}` : ""}` });
        } catch (err) {
          console.error("Failed to sync charge.refund.updated:", err);
          await recordWebhookProcessingFailure(event, err);
          res.status(500).send(`Refund sync failure: ${err.message}`);
          return;
        }
      }
    }

    // Refunds issued directly from the Stripe Dashboard (or by any other path)
    // arrive as charge.refunded — sync them back so the order, inventory, and
    // analytics don't drift out of "paid".
    if (event.type === "charge.refunded") {
      const charge = event.data.object;
      const paymentIntentId = typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : charge.payment_intent?.id || null;
      if (paymentIntentId) {
        try {
          const snap = await db.collection("orders")
            .where("stripePaymentIntentId", "==", paymentIntentId).limit(1).get();
          if (!snap.empty) {
            await syncStripeReversal(snap.docs[0].id, { charge, source: "Stripe webhook" });
            // The refund's own fee (any fee given back), on the order's money (code plan 7.10). Best effort.
            await recordOrderMoney({ db, payments, orderId: snap.docs[0].id }).catch(err => console.warn(`Order ${snap.docs[0].id}: the refund's fee wasn't read yet (${err?.message || err}).`));
          }
        } catch (err) {
          console.error("Failed to sync charge.refunded:", err);
          await recordWebhookProcessingFailure(event, err);
          res.status(500).send(`Refund sync failure: ${err.message}`);
          return;
        }
      }
    }

    // A payout reached the press's bank: each order in it keeps its fee, net, payout and payout date (code plan 7.10).
    // Safe to repeat; a failure asks Stripe (or Square, through the platform) to send the event again.
    if (event.type === "payout.paid") {
      const payout = event.data.object || {};
      try {
        const changed = await recordPayout({ db, payments, mode: event.livemode ? "live" : "test", payoutId: payout.id, accountId: event.account || null, arrivalDate: payout.arrival_date });
        console.log(`Payout ${payout.id}: ${changed} order(s) updated.`);
      } catch (err) {
        console.error("Failed to record payout.paid:", err);
        await recordWebhookProcessingFailure(event, err);
        res.status(500).send(`Payout sync failure: ${err.message}`);
        return;
      }
    }

    // Mark this event processed (after successful handling) for idempotency.
    await stripeEventRef.set({
      eventType: event.type,
      stripeEventId: event.id,
      processedAt: new Date().toISOString(),
      expiresAt: retainFor(90),
    });
    const receivedAt = new Date().toISOString();
    const eventMode = event.livemode ? "live" : "test";
    await db.collection("adminSecrets").doc("stripeWebhookStatus").set({
      lastReceivedAt: receivedAt,
      lastEventType: event.type,
      lastMode: eventMode,
      // Per Stripe account, so a test endpoint can't make the live one look healthy.
      [eventMode]: { lastReceivedAt: receivedAt, lastEventType: event.type },
    }, { merge: true }).catch(() => {});

    res.json({ received: true });
  }
);

// ──────────────────────────────────────────────────────────────
// 3. HTTP Endpoint: Refund a paid Stripe order (admin only)
// ──────────────────────────────────────────────────────────────
// Read-only profile estimate. Checkout resolves live carrier rates and reprices independently.
exports.cartShippingPreview = onBrowserRequest({}, async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  if (!(await hitLimit(db, "cart-shipping", req, LIMITS.track))) return res.status(429).json({ error: "too_many" });
  const { items: requested, country, postalCode } = req.body || {};
  if (!Array.isArray(requested) || requested.length < 1 || requested.length > 50 || typeof country !== "string" || !resolveCountry(country) || typeof postalCode !== "string" || !postalCode.trim() || postalCode.length > 20) return res.status(400).json({ error: "invalid_destination" });
  try {
    const lines = await Promise.all(requested.map(async item => {
      if (typeof item?.id !== "string" || !item.id || item.id.includes("/") || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) throw new Error("invalid_cart");
      const snap = await db.collection("books").doc(item.id).get();
      const book = snap.data();
      if (!snap.exists || purchaseProblem(book, item.variantId)) throw new Error("invalid_cart");
      const variant = item.variantId ? (book.variants || []).find(value => value.id === item.variantId) : null;
      // An edition that no longer exists is refused here exactly as checkout refuses it.
      if (item.variantId && !variant) throw new Error("invalid_cart");
      const price = catalogUnitPrice(book, variant);
      if (!Number.isFinite(price) || price < 0) throw new Error("invalid_cart");
      // E-books and audiobooks are recognised by format too, as checkout does (isPhysicalItem).
      const digital = !isPhysicalItem({ format: catalogFormat(book, variant), digital: catalogDigital(book, variant) });
      // A box set without its own weight weighs what its books weigh (as priceOrder does), so the estimate matches the charge.
      let weightGrams = itemWeightGrams(book, variant);
      const parts = bundleComponents(book);
      if (weightGrams == null && parts.length) {
        const partBooks = await Promise.all(parts.map(part => db.collection("books").doc(part.id).get()));
        const weights = partBooks.map((doc, i) => {
          if (!doc.exists) return null;
          const partBook = doc.data();
          return itemWeightGrams(partBook, parts[i].variantId ? (partBook.variants || []).find(value => value.id === parts[i].variantId) || null : null);
        });
        if (weights.every(w => w != null)) weightGrams = weights.reduce((sum, w, i) => sum + w * parts[i].quantity, 0);
      }
      return { price, quantity: item.quantity, shippingProfileId: book.shippingProfileId || null, weightGrams, digital };
    }));
    const profilesSnap = await db.collection("shipping-profiles").get();
    const physical = lines.filter(item => !item.digital);
    // No invented fallback rate when shipping has not been configured.
    const profiles = profilesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const quotes = profiles.length ? quoteShipping(physical, { country }, profiles).filter(quote => quote.type !== "pickup") : [];
    res.status(200).json({ quotes, digitalOnly: physical.length === 0, preliminary: true });
  } catch (error) { res.status(error.message === "invalid_cart" ? 409 : 500).json({ error: error.message === "invalid_cart" ? "invalid_cart" : "unavailable" }); }
});

// Admin-only return decisions; operational inspection details stay private.
exports.manageReturn = onBrowserRequest({}, async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  const user = await requireAdmin(req, res);
  if (!user) return;
  const { orderId, action, instructions, inspection } = req.body || {};
  if (typeof orderId !== "string" || !orderId || orderId.length > 64 || orderId.includes("/")) return res.status(400).json({ error: "Invalid order ID." });
  try {
    const progress = await db.runTransaction(async tx => {
      const orderRef = db.collection("orders").doc(orderId);
      const opsRef = db.collection("order-operations").doc(orderId);
      const [orderSnap, opsSnap] = await Promise.all([tx.get(orderRef), tx.get(opsRef)]);
      if (!orderSnap.exists) { const error = new Error("Order not found."); error.status = 404; throw error; }
      const order = orderSnap.data(), ops = opsSnap.data() || {};
      const now = new Date().toISOString();
      const next = returnTransition(order, ops.returnCase, action, { instructions, inspection }, now, user.email || user.uid);
      if (next === ops.returnCase) return publicReturn(next);
      const progress = publicReturn(next);
      tx.set(opsRef, { ...ops, returnCase: next, updatedAt: now, activity: [...(ops.activity || []), { type: "event", message: `Return ${action}.`, createdAt: now, actor: user.email || user.uid }] });
      tx.update(orderRef, { returnProgress: progress, customerRequest: { ...order.customerRequest, status: ["rejected", "closed"].includes(action) ? "handled" : "open" }, updatedAt: now });
      return progress;
    });
    res.status(200).json({ progress });
  } catch (error) { res.status(error.status || 500).json({ error: error.message || "Could not update return." }); }
});

exports.refundOrder = onBrowserRequest(
  { secrets: withPlatformKey([STRIPE_SECRET_KEY, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET]) },
  async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;

    const body = readBody(req, res, refundOrderBody);
    if (!body) return;
    const { orderId, reason, restock = true, amountMinor = null, restockLines = null } = body;

    const orderRef = db.collection("orders").doc(orderId);
    const actor = adminUser.email || adminUser.uid;
    const reasonText = String(reason || "Admin refund").slice(0, 500);
    const claimedAt = new Date().toISOString();
    let claimed = false, providerAccepted = false, providerCalled = false;
    // Only these mean the provider certainly took no refund; anything else may still complete.
    const DEFINITE_REFUSALS = ["StripeInvalidRequestError", "StripeCardError", "StripePermissionError", "StripeAuthenticationError"];
    // A refund attempt that never reached the provider must not leave its claim behind:
    // a stale refundRequest would block every later return step on this order.
    const releaseClaim = () => db.runTransaction(async transaction => {
      const snap = await transaction.get(orderRef);
      const current = snap.exists ? snap.data() : null;
      if (current && current.paymentStatus === "paid" && current.refundRequest?.at === claimedAt) transaction.update(orderRef, { refundRequest: null });
    }).catch(err => console.warn(`Could not release refund claim for ${orderId}:`, err.message));
    try {
      // Claim the refund first and save the admin's restock choice, so a Stripe/PayPal
      // refund webhook that lands before we finish follows the same choice.
      let plan = null, partialLines = [], fromReturn = false;
      const order = await db.runTransaction(async transaction => {
        const snap = await transaction.get(orderRef);
        if (!snap.exists) { const e = new Error("Order not found"); e.status = 404; throw e; }
        const current = snap.data();
        if (current.paymentStatus !== "paid") {
          const e = new Error(current.paymentStatus === "refunded" ? "This order has already been refunded." : "Only paid orders can be refunded.");
          e.status = 409; throw e;
        }
        // Books on their way back (approved / received) are inspected before the money goes back.
        // A request the shop hasn't approved (e-book orders, goodwill refunds) can be refunded directly.
        if (current.customerRequest?.type === "return" && current.customerRequest.status === "open" && ["approved", "received"].includes(current.returnProgress?.state)) {
          const error = new Error("Receive and inspect the returned books before refunding this return."); error.status = 409; throw error;
        }
        // Never more than was charged; an amount reaching what is left is today's full refund.
        plan = refundPlan(current, amountMinor);
        partialLines = []; fromReturn = false;
        if (plan.kind === "partial") {
          fromReturn = current.returnProgress?.state === "inspected";
          if (fromReturn && restock !== false) {
            // A partial return: the inspected resellable copies go back, as for a full return refund.
            const ops = (await transaction.get(db.collection("order-operations").doc(orderId))).data() || {};
            partialLines = restockLinesFor(current, (ops.returnCase?.inspection || []).map(row => ({ index: row.index, quantity: row.restockQuantity ?? (row.condition === "resellable" ? row.quantity : 0) })));
          } else if (!fromReturn) partialLines = restockLinesFor(current, restockLines);
        }
        // A gift card this order bought that has since been spent can't be taken back by a refund.
        const issued = plan.kind === "full" && Array.isArray(current.giftCardsIssued) ? current.giftCardsIssued : [];
        if (issued.length) {
          const cards = await Promise.all(issued.map(card => transaction.get(db.collection("giftCards").doc(card.id))));
          const spentMinor = cards.reduce((sum, cardSnap) => {
            const card = cardSnap.exists ? cardSnap.data() : null;
            return card ? sum + Math.max(0, Math.floor(Number(card.initialMinor) || 0) - Math.floor(Number(card.balanceMinor) || 0)) : sum;
          }, 0);
          if (spentMinor > 0) {
            const error = new Error(`CA$${(spentMinor / 100).toFixed(2)} of the gift cards this order bought has already been spent. A full refund would give that money back twice. Refund only the unused part in Stripe or PayPal directly, then disable the card in Gift cards.`);
            error.status = 409; throw error;
          }
        }
        transaction.update(orderRef, { refundRequest: plan.kind === "partial"
          ? { restock: false, partial: true, amountMinor: plan.amountMinor, reason: reasonText, actor, at: claimedAt }
          : { restock: restock !== false, reason: reasonText, actor, at: claimedAt } });
        return current;
      });
      claimed = true;

      const provider = refundProviderOf(order);
      if (!provider) {
        await releaseClaim();
        res.status(409).json({ error: "This order has no saved card or PayPal payment to refund. Refund it in Stripe or PayPal directly; the order updates itself." });
        return;
      }
      let outcome;
      if (provider === "stripe") {
        outcome = await payments.refund({
          mode: order.stripeMode, accountId: order.stripeAccountId || null, paymentIntentId: order.stripePaymentIntentId,
          amountMinor: plan.kind === "partial" ? plan.amountMinor : null,
          metadata: { order_id: orderId, admin_email: adminUser.email || "", reason: reasonText },
          idempotencyKey: plan.kind === "partial" ? partialRefundKey(orderId, plan.already, plan.amountMinor) : `order-refund-${orderId}-full${refundRetrySuffix(order)}`,
          onCalling: () => { providerCalled = true; },
        });
      } else if (provider === "paypal") {
        const config = await getPayPalConfig();
        if (order.paypalMode === "test") config.testMode = true;
        else if (order.paypalMode === "live") config.testMode = false;
        providerCalled = true;
        const refund = await paypalRequest(config, `/v2/payments/captures/${encodeURIComponent(order.paypalCaptureId)}/refund`, {
          method: "POST",
          headers: { "PayPal-Request-Id": plan.kind === "partial" ? `refund-${orderId}-partial-${plan.already}-${plan.amountMinor}` : `refund-${orderId}-full${refundRetrySuffix(order)}` },
          body: JSON.stringify({ note_to_payer: reasonText.slice(0, 255),
            ...(plan.kind === "partial" ? { amount: { value: (plan.amountMinor / 100).toFixed(2), currency_code: String(order.paypalCurrency || plan.currency).toUpperCase() } } : {}) }),
        });
        const status = String(refund.status || "").toUpperCase();
        if (!["COMPLETED", "PENDING"].includes(status)) throw new Error(`PayPal refund was not accepted (status: ${refund.status}).`);
        outcome = {
          refundId: refund.id,
          amountMinor: refund.amount?.value != null ? toMinor(refund.amount.value) : null,
          currency: refund.amount?.currency_code || order.paypalCurrency || null,
          status: status === "COMPLETED" ? "succeeded" : "pending",
        };
      } else {
        // e-Transfer, cash, pickup: the money goes back outside the shop; this records it.
        outcome = { refundId: null, amountMinor: plan.kind === "partial" ? plan.amountMinor : null, currency: plan.kind === "partial" ? plan.currency : null, status: "succeeded" };
      }

      providerAccepted = true;
      if (plan.kind === "partial") {
        const result = await applyPartialRefund(orderId, {
          provider, refundId: outcome.refundId, amountMinor: outcome.amountMinor ?? plan.amountMinor, already: plan.already,
          currency: outcome.currency || plan.currency, status: outcome.status, restockLines: partialLines, fromReturn, reason: reasonText, actor, claimedAt,
        });
        res.status(200).json({ refundId: outcome.refundId, amount: (outcome.amountMinor ?? plan.amountMinor) / 100, currency: String(outcome.currency || plan.currency).toUpperCase(),
          status: outcome.status, provider, partial: true, alreadyRecorded: result.alreadyRecorded });
        return;
      }
      // After earlier partial refunds the provider refunds what is left; record the running total.
      if (plan.already > 0 && outcome.amountMinor != null) outcome.amountMinor += plan.already;
      const result = await applyOrderRefund(orderId, {
        provider, ...outcome, restock: restock !== false, reason: reasonText, actor,
      });
      res.status(200).json({
        refundId: outcome.refundId,
        amount: outcome.amountMinor != null ? outcome.amountMinor / 100 : Number(order.total) || 0,
        currency: String(outcome.currency || order.checkoutCurrency || "CAD").toUpperCase(),
        status: outcome.status,
        provider,
        alreadyRecorded: result.alreadyRecorded,
      });
    } catch (err) {
      console.error("refundOrder failed:", err);
      // Keep the claim only when the provider may have taken the refund (accepted, or a lost
      // connection): its webhook then follows the admin's restock choice.
      if (claimed && !providerAccepted && (!providerCalled || DEFINITE_REFUSALS.includes(err?.type) || (err?.status >= 400 && err?.status < 500))) await releaseClaim();
      const status = err.status || (err.type?.startsWith("Stripe") ? 400 : 500);
      res.status(status).json({ error: err.message || "Refund failed" });
    }
  },
);

const downloads = digitalDownloadEndpoint({
  onRequest, admin, db, crypto, catalogDigital, digitalDelivery, isPhysicalItem, preorderActive,
});

exports.downloadDigitalAsset = downloads.downloadDigitalAsset;

// ──────────────────────────────────────────────────────────────
// 4. Notification Settings and Helper Functions
// ──────────────────────────────────────────────────────────────
const DEFAULT_NOTIFICATIONS = {
  // Settings › Notifications: off by default (`enabled: false`); `delayDays` after shipping (functions/reviewRequests.js).
  review_request: REVIEW_REQUEST_TEMPLATE,
  brand: {
    logoUrl: "",
    brandColor: "#e8402a",
    emailTheme: "light"
  },
  order_confirmation: {
    subject: "Order confirmed: {{order_id}}",
    body: "Hi {{customer_name}},\n\nThank you for your purchase! We've received your order and are preparing it for shipment. We will send you another email when it has shipped.",
    buttonText: "View your order",
    signoff: "Thanks,\nThe {{shop_name}} team",
    enabled: true
  },
  shipping_confirmation: {
    subject: "Your order is on the way!",
    body: "Hi {{customer_name}},\n\nGood news! Your order {{order_id}} has shipped with {{tracking_carrier}} and is on its way.\n\nTracking number: {{tracking_number}}\n\nUse the button below to follow your parcel on the carrier's website.",
    buttonText: "Track your shipment",
    signoff: "Best,\nThe {{shop_name}} team",
    enabled: true
  },
  abandoned_cart: {
    subject: "Did you forget something?",
    body: "Hi {{customer_name}},\n\nWe noticed you left some items in your cart. We've saved them for you, so you can easily complete your purchase whenever you're ready!",
    buttonText: "Resume purchase",
    signoff: "Thanks,\nThe {{shop_name}} team",
    enabled: true
  },
  order_cancelled: {
    subject: "Order cancelled: {{order_id}}",
    body: "Hi {{customer_name}},\n\nYour order has been cancelled and you will not be charged. If you have any questions, please contact us.",
    buttonText: "",
    signoff: "Best,\nThe {{shop_name}} team",
    enabled: true
  },
  order_pending_payment: {
    subject: "Order received — payment needed: {{order_id}}",
    body: "Hi {{customer_name}},\n\nThank you for your order! It is reserved for you, but it is not paid yet. Please pay {{total_price}} by {{payment_method}} using the instructions below. We'll confirm by email as soon as your payment arrives and then prepare your order.",
    buttonText: "View your order",
    signoff: "Thanks,\nThe {{shop_name}} team",
    enabled: true
  },
  order_refunded: {
    subject: "Order refunded: {{order_id}}",
    body: "Hi {{customer_name}},\n\nWe have successfully refunded {{total_price}} for your order. The funds should return to your original payment method in 5-10 business days.",
    buttonText: "",
    signoff: "Best,\nThe {{shop_name}} team",
    enabled: true
  },
  customer_welcome: {
    subject: "Welcome to {{shop_name}}!",
    body: "Hi {{customer_name}},\n\nThank you for creating an account with {{shop_name}}! You can now log in to view your orders, save shipping addresses, and download digital library books.",
    buttonText: "Go to your account",
    signoff: "Warmly,\nThe {{shop_name}} team",
    enabled: true
  },
  contact_reply: {
    subject: "We got your message",
    body: "Hi {{customer_name}},\n\nThanks for getting in touch with {{shop_name}}! We've received your message and will reply as soon as we can.",
    buttonText: "",
    signoff: "Warmly,\nThe {{shop_name}} team",
    enabled: true
  },
  gift_card: {
    subject: "You've received a {{amount}} gift card",
    body: "Hi {{recipient_name}},\n\n{{sender_name}} sent you a {{amount}} gift card for {{shop_name}}.\n\n{{message}}\n\nYour gift card code: {{code}}\n\nEnter it in the Gift card box at checkout. {{expires}}",
    buttonText: "Shop now",
    signoff: "Happy reading,\nThe {{shop_name}} team",
    enabled: true
  },
  delivery_update: {
    subject: "Delivery Update: Your order is {{status}}",
    body: "Hi {{customer_name}},\n\nYour package tracking status has been updated: {{status}}.\n\nCarrier: {{tracking_carrier}}\nTracking: {{tracking_number}}",
    buttonText: "Track shipment",
    signoff: "Best,\nThe {{shop_name}} team",
    enabled: true
  }
};

async function loadNotificationSettings() {
  let dbSettings = {};
  try {
    const snap = await db.collection("settings").doc("notifications").get();
    if (snap.exists) {
      dbSettings = snap.data() || {};
    }
  } catch (err) {
    console.warn("Failed to load notifications from Firestore, using default fallback:", err);
  }

  const merged = { ...DEFAULT_NOTIFICATIONS };
  for (const key of Object.keys(DEFAULT_NOTIFICATIONS)) {
    if (key === "brand") {
      merged.brand = { ...DEFAULT_NOTIFICATIONS.brand, ...(dbSettings.brand || {}) };
    } else {
      merged[key] = { ...DEFAULT_NOTIFICATIONS[key], ...(dbSettings[key] || {}) };
    }
  }
  // Emails to the shop itself (Settings › Notifications › Emails to the shop). On unless switched off;
  // an older saved new_order_admin.enabled is honoured too.
  // {{shop_name}} in every email (plan 1.16): Settings › Email sender name, else the shop's name, else the deploy's.
  merged.shopName = shopConfig.senderName;
  try {
    const website = (await db.collection("settings").doc("website").get()).data() || {};
    const own = [website.communications?.fromName, website.info?.name].map((v) => String(v || "").trim()).find(Boolean);
    if (own) merged.shopName = own;
  } catch (err) {
    console.warn("Failed to load the shop name for emails, using the deploy's:", err);
  }
  merged.shopAlerts = {
    newOrder: dbSettings.shopAlerts?.newOrder ?? (dbSettings.new_order_admin?.enabled !== false),
    shipped: dbSettings.shopAlerts?.shipped !== false,
  };
  return merged;
}

// Keep in step with src/app/lib/tracking.ts. A publisher-entered link (manual
// dispatch with a carrier we don't recognise) wins over the built-in pages.
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

// How the order reaches the customer, for the order confirmation email.
// Pickup or local delivery (the server-priced choice, else the shopper's selection).
const localMethodOf = order => order?.fulfillment?.method || order?.fulfillmentSelection?.method || "";
const isLocalOrder = order => ["pickup", "local_delivery"].includes(localMethodOf(order));

function deliveryDetails(order) {
  const local = order.fulfillment || {};
  if (local.method === "pickup") {
    const a = local.address || {};
    return {
      heading: "Pickup",
      method: local.name || "Pickup",
      estimate: local.estimate || "",
      lines: [local.name, [a.street, a.city, a.state, a.zip].filter(Boolean).join(", "), local.hours, local.estimate, "We'll email you when your order is ready to collect."].filter(Boolean),
    };
  }
  if (local.method === "local_delivery") {
    return { heading: "Local delivery", method: local.name || "Local delivery", estimate: local.estimate || "", lines: [local.name, local.estimate].filter(Boolean) };
  }
  if (!order.shippingMethod) return { heading: "", method: "", estimate: "", lines: [] };
  const est = order.shippingEstimate || {};
  const days = String(est.days || "").trim();
  const estimate = days ? `${days} business day${days === "1" ? "" : "s"} after dispatch` : String(est.terms || "").trim();
  const a = order.customer?.address || {};
  return {
    heading: "Shipping",
    method: order.shippingMethod,
    estimate,
    lines: [order.shippingMethod, estimate && `Expected delivery: ${estimate}`, [a.street, a.city, a.state, a.zip, a.country].filter(Boolean).join(", "), "We'll email your tracking number as soon as it ships."].filter(Boolean),
  };
}

const isPhysicalAny = order => (order?.items || []).some(item => item && isPhysicalItem(item));

// Public storefront address for links in emails (Firebase Hosting). When the shop gets its own domain, set the
// repository variable SITE_URL: deploy-firebase.yml writes it into the Functions env (functions/.env.<project>),
// which shopConfig.js reads (else the project's own web.app address).
const SITE_URL = shopConfig.siteUrl;
function siteLink(path) { return `${SITE_URL}${path}`; }

// One-click order link for emails: /track opens the order straight away when the
// key matches, instead of asking the customer to type the order number and email.
async function orderTrackUrl(orderId, order) {
  let key = "";
  try {
    await db.runTransaction(async tx => {
      const ref = db.collection("orders").doc(orderId);
      const snap = await tx.get(ref);
      const saved = snap.exists ? snap.data() : order;
      key = typeof saved?.trackingKey === "string" && /^[a-f0-9]{32,64}$/.test(saved.trackingKey) ? saved.trackingKey : crypto.randomBytes(32).toString("hex");
      if (snap.exists && saved.trackingKey !== key) tx.update(ref, { trackingKey: key });
    });
  } catch (err) { return siteLink(`/track?orderId=${encodeURIComponent(orderId)}`); }
  return siteLink(`/track?orderId=${encodeURIComponent(orderId)}&key=${key}`);
}

function getTrackingUrl(carrier, trackingNum, customUrl) {
  try {
    const custom = new URL(String(customUrl || "").trim());
    if (custom.protocol === "https:" || custom.protocol === "http:") return custom.toString();
  } catch (_) { /* no usable custom link */ }
  // Shippo reports carriers as tokens ("canada_post"), people type "Canada Post".
  const cleanCarrier = (carrier || "").trim().toLowerCase().replace(/[_-]+/g, " ");
  const cleanNum = (trackingNum || "").trim();
  if (cleanCarrier.includes("purolator")) {
    return `https://www.purolator.com/en/shipping/tracker?pin=${encodeURIComponent(cleanNum)}`;
  }
  if (cleanCarrier.includes("canpar")) {
    return `https://www.canpar.com/en/tracking/delivery_options.htm?barcode=${encodeURIComponent(cleanNum)}`;
  }
  if (cleanCarrier.includes("canada post")) {
    return `https://www.canadapost-postescanada.ca/track-reperage/en#/details/${encodeURIComponent(cleanNum)}`;
  }
  if (cleanCarrier.includes("usps")) {
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(cleanNum)}`;
  }
  if (cleanCarrier.includes("ups")) {
    return `https://www.ups.com/track?tracknum=${encodeURIComponent(cleanNum)}`;
  }
  if (cleanCarrier.includes("fedex")) {
    return `https://www.fedex.com/apps/fedextrack/?tracknumbers=${encodeURIComponent(cleanNum)}`;
  }
  if (cleanCarrier.includes("dhl")) {
    return `https://www.dhl.com/en/express/tracking.html?AWB=${encodeURIComponent(cleanNum)}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(carrier + " " + cleanNum)}`;
}

function compileEmailTemplate(templateId, settings, vars, additionalSection) {
  const brand = settings.brand || {};
  // {{shop_name}} is known to every email; a caller's own value wins.
  const shopName = String(settings.shopName || shopConfig.senderName || "");
  vars = { shop_name: shopName, ...vars };
  const logoUrl = brand.logoUrl || "";
  const brandColor = brand.brandColor || "#e8402a";
  
  const template = settings[templateId] || DEFAULT_NOTIFICATIONS[templateId];
  let subject = template.subject || DEFAULT_NOTIFICATIONS[templateId].subject;
  // A required line (the gift-card code) comes back even if an edit removed it.
  let body = withRequiredPlaceholders(templateId, template.body || DEFAULT_NOTIFICATIONS[templateId].body);
  let buttonText = template.buttonText !== undefined ? template.buttonText : DEFAULT_NOTIFICATIONS[templateId].buttonText;
  let signoff = template.signoff || DEFAULT_NOTIFICATIONS[templateId].signoff;

  // Replace placeholders in subject and body
  // Values are shopper-controlled (names, messages, statuses): HTML-escaped in the
  // body, newline-stripped in the subject. A replacer function keeps "$" literal.
  // items_table is the one var built here as trusted HTML.
  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
    const text = String(value ?? "");
    // The order table is HTML: it belongs in the body only.
    subject = subject.replace(regex, () => (key === "items_table" ? "" : text.replace(/[\r\n]+/g, " ")));
    // items_table is placed after line breaks are added (placeItemsTable), so it is left in the body here.
    if (key !== "items_table") body = body.replace(regex, () => escapeHtml(text));
    if (key !== "items_table") signoff = signoff.replace(regex, () => escapeHtml(text));
  }

  subject = blankUnknownPlaceholders(subject).replace(/\s{2,}/g, " ").trim();
  // Keep {{items_table}} for placeItemsTable; every other unknown placeholder reads as blank.
  body = blankUnknownPlaceholders(body.replace(/\{\{\s*items_table\s*\}\}/g, "\u0000ITEMS\u0000")).replace(/\u0000ITEMS\u0000/g, "{{items_table}}");
  buttonText = blankUnknownPlaceholders(buttonText);
  signoff = blankUnknownPlaceholders(signoff);

  // Only a real web link becomes a button (never javascript: or a broken attribute).
  const buttonUrl = /^https?:\/\//i.test(String(vars.button_url || "")) ? escapeHtml(String(vars.button_url)) : "";
  const ctaButtonHtml = buttonText && buttonUrl ? risoButton(buttonUrl, buttonText, brandColor, brand.emailTheme) : "";

  const placed = placeItemsTable(body.replace(/\n/g, "<br/>"), vars.items_table || "");
  const finalBody = placed.body;
  const itemsTableHtml = placed.after;
  const signoffHtml = signoff.replace(/\n/g, "<br/>");

  const html = risoLayout(`
    <p style="margin-top:0;">${finalBody}</p>
    ${ctaButtonHtml}
    ${itemsTableHtml}
    ${additionalSection || ""}
    <p style="margin-top:30px;font-weight:600;">${signoffHtml}</p>
  `, { logoUrl, accent: brandColor, theme: brand.emailTheme, shopName });

  return { subject, html };
}


// [Duplicate exports.onOrderCreated removed; logic consolidated in export at bottom]

// ──────────────────────────────────────────────────────────────
// 5b. Order Paid: Trigger notifications only AFTER successful payment
// ──────────────────────────────────────────────────────────────
// Emails one gift card's code to its recipient (or `to`). Records emailedAt on the card.
async function emailGiftCard(cardId, card, { to = "", notificationSettings = null, queue = "", test = false } = {}) {
  const recipient = String(to || card.recipientEmail || card.purchaserEmail || "").trim();
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(recipient)) throw new Error("This gift card has no email address to send to.");
  const settings = notificationSettings || await loadNotificationSettings();
  const compiled = compileEmailTemplate("gift_card", settings, {
    recipient_name: card.recipientName || "there",
    sender_name: card.senderName || "Someone",
    amount: `CA$${(Number(card.initialMinor) / 100).toFixed(2)}`,
    code: card.code,
    message: card.message || "",
    expires: card.expiresOn ? `It can be used until ${card.expiresOn}.` : "",
    button_url: siteLink("/"),
    shop_url: siteLink("/"),
  });
  await sendEmail({ to: recipient, subject: `${test ? "[TEST] " : ""}${compiled.subject}`, html: compiled.html, secret: RESEND_API_KEY.value(), queue, about: { giftCardId: cardId } });
  const at = new Date().toISOString();
  await db.collection("giftCards").doc(cardId).update({ emailedAt: at, history: withHistory(card, { type: "emailed", minor: 0, to: recipient, at }), updatedAt: at });
}

// A paid order with gift-card lines gets its cards once (giftCardsIssuedAt), then each is emailed.
async function issueGiftCardsForOrder(orderId) {
  const orderRef = db.collection("orders").doc(orderId);
  let created = [];
  let testOrder = false;
  await db.runTransaction(async tx => {
    created = [];
    const snap = await tx.get(orderRef);
    if (!snap.exists) return;
    const order = snap.data();
    testOrder = order.isTest === true || order.sandboxPayment === true;
    if (order.giftCardsIssuedAt || order.paymentStatus !== "paid") return;
    const cards = cardsForOrder(orderId, order);
    if (!cards.length) return;
    const now = new Date().toISOString();
    for (const card of cards) tx.create(db.collection("giftCards").doc(card.id), card.data);
    tx.update(orderRef, {
      giftCardsIssuedAt: now,
      giftCardsIssued: cards.map(card => ({ id: card.id, last4: card.data.last4, minor: card.data.initialMinor, recipientEmail: card.data.recipientEmail, lineIndex: card.data.lineIndex })),
      updatedAt: now,
    });
    created = cards;
  });
  const notificationSettings = await loadNotificationSettings();
  if (notificationSettings.gift_card?.enabled === false) return;
  // A test-card (sandbox) purchase never emails the recipients it names: anyone could otherwise
  // use test mode to send the shop's mail to strangers. The shop gets one [TEST] copy instead.
  const sends = testOrder ? created.slice(0, 1) : created;
  for (const card of sends) {
    try {
      await emailGiftCard(card.id, card.data, testOrder ? { notificationSettings, to: ADMIN_TO, test: true } : { notificationSettings, queue: "giftCard" });
    } catch (err) {
      console.error(`Gift card email failed for order ${orderId}:`, err.message);
    }
  }
}

// The carrier address check is a nice-to-have: it runs AFTER every email, so a slow Shippo can
// never cost the customer their confirmation or the shop its new-order alert.
async function checkAddressAfterPayment(event) {
  const before = event.data?.before?.data() || {};
  const after = event.data?.after?.data() || {};
  if (after.isTest === true && after.sandboxPayment !== true) return;
  if (!(before.paymentStatus !== "paid" && after.paymentStatus === "paid") || !after.customer?.email) return;
  try {
    await autoApproveShippingAddress(event.params.orderId, after);
  } catch (err) {
    console.warn("Automatic address check failed; publisher review stays required", err);
  }
}
exports.onOrderUpdated = onDocumentUpdated(
  { document: "orders/{orderId}", secrets: withPlatformKey([RESEND_API_KEY, SHIPPO_API_TOKEN]), timeoutSeconds: 120 },
  async event => {
    try { await handleOrderUpdated(event); }
    finally { await checkAddressAfterPayment(event); }
  }
);
async function handleOrderUpdated(event) {
    const before = event.data?.before?.data() || {};
    const after = event.data?.after?.data() || {};
    const orderId = event.params.orderId;

    // Test orders send nothing — except sandbox payments, whose emails are part of
    // the checkout rehearsal (they still never buy labels or touch stock).
    if (after.isTest === true && after.sandboxPayment !== true) return;
    // A refund the bank rejected put this order back to paid: tell the shop, because the customer
    // was told they were refunded (Orders › Needs attention also lists it).
    if (after.refundFailedAt && before.refundFailedAt !== after.refundFailedAt && after.paymentStatus === "paid") {
      try {
        await sendEmail({
          to: ADMIN_TO,
          subject: `Refund failed: order ${orderId} needs a new refund`,
          html: `<p>The refund for order <strong>${escapeHtml(orderId)}</strong> was rejected after it was accepted, so the customer was <strong>not</strong> refunded and the order is paid again.</p><p>Open the order in <a href="${siteLink(`/admin#orders/${encodeURIComponent(orderId)}`)}">Orders</a> to refund again or contact the customer. Do not pack it unless they still want it.</p>`,
          secret: RESEND_API_KEY.value(),
        });
      } catch (err) {
        console.error(`Could not email the shop about the failed refund on ${orderId}:`, err.message);
      }
    }
    if (!after.customer?.email) return;

    const notificationSettings = await loadNotificationSettings();
    let trackUrlPromise;
    const trackUrl = () => (trackUrlPromise = trackUrlPromise || orderTrackUrl(orderId, after));

    // 1. Order Confirmation (Order Paid)
    const becamePaid = before.paymentStatus !== "paid" && after.paymentStatus === "paid";
    // A paid order ends its checkout cart, so abandonedCartSweep never emails a paying customer.
    if (becamePaid && typeof after.cartId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(after.cartId)) {
      try {
        await db.collection("abandoned-carts").doc(after.cartId).set({ recovered: true, recoveredAt: new Date().toISOString() }, { merge: true });
      } catch (err) {
        console.warn("Could not mark checkout cart recovered", err);
      }
    }
    if (becamePaid && (after.items || []).some(item => item && item.giftCard === true)) {
      try {
        await issueGiftCardsForOrder(orderId);
      } catch (err) {
        console.error(`Could not issue gift cards for ${orderId}:`, err);
      }
    }
    if (becamePaid) {
      // If it is a manual payment method, decrement stock levels
      const isManual = after.paymentMethod && after.paymentMethod !== "Stripe" && after.paymentMethod !== "PayPal";
      if (isManual && after.inventoryDecrementedAt == null) {
        const itemList = after.items || [];
        try {
          await reserveStock(db, orderId, itemList, Date.now(), holdOwner(after));
          await db.runTransaction(async transaction => {
            const books = await readBooks(transaction, db, itemList);
            const oversold = writeStock(transaction, db, itemList, books, -1, new Date().toISOString());
            if (oversold) transaction.update(db.collection("orders").doc(orderId), { oversold: true });
            // Mark as decremented on the order document
            transaction.update(db.collection("orders").doc(orderId), {
              inventoryDecrementedAt: new Date().toISOString()
            });
          });
          console.log(`Successfully decremented inventory for manual order ${orderId}`);
        } catch (err) {
          console.error(`Failed to decrement inventory for manual order ${orderId}:`, err);
        }
      }

    }
    // Admin "Resend order confirmation" (Order detail › More order actions) stamps
    // confirmationEmailRequestedAt; each stamp sends the customer's confirmation once more.
    const resendConfirmation = !becamePaid && !!after.confirmationEmailRequestedAt && after.confirmationEmailRequestedAt !== before.confirmationEmailRequestedAt;
    if ((becamePaid || resendConfirmation) && after.paymentStatus === "paid") {
      // The customer's "Order confirmed" and the shop's new-order alert have separate switches:
      // pausing one must never silence the other. A resend never repeats the shop's alert.
      const customerPaidOn = notificationSettings.order_confirmation?.enabled !== false;
      const shopPaidOn = becamePaid && notificationSettings.shopAlerts?.newOrder !== false;
      if (customerPaidOn || shopPaidOn) {
      const order = after;

      // Compile digital items download section if any digital formats exist
      // Same digital rule as downloads, returns and labels ("Ebook", "Digital edition", digital: true).
      // Box sets contribute their e-book parts; pre-ordered e-books get no live link until release.
      const digitalItems = await digitalDelivery.emailDigitalEntries(order, {
        loadBook: async id => { const snap = await db.collection("books").doc(String(id)).get(); return snap.exists ? snap.data() : null; },
        isPhysical: isPhysicalItem, catalogDigital, preorderActive, releaseDateOf, today: shopDate(),
      });

      let downloadSection = "";
      if (digitalItems.length > 0) {
        const linkFor = item => `${functionLink(shopConfig, "downloadDigitalAsset")}?orderId=${encodeURIComponent(orderId)}&itemId=${encodeURIComponent(item.itemId)}${item.variantId ? `&variantId=${encodeURIComponent(item.variantId)}` : ""}&token=${encodeURIComponent(order.downloadToken || "")}`;
        const note = String(notificationSettings.order_confirmation?.downloadNote || digitalDelivery.DEFAULT_DOWNLOAD_NOTE);
        downloadSection = `
          <div style="margin-top:28px;padding:24px;background:#f8f6ff;border-radius:16px;border:1px solid #7c3aed20;">
            <h3 style="margin-top:0;font-size:13px;letter-spacing:.15em;text-transform:uppercase;color:#7c3aed;">Digital Library Access</h3>
            <p style="font-size:11px;color:#666;margin-bottom:16px;line-height:1.5;">${escapeHtml(note)}</p>
            <table style="width:100%;font-size:12px;border-collapse:collapse;">
              ${digitalItems.map(item => `
                <tr>
                  <td style="padding:8px 0;border-bottom:1px solid #7c3aed10;"><strong>${escapeHtml(item.title)}</strong></td>
                  <td style="padding:8px 0;text-align:right;border-bottom:1px solid #7c3aed10;">
                    ${item.pendingUntil
                      ? `<span style="font-size:11px;color:#666;">${item.pendingUntil === "announced" ? "Available once the book is released" : `Available from ${escapeHtml(item.pendingUntil)}`}</span>`
                      : `<a href="${linkFor(item)}"
                       style="display:inline-block;background:#7C3AED;color:#fff;text-decoration:none;padding:6px 12px;border-radius:6px;font-size:10px;font-weight:bold;letter-spacing:.05em;text-transform:uppercase;">Download File</a>`}
                  </td>
                </tr>
              `).join("")}
            </table>
          </div>
        `;
      }

      const itemsTable = customerTotalsTable(order);

      let paymentConfirmedSection = "";
      if (order.paymentMethod && !["Stripe", "PayPal", "Free"].includes(order.paymentMethod)) {
        paymentConfirmedSection = `
          <div style="margin-top:28px;padding:24px;background:#ecfdf5;border-radius:16px;border:1px solid #10b98120;">
            <h3 style="margin-top:0;font-size:13px;letter-spacing:.15em;text-transform:uppercase;color:#10b981;">Payment Verified</h3>
            <p style="font-size:12px;color:#065f46;margin-bottom:0;line-height:1.6;">We have verified your payment via <strong>${escapeHtml(order.paymentMethod)}</strong>. Your order is now confirmed${isPhysicalAny(order) ? " and being prepared for shipment" : ""}.</p>
          </div>
        `;
      }
      const delivery = deliveryDetails(order);
      // Nothing physical in the order: no "preparing it for shipment" / "we'll email when it ships".
      const digitalOnlyOrder = (order.items || []).length > 0 && (order.items || []).every(item => !item || !isPhysicalItem(item));
      const deliverySection = delivery.heading ? `
          <div style="margin-top:28px;padding:20px 24px;border:2px solid #111;">
            <h3 style="margin-top:0;font-size:13px;letter-spacing:.15em;text-transform:uppercase;">${escapeHtml(delivery.heading)}</h3>
            ${delivery.lines.map(line => `<p style="font-size:13px;margin:4px 0;line-height:1.6;">${escapeHtml(line)}</p>`).join("")}
          </div>` : "";
      // Pre-ordered books: when each is released and when the parcel ships.
      const preorderLines = preorderEmailLines(order);
      const preorderSection = preorderLines.length ? `
          <div style="margin-top:28px;padding:20px 24px;border:2px solid #111;">
            <h3 style="margin-top:0;font-size:13px;letter-spacing:.15em;text-transform:uppercase;">Pre-order</h3>
            ${preorderLines.map(line => `<p style="font-size:13px;margin:4px 0;line-height:1.6;">${escapeHtml(line)}</p>`).join("")}
          </div>` : "";
      const combinedSection = [preorderSection, deliverySection, paymentConfirmedSection, downloadSection].filter(Boolean).join("\n");

      const confirmationSettings = digitalOnlyOrder ? { ...notificationSettings, order_confirmation: { ...notificationSettings.order_confirmation,
        body: forDigitalOnlyOrder(notificationSettings.order_confirmation?.body || DEFAULT_NOTIFICATIONS.order_confirmation.body, { hasDownloads: digitalItems.length > 0 }) } } : notificationSettings;
      const compiled = compileEmailTemplate("order_confirmation", confirmationSettings, {
        customer_name: order.customer.name || "there",
        order_id: order.orderId || orderId,
        shipping_method: delivery.method,
        delivery_estimate: delivery.estimate,
        order_url: await trackUrl(),
        button_url: await trackUrl(),
        items_table: itemsTable,
        total_price: chargedTotalFmt(order)
      }, combinedSection);

      const adminOrderUrl = siteLink(`/admin#orders/${encodeURIComponent(orderId)}`);
      const adminAddr = order.customer?.address
        ? [order.customer.address.street, order.customer.address.unit, order.customer.address.city, order.customer.address.state, order.customer.address.zip, order.customer.address.country].filter(Boolean).join(", ")
        : "—";
      const adminPaidHtml = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
          <h2 style="margin-top:0;color:#16a34a;">&#10003; Payment Received</h2>
          <p><strong>Order:</strong> ${escapeHtml(order.orderId || orderId)} &nbsp;·&nbsp; <strong>${escapeHtml(chargedTotalFmt(order))}</strong></p>
          ${risoButton(adminOrderUrl, "Fulfil this order &rarr;", notificationSettings.brand?.brandColor, notificationSettings.brand?.emailTheme)}
          <p><strong>Customer:</strong> ${escapeHtml(order.customer.name)} &lt;${escapeHtml(order.customer.email)}&gt;${order.customer.phone ? ` · ${escapeHtml(order.customer.phone)}` : ""}</p>
          <p><strong>Ship to:</strong> ${escapeHtml(adminAddr)}</p>
          <p><strong>Payment:</strong> ${escapeHtml(order.paymentMethod || "Stripe")}</p>
          ${preorderLines.length ? `<p><strong>Pre-order:</strong> ${preorderLines.map(escapeHtml).join(" ")} It waits in Orders › Awaiting release until then.</p>` : ""}
          ${itemsTable}
          <p style="margin-top:24px;"><a href="${adminOrderUrl}">Open the order in the admin</a> to pack it, buy a label and mark it shipped.</p>
        </div>
      `;

      if (customerPaidOn) try {
        await sendOrderEmailOnce(orderId, becamePaid ? "orderConfirmed" : `orderConfirmedResend_${after.confirmationEmailRequestedAt}`, {
          to: order.customer.email,
          subject: compiled.subject,
          html: compiled.html,
          secret: RESEND_API_KEY.value(),
        });
      } catch (err) {
        console.error("Payment confirmation email to customer failed", err);
      }
      // The shop's one email per paid order (Settings › Notifications › new-order alert).
      // It goes out even when the customer's address is rejected.
      if (shopPaidOn) try {
        await sendOrderEmailOnce(orderId, "shopNewOrder", {
          to: ADMIN_TO,
          subject: `${order.sandboxPayment ? "[TEST] " : ""}[NEW ${preorderLines.length ? "PRE-ORDER" : "ORDER"}] ${order.orderId || orderId} · paid · ${chargedTotalFmt(order)} · ${order.customer.name}`,
          html: adminPaidHtml,
          secret: RESEND_API_KEY.value(),
        });
      } catch (err) {
        console.error("Payment admin notification email failed", err);
      }
    }
  }

    // 2. Shipping Confirmation (Order Shipped)
    const becameShipped = before.fulfillmentStatus !== "shipped" && after.fulfillmentStatus === "shipped";
    // Admin "Resend shipping email" (Order detail › In transit) stamps shippingEmailRequestedAt.
    const resendShipped = !!after.shippingEmailRequestedAt && after.shippingEmailRequestedAt !== before.shippingEmailRequestedAt;
    const handedOverLocally = isLocalOrder(after);
    // Customer "Order shipped" and the shop's shipped copy have separate switches too.
    const customerShippedOn = notificationSettings.shipping_confirmation?.enabled !== false;
    const shopShippedOn = becameShipped && notificationSettings.shopAlerts?.shipped !== false;
    if ((becameShipped || resendShipped) && !handedOverLocally && (customerShippedOn || shopShippedOn)) {
      // Straight to the carrier's tracking page; without a tracking number, the shop's order-status page.
      const trackingUrl = after.trackingNumber
        ? getTrackingUrl(after.trackingCarrier, after.trackingNumber, after.trackingUrl)
        : await trackUrl();
      // No tracking number: leave out the carrier/tracking lines instead of printing blanks.
      const shippedSettings = after.trackingNumber ? notificationSettings : { ...notificationSettings, shipping_confirmation: {
        ...notificationSettings.shipping_confirmation,
        body: withoutTrackingLines(notificationSettings.shipping_confirmation?.body || DEFAULT_NOTIFICATIONS.shipping_confirmation.body) } };
      const compiled = compileEmailTemplate("shipping_confirmation", shippedSettings, {
        customer_name: after.customer?.name || "there",
        order_id: after.orderId || orderId,
        tracking_carrier: after.trackingCarrier || "carrier",
        tracking_number: after.trackingNumber || "",
        button_url: trackingUrl,
        tracking_url: trackingUrl
      });

      const shippedAdminHtml = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
          <h2 style="margin-top:0;">&#128666; Order Shipped</h2>
          <p><strong>Order:</strong> ${escapeHtml(after.orderId || orderId)}</p>
          <p><strong>Customer:</strong> ${escapeHtml(after.customer?.name)} &lt;${escapeHtml(after.customer?.email)}&gt;</p>
          <p><strong>Carrier:</strong> ${escapeHtml(after.trackingCarrier || "—")} &nbsp;·&nbsp; <strong>Tracking:</strong> ${escapeHtml(after.trackingNumber || "—")}</p>
          ${after.trackingNumber && /^https?:\/\//i.test(trackingUrl) ? `<p><a href="${escapeHtml(trackingUrl)}">Track shipment &rarr;</a></p>` : ""}
        </div>
      `;

      // A first dispatch sends once; each admin "Resend shipping email" (its own stamp) sends once more.
      const shippedKind = becameShipped ? "shipped" : `shippedResend_${after.shippingEmailRequestedAt}`;
      if (customerShippedOn) try {
        await sendOrderEmailOnce(orderId, shippedKind, {
          to: after.customer.email,
          subject: compiled.subject,
          html: compiled.html,
          secret: RESEND_API_KEY.value(),
        });
      } catch (err) {
        console.error("Shipping confirmation email to customer failed", err);
      }
      // The shop's own copy goes out even when the customer's address is rejected (first dispatch only).
      if (shopShippedOn) try {
        await sendOrderEmailOnce(orderId, "shopShipped", {
          to: ADMIN_TO,
          subject: `[SHIPPED] ${after.orderId || orderId} · ${after.customer?.name}`,
          html: shippedAdminHtml,
          secret: RESEND_API_KEY.value(),
        });
      } catch (err) {
        console.error("Shipping admin notification email failed", err);
      }
    }

    // 2b. Shipped parcels: "out for delivery" and "delivered" (admin buttons or Shippo tracking) send
    // no customer email. The shipping email is the only one (owner's choice); the order status still moves.

    // 2c. Pickup and local delivery: the confirmation promises "we'll email you when your order is
    // ready to collect", so each customer-facing step the admin records sends one Delivery email.
    const localMethod = localMethodOf(after);
    const LOCAL_STEPS = localMethod === "pickup" ? { ready_for_pickup: "ready to collect" }
      : localMethod === "local_delivery" ? { out_for_delivery: "out for delivery", delivered: "delivered" } : {};
    const localStep = LOCAL_STEPS[after.fulfillmentStatus];
    if (localStep && before.fulfillmentStatus !== after.fulfillmentStatus && notificationSettings.delivery_update?.enabled !== false) {
      const localSettings = { ...notificationSettings, delivery_update: { ...notificationSettings.delivery_update,
        body: withoutCarrierLines(notificationSettings.delivery_update?.body || DEFAULT_NOTIFICATIONS.delivery_update.body) } };
      const compiled = compileEmailTemplate("delivery_update", localSettings, {
        customer_name: after.customer?.name || "there",
        order_id: after.orderId || orderId,
        status: localStep,
        button_url: await trackUrl(),
      }, localMethod === "pickup" ? (() => {
        const lines = deliveryDetails(after).lines.filter(line => !/we'll email you/i.test(line));
        return lines.length ? `<div style="margin-top:28px;padding:20px 24px;border:2px solid #111;"><h3 style="margin-top:0;font-size:13px;letter-spacing:.15em;text-transform:uppercase;">Pickup</h3>${lines.map(line => `<p style="font-size:13px;margin:4px 0;line-height:1.6;">${escapeHtml(line)}</p>`).join("")}</div>` : "";
      })() : "");
      try {
        await sendOrderEmailOnce(orderId, `local_${after.fulfillmentStatus}`, {
          to: after.customer.email,
          subject: compiled.subject,
          html: compiled.html,
          secret: RESEND_API_KEY.value(),
        });
      } catch (err) {
        console.error("Pickup/local delivery email failed", err);
      }
    }

    // 3. Order Cancelled (skip if the order is being refunded simultaneously — the refund email is more accurate)
    // A cancelled order frees any copies it was holding at checkout.
    if (before.status !== "cancelled" && after.status === "cancelled") {
      await releaseStock(db, orderId, after.items || []);
      await releaseGiftCards(db, orderId, [...chargedRedemptions(after), ...(after.giftCardRedemptions || [])]);
    }
    const becameCancelled = before.status !== "cancelled" && after.status === "cancelled"
      && after.paymentStatus !== "refunded" && after.paymentStatus !== "refund_pending"
      // "You will not be charged" is only true for an order that was never paid.
      && after.paymentStatus !== "paid";
    if (becameCancelled && notificationSettings.order_cancelled?.enabled !== false) {
      const compiled = compileEmailTemplate("order_cancelled", notificationSettings, {
        customer_name: after.customer?.name || "there",
        order_id: after.orderId || orderId,
        button_url: await trackUrl()
      });

      try {
        await sendOrderEmailOnce(orderId, "cancelled", {
          to: after.customer.email,
          subject: compiled.subject,
          html: compiled.html,
          secret: RESEND_API_KEY.value(),
        });
      } catch (err) {
        console.error("Order cancelled email failed", err);
      }
    }

    // 4. Order Refunded
    const becameRefunded = before.paymentStatus !== "refunded" && after.paymentStatus === "refunded";
    if (becameRefunded) {
      // If it is a manual payment method, handle restocking
      const isManual = after.paymentMethod && after.paymentMethod !== "Stripe" && after.paymentMethod !== "PayPal";
      // applyOrderRefund already handled stock (or the admin's "don't restock" choice) when it set refund.provider.
      const shouldRestock = isManual && !after.refund?.provider && after.refundRequest?.restock !== false
        && after.restockOnRefund !== false && after.inventoryRestockedAt == null;
      if (shouldRestock) {
        const itemList = after.items || [];
        try {
          await db.runTransaction(async transaction => {
            const books = await readBooks(transaction, db, itemList);
            writeStock(transaction, db, itemList, books, 1, new Date().toISOString());
            // Mark as restocked on the order document
            transaction.update(db.collection("orders").doc(orderId), {
              inventoryRestockedAt: new Date().toISOString()
            });
          });
          console.log(`Successfully restocked manual order ${orderId}`);
        } catch (err) {
          console.error(`Failed to restock manual order ${orderId}:`, err);
        }
      }

      const facts = refundEmailFacts(after, chargedRedemptions(after));
      if (facts && notificationSettings.order_refunded?.enabled !== false) {
      // {{total_price}} now carries its own currency (e.g. "US$12.40"); older saved templates
      // that wrote "CA${{total_price}}" are read without the hard-coded prefix.
      const refundBody = String(notificationSettings.order_refunded?.body || "").replace(/CA\$\s*\{\{total_price\}\}/g, "{{total_price}}");
      const refundSettings = { ...notificationSettings, order_refunded: { ...notificationSettings.order_refunded,
        // Paid entirely by gift card: the money is back on the card now, not "in 5-10 business days".
        body: facts.giftOnly ? withoutBankRefundSentences(refundBody || DEFAULT_NOTIFICATIONS.order_refunded.body) : refundBody } };
      const giftSection = facts.giftText ? `
          <div style="margin-top:28px;padding:20px 24px;border:2px solid #111;">
            <h3 style="margin-top:0;font-size:13px;letter-spacing:.15em;text-transform:uppercase;">Gift card</h3>
            <p style="font-size:13px;margin:4px 0;line-height:1.6;">${escapeHtml(facts.giftText)} is back on your gift card${facts.cards ? ` ${escapeHtml(facts.cards)}` : ""} and can be used right away.</p>
          </div>` : "";
      const compiled = compileEmailTemplate("order_refunded", refundSettings, {
        customer_name: after.customer?.name || "there",
        order_id: after.orderId || orderId,
        // What was actually refunded, in the currency it went back in.
        total_price: facts.amountText,
        button_url: await trackUrl()
      }, giftSection);

      try {
        await sendOrderEmailOnce(orderId, "refunded", {
          to: after.customer.email,
          subject: compiled.subject,
          html: compiled.html,
          secret: RESEND_API_KEY.value(),
        });
      } catch (err) {
        console.error("Order refunded email failed", err);
      }
    }
  }

    // 5. Partial refund (Stripe or PayPal): the order stays paid, so nothing above tells the
    // customer. One email per new running total.
    const refundedBefore = Number(before.refundedAmountMinor) || 0;
    const refundedAfter = Number(after.refundedAmountMinor) || 0;
    if (after.paymentStatus === "paid" && after.partiallyRefunded && refundedAfter > refundedBefore
      && notificationSettings.order_refunded?.enabled !== false) {
      const currency = String(after.expectedCurrency || after.checkoutCurrency || "CAD").toUpperCase();
      // refundedAmountMinor is already in the charged currency: format it, never convert it again.
      const amountText = refundAmountText({ refund: { amount: (refundedAfter - refundedBefore) / 100, currency } });
      const compiled = compileEmailTemplate("order_refunded", notificationSettings, {
        customer_name: after.customer?.name || "there",
        order_id: after.orderId || orderId,
        total_price: amountText,
        button_url: await trackUrl()
      }, `<p style="margin-top:20px;font-size:13px;line-height:1.6;">This is a partial refund. The rest of your order is unchanged.</p>`);
      try {
        await sendOrderEmailOnce(orderId, `partialRefund_${refundedAfter}`, {
          to: after.customer.email,
          subject: compiled.subject,
          html: compiled.html,
          secret: RESEND_API_KEY.value(),
        });
      } catch (err) {
        console.error("Partial refund email failed", err);
      }
    }
}

const { digestSince, digestNeedsOperations, DIGEST_ORDER_LIMIT } = require("./orderDigest");
const { lastWeek, buildWeeklySummary, weeklyHighlights, weeklySummaryEnabled, firstOrders, WEEKLY_PDF_LINE } = require("./weeklySummary");
const { buildWeeklyPdf, weeklyPdfName } = require("./weeklyPdf");
const { pruneOldCarts } = require("./cartCleanup");

// Back-in-stock emails are sent a few at a time inside a time budget. Alerts a run could not reach keep
// `restockPending: true`, and backInStockSweep (every 15 minutes) finishes them, so a big list is never
// lost when the trigger runs out of time (the trigger only fires on the 0 -> available change).
const RESTOCK_BATCH = 5;
const RESTOCK_BUDGET_MS = 240 * 1000;

const jobs = scheduledJobs({
  onSchedule, admin, db, crypto, ADMIN_TO, RESEND_API_KEY, DIGEST_ORDER_LIMIT, RESTOCK_BUDGET_MS, TRANSIT_DAYS,
  buildOrderDigest, catalogUnitPrice, claimEmailSend, compileEmailTemplate, dailyDigestEnabled,
  digestNeedsOperations, digestSince, escapeHtml, footerAddress, loadNotificationSettings,
  marketingUnsubscribeKey, moneyFmt, nextDailyCount, normMarketingEmail, optOutId, pruneOldCarts,
  reminderFirstName, runInBatches, sendEmail: lateSendEmail, sendRestockAlerts, sendWeeklySummary, siteLink,
  stockOf, unsubscribeToken, weeklySummaryEnabled,
});

exports.dailyOrderDigest = jobs.dailyOrderDigest;

exports.weeklySummary = jobs.weeklySummary;

async function sendWeeklySummary(nowMs = Date.now()) {
  const week = lastWeek(nowMs);
  const paidSnap = await db.collection("orders").where("paymentStatus", "==", "paid")
    .select("createdAt", "paidAt", "paymentStatus", "isTest", "sandboxPayment", "customer.email", "total",
      "refundedAmountMinor", "expectedAmountMinor", "expectedCurrency", "checkoutCurrency", "items")
    .limit(20000).get();
  const paid = paidSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  // Analytics docs are keyed by UTC day; the two weeks plus a day either side cover the Toronto weeks.
  const dailySnap = await db.collection("analytics").where("date", ">=", week.prevStart).where("date", "<=", week.end).get();
  const daily = dailySnap.docs.map(d => ({ id: d.id, ...d.data() }));
  // "Waiting to ship" uses the daily digest's rule on the last 180 days of paid orders.
  const recentSnap = await db.collection("orders").where("paymentStatus", "==", "paid")
    .where("createdAt", ">=", digestSince(nowMs)).orderBy("createdAt", "desc").limit(DIGEST_ORDER_LIMIT).get();
  const toShip = buildOrderDigest(recentSnap.docs.map(d => ({ id: d.id, ...d.data() })), new Map(), nowMs).unshipped.length;
  const firstOrderIds = firstOrders(paid);
  const { subject, html } = buildWeeklySummary({ orders: paid, daily, week, firstOrderIds, toDo: { toShip }, link: siteLink, withPdf: true });
  // The attached PDF (functions/weeklyPdf.js) names the most looked-at books, so it needs their titles.
  const bookTitles = new Map();
  await db.collection("books").select("title").get()
    .then(snap => snap.docs.forEach(d => bookTitles.set(d.id, String(d.data()?.title || ""))))
    .catch(err => console.warn("Weekly summary: book titles unavailable:", err.message));
  let attachments = [];
  try {
    const pdf = buildWeeklyPdf(weeklyHighlights({ orders: paid, daily, week, firstOrderIds, bookTitles }));
    attachments = [{ filename: weeklyPdfName(week), content: pdf, contentType: "application/pdf" }];
  } catch (err) {
    console.error("Weekly summary PDF failed; sending the email without it:", err);
  }
  await sendEmail({ to: ADMIN_TO, subject, html: attachments.length ? html : html.replace(WEEKLY_PDF_LINE, ""), secret: RESEND_API_KEY.value(), attachments });
  return { subject };
}

// Secret for signing unsubscribe links, created once and kept server-only in adminSecrets.
async function marketingUnsubscribeKey() {
  const ref = db.collection("adminSecrets").doc("marketing");
  const snap = await ref.get();
  const existing = snap.exists ? String(snap.data()?.unsubscribeKey || "") : "";
  if (existing.length >= 32) return existing;
  const key = crypto.randomBytes(32).toString("hex");
  await ref.set({ unsubscribeKey: key }, { merge: true });
  return key;
}

exports.abandonedCartSweep = jobs.abandonedCartSweep;
const shippo = shippoEndpoints({
  onBrowserRequest, onRequest, db, applyCors, requireAdmin, hitLimit, LIMITS, IS_EMULATOR, RESEND_API_KEY,
  SHIPPO_API_TOKEN, SHIPPO_CONFIG_DOC, ADDRESS_ACTIONS, FALLBACK_COPY_GRAMS, addressKeyProblem, addressMissing,
  advancesTracking, bundleComponents, callShippo, catalogDigital, catalogFormat, checkoutRate,
  cleanLiveRateExtra, getCountryCode, getShippoToken, getStateCode, handleAddressLookup, isPhysicalItem,
  itemWeightGrams, liveRateExtra, originAddress, parcelGrams, publicErrorMessage, readAdminSecret,
  withLiveRateExtra,
});

exports.getShippoConfig = shippo.getShippoConfig;

exports.setShippoDynamicRates = shippo.setShippoDynamicRates;

exports.getShippoRates = shippo.getShippoRates;

exports.saveShippoConfig = shippo.saveShippoConfig;

// Server-side carrier check of a paid order's shipping address. A valid address is
// recorded as reviewed in the admin-only order-operations record, so the publisher
// goes straight to packing. Anything else keeps the order in "Needs attention".
async function autoApproveShippingAddress(orderId, order) {
  const method = order.fulfillmentSelection?.method || order.fulfillment?.method || "shipping";
  const address = order.customer?.address || {};
  // Countries with no province list or no postal code are checked too (shared/addressRules).
  if (method !== "shipping" || order.isTest || addressMissing(address).length) return;
  const shippoToken = await getShippoToken();
  if (!shippoToken) return;
  const result = await callShippo("addresses/", "POST", {
    name: order.customer?.name || "Customer",
    street1: address.street,
    street2: address.unit || "",
    city: address.city,
    state: getStateCode(address.state),
    zip: address.zip,
    country: getCountryCode(address.country),
    validate: true,
  }, shippoToken);
  if (result?.validation_results?.is_valid !== true) return;
  const opsRef = db.collection("order-operations").doc(orderId);
  const now = new Date().toISOString();
  await db.runTransaction(async tx => {
    const [fresh, ops] = await Promise.all([tx.get(db.collection("orders").doc(orderId)), tx.get(opsRef)]);
    const current = fresh.data() || {};
    const key = guardAddressKey(current);
    // Only approve the address that was checked, and never override a publisher decision.
    if (key !== guardAddressKey(order) || (ops.data() || {}).addressReviewed) return;
    tx.set(opsRef, {
      addressReviewed: key,
      updatedAt: now,
      activity: [...((ops.data() || {}).activity || []), { type: "event", message: "Shipping address verified automatically with the carrier after payment.", createdAt: now }],
    }, { merge: true });
  });
}

exports.validateAddress = shippo.validateAddress;

// ──────────────────────────────────────────────────────────────
// 8. HTTP Endpoint: Create Shipping Label via Shippo (Secure)
// ──────────────────────────────────────────────────────────────
exports.createShippingLabel = shippingLabelEndpoints({
  onBrowserRequest, SHIPPO_API_TOKEN, applyCors, admin, requireAdmin, db, getShippoToken, callShippo, IS_EMULATOR, originAddress, getStateCode, getCountryCode,
}).createShippingLabel;

// ──────────────────────────────────────────────────────────────
// 9. HTTP Endpoint: Validate Discount Code (public checkout)
//    The discounts collection is admin-only in Firestore rules, so the
//    storefront validates codes through this endpoint instead.
// ──────────────────────────────────────────────────────────────
// A page or section that failed to draw in a shopper's browser (src/app/lib/errorReport.ts). Counted per distinct
// error in admin-only clientErrors (functions/clientErrors.js); nothing personal is kept. Always answers 204.
async function handleClientError(req, res) {
  const report = cleanReport(req.body.report);
  if (report && (await hitLimit(db, "client-error", req, LIMITS.clientError))) {
    const result = await recordClientError(db, report).catch(err => { console.warn("clientError record failed:", err.message); return null; });
    if (result === "full") console.warn("clientError: today's budget of new errors is used up; new errors aren't recorded until tomorrow.");
  }
  res.status(204).send("");
}

exports.validateDiscountCode = onBrowserRequest(async (req, res) => {
  if (applyCors(req, res)) return;

  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  // The storefront's starting currency: the visitor's country as Google's front end saw their IP
  // (serverGeoCountry). No database work and no third-party lookup; null when the platform sent none.
  if (req.body?.action === "visitorCountry") {
    res.set("Cache-Control", "private, no-store");
    res.status(200).json({ country: serverGeoCountry(req) || null });
    return;
  }

  if (req.body?.action === "clientError") return handleClientError(req, res);

  // Checkout's automatic offers (no code): the conditions checkout needs to show the same saving
  // the server will charge. Customer lists and usage counts stay private.
  if (req.body?.action === "automaticDiscounts") {
    // Its own bucket (checkout asks on every cart change, which must not use up the code-guessing allowance),
    // and the discounts query is shared for 30 s so a loop of calls cannot turn into a loop of reads (#110).
    if (!(await hitLimit(db, "autodiscount", req, LIMITS.autoDiscount))) {
      res.status(429).json({ error: "Too many attempts. Please wait a few minutes and try again." });
      return;
    }
    try {
      const offers = await cachedAutomaticDiscounts();
      res.status(200).json({ discounts: offers.map(d => ({
        id: d.id, title: String(d.title || ""), type: d.type, value: d.value ?? null,
        minOrderAmount: d.minOrderAmount ?? null, minQuantity: d.minQuantity ?? null, maxDiscountAmount: d.maxDiscountAmount ?? null,
        appliesTo: d.appliesTo ?? "all", selectedCategories: d.selectedCategories ?? [], selectedProducts: d.selectedProducts ?? [],
        buyQuantity: d.buyQuantity ?? null, getQuantity: d.getQuantity ?? null, getDiscountValue: d.getDiscountValue ?? null, tiers: d.tiers ?? null,
        giftBookId: d.giftBookId ?? null, giftVariantId: d.giftVariantId ?? null,
        // Offers limited to some customers may not apply to this shopper: checkout re-prices on the server.
        restricted: !!(String(d.allowedCustomerEmails || "").trim() || String(d.allowedEmailDomains || "").trim() || d.onePerCustomer),
      })) });
    } catch (err) {
      console.error("automaticDiscounts failed:", err);
      res.status(200).json({ discounts: [] });
    }
    return;
  }

  // Checkout's "Gift card" box: the card's balance, by code. Rate limited like discount codes.
  if (req.body?.action === "giftCardBalance") {
    if (!(await hitLimit(db, "discount", req, LIMITS.discount))) {
      res.status(429).json({ error: "Too many attempts. Please wait a few minutes and try again." });
      return;
    }
    const id = giftCardId(req.body.code);
    if (!id) return res.status(400).json({ error: GIFT_CARD_MESSAGES.not_found, code: "gift_card_not_found" });
    const snap = await db.collection("giftCards").doc(id).get();
    const card = snap.exists ? snap.data() : null;
    const problem = giftCardProblem(card, { testMode: await shopTestMode() });
    if (problem) return res.status(400).json({ error: GIFT_CARD_MESSAGES[problem], code: `gift_card_${problem}` });
    return res.status(200).json({ last4: card.last4 || last4(req.body.code), balanceMinor: availableMinor(card, "", Date.now()), currency: "CAD", expiresOn: card.expiresOn || null });
  }

  const { code } = req.body;
  if (!code || typeof code !== "string") {
    res.status(400).json({ error: "Missing discount code" });
    return;
  }
  if (!(await hitLimit(db, "discount", req, LIMITS.discount))) {
    res.status(429).json({ error: "Too many attempts. Please wait a few minutes and try again." });
    return;
  }

  try {
    const d = await fetchValidDiscount(code);
    res.status(200).json({
      discount: {
        id: d.id,
        code: d.code,
        type: d.type,
        value: d.value,
        minOrderAmount: d.minOrderAmount ?? null,
        minQuantity: d.minQuantity ?? null,
        // Checkout shows the same "up to $X off" ceiling the server applies.
        maxDiscountAmount: d.maxDiscountAmount ?? null,
        onePerCustomer: d.onePerCustomer ?? false,
        appliesTo: d.appliesTo ?? "all",
        selectedCategories: d.selectedCategories ?? [],
        selectedProducts: d.selectedProducts ?? [],
        allowedEmailDomains: d.allowedEmailDomains ?? "",
        // The list itself stays private: checkout re-checks the shopper's email on the server.
        restrictedToCustomers: !!String(d.allowedCustomerEmails || "").trim(),
        buyQuantity: d.buyQuantity ?? null,
        getQuantity: d.getQuantity ?? null,
        getDiscountValue: d.getDiscountValue ?? null,
        tiers: d.tiers ?? null,
      },
    });
  } catch (err) {
    res.status(400).json({ error: publicErrorMessage(err, "That code could not be checked. Please try again.") });
  }
});

// ──────────────────────────────────────────────────────────────
// 10. Order Created Trigger (New Order Admin Alert / Customer Manual Order Confirmation)
// ──────────────────────────────────────────────────────────────
exports.onOrderCreated = onDocumentCreated(
  { document: "orders/{orderId}", secrets: withPlatformKey([RESEND_API_KEY]) },
  async event => {
    const order = event.data?.data() || {};
    const orderId = event.params.orderId;

    if (order.isTest === true) return;
    if (!order.customer?.email) return;

    const notificationSettings = await loadNotificationSettings();

    // 1. Admin Alert: Send email to ADMIN_TO about new order
    // Card/PayPal orders are created before payment (and many are never paid): the shop
    // hears about those once, when they're paid (onOrderUpdated). Only manual-payment
    // orders, which are paid later by e-Transfer/cash, are news when placed.
    if (notificationSettings.shopAlerts?.newOrder !== false && order.paymentStatus === "pending") {
      const itemsTable = `
        <table style="width:100%;border-collapse:collapse;margin:24px 0;font-size:13px;">
          ${orderRowsHtml(order.items)}
          <tr><td colspan="2" style="padding:8px 0;text-align:right;color:#666;">Subtotal</td><td style="text-align:right;">${moneyFmt(order.subtotal)}</td></tr>
          <tr><td colspan="2" style="padding:8px 0;text-align:right;color:#666;">Shipping</td><td style="text-align:right;">${moneyFmt(order.shipping)}</td></tr>
          ${order.tax ? `<tr><td colspan="2" style="padding:8px 0;text-align:right;color:#666;">Tax</td><td style="text-align:right;">${moneyFmt(order.tax)}</td></tr>` : ""}
          ${order.discount ? `<tr><td colspan="2" style="padding:8px 0;text-align:right;color:#0a7;">Discount</td><td style="text-align:right;color:#0a7;">−${moneyFmt(order.discount)}</td></tr>` : ""}
          <tr><td colspan="2" style="padding:12px 0;text-align:right;font-weight:bold;">Total</td><td style="text-align:right;font-weight:bold;">${moneyFmt(order.total)}</td></tr>
        </table>
      `;

      const adminHtml = `
        <p>A new order has been placed: <strong>${escapeHtml(order.orderId || orderId)}</strong> · ${moneyFmt(order.total)}</p>
        <p>It's waiting for a manual payment (${escapeHtml(order.paymentMethod || "manual")}). Once the money arrives, confirm it in the order and ship it.</p>
        ${risoButton(siteLink(`/admin#orders/${encodeURIComponent(orderId)}`), "Open this order &rarr;", notificationSettings.brand?.brandColor, notificationSettings.brand?.emailTheme)}
        <p><strong>Customer:</strong> ${escapeHtml(order.customer.name)} &lt;${escapeHtml(order.customer.email)}&gt;</p>
        <p><strong>Payment Method:</strong> ${escapeHtml(order.paymentMethod || "Stripe")}</p>
        <p><strong>Shipping Method:</strong> ${escapeHtml(order.shippingMethod || "Standard")}</p>
        ${itemsTable}
      `;

      try {
        await sendEmail({
          queue: "shopPendingOrder",
          about: { orderId },
          to: ADMIN_TO,
          subject: `[NEW ORDER] ${order.orderId || orderId}`,
          html: adminHtml,
          secret: RESEND_API_KEY.value(),
        });
      } catch (err) {
        console.error("New order admin email notification failed", err);
      }
    }

    // 2. Customer Email: Send "Order Received (Pending Payment)" confirmation email if order was placed via manual payment method (i.e. starts as "pending")
    if (order.paymentStatus === "pending" && notificationSettings.order_pending_payment?.enabled !== false) {
      const itemsTable = customerTotalsTable(order);

      // Instructions come from the shop's own settings, never from the order
      // document (which a browser can write), so nobody can make the shop email
      // someone "pay to this account" text.
      const websiteSettings = (await db.collection("settings").doc("website").get()).data() || {};
      const manualMethod = (websiteSettings.payments?.manualMethods || []).find(m => m && m.name === order.paymentMethod);
      const paymentInstructions = String(manualMethod?.instructions || "");
      if (!manualMethod) return; // not a payment method this shop offers: no customer email
      let additionalSection = "";
      if (paymentInstructions) {
        additionalSection = `
          <div style="margin-top:28px;padding:24px;background:#fffbeb;border-radius:16px;border:1px solid #d9770620;">
            <h3 style="margin-top:0;font-size:13px;letter-spacing:.15em;text-transform:uppercase;color:#d97706;">Payment Instructions</h3>
            <p style="font-size:12px;color:#451a03;margin-bottom:0;line-height:1.6;white-space:pre-wrap;">${escapeHtml(paymentInstructions)}</p>
          </div>
        `;
      }

      // Not paid yet: its own template, so the customer isn't told the order is paid for.
      const compiled = compileEmailTemplate("order_pending_payment", notificationSettings, {
        customer_name: order.customer.name || "there",
        order_id: order.orderId || orderId,
        payment_method: order.paymentMethod || "",
        button_url: await orderTrackUrl(orderId, order),
        items_table: itemsTable,
        total_price: chargedTotalFmt(order)
      }, additionalSection);

      try {
        await sendEmail({
          queue: "orderPendingPayment",
          about: { orderId },
          to: order.customer.email,
          subject: compiled.subject,
          html: compiled.html,
          secret: RESEND_API_KEY.value(),
        });
      } catch (err) {
        console.error("Order pending payment customer email failed", err);
      }
    }
  }
);

const shopMail = shopEmails({
  onBrowserRequest, onDocumentCreated, admin, db, mailer, applyCors, requireAdmin, ADMIN_TO,
  DEFAULT_NOTIFICATIONS, RESEND_API_KEY, claimEmailSend, cleanRecipients, compileEmailTemplate,
  loadNotificationSettings, logEmailAttempt, publicOutboxEntry, sendEmail: lateSendEmail, sendQueuedEmail,
  sendWeeklySummary, siteLink,
});

exports.onContactMessage = shopMail.onContactMessage;

exports.onCustomerCreated = shopMail.onCustomerCreated;

exports.sendTestEmail = shopMail.sendTestEmail;

exports.shippoWebhook = shippo.shippoWebhook;

// ──────────────────────────────────────────────────────────────
// 12b. Back-in-stock alerts: email shoppers who signed up on a sold-out product
// ──────────────────────────────────────────────────────────────
function stockOf(item, fallback) {
  if (!item) return fallback;
  if (item.stockLevel !== undefined) return Number(item.stockLevel);
  if (item.stock !== undefined) return Number(item.stock);
  return fallback;
}

async function sendRestockAlerts({ bookId, book, docs, deadline, released = false }) {
  // released = the book just stopped being "Coming soon": signups made on that page get "Out now" wording.
  // (backInStockSweep can't see the switch any more; it reads the releasePending stamp set below.)
  const stuckBefore = Date.now() - 15 * 60 * 1000;
  const link = siteLink(`/books/${encodeURIComponent(book.slug || bookId)}`);
  const restockSettings = await loadNotificationSettings();
  const esc = t => String(t || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const keyOf = alert => `${String(alert.email || "").trim().toLowerCase()}|${String(alert.variantId || "")}`;
  // One email per address per book edition, however many signups exist for it: the first signup sends,
  // the repeats are closed once that send is done.
  const leaders = [];
  const repeats = [];
  const seen = new Set();
  for (const doc of docs) {
    const key = keyOf(doc.data());
    if (seen.has(key)) repeats.push(doc); else { seen.add(key); leaders.push(doc); }
  }
  const emailedThisRun = new Set();

  const sendOne = async doc => {
    const alert = doc.data();
    // Claim first so a duplicate trigger never double-sends.
    const claimed = await db.runTransaction(async tx => {
      const cur = await tx.get(doc.ref);
      if (!cur.exists) return false;
      const c = cur.data();
      const stuck = c.status === "sending" && Date.parse(c.sendingAt || 0) < stuckBefore;
      if (c.status !== "waiting" && !stuck) return false;
      tx.update(doc.ref, { status: "sending", sendingAt: new Date().toISOString() });
      return true;
    });
    if (!claimed) return;
    // Anyone can sign up (new guests included), so no proof is required, but every send takes
    // from the shop-wide budget. Over it, the signup keeps waiting for the next restock.
    if (!(await claimEmailSend(db, "backInStock", "", { failOpen: false }))) {
      await doc.ref.update({ status: "waiting" }).catch(() => {});
      return;
    }
    try {
      const title = esc(book.title || alert.bookTitle);
      const variant = alert.variantName ? ` (${esc(alert.variantName)})` : "";
      const isRelease = released || alert.releasePending === true;
      await sendEmail({
        // Both senders down: the retry queue delivers it later (this trigger won't run again).
        queue: "backInStock",
        to: alert.email,
        subject: isRelease ? `Out now: ${book.title || alert.bookTitle}` : `Back in stock: ${book.title || alert.bookTitle}`,
        html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;">
            <h2 style="margin-top:0;">${isRelease ? "It's here!" : "It's back!"}</h2>
            <p style="font-size:15px;line-height:1.6;"><strong>${title}</strong>${variant} ${isRelease ? "is out now and ready to order." : "is available again. Stock is limited, so grab your copy while you can."}</p>
            ${risoButton(link, "Shop now", restockSettings.brand?.brandColor, restockSettings.brand?.emailTheme)}
            <p style="font-size:12px;color:#888;">You received this because you asked to be notified. This is a one-time message.</p>
          </div>`,
        secret: RESEND_API_KEY.value(),
      });
      emailedThisRun.add(keyOf(alert));
    } catch (err) {
      console.error("Back-in-stock email failed:", err.message);
      // Queued for a retry: it counts as sent here, so it is never also sent again by a later restock.
      if (!err?.queued) {
        // Back to waiting, still pending: the next sweep tries again.
        await doc.ref.update({ status: "waiting" }).catch(() => {});
        return;
      }
      emailedThisRun.add(keyOf(alert));
    }
    // Sent: remove the signup (its id is per address + edition) so the shopper can ask again
    // next time; if that fails, mark it notified — never back to waiting, which would resend.
    await doc.ref.delete().catch(() => doc.ref.update({ status: "notified", notifiedAt: new Date().toISOString(), restockPending: false }).catch(() => {}));
  };

  const result = await runInBatches(leaders, RESTOCK_BATCH, sendOne, { deadline });
  for (const doc of repeats) {
    if (emailedThisRun.has(keyOf(doc.data()))) await doc.ref.update({ status: "notified", notifiedAt: new Date().toISOString(), restockPending: false }).catch(() => {});
  }
  if (result.skipped.length || result.failed) console.warn(`Back-in-stock for ${bookId}: ${result.skipped.length} left for the sweep, ${result.failed} failed`);
  return result;
}

exports.onBookRestocked = onDocumentUpdated(
  { document: "books/{bookId}", secrets: withPlatformKey([RESEND_API_KEY]), timeoutSeconds: 300 },
  async event => {
    const before = event.data?.before?.data() || {};
    const after = event.data?.after?.data() || {};
    const bookId = event.params.bookId;
    // Only books shoppers can actually buy: no "it's back" for drafts, archived or not-yet-released books.
    if (after.isTest === true) return;
    // (A future release date doesn't skip: the alert would otherwise wait for a second restock.)
    if (after.status && after.status !== "published") return;
    // Still "Coming soon": nothing can be bought yet, so no email (stock may be filled in ahead of release).
    if (after.comingSoon === true) return;

    // Which variant ids (and the base product, "") just went from 0 to available?
    const restocked = new Set();
    const afterVariants = Array.isArray(after.variants) ? after.variants : [];
    // Coming soon switched off = the book is out: everyone who asked on its page hears, for every edition
    // in stock. Signups there are for the book as a whole (""), so "" counts when any edition can be bought.
    const released = before.comingSoon === true;
    if (released) {
      const anyEdition = afterVariants.some(v => stockOf(v, 999) > 0);
      if (stockOf(after, 999) > 0 || anyEdition) restocked.add("");
      for (const v of afterVariants) if (stockOf(v, 999) > 0) restocked.add(String(v.id));
    }
    if (stockOf(before, 999) <= 0 && stockOf(after, 999) > 0) restocked.add("");
    const beforeVariants = Array.isArray(before.variants) ? before.variants : [];
    for (const v of afterVariants) {
      const prev = beforeVariants.find(x => x.id === v.id);
      if (prev && stockOf(prev, 999) <= 0 && stockOf(v, 999) > 0) restocked.add(String(v.id));
    }
    // A base restock also covers signups made before variants existed.
    if (restocked.size === 0) return;

    // Waiting alerts, plus any stuck in "sending" (a run that crashed mid-send) for over 15 minutes.
    const snap = await db
      .collection("stockAlerts")
      .where("bookId", "==", bookId)
      .where("status", "in", ["waiting", "sending"])
      .limit(500)
      .get();
    if (snap.empty) return;
    const docs = snap.docs.filter(doc => restocked.has(String(doc.data().variantId || "")));
    if (!docs.length) return;
    // Mark them pending first: whatever this run cannot reach is finished by backInStockSweep.
    await Promise.all(docs.map(doc => doc.ref.update({ restockPending: true, ...(released ? { releasePending: true } : {}) }).catch(() => {})));
    await sendRestockAlerts({ bookId, book: after, docs, deadline: Date.now() + RESTOCK_BUDGET_MS, released });
  },
);

/**
 * Finishes back-in-stock emails a restock run could not reach in time (every 15 minutes). A pending
 * alert is only sent while its book is still published and in stock; otherwise it simply waits for the next restock.
 */
// Website sales → inventory app (docs/INVENTORY_LINK.md): every write to a counted order (paid, refunded,
// shipped…) is sent to the inventory app's inbox. Only reads the order; inventoryLinkSweep retries failures.
let inventoryLinkStateCache = { at: 0, state: null };
exports.onOrderInventoryPush = onDocumentWritten({ document: "orders/{orderId}", timeoutSeconds: 60 }, async event => {
  if (!event.data?.after?.exists) return;
  const jobs = require("./inventoryLinkJobs");
  if (!inventoryLinkStateCache.state || Date.now() - inventoryLinkStateCache.at > 60 * 1000) {
    inventoryLinkStateCache = { at: Date.now(), state: await jobs.readState(db) };
  }
  const state = inventoryLinkStateCache.state;
  if (!jobs.salesOn(state)) return;
  const result = await jobs.pushOrder(inventoryLinkDeps(), event.params.orderId, state);
  if (result.status === "failed") console.warn(`inventory link: order ${event.params.orderId} not delivered yet (${result.error}); the sweep retries it.`);
});

// The link's regular check: labels bought in the inventory app, missed or failed pushes, past orders,
// and (every 15 minutes, once the owner switched it on) linked books' stock.
exports.inventoryLinkSweep = onSchedule({ schedule: "every 5 minutes", timeoutSeconds: 300 }, async () => {
  const out = await require("./inventoryLinkJobs").runSweep(inventoryLinkDeps(), { stock: "auto" });
  if (out.error) console.error("inventoryLinkSweep:", out.error);
});

// The storefront's catalog file stays in use only while nothing it holds has changed (functions/catalogVersion.js).
// Books and pages count only when a published version is involved (the file holds nothing else).
const catalogChanged = (source, { publishedOnly = false } = {}) => async event => {
  const catalogVersion = require("./catalogVersion");
  if (publishedOnly && !catalogVersion.touchesCatalogFile(event.data?.before?.data(), event.data?.after?.data())) return;
  try { await catalogVersion.bumpCatalogVersion(db, admin.firestore.FieldValue, `${source}/${Object.values(event.params || {})[0] || ""}`); }
  catch (err) { console.error("catalogVersion: could not record a change:", err.message); throw err; }
};
exports.catalogVersionBooks = onDocumentWritten("books/{bookId}", catalogChanged("books", { publishedOnly: true }));
exports.catalogVersionPages = onDocumentWritten("pages/{pageId}", catalogChanged("pages", { publishedOnly: true }));
exports.catalogVersionSettings = onDocumentWritten("settings/website", catalogChanged("settings"));
// The file also carries the public shipping profiles (book pages' shipping figure, the bag's estimate and bar).
exports.catalogVersionShipping = onDocumentWritten("shipping-profiles/{profileId}", catalogChanged("shipping-profiles"));

exports.storageImageSweep = jobs.storageImageSweep;

exports.backInStockSweep = jobs.backInStockSweep;

// ──────────────────────────────────────────────────────────────
// 12. Low Stock Alerts: Email admin when product or variant stock drops below 3 or hits 0
// ──────────────────────────────────────────────────────────────
exports.onBookUpdated = onDocumentUpdated(
  { document: "books/{bookId}", secrets: withPlatformKey([RESEND_API_KEY]) },
  async event => {
    const before = event.data?.before?.data() || {};
    const after = event.data?.after?.data() || {};

    if (after.isTest === true) return;
    if (!after.trackInventory) return;

    // A missing stock field means "not counted" on both sides, so it never reads as a sale to 0.
    const stockBefore = stockOf(before.stockLevel !== undefined ? before : null, 999);
    const stockAfter = stockOf(after.stockLevel !== undefined ? after : null, 999);

    let shouldAlert = false;
    let alertLines = [];

    // Check parent product stock
    const parentBecameLowStock = (stockBefore > 3 && stockAfter <= 3 && stockAfter > 0);
    const parentBecameSoldOut = (stockBefore > 0 && stockAfter <= 0);

    if (parentBecameLowStock) {
      shouldAlert = true;
      alertLines.push(`Product "<strong>${escapeHtml(after.title)}</strong>" is running low on stock (${stockAfter} remaining).`);
    } else if (parentBecameSoldOut) {
      shouldAlert = true;
      alertLines.push(`Product "<strong>${escapeHtml(after.title)}</strong>" is now sold out!`);
    }

    // Check individual variants
    if (after.variants && Array.isArray(after.variants)) {
      const beforeVariants = before.variants || [];
      after.variants.forEach(vAfter => {
        const vBefore = beforeVariants.find(v => v.id === vAfter.id);
        // A newly added edition was never in stock: adding one with 0-3 copies is not a sale.
        if (!vBefore) return;
        const vStockBefore = stockOf(vBefore, 999);
        const vStockAfter = stockOf(vAfter, 999);

        const vBecameLowStock = (vStockBefore > 3 && vStockAfter <= 3 && vStockAfter > 0);
        const vBecameSoldOut = (vStockBefore > 0 && vStockAfter <= 0);

        if (vBecameLowStock) {
          shouldAlert = true;
          alertLines.push(`Variant "<strong>${escapeHtml(vAfter.name)}</strong>" of product "${escapeHtml(after.title)}" is running low on stock (${vStockAfter} remaining).`);
        } else if (vBecameSoldOut) {
          shouldAlert = true;
          alertLines.push(`Variant "<strong>${escapeHtml(vAfter.name)}</strong>" of product "${escapeHtml(after.title)}" is now sold out!`);
        }
      });
    }

    if (shouldAlert && alertLines.length > 0) {
      const alertHtml = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #f3f4f6;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          <h2 style="margin-top:0;color:#dc2626;font-size:18px;">&#9888; Inventory Alert</h2>
          <p style="font-size:14px;color:#374151;line-height:1.6;">${alertLines.join("<br><br>")}</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
          <p style="font-size:12px;color:#9ca3af;margin-bottom:0;">
            This email was sent automatically because inventory tracking is enabled for this item.
            You can update your catalog settings in the storefront dashboard.
          </p>
        </div>
      `;

      try {
        await sendEmail({
          queue: "inventoryAlert",
          to: ADMIN_TO,
          subject: `[INVENTORY ALERT] ${after.title}`,
          html: alertHtml,
          secret: RESEND_API_KEY.value(),
        });
        console.log(`Inventory alert email sent to admin for book ${after.title}`);
      } catch (err) {
        console.error("Failed to send inventory low stock email alert:", err);
      }
    }
  }
);

// (The second, weaker `refundOrder` definition that previously lived here was
// removed: it shadowed the robust idempotent implementation above — see the
// `exports.refundOrder` near the top of this file. The version above carries a
// Stripe idempotency key, partial-refund recording, restock-once guards, and
// manual-payment handling.)

// ──────────────────────────────────────────────────────────────
// 14. HTTP Endpoint: Mark Manual Order as Paid (Admin Secure)
//     Decrements stock, records analytics, flips status to paid.
//     onOrderUpdated fires the customer order-confirmation email automatically.
// ──────────────────────────────────────────────────────────────
// Marks an order paid when no card or PayPal payment is involved (manual payment confirmed
// by the admin, or a $0 order): stock out once, discount use counted once, revenue recorded.
async function completeOrderWithoutCard(orderId, message, { reserve = true, req = null } = {}) {
  const initial = await db.collection("orders").doc(orderId).get();
  // A free order checks the 30-minute stock hold like any checkout. A manual payment the owner
  // confirms days later is money already received: it is recorded even if the books have
  // since sold (settlePayment flags oversold for the owner).
  if (reserve && initial.exists && initial.data().paymentStatus !== "paid") {
    const pending = initial.data();
    await reserveCheckout(orderId, pending.items || [], pending, pending.giftCardRedemptions, (await shopTestMode()), req);
  }
  // false when nothing was marked paid (a gift card could no longer cover its part).
  const result = await settlePayment(orderId, { provider: "Checkout", message });
  return result.paid || result.reason === "already-paid";
}

exports.markOrderPaid = onBrowserRequest(
  async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== "POST") { res.status(405).send("Method Not Allowed"); return; }

    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;

    const { orderId } = req.body;
    if (!orderId) { res.status(400).json({ error: "Missing orderId" }); return; }

    try {
      const snap = await db.collection("orders").doc(orderId).get();
      const refusal = manualPaidRefusal(snap.exists ? snap.data() : null);
      if (refusal === "missing") { res.status(404).json({ error: "Order not found" }); return; }
      if (refusal === "closed") { res.status(409).json({ error: "This order is cancelled or refunded, so it can't be marked paid." }); return; }
      if (refusal === "provider") { res.status(409).json({ error: "Card and PayPal orders are marked paid only when the payment provider confirms the payment. Use Check payment with Stripe, or check PayPal." }); return; }
      await completeOrderWithoutCard(orderId, `Payment confirmed manually by ${adminUser.email}.`, { reserve: false });
      res.status(200).json({ success: true });
    } catch (err) {
      console.error("markOrderPaid failed:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * Safety net for the Stripe webhook (every 15 minutes): if Stripe says an order's
 * payment succeeded but the order is still unpaid, record reconciliation pending
 * without settling it, and email the shop so the
 * webhook setup gets fixed. Each order is looked up in the Stripe account (test or
 * live) it was created in, then the other one.
 */
const SWEEP_LOOKUP_BATCH = 5;           // Stripe lookups in flight at once
const SWEEP_LOOKUP_MS = 100 * 1000;     // stop starting payment lookups after this
const SWEEP_REVERSAL_MS = 190 * 1000;   // stop starting refund/dispute checks after this (function limit: 300 s)
const SWEEP_REVERSAL_STOP_MS = 220 * 1000; // save the check record by then even if a check still waits on Stripe
const SWEEP_RUN_STOP_MS = 240 * 1000;      // …and never later than this after the sweep itself started
// Follows label refunds asked for from Orders (mode "voidLabel"): Shippo takes up to ~14 business days and
// may reject one (the carrier scanned the label). Each pending row is re-read at most hourly; the result is
// saved on order-operations.labelRefunds and a rejection shows in the admin alerts (labelVoid.js).
async function checkLabelRefunds(now = Date.now()) {
  const token = await getShippoToken();
  if (!token) return { checked: 0 };
  const snap = await db.collection("order-operations").where("labelRefundOpen", "==", true).limit(40).get();
  let checked = 0, settled = 0;
  for (const doc of snap.docs) {
    const due = openRefunds(doc.data().labelRefunds).filter(e => now - (Date.parse(e.checkedAt || "") || 0) >= 60 * 60 * 1000);
    if (!due.length) continue;
    const results = {};
    for (const entry of due) {
      try {
        const found = entry.refundId
          ? await callShippo(`refunds/${encodeURIComponent(entry.refundId)}/`, "GET", null, token)
          : await callShippo(`transactions/${encodeURIComponent(entry.transactionId)}/`, "GET", null, token);
        const status = entry.refundId ? found?.status : (transactionRefundState(found) ? found?.status : "PENDING");
        if (status) results[entry.refundId || entry.transactionId] = status;
        checked++;
      } catch (err) { console.warn(`label refund check ${doc.id}:`, err.message); }
    }
    if (!Object.keys(results).length) continue;
    const at = new Date(now).toISOString();
    await db.runTransaction(async tx => {
      const fresh = (await tx.get(doc.ref)).data() || {};
      const outcome = applyRefundChecks(fresh.labelRefunds, results, at);
      const done = outcome.entries.filter((e, i) => e?.state !== "pending" && fresh.labelRefunds?.[i]?.state === "pending");
      settled += done.length;
      tx.set(doc.ref, { labelRefunds: outcome.entries, labelRefundOpen: outcome.open, updatedAt: at,
        ...(done.length ? { activity: admin.firestore.FieldValue.arrayUnion(...done.map(e => ({ type: "event", createdAt: at,
          message: e.state === "refunded" ? `Shippo refunded label #${e.trackingNumber || ""}.` : `Shippo rejected the refund for label #${e.trackingNumber || ""} (the carrier scanned or used it).` }))) } : {}) }, { merge: true });
    });
  }
  return { checked, settled };
}

exports.unpaidPaymentSweep = onSchedule(
  { schedule: "every 15 minutes", timeoutSeconds: 300, secrets: withPlatformKey([STRIPE_SECRET_KEY, RESEND_API_KEY, SHIPPO_API_TOKEN]) },
  async () => {
    const runStartedAt = Date.now();
    // Studio 3.5: scheduled theme publishes and campaigns ride on this sweep (own try/catch: never blocks payments).
    try { await require("./themeSchedule").runThemeSchedule(db); }
    catch (err) { console.error("unpaidPaymentSweep: theme schedule failed:", err.message); }
    const { suspectOrders, alertHtml } = require("./paymentSweep");
    // Newest unpaid orders first, within the 7-day window the sweep checks. Without an order
    // the 300 returned were an arbitrary slice, so new orders could be skipped for good.
    // Falls back to the old query while the composite index is still building.
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const snap = await db.collection("orders").where("paymentStatus", "==", "unpaid").where("createdAt", ">=", since)
      .orderBy("createdAt", "desc").limit(300).get()
      .catch(err => { console.error("unpaidPaymentSweep: ordered query failed (deploy firestore:indexes), using unordered:", err.message); return db.collection("orders").where("paymentStatus", "==", "unpaid").limit(300).get(); });
    const candidates = suspectOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    const found = [];
    // The Stripe mode and keys are read once for the whole sweep (only when Stripe is asked at all).
    // A failed read falls back to the per-call reads every lookup used to do.
    let keysRead = null;
    const paymentKeys = () => keysRead || (keysRead = payments.readKeys().catch(err => {
      console.warn("unpaidPaymentSweep: could not read the Stripe keys once; reading them for each order:", err.message);
      return null;
    }));
    // Time budget (the function has 300 s): lookups run a few at a time and stop starting new ones after
    // SWEEP_LOOKUP_MS, so the owner alert, reversal checks and email queue below always get their turn.
    const sweepStartedAt = Date.now();
    await runInBatches(candidates, SWEEP_LOOKUP_BATCH, async order => {
      try {
        const usesIntent = isPaymentId(order.stripePaymentIntentId);
        const result = await retrieveOrderPayment(order.id, order, usesIntent
          ? { paymentIntentId: order.stripePaymentIntentId }
          : { sessionId: order.stripeCheckoutSessionId }, await paymentKeys());
        if (result?.session && result.session.payment_status === "paid") {
          const session = result.session;
          await recordStripeReconciliation(order.id, session)
            .catch(err => { console.error(`unpaidPaymentSweep: could not flag order ${order.id}:`, err); return false; });
          found.push({ orderId: order.id, email: order.customer?.email, amount: session.amount_total, currency: session.currency, intentId: session.id, fixed: false });
          return;
        }
        const intent = result?.intent;
        if (intent && intent.status === "succeeded") {
          await recordStripeReconciliation(order.id, intentAsSession(intent))
            .catch(err => { console.error(`unpaidPaymentSweep: could not flag order ${order.id}:`, err); return false; });
          found.push({ orderId: order.id, email: order.customer?.email, amount: intent.amount, currency: intent.currency, intentId: intent.id, fixed: false });
        }
      } catch (err) {
        console.warn(`unpaidPaymentSweep: could not check order ${order.id}:`, err.message);
      }
    }, { deadline: sweepStartedAt + SWEEP_LOOKUP_MS });

    // The owner alert goes out right after the lookups, before the slower reversal checks, email queue and
    // review requests: the safety net for a broken Stripe webhook must not depend on those finishing.
    // Stamp only after the alert really went out: a failed send leaves the orders unstamped so the next
    // sweep (15 minutes later) tries the alert again.
    if (found.length) {
      try {
        await sendEmail({
          to: ADMIN_TO,
          subject: `⚠ Stripe webhook missed ${found.length} paid order${found.length === 1 ? "" : "s"}`,
          html: alertHtml(found),
          secret: RESEND_API_KEY.value(),
        });
        const at = new Date().toISOString();
        await Promise.all(found.map((f) => db.collection("orders").doc(f.orderId).update({ paymentAlertSentAt: at })
          .catch(err => console.error(`unpaidPaymentSweep: could not stamp ${f.orderId}:`, err.message))));
      } catch (err) {
        console.error("unpaidPaymentSweep: alert email failed; will retry on the next sweep:", err.message);
      }
    }

    // Safety net for refunds/disputes made in Stripe whose webhook never arrived: each watched paid order
    // is re-read from Stripe at least every 6 hours. The check times live in one server-only record
    // (systemStatus/stripeReversalChecks, reversalSchedule.js), so a sweep reads only new payments and the
    // orders that are due, and a check no longer writes to the order (which woke the order triggers).
    try {
      const { runReversalChecks, paidOrderScanner } = require("./reversalSchedule");
      const recordRef = db.collection("systemStatus").doc("stripeReversalChecks");
      const result = await runReversalChecks({
        readState: async () => { const doc = await recordRef.get(); return doc.exists ? doc.data() : null; },
        readRecheck: async () => { const doc = await reversalRecheckRef().get(); return doc.exists ? doc.data().at || null : null; },
        writeState: record => recordRef.set({ ...record, updatedAt: new Date().toISOString() }),
        queryPaid: paidOrderScanner(db),
        getOrders: async ids => (ids.length ? await db.getAll(...ids.map(id => db.collection("orders").doc(id))) : [])
          .map(doc => (doc.exists ? { id: doc.id, ...doc.data() } : null)),
        check: async (order, onChecked) => checkStripeReversal(order.id, order, "automatic check", { keys: await paymentKeys(), onChecked })
          .catch(err => console.warn(`reversal check ${order.id}:`, err.message)),
        stampOrders: ids => Promise.all(ids.map(id => db.collection("orders").doc(id).update({ stripeCheckedAt: new Date().toISOString() }))),
        warn: message => console.warn(`unpaidPaymentSweep: ${message}`),
      }, { deadline: sweepStartedAt + SWEEP_REVERSAL_MS, stopBy: Math.min(sweepStartedAt + SWEEP_REVERSAL_STOP_MS, runStartedAt + SWEEP_RUN_STOP_MS), batch: SWEEP_LOOKUP_BATCH });
      if (result.checked || result.reconcile) console.log("unpaidPaymentSweep: reversal checks", result);
    } catch (err) {
      console.warn("unpaidPaymentSweep: reversal checks failed:", err.message);
    }

    // Shippo label refunds asked for from Orders (own try/catch: never blocks payments).
    try {
      const labels = await checkLabelRefunds();
      if (labels.settled) console.log("unpaidPaymentSweep: label refunds", labels);
    } catch (err) { console.warn("unpaidPaymentSweep: label refund checks failed:", err.message); }

    // Emails that every sender refused are retried here on a widening schedule, after the payment
    // checks and within a time budget so a backlog can't starve them (own try/catch).
    try {
      const outbox = await runEmailOutbox();
      if (outbox.tried || outbox.prunedLog || outbox.prunedOutbox) console.log("unpaidPaymentSweep: email queue", outbox);
    } catch (err) { console.error("unpaidPaymentSweep: email retry queue failed:", err.message); }

    // "How was your book?" emails N days after shipping, when switched on (own try/catch).
    try {
      const notificationSettings = await loadNotificationSettings();
      if (notificationSettings.review_request?.enabled === true) {
        const unsubscribeKey = await marketingUnsubscribeKey();
        const result = await runReviewRequests({
          db, notificationSettings, compileEmailTemplate, siteLink, escapeHtml, optOutId,
          unsubscribeUrl: email => siteLink(`/track?unsubscribe=1&e=${encodeURIComponent(normMarketingEmail(email))}&t=${unsubscribeToken(email, unsubscribeKey)}`),
          sendEmail: message => sendEmail({ ...message, secret: RESEND_API_KEY.value() }),
        });
        if (result.sent) console.log("unpaidPaymentSweep: review requests", result);
      }
    } catch (err) { console.error("unpaidPaymentSweep: review requests failed:", err.message); }
  }
);

/**
 * Nightly backup into the project's default Storage bucket, folder backups/YYYY-MM-DD/, done two ways:
 *  1. the managed Firestore export (restorable with `gcloud firestore import`). It needs the Functions
 *     service account to hold "Cloud Datastore Import Export Admin"; without it Google answers PERMISSION_DENIED.
 *  2. the Functions' own copy of every document (backupJson.js, backups/<day>/json/), which needs no extra
 *     role, so a refused export still leaves a complete, restorable backup (scripts/restore-json-backup.mjs).
 * The run succeeds when either works. The previous export's long-running operation is checked at the start
 * of each run, so an export that was accepted but failed later is reported too. Settings › General ›
 * Backups & export reads the result (systemStatus/backup) and has Back up now (action "backupNow").
 */
const BACKUP_KEEP_DAYS = 30;
const BACKUP_LOCK_MS = 10 * 60 * 1000;
const BACKUP_MANUAL_GAP_MS = 5 * 60 * 1000;

async function runFirestoreBackup({ trigger, budgetMs }) {
  const startedAt = Date.now();
  const deadline = startedAt + budgetMs;
  const projectId = process.env.GCLOUD_PROJECT || admin.app().options.projectId;
  const day = new Date(startedAt).toISOString().slice(0, 10);
  const bucketName = admin.app().options.storageBucket || `${projectId}.firebasestorage.app`;
  const statusRef = db.collection("systemStatus").doc("backup");
  const at = new Date(startedAt).toISOString();

  // One backup at a time: a run holds `runningSince` for up to BACKUP_LOCK_MS.
  const claim = await db.runTransaction(async tx => {
    const snap = await tx.get(statusRef);
    const prev = snap.exists ? snap.data() : null;
    const running = prev?.runningSince && startedAt - Date.parse(prev.runningSince) < BACKUP_LOCK_MS;
    if (running) return { busy: true, previous: prev };
    if (trigger === "manual" && prev?.lastAttemptAt && startedAt - Date.parse(prev.lastAttemptAt) < BACKUP_MANUAL_GAP_MS) return { tooSoon: true, previous: prev };
    tx.set(statusRef, { runningSince: at, runningTrigger: trigger }, { merge: true });
    return { previous: prev };
  });
  if (claim.busy || claim.tooSoon) return claim;
  const previous = claim.previous;

  const { serviceAccountEmail } = require("./inventoryLinkStore");
  const { runJsonBackup, exportRefusedForPermission } = require("./backupJson");
  const { backupOutcome } = require("./shopSettings");
  const extra = { trigger, serviceAccount: await serviceAccountEmail().catch(() => ""), bucket: bucketName };
  try {
    const client = new admin.firestore.v1.FirestoreAdminClient();

    // Did the previous export actually finish? (It runs after the function returns.)
    if (previous?.export?.operation) {
      try {
        const op = await client.checkExportDocumentsProgress(previous.export.operation);
        extra.previousExport = { operation: previous.export.operation, done: !!op.done, error: op.error ? String(op.error.message || op.error).slice(0, 300) : "" };
      } catch (err) {
        extra.previousExport = { operation: previous.export.operation, done: false, error: `Couldn't check: ${String(err.message || err).slice(0, 200)}` };
      }
    }

    let exportResult;
    try {
      const [operation] = await client.exportDocuments({
        name: client.databasePath(projectId, "(default)"),
        outputUriPrefix: `gs://${bucketName}/backups/${day}/export`,
        collectionIds: [],
      });
      console.log(`Firestore export started: ${operation.name}`);
      exportResult = { ok: true, operation: String(operation.name || "").slice(0, 300), error: "", permission: false };
    } catch (err) {
      const permission = exportRefusedForPermission(err);
      console.warn(`Firestore export refused (${permission ? "missing IAM role" : "error"}):`, err.message);
      exportResult = { ok: false, operation: "", error: String(err.message || err).slice(0, 300), permission };
    }
    extra.export = exportResult;

    let copyResult;
    try {
      const manifest = await runJsonBackup({
        db, bucket: admin.storage().bucket(bucketName), folder: `backups/${day}/json`,
        idField: admin.firestore.FieldPath.documentId(), deadline, at,
      });
      const failed = manifest.collections.filter(c => !c.complete);
      copyResult = {
        ok: manifest.complete, folder: manifest.folder, documents: manifest.documents, bytes: manifest.bytes,
        collections: manifest.collections.length, failed: failed.map(c => c.id).slice(0, 20),
        error: failed.length ? `${failed.length} collection(s) not copied: ${failed.slice(0, 3).map(c => `${c.id} (${c.error})`).join(", ")}` : "",
      };
    } catch (err) {
      console.error("Document copy backup failed:", err);
      copyResult = { ok: false, error: String(err.message || err).slice(0, 300) };
    }
    extra.copy = copyResult;

    const outcome = backupOutcome({ exportResult, copyResult });
    await statusRef.set(backupStatusRecord({ ok: outcome.ok, day, at, operation: exportResult.operation, error: outcome.error, previous, extra }))
      .catch(err => console.error("Could not record backup status:", err.message));

    // Keep 30 days: older day folders are deleted so storage cost cannot grow without limit. Only after a good
    // run, and a prune failure never fails the backup; it is recorded for Settings › General › Backups & export.
    if (outcome.ok) {
      try {
        const bucket = admin.storage().bucket(bucketName);
        const [, , api] = await bucket.getFiles({ prefix: "backups/", delimiter: "/", autoPaginate: false });
        const stale = backupFoldersToPrune(api?.prefixes || [], new Date(), BACKUP_KEEP_DAYS);
        for (const prefix of stale) await bucket.deleteFiles({ prefix, force: true });
        await statusRef.set({ prunedAt: new Date().toISOString(), prunedFolders: stale.length, pruneError: "" }, { merge: true });
      } catch (pruneErr) {
        console.error("Backup pruning failed:", pruneErr.message);
        await statusRef.set({ pruneError: String(pruneErr.message || pruneErr).slice(0, 300), prunedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
      }
    }
    return { ok: outcome.ok, error: outcome.error, export: exportResult, copy: copyResult };
  } catch (err) {
    await statusRef.set(backupStatusRecord({ ok: false, day, at, error: err.message, previous, extra })).catch(e => console.error("Could not record backup status:", e.message));
    throw err;
  }
}

exports.nightlyFirestoreBackup = onSchedule(
  { schedule: "every day 03:17", timeZone: "America/Toronto", timeoutSeconds: 540, memory: "512MiB" },
  async () => {
    const result = await runFirestoreBackup({ trigger: "nightly", budgetMs: 480 * 1000 });
    if (result.busy) { console.warn("nightlyFirestoreBackup: another backup is running; skipped."); return; }
    if (!result.ok) throw new Error(`Backup failed: ${result.error}`);
  }
);

// Order detail › Put the books back in stock: a refund that left its books out (Restock items unticked).
async function handleRestockRefunded(req, res) {
  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;
  const body = readBody(req, res, orderActionBody);
  if (!body) return;
  const { orderId } = body;
  try {
    const result = await restockRefundedOrder(db, orderId, { actor: adminUser.email || adminUser.uid, testShop: shopConfig.testShop });
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error("restockRefunded failed:", err);
    res.status(500).json({ error: "The books couldn't be put back just now. Try again in a minute." });
  }
}

/** Settings › General › Backups & export › Back up now (admin). Fits inside this endpoint's 60 s limit. */
async function handleBackupNow(req, res) {
  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;
  try {
    const result = await runFirestoreBackup({ trigger: "manual", budgetMs: 45 * 1000 });
    if (result.busy) return res.status(409).json({ error: "A backup is already running. Check back in a few minutes." });
    if (result.tooSoon) return res.status(429).json({ error: "A backup ran in the last 5 minutes. Try again shortly." });
    res.status(200).json({ ok: result.ok, error: result.error, copy: result.copy, export: result.export });
  } catch (err) {
    console.error("backupNow failed:", err);
    res.status(500).json({ error: "The backup didn't finish. Try again in a minute." });
  }
}
