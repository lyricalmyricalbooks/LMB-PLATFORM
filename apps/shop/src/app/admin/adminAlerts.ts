import { physicalItems } from "./fulfillment";
import { labelRefundProblems } from "./labelRefunds";
import { currentRows } from "./emailLogDisplay";
import { describeBackup, type BackupRecord } from "./backupStatus";
import { waitingPreorderLines, preorderClockStart } from "../features/site/preorder";
import { appOnlyBooks, detailDiffs, openMatches } from "./inventoryLink";
// Admin-wide alerts shown above every admin page (AdminAlerts.tsx). Pure, tested.
// Payment problems come first: money that arrived but isn't recorded, or vice versa.

export type AlertTone = "danger" | "warning" | "info";
export type AdminAlert = {
  id: string;
  tone: AlertTone;
  title: string;
  detail: string;
  orderIds: string[];
  /** What the alert is about when no order is (held books…): a change brings a hidden alert back. */
  key?: string;
  action: "order" | "orders" | "webhook" | "notifications" | "payments" | "general" | "retry" | "inventory" | "inventoryApp";
  /** action "inventoryApp": where in the inventory app the button opens (a `#…` the app handles). */
  appHash?: string;
};

/** Where an alert's button opens: an admin page and, on pages split into sub tabs, the tab holding the fix. */
export type AlertRoute = { tab: string; settingsTab?: string; subTab?: string };
const ALERT_ROUTES: Partial<Record<AdminAlert["action"], AlertRoute>> = {
  inventory: { tab: "inventory", subTab: "inv-link" },                                          // every inventory alert is about the app link
  notifications: { tab: "settings", settingsTab: "notifications", subTab: "email-deliveries" }, // Waiting to send + Recent deliveries
  webhook: { tab: "settings", settingsTab: "payments", subTab: "pay-methods" },                 // Stripe › Webhook health
  payments: { tab: "settings", settingsTab: "payments" },                                       // the test mode switch: Ready to take payments?
  general: { tab: "settings", settingsTab: "general", subTab: "gs-tools" },                     // Backups & export
};
/** The page (and sub tab) an alert's button opens; null for order, orders and retry, which aren't settings pages. */
export function alertRoute(a: Pick<AdminAlert, "action">): AlertRoute | null {
  return ALERT_ROUTES[a.action] || null;
}

export type WebhookStatus = { lastReceivedAt?: string | null; lastFailureAt?: string | null; lastFailure?: string | null } | null;

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const STRIPE_GRACE_MS = 10 * MIN;   // the webhook normally lands within seconds
const SHIP_LATE_MS = 3 * DAY;
const MANUAL_LATE_MS = 2 * DAY;

