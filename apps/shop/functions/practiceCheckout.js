// Practice checkout for platform shops (code plan 7.6). While the shop is private (Settings › General › Store status is
// not Open), the owner presses "Try a practice order": for one hour the owner's own checkout, and nobody else's, pays
// through the press's test account on the platform's payment service. Tested in practiceCheckout.test.js.
//
// The flag is the admin-only, server-written systemStatus/practiceCheckout ({ uid, email, startedAt, until }); the
// rules let no browser write it. A checkout is a practice one only when all of these hold at that moment: the shop takes
// cards through the platform, the shop is private, the request carries the owner's own verified sign-in, and that
// owner started practice less than an hour ago. Practice orders are marked `practiceOrder: true`; their payment is a
// sandbox one (isTest, sandboxPayment), so it records no revenue and stays out of reports, and like on the platform's
// test shop (plan 1.31) it takes stock and its refund puts it back (settlePayment.js sandboxTakesStock).
const { adminRole, supportOf } = require("./roles");
const { shopPrivate } = require("./shopSettings");

const PRACTICE_MS = 60 * 60 * 1000;

/** Why the owner can't start practice now ("own_keys" | "shop_open" | "owner_only"), or null when they can. */
function practiceRefusal({ platform, settings, token }) {
  if (!platform) return "own_keys";
  if (adminRole(token) !== "owner" || supportOf(token)) return "owner_only";
  if (!shopPrivate(settings)) return "shop_open";
  return null;
}

/** The flag's end (ISO) when it is running for this sign-in, else "". */
function practiceUntil(record, token, nowMs) {
  if (!record || !token?.uid || record.uid !== token.uid) return "";
  const until = Date.parse(record.until || "");
  return Number.isFinite(until) && until > nowMs ? record.until : "";
}

/**
 * @param {object} deps
 * @param {object} deps.db Firestore
 * @param {boolean} deps.platform the shop takes cards through the platform (payments.mode === "platform")
 * @param {(req, res) => Promise<object|null>} deps.requireAdmin
 * @param {(req) => Promise<object|null>} deps.orderRequestIdentity the request's verified sign-in, or null
 * @param {() => number} [deps.now]
 */
function practiceCheckoutActions({ db, platform, requireAdmin, orderRequestIdentity, now = Date.now }) {
  const flagRef = () => db.collection("systemStatus").doc("practiceCheckout");
  const readSettings = async () => (await db.collection("settings").doc("website").get()).data() || {};
  const readFlag = async () => {
    const snap = await flagRef().get();
    return snap.exists ? snap.data() || null : null;
  };

  // Admin › Settings › Payments › Test sale walkthrough: step "status" | "start" | "stop".
  async function handlePracticeCheckout(req, res) {
    const token = await requireAdmin(req, res);
    if (!token) return;
    const step = req.body?.step;
    try {
      const [settings, record] = await Promise.all([readSettings(), readFlag()]);
      const refusal = practiceRefusal({ platform, settings, token });
      const until = refusal ? "" : practiceUntil(record, token, now());
      if (step === "status") {
        res.json({ active: !!until, until, ...(refusal ? { refusal } : {}) });
        return;
      }
      if (step === "stop") {
        // Anyone on the admin may end it early; ending it never opens anything.
        if (record) await flagRef().set({ ...record, until: new Date(now()).toISOString(), stoppedBy: token.email || token.uid });
        res.json({ active: false, until: "" });
        return;
      }
      if (step === "start") {
        if (refusal === "own_keys") return res.status(409).json({ error: "This shop takes card payments with its own keys. Use test mode instead.", code: refusal });
        if (refusal === "owner_only") return res.status(403).json({ error: "Only the shop's owner can try a practice order.", code: refusal });
        if (refusal === "shop_open") return res.status(409).json({ error: "Your shop is open, so practice orders are off. They work only while the shop is private.", code: refusal });
        const startedAt = new Date(now()).toISOString();
        const next = { uid: token.uid, email: token.email || "", startedAt, until: new Date(now() + PRACTICE_MS).toISOString() };
        await flagRef().set(next);
        res.json({ active: true, until: next.until });
        return;
      }
      res.status(400).json({ error: "Unknown step.", code: "bad_request" });
    } catch (err) {
      console.error(`Practice checkout (${step}) failed:`, err?.message || err);
      res.status(500).json({ error: "Couldn't reach the practice checkout. Try again in a minute." });
    }
  }

  /**
   * For createStripeCheckoutSession: null for an ordinary checkout, or { settings } for a practice one, where settings
   * are the shop's own with checkout open and test mode on, for this one request (nothing is saved).
   */
  async function practiceFor(req) {
    if (!platform) return null;
    const token = await orderRequestIdentity(req);
    if (!token) return null;
    const [settings, record] = await Promise.all([readSettings(), readFlag()]);
    if (practiceRefusal({ platform, settings, token }) || !practiceUntil(record, token, now())) return null;
    return {
      settings: {
        ...settings,
        maintenance: { ...(settings.maintenance || {}), enabled: false },
        payments: { ...(settings.payments || {}), testMode: true },
      },
    };
  }

  return { handlePracticeCheckout, practiceFor };
}

module.exports = { PRACTICE_MS, practiceCheckoutActions, practiceRefusal, practiceUntil };
