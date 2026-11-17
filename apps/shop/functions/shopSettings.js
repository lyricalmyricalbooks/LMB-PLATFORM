// Pure readers for shop-wide settings (Settings › General / Notifications) used by several
// functions. Tested in shopSettings.test.js.

const { shopConfig } = require("./shopConfig");
const { pressName } = require("./shared/shopIdentity");

// No made-up origin: a label or a live rate is only ever from the press's own address (General › Location). This was
// once another shop's real street and phone, which a new shop would have shipped under; the launch checklist now
// blocks until the press saves its own address.
const ORIGIN_FALLBACK = { street: "", city: "", state: "", zip: "", country: "", phone: "" };

const text = value => (typeof value === "string" ? value.trim() : "");

/**
 * The shop's shipping origin from settings/website.location (Settings › General › Location).
 * A blank field stays blank: Shippo then refuses the label or rate, rather than using an address that isn't the press's.
 * State and country are returned as entered; the caller turns them into codes.
 */
function shopOrigin(settings) {
  const location = (settings && settings.location) || {};
  const pick = key => text(location[key]) || ORIGIN_FALLBACK[key];
  // Shippo wants digits (and an optional +); "(647) 409-6863" becomes "6474096863".
  const phone = text(location.phone).replace(/[^\d+]/g, "") || ORIGIN_FALLBACK.phone;
  return {
    // The label's sender and the customs form's signer: the press's own name (plan 5.8).
    name: pressName(settings, shopConfig.senderName),
    street1: pick("street"),
    city: pick("city"),
    state: pick("state"),
    zip: text(location.zip).replace(/\s+/g, "").toUpperCase() || ORIGIN_FALLBACK.zip,
    country: pick("country"),
    phone,
    email: shopConfig.ownerEmail,
  };
}

/** Settings › General › Store status › Maintenance: no new checkouts while it is on. */
function checkoutClosed(settings) {
  return settings?.maintenance?.enabled === true;
}

/**
 * The shop's plan on the platform is paused or closed (code plan 6.7): the public platform/status document the platform
 * writes ({ access: "open" | "paused" | "closed" }; services/billing/shopPlan.js in the platform repo). No new orders
 * then, whatever the owner's own settings say, and no practice order either. A shop with no such document isn't on a
 * plan and is never paused by it; any access but "open" counts as paused.
 */
function planPaused(status) {
  if (!status || typeof status !== "object" || status.access === undefined) return false;
  return status.access !== "open";
}

/**
 * Settings › General › Store status is not Open: checkout is paused for maintenance, or the under construction wall
 * hides the shop. The shop is private then; practice orders (practiceCheckout.js) work only in this state.
 */
function shopPrivate(settings) {
  return checkoutClosed(settings) || settings?.design?.showUnderConstruction === true;
}

/** Settings › Notifications › Shop alerts › Daily "orders needing you" email (on unless switched off). */
function dailyDigestEnabled(notificationSettings) {
  return notificationSettings?.shopAlerts?.dailyOrderDigest !== false;
}

/**
 * Did a backup run succeed? Either the managed Firestore export started, or the Functions' own copy of
 * every document finished (backupJson.js). `error` explains a failure in one sentence.
 */
function backupOutcome({ exportResult, copyResult }) {
  const exportOk = exportResult?.ok === true;
  const copyOk = copyResult?.ok === true;
  if (exportOk || copyOk) return { ok: true, error: "" };
  const parts = [];
  if (exportResult?.error) parts.push(`Firestore export: ${exportResult.error}`);
  if (copyResult?.error) parts.push(`Document copy: ${copyResult.error}`);
  return { ok: false, error: parts.join(" · ") || "Unknown error" };
}

/**
 * In the shared system a shop's own copy of its folder runs once a week (Julian, 17 November 2026: running cost cut 2).
 * The platform's export of the whole shared database is the nightly safety net for every shop (LMB-PLATFORM
 * services/health/nightly.js). The nightly run makes the copy only once the last good one is about a week old, so a
 * failed copy is tried again the next night. A shop in its own project still copies every night. Back up now always runs.
 */
const SHARED_COPY_EVERY_MS = 6.5 * 24 * 60 * 60 * 1000;
function ownCopyDue({ trigger, shared, previous, now }) {
  if (trigger !== "nightly" || !shared) return true;
  const last = Date.parse(previous?.lastSuccessAt || "");
  return !Number.isFinite(last) || now - last >= SHARED_COPY_EVERY_MS;
}

/** What the nightly backup writes to the admin-only systemStatus/backup doc. `extra` = export/copy details. */
function backupStatusRecord({ ok, day, at, operation = "", error = "", previous = null, extra = {} }) {
  const record = { ...extra, lastAttemptAt: at, lastDay: day, ok: ok === true, runningSince: "" };
  if (ok) {
    record.lastSuccessAt = at;
    record.lastSuccessDay = day;
    record.operation = String(operation || "").slice(0, 300);
    record.error = "";
  } else {
    record.error = String(error || "Unknown error").slice(0, 500);
    // A failure keeps the last good backup on record.
    if (previous?.lastSuccessAt) {
      record.lastSuccessAt = previous.lastSuccessAt;
      record.lastSuccessDay = previous.lastSuccessDay || "";
    }
  }
  return record;
}

module.exports = { ORIGIN_FALLBACK, shopOrigin, checkoutClosed, planPaused, shopPrivate, dailyDigestEnabled, backupOutcome, backupStatusRecord, ownCopyDue };
