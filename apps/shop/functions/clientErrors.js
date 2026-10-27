// Shopper-side crashes (a page or section that failed to draw, an uncaught script error), reported by the storefront
// through validateDiscountCode `action: "clientError"` (src/app/lib/errorReport.ts) and listed in Settings › General ›
// Tools & records › Shop errors. One admin-only `clientErrors/{signature}` record per distinct error, counted, never a
// row per shopper: no address, query string, email or order key is kept. Records expire after RETAIN_DAYS (TTL).
const crypto = require("crypto");

const RETAIN_DAYS = 30;
// New distinct errors recorded per day for the whole shop (repeats of a known one only add to its count).
const NEW_PER_DAY = 100;
const MAX_PATHS = 5;
const KINDS = ["page", "section", "script", "promise"];

const text = (value, max) => String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);
// Stacks keep their line breaks (one frame per line in the admin's Details view).
const lines = (value, max) => String(value ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, " ").trim().slice(0, max);

/** Removes anything that could identify a shopper: email addresses, long numbers, query strings and fragments. */
function scrub(value) {
  return String(value)
    // A plain domain after the @, so Firefox/Safari stack frames ("fn@https://shop/assets/x.js:1:2") survive.
    .replace(/[^\s@"'<>()]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b(?![:/])/gi, "[email]")
    .replace(/\?[^\s)'"]*/g, "")
    .replace(/#[^\s)'"]*/g, "")
    .replace(/\b\d{6,}\b/g, "[number]");
}

/** Only the page's path, without its query or fragment (tracking links carry order keys). */
function cleanPath(value) {
  const raw = text(value, 300);
  if (!raw.startsWith("/")) return "/";
  return scrub(raw.split(/[?#]/)[0]).slice(0, 200) || "/";
}

/** The report as it may be stored, or null when it has nothing worth keeping. */
function cleanReport(body) {
  if (!body || typeof body !== "object") return null;
  const message = scrub(text(body.message, 300));
  if (!message) return null;
  const kind = KINDS.includes(body.kind) ? body.kind : "script";
  return {
    kind,
    message,
    stack: scrub(lines(body.stack, 2000)),
    path: cleanPath(body.path),
    section: text(body.section, 60).replace(/[^\w-]/g, ""),
    build: text(body.build, 40).replace(/[^\w.-]/g, ""),
  };
}

/** Same error, same record: the kind, the message with its numbers taken out, and the section type. */
function signatureOf(report) {
  const key = [report.kind, report.message.replace(/\d+/g, "#"), report.section].join("|");
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 32);
}

const torontoDay = now => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date(now));

/**
 * Counts one report. Returns "recorded" (new error), "counted" (a known one) or "full" (the day's budget of new
 * errors is used up). `db` is a Firestore Admin instance (or the tests' fake).
 */
async function recordClientError(db, report, now = Date.now()) {
  const id = signatureOf(report);
  const ref = db.collection("clientErrors").doc(id);
  const budgetRef = db.collection("systemStatus").doc("clientErrorBudget");
  const expiresAt = new Date(now + RETAIN_DAYS * 864e5);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const prev = snap.data() || {};
      const paths = Array.isArray(prev.paths) ? prev.paths.filter(p => typeof p === "string") : [];
      const nextPaths = paths.includes(report.path) ? paths : [report.path, ...paths].slice(0, MAX_PATHS);
      tx.set(ref, { count: Math.min(1e9, Number(prev.count || 0) + 1), lastSeenAt: new Date(now), lastPath: report.path,
        paths: nextPaths, stack: report.stack || prev.stack || "", build: report.build || prev.build || "", expiresAt }, { merge: true });
      return "counted";
    }
    const budgetSnap = await tx.get(budgetRef);
    const day = torontoDay(now);
    const budget = budgetSnap.exists ? budgetSnap.data() || {} : {};
    const used = budget.day === day ? Number(budget.created || 0) : 0;
    if (used >= NEW_PER_DAY) return "full";
    tx.set(budgetRef, { day, created: used + 1 });
    tx.set(ref, { ...report, count: 1, firstSeenAt: new Date(now), lastSeenAt: new Date(now), lastPath: report.path,
      paths: [report.path], expiresAt });
    return "recorded";
  });
}

module.exports = { cleanReport, signatureOf, recordClientError, RETAIN_DAYS, NEW_PER_DAY };