const age = (o: any, now: number) => now - Date.parse(o?.createdAt || "");
const paidAge = (o: any, now: number) => now - Date.parse(o?.paidAt || o?.createdAt || "");
// A pre-order can't ship before its release, so its shipping clock starts when the printed
// pre-orders were released (by date or "Ready to ship now"); digital pre-orders don't count.
const shipAge = (o: any, now: number) => Math.min(paidAge(o, now), now - preorderClockStart(o, o?.operations || {}));
const label = (o: any) => o?.orderId || o?.id;
const list = (orders: any[]) => {
  const names = orders.slice(0, 3).map(label).join(", ");
  return orders.length > 3 ? `${names} and ${orders.length - 3} more` : names;
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const hasStripePayment = (o: any) =>
  String(o?.stripePaymentIntentId || "").startsWith("pi_") || String(o?.stripeCheckoutSessionId || "").startsWith("cs_");
const isFinished = (o: any) => ["cancelled", "completed"].includes(o?.status)
  || ["shipped", "out_for_delivery", "delivered", "cancelled", "refunded", "picked_up"].includes(o?.fulfillmentStatus);

function alert(id: string, tone: AlertTone, title: string, detail: string, orders: any[], action?: AdminAlert["action"]): AdminAlert {
  return { id, tone, title, detail, orderIds: orders.map((o) => o.id), action: action || (orders.length === 1 ? "order" : "orders") };
}

export function buildAdminAlerts(allOrders: any[], webhook: WebhookStatus = null, now = Date.now(), emailLog: any[] = []): AdminAlert[] {
  const orders = (allOrders || []).filter((o) => o && o.isTest !== true);
  const out: AdminAlert[] = [];

  const mismatch = orders.filter((o) => o.paymentMismatch && !o.paymentMismatch.resolvedAt && o.paymentStatus !== "paid" && o.paymentStatus !== "refunded");
  if (mismatch.length) out.push(alert("mismatch", "danger", `${plural(mismatch.length, "payment doesn't", "payments don't")} match the order total`,
    `Stripe or PayPal took a different amount than the order expected: ${list(mismatch)}. Review and refund in Stripe before shipping.`, mismatch));

  const reconciliation = orders.filter(o => o.reconciliationPending && o.paymentStatus !== "paid" && o.paymentStatus !== "refunded");
  if (reconciliation.length) out.push(alert("payment-reconciliation", "danger", `${plural(reconciliation.length, "payment awaits", "payments await")} webhook reconciliation`, `Provider evidence needs reconciliation with a signed webhook: ${list(reconciliation)}. Review Payments webhook health before fulfillment.`, reconciliation));

  const requests = orders.filter((o) => o.customerRequest?.status === "open");
  if (requests.length) out.push(alert("customer-request", "warning", `${plural(requests.length, "customer is", "customers are")} waiting on a cancel or return request`,
    `Answer before packing: ${list(requests)}. Open the order to cancel, refund or mark the request handled.`, requests));

  const paidTwice = orders.filter((o) => Array.isArray(o.duplicatePayments) && o.duplicatePayments.length && o.paymentStatus === "paid" && !isFinished(o));
  if (paidTwice.length) out.push(alert("paid-twice", "danger", `${plural(paidTwice.length, "order was", "orders were")} paid twice`,
    `Stripe took a second payment for an order that was already paid: ${list(paidTwice)}. Refund the extra payment in the Stripe Dashboard.`, paidTwice));

  const overLimit = orders.filter((o) => o.discountOverLimit && o.paymentStatus === "paid" && !isFinished(o));
  if (overLimit.length) out.push(alert("discount-over-limit", "warning", `${plural(overLimit.length, "order used", "orders used")} a discount code past its limit`,
    `Two shoppers used the last copy of a limited code at the same moment: ${list(overLimit)}. Decide whether to honour it before shipping.`, overLimit));

  const stuck = orders.filter((o) => o.paymentStatus === "unpaid" && hasStripePayment(o) && age(o, now) >= STRIPE_GRACE_MS && age(o, now) <= 7 * DAY && !o.paymentMismatch);
  if (stuck.length) out.push(alert("unpaid-stripe", "danger", `${plural(stuck.length, "order is", "orders are")} unpaid after starting a card payment`,
    `The customer may have paid but Stripe hasn't confirmed it to the shop: ${list(stuck)}. Open the order to review provider payment and pending webhook reconciliation. Only a verified payment webhook can mark it paid.`, stuck));

  const disputes = orders.filter((o) => o.disputeStatus && ["needs_response", "warning_needs_response"].includes(o.disputeStatus));
  if (disputes.length) out.push(alert("dispute", "danger", `${plural(disputes.length, "payment dispute needs", "payment disputes need")} a response`,
    `Answer in the Stripe Dashboard before the deadline: ${list(disputes)}.`, disputes));

  const refundFailedOrders = orders.filter((o) => o.paymentStatus === "paid" && o.refund?.status === "failed");
  if (refundFailedOrders.length) out.push(alert("refund-failed", "danger", `${plural(refundFailedOrders.length, "refund was", "refunds were")} rejected by the bank`,
    `The customer was told they were refunded but the money did not go back: ${list(refundFailedOrders)}. Refund again or contact the customer before packing.`, refundFailedOrders));

  if (webhook?.lastFailureAt && (!webhook.lastReceivedAt || webhook.lastFailureAt > webhook.lastReceivedAt) && now - Date.parse(webhook.lastFailureAt) <= 7 * DAY) {
    out.push(alert("webhook", "danger", "Stripe's payment messages are being rejected",
      "The last Stripe webhook failed its security check, so paid orders may stay unpaid. Settings › Payments › Webhook health › Reset webhook signing.", [], "webhook"));
  }

  const partial = orders.filter((o) => o.partiallyRefunded && o.paymentStatus === "paid" && !isFinished(o));
  if (partial.length) out.push(alert("partial-refund", "warning", `${plural(partial.length, "order was", "orders were")} partly refunded in Stripe`,
    `Check what still needs to ship before packing: ${list(partial)}.`, partial));

  const inventoryConflict = orders.filter((o) => o.inventoryConflict && !isFinished(o));
  if (inventoryConflict.length) out.push(alert("inventory-conflict", "danger", `${plural(inventoryConflict.length, "captured payment needs", "captured payments need")} inventory reconciliation`,
    `Payment was captured after its stock hold expired: ${list(inventoryConflict)}. Review the provider payment and contact the customer.`, inventoryConflict));

  // A card/PayPal payment arrived but a gift card could no longer cover its share, so the order was
  // NOT marked paid. Refund the payment or settle the difference with the customer.
  const giftCardConflict = orders.filter((o) => o.giftCardConflict && !o.giftCardConflict.resolvedAt && o.paymentStatus !== "paid" && !isFinished(o));
  if (giftCardConflict.length) out.push(alert("gift-card-conflict", "danger", `${plural(giftCardConflict.length, "payment needs", "payments need")} gift card reconciliation`,
    `A payment arrived but the gift card could no longer cover its part, so the order wasn't marked paid: ${list(giftCardConflict)}. Check the gift card in Gift cards, then refund the payment or contact the customer.`, giftCardConflict));

  // Paid gift-card purchases whose cards were never created (the issuing step failed): the buyer has no code.
  const paidAt = (o: any) => Date.parse(o.paidAt || o.updatedAt || o.createdAt || "") || now;
  const giftCardsMissing = orders.filter((o) => o.paymentStatus === "paid" && !o.isTest && !o.giftCardsIssuedAt
    && (o.items || []).some((item: any) => item && item.giftCard === true) && now - paidAt(o) >= 10 * 60 * 1000);
  if (giftCardsMissing.length) out.push(alert("gift-cards-not-issued", "danger", `${plural(giftCardsMissing.length, "paid gift card order has", "paid gift card orders have")} no gift card yet`,
    `The buyer paid but no gift card code was created: ${list(giftCardsMissing)}. Issue the card from Gift cards › Issue gift card and email it, then note it on the order.`, giftCardsMissing));

  const oversold = orders.filter((o) => o.oversold && o.paymentStatus === "paid" && !isFinished(o));
  if (oversold.length) out.push(alert("oversold", "warning", `${plural(oversold.length, "paid order was", "paid orders were")} oversold`,
    `More copies were sold than were in stock: ${list(oversold)}. Restock or contact the customer.`, oversold));

  const late = orders.filter((o) => o.paymentStatus === "paid" && !isFinished(o) && !o.isTest && (!o.items?.length || physicalItems(o).length > 0) && !waitingPreorderLines(o, o.operations || {}, new Date(now)).length && shipAge(o, now) >= SHIP_LATE_MS);
  if (late.length) out.push(alert("ship-late", "warning", `${plural(late.length, "paid order has", "paid orders have")} waited over 3 days to ship`,
    `Oldest first: ${list(late.sort((a, b) => shipAge(b, now) - shipAge(a, now)))}.`, late));

  const manual = orders.filter((o) => o.paymentStatus === "pending" && age(o, now) >= MANUAL_LATE_MS && o.status !== "cancelled");
  if (manual.length) out.push(alert("manual-pending", "info", `${plural(manual.length, "order is", "orders are")} still waiting for a manual payment`,
    `e-Transfer / cash orders with no payment after 2 days: ${list(manual)}. Confirm the payment or cancel the order.`, manual));

  const uncertain = orders.filter(o => o.operations?.labelPurchasePending === true);
  if (uncertain.length) out.push(alert("label-purchase-uncertain", "danger", `${plural(uncertain.length, "label purchase needs", "label purchases need")} reconciliation`, `Check the existing transaction in Shippo before retrying: ${list(uncertain)}. An uncertain purchase may already have charged for a label.`, uncertain));
  // Shippo label refunds asked for from Order detail (followed by the server every 15 minutes).
  const labelRefund = labelRefundProblems(orders, now);
  if (labelRefund.rejected.length) out.push(alert("label-refund-rejected", "warning", `Shippo rejected ${plural(labelRefund.rejected.length, "label refund", "label refunds")}`,
    `The carrier scanned or used the label, so Shippo won't refund it: ${list(labelRefund.rejected)}. Contact Shippo support if the parcel never went out.`, labelRefund.rejected));
  if (labelRefund.stale.length) out.push(alert("label-refund-stale", "info", `${plural(labelRefund.stale.length, "label refund is", "label refunds are")} still pending after 30 days`,
    `Check them in Shippo: ${list(labelRefund.stale)}.`, labelRefund.stale));
  // A queued email's newest row is its outcome: one later sent (or stopped) by the retry queue no longer alarms.
  const current = currentRows(emailLog);
  const queuedEmails = current.filter(e => e.status === "queued");
  if (queuedEmails.length) out.push({ id: "email-queued", tone: "warning", title: `${plural(queuedEmails.length, "email is", "emails are")} waiting to be sent again`, detail: "Every sender refused them, so the shop is retrying automatically. Fix the sending setup in Notifications, then use Retry now.", orderIds: queuedEmails.map(e => String(e.outboxId)), action: "notifications" });
  const failedEmails = current.filter(e => ["failed", "bounced", "complained"].includes(e.status) && now - Date.parse(e.at || "") <= 7 * DAY);
  if (failedEmails.length) out.push({ id: "email-failed", tone: "warning", title: `${plural(failedEmails.length, "recent email needs", "recent emails need")} attention`, detail: "Review Notifications delivery attempts and provider events. Resolve the cause before resending; sent status only proves provider acceptance.", orderIds: failedEmails.map(e => String(e.id || e.at)), action: "notifications" });
  return out;
}

// The nightly backup failed or is overdue (systemStatus/backup, written by nightlyFirestoreBackup).
// "Not recorded yet" is not an alarm: the first run after deploying records it.
export function backupAlert(record: BackupRecord | undefined, now = Date.now()): AdminAlert | null {
  if (!record) return null;
  const view = describeBackup(record, now);
  if (view.tone !== "danger" && view.tone !== "warning") return null;
  return { id: "backup", tone: view.tone === "danger" ? "danger" : "warning", title: view.label, detail: view.detail, orderIds: [], action: "general" };
}

// A refresh that could not read part of what the alerts need must say so: an empty list would
// otherwise look like "nothing is wrong".
export function checkFailedAlert(failedParts: string[]): AdminAlert | null {
  if (!failedParts.length) return null;
  return { id: "alerts-check-failed", tone: "warning", title: "Couldn't finish checking for problems",
    detail: `The alerts could not read ${failedParts.join(" and ")}, so a payment, dispute or backup problem may not be shown. Check your connection and try again.`, orderIds: [], action: "retry" };
}

// Alerts from the saved store settings (not orders): test mode left on refuses real cards.
export function settingsAlerts(settings: any): AdminAlert[] {
  if (settings?.payments?.testMode !== true) return [];
  return [{ id: "test-mode", tone: "warning", title: "Test mode is on — real cards are refused",
    detail: "Checkout only accepts Stripe/PayPal test payments and orders are marked as tests. Switch it off in Settings › Payments before selling.", orderIds: [], action: "payments" }];
}

// The inventory app link (systemStatus/inventoryLink, written by functions inventoryLinkSweep): only
// once the owner switched sales on. Plain words; the Inventory page's link panel has the detail.
export function inventoryLinkAlerts(state: any, now = Date.now()): AdminAlert[] {
  if (!state || typeof state.startDay !== "string" || !state.startDay) return [];
  const out: AdminAlert[] = [];
  const link = (id: string, tone: AlertTone, title: string, detail: string): AdminAlert => ({ id, tone, title, detail, orderIds: [], action: "inventory" });
  if (state.connection && state.connection.ok === false) {
    out.push(link("inventory-link-down", "danger", "The inventory app link isn't working",
      "Website sales and stock aren't being shared with the inventory app. Open Inventory › Inventory app link and press Check connection."));
  }
  const lastRun = Date.parse(state.lastRunAt || "");
  if (Number.isFinite(lastRun) && now - lastRun > 60 * MIN) {
    out.push(link("inventory-link-stalled", "warning", "The inventory app link hasn't checked in for over an hour",
      "Its regular check runs every 5 minutes. If this stays, the website's scheduled jobs may not be running."));
  }
  const pending = state.pendingImport;
  // Aged by when each order started waiting (a dispatch or refund also waits), not when it was paid.
  const oldest = Date.parse(pending?.oldestSince || pending?.oldestPaidAt || "");
  if (pending?.count > 0 && Number.isFinite(oldest) && now - oldest > DAY) {
    out.push(link("inventory-link-waiting", "warning", `${plural(pending.count, "website order has", "website orders have")} waited over a day for the inventory app`,
      "New sales, refunds or shipping updates. Open the inventory app so it adds them to its books (website stock already counts them)."));
  }
  // Books added to both shops after the matching step (found by the sweep's hourly match check).
  const open = openMatches(state.newMatches?.items, state.links, state.ignoredMatches || {});
  if (open.length) {
    const names = open.slice(0, 3).map((m: any) => (m.edition ? `${m.title} (${m.edition})` : m.title)).join(", ");
    out.push(link("inventory-link-new-books", "info", `${plural(open.length, "book", "books")} can be matched to the inventory app`,
      `${names}${open.length > 3 ? " and more" : ""}. Until they're matched, their website sales don't reach the inventory app. Open Inventory › Inventory app link to match them in one click.`));
  }
  if (Number(state.lastPush?.failed) > 0) {
    out.push(link("inventory-link-push", "warning", `${plural(Number(state.lastPush.failed), "website sale", "website sales")} couldn't be sent to the inventory app yet`,
      "The website keeps trying every 5 minutes. If this stays, check the connection on the Inventory page."));
  }
  // A website refund the app hasn't added yet looks the same for a while: only alert once nothing waits.
  const ahead = Array.isArray(state.lastSync?.appAhead) ? state.lastSync.appAhead : [];
  if (ahead.length && Number(pending?.count || 0) === 0) {
    out.push(link("inventory-link-ahead", "warning", `The inventory app counts extra website sales for ${plural(ahead.length, "book", "books")}`,
      `It has more website rows than the website sent (${ahead.slice(0, 3).map((a: any) => a.title).join(", ")}). Check those books' website sales in the inventory app.`));
  }
  const holds = Array.isArray(state.lastSync?.holds) ? state.lastSync.holds.filter((h: any) => ["big-change", "not-derived", "now-has-editions"].includes(h.hold)) : [];
  if (state.autoSync && holds.length) {
    const names = holds.slice(0, 3).map((h: any) => (h.edition ? `${h.title} (${h.edition})` : h.title)).filter(Boolean).join(", ");
    out.push({
      ...link("inventory-link-holds", "info", `Stock for ${plural(holds.length, "book waits", "books wait")} for you`,
        `${names ? `${names}${holds.length > 3 ? " and more" : ""}. ` : ""}A big change, a book with no print run in the inventory app, or a matched book now sold in editions isn't applied automatically. Open the stock preview and press Apply, or leave it as it is.`),
      key: holds.map((h: any) => `${h.bookId}/${h.variantId || "_"}/${h.hold}/${h.to ?? ""}`).sort().join(","),
    });
  }
  // The to-do and new-book exchange with the app failing (its answers would otherwise never arrive).
  const exchangeError = state.linkRequestError || state.shopCatalogError || state.websiteSideError;
  if (exchangeError) {
    out.push(link("inventory-link-exchange", "warning", "The website couldn't share its to-do list or new books with the inventory app",
      "Books added in one app may not be offered to the other yet. The website tries again every 5 minutes; if this stays, press Check connection on the Inventory page."));
  }
  // Books only the inventory app has: offered under Inventory app link › Add to the shop.
  const onlyInApp = appOnlyBooks(state);
  if (onlyInApp.length) {
    const names = onlyInApp.slice(0, 3).map((b) => b.title).join(", ");
    out.push({
      ...link("inventory-link-app-books", "info", `${plural(onlyInApp.length, "book in the inventory app isn't", "books in the inventory app aren't")} in the shop yet`,
        `${names}${onlyInApp.length > 3 ? " and more" : ""}. Add one as a draft website book in one click, or say it's not for the shop.`),
      key: onlyInApp.map((b) => b.id).sort().join(","),
    });
  }
  const differing = detailDiffs(state);
  if (differing.length) {
    const names = [...new Set(differing.map((d) => d.title))];
    out.push({
      ...link("inventory-link-details", "info", `${plural(names.length, "book's details differ", "books' details differ")} from the inventory app`,
        `${names.slice(0, 3).join(", ")}${names.length > 3 ? " and more" : ""}: title, author, ISBN or price. Choose which to keep.`),
      key: differing.map((d) => `${d.id}:${d.shop}:${d.app}`).sort().join(","),
    });
  }
  // The inventory app's own to-do (websiteLink/app.todo): what waits for you there. Gone after a week without the
  // app open, since it can't have been checked since.
  const appTodo = state.app?.todo;
  const todoAt = Date.parse(appTodo?.at || "");
  if (Array.isArray(appTodo?.items) && Number.isFinite(todoAt) && now - todoAt < 7 * DAY) {
    for (const item of appTodo.items.slice(0, 10)) {
      if (!item?.id || !item?.title) continue;
      out.push({ id: `inventory-app-${item.id}`, tone: "info", title: String(item.title).slice(0, 200),
        detail: "Waiting in the inventory app. It updates there each time the app is open.", orderIds: [], action: "inventoryApp",
        appHash: /^#[A-Za-z0-9_=-]{1,100}$/.test(String(item.hash || "")) ? item.hash : "#todo", key: String(item.count ?? "") });
    }
  }
  for (const issue of Array.isArray(state.shipmentIssues) ? state.shipmentIssues : []) {
    if (!issue?.orderId) continue;
    out.push({ id: `inventory-label-${issue.orderId}`, tone: "warning", title: `A label bought in the inventory app wasn't used for order ${issue.orderId}`,
      detail: `${issue.reason || "The website refused it."} Sort it out on the order, then mark the parcel shipped again in the inventory app.`, orderIds: [issue.orderId], action: "order" });
  }
  return out;
}

// Changes whenever the set of problems changes, so a dismissed alert comes back
// when a new order (or, for alerts about books, a new change) joins it.
export function alertSignature(a: AdminAlert): string {
  return `${a.id}:${[...a.orderIds].sort().join(",")}${a.key ? `:${a.key}` : ""}`;
}
