// Donations & tips (beta; LMB-PLATFORM tasks/todo/2026-11-18-giving-g1.md). A shop takes gifts on its Support page: the
// giver picks or types an amount, may cover the card fee, give in someone's honour or memory and stay anonymous, then
// pays on the shop's own card page (Stripe or Square, no shop order, no sales tax; the order webhook ignores it). A
// thank-you email goes to the giver and a short note to the owner.
//
// On only while both switches are: the platform's (`platform/features` › `ways.giving`, the control room) and the
// owner's (`firstWeek/start` › `ways.giving`, Settings › Ways to sell). Every public action checks them first.
//
// Records, all server-only (no rule opens them to a browser; the admin reads through `givingAdmin`):
//   givingSettings/main     the owner's choices (shared/givingRules `cleanGivingSettings`)
//   gifts/{id}              one gift: `held` while the giver pays, then `paid`, `cancelled` (page closed unpaid) or
//                           `refunded`
//   givingBlocked/{day}     tries refused that day by the card-testing guard, per reason (the admin and the control room
//                           show them)
//   givingSecret/key        the shop's own key for the page's form token
//   fundraisers/{id}        a fundraiser (G2): title, story, goal, last day, `draft`/`live`/`ended`, and the server's own
//                           count of what it raised (`raisedMinor`, `supporters`, `wallEntries`), changed only when a
//                           gift given to it is paid or refunded. One runs at a time.
//
// Card-testing guard (people trying stolen cards with small gifts): the lowest gift is $5 (shared/givingRules MIN_GIFT_MINOR);
// one visitor may open GIFT_PAGES_PER_HOUR card pages an hour and one email GIFT_PAGES_PER_EMAIL; the page's form token
// must be at least FORM_MIN_SECONDS old (a person reads the page first) and a hidden field only bots fill in must be
// empty. The card page itself takes one payment. Every refusal is counted in `givingBlocked`.
//
// Public actions (through validateDiscountCode, rate limited): givingInfo, giftStart, giftView. Owner ops go through
// createStripeCheckoutSession `action: "givingAdmin"`. `sweep()` (inside bookingSweep, every 5 minutes) confirms a paid
// page nobody came back to and closes an unpaid one.
"use strict";

const crypto = require("crypto");
const { cleanGivingSettings, startingGivingSettings, giftAmountProblem, giftCharge, cleanGiver, centsOf, MIN_GIFT_MINOR, MAX_GIFT_MINOR, GIVING_MESSAGES } = require("./shared/givingRules");
const { waysOn } = require("./shared/waysToSell");
const { cleanFundraiser, fundraiserState, publicFundraiser, wallWith, wallWithout } = require("./shared/fundraiserRules");
const { dayOf } = require("./shared/bookingTimes");
const { shopTimeZone } = require("./shared/shopTimeZone");

/** How long a card page stays open; the sweep closes it after that. Stripe's shortest is 30 minutes. */
const PAGE_MINUTES = 31;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** Card pages one visitor may open in an hour, and one email address. */
const GIFT_PAGES_PER_HOUR = 5;
const GIFT_PAGES_PER_EMAIL = 3;
/** The page's form token: at least this old (a person reads before giving) and at most FORM_MAX_HOURS. */
const FORM_MIN_SECONDS = 3;
const FORM_MAX_HOURS = 6;
/** Gifts the admin lists, newest first. */
const MAX_LISTED = 500;
const BLOCK_REASONS = Object.freeze(["tooSmall", "tooMany", "bot"]);
const ID = /^[A-Za-z0-9_-]{6,40}$/;
const KEY = /^[a-f0-9]{48}$/;
const SESSION_ID = /^(cs_[A-Za-z0-9_]{8,200}|sqlink_[A-Za-z0-9_-]{1,192})$/;
const PUBLIC_GIVING_ACTIONS = Object.freeze(["givingInfo", "giftStart", "giftView"]);

const hash = (key) => crypto.createHash("sha256").update(String(key)).digest("hex");
const sameHash = (a, b) => typeof a === "string" && typeof b === "string" && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const fail = (res, status, error, code) => res.status(status).json({ error, ...(code ? { code } : {}) });
const moneyWords = (minor, currency, locale = "en-CA") => new Intl.NumberFormat(locale, { style: "currency", currency: String(currency || "CAD").toUpperCase() }).format(minor / 100);
const french = (locale) => /^fr\b/i.test(String(locale || ""));

// The fixed words of the thank-you email, in the giver's language (the page sends the browser's).
const WORDS = {
  en: {
    subject: (shop) => `Thank you for your gift to ${shop}`,
    heading: "Thank you",
    intro: (shop) => `Your gift to ${shop} came through. It makes a real difference.`,
    gift: "Your gift", fee: "Card fee you covered", total: "Paid", honour: "In honour of", memory: "In memory of",
    anonymous: "You asked to stay anonymous, so your name won't be shown anywhere.",
    button: "See your gift",
    refundSubject: (shop) => `Your gift to ${shop} was refunded`,
    refundIntro: (shop) => `${shop} has refunded your gift.`,
    refundWhen: "The money goes back to the card you paid with, usually within 5 to 10 business days.",
  },
  fr: {
    subject: (shop) => `Merci pour votre don à ${shop}`,
    heading: "Merci",
    intro: (shop) => `Votre don à ${shop} a bien été reçu. Il fait une vraie différence.`,
    gift: "Votre don", fee: "Frais de carte que vous avez couverts", total: "Payé", honour: "En l'honneur de", memory: "À la mémoire de",
    anonymous: "Vous avez demandé à rester anonyme : votre nom ne sera affiché nulle part.",
    button: "Voir votre don",
    refundSubject: (shop) => `Votre don à ${shop} a été remboursé`,
    refundIntro: (shop) => `${shop} a remboursé votre don.`,
    refundWhen: "L'argent est remis sur la carte utilisée pour le paiement, habituellement en 5 à 10 jours ouvrables.",
  },
};

/** What the giver's own page may see of a gift (never payment ids or key hashes). */
function publicGift(id, g) {
  return {
    id, status: g.status, amountMinor: g.amountMinor || 0, feeMinor: g.feeMinor || 0, chargedMinor: g.chargedMinor || 0, currency: g.currency,
    name: g.customer?.name || "", anonymous: g.anonymous === true, honour: g.honour || null, paidAt: g.paidAt || "", refunded: g.status === "refunded",
  };
}

/** A gift as the admin lists it: the giver's details are the owner's to see, even when the giver stays anonymous to others. */
const adminGift = (id, g) => ({
  id, status: g.status, name: g.customer?.name || "", email: g.customer?.email || "", anonymous: g.anonymous === true, honour: g.honour || null, note: g.note || "",
  amountMinor: g.amountMinor || 0, feeMinor: g.feeMinor || 0, chargedMinor: g.chargedMinor || 0, currency: g.currency,
  createdAt: g.createdAt || "", paidAt: g.paidAt || "", refundedAt: g.refundedAt || "", test: g.mode === "test",
  fundraiserId: g.fundraiserId || "",
});

/** A fundraiser as the owner sees it: what anyone sees, plus when it started and ended. */
const adminFundraiser = (id, f, today) => ({
  ...publicFundraiser(id, f, today), status: f.status || "draft", createdAt: f.createdAt || "", startedAt: f.startedAt || "", endedAt: f.endedAt || "",
});

function givingActions({
  db, requireAdmin, payments, shopTestMode, hitLimit, LIMITS, siteLink, shopName = () => "", currency,
  sendEmail = async () => {}, emailBrand = async () => ({}), ownerEmail = () => "",
  escapeHtml, risoLayout, risoButton, now = () => new Date(), timeZone = shopTimeZone,
  randomId = () => crypto.randomBytes(12).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 16).padEnd(8, "0"),
  randomKey = () => crypto.randomBytes(24).toString("hex"),
}) {
  const gifts = () => db.collection("gifts");
  const settingsRef = () => db.collection("givingSettings").doc("main");
  const blockedRef = (day) => db.collection("givingBlocked").doc(day);
  const fundraisers = () => db.collection("fundraisers");
  /** The shop's own day (YYYY-MM-DD in its time zone): a fundraiser runs to the end of its last day there. */
  const shopToday = (ms = now().getTime()) => dayOf(ms, timeZone());

  /** The fundraiser running now, or null. Started ones whose last day passed count as ended. */
  async function liveFundraiser(today = shopToday()) {
    const snap = await fundraisers().where("status", "==", "live").limit(10).get();
    const doc = snap.docs.find((d) => fundraiserState(d.data(), today) === "live");
    return doc ? { id: doc.id, data: doc.data() } : null;
  }
  const keyFits = (g, key) => KEY.test(String(key || "")) && (g.keyHashes || []).some((h) => sameHash(h, hash(key)));
  const giftUrl = (id, key) => siteLink(`/support?gift=${encodeURIComponent(id)}&key=${encodeURIComponent(key)}`);
  const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

  /** Both switches: the platform lets this shop take gifts, and the owner turned it on. */
  async function featureOn() {
    const [features, start] = await Promise.all([
      db.collection("platform").doc("features").get().catch(() => null),
      db.collection("firstWeek").doc("start").get().catch(() => null),
    ]);
    return waysOn(features?.exists ? features.data() : null, start?.exists ? start.data() : null).includes("giving");
  }
  async function readSettings() {
    const snap = await settingsRef().get().catch(() => null);
    return snap?.exists ? cleanGivingSettings(snap.data()) : startingGivingSettings();
  }
  /** Whether checkout may take a tip now: both switches on and the owner asks for tips. Read on every pricing. */
  async function tipsTaken() {
    if (!(await featureOn())) return false;
    return (await readSettings()).checkoutTip === true;
  }
  async function standalone() {
    const mode = (await shopTestMode()) ? "test" : "live";
    return { mode, checkout: await payments.standaloneCheckout(mode) };
  }

  // The website shows its Support links from `settings/website.givingLive`, which the pages already read. Kept in step
  // when the owner flips the switch (admin op `hint`) or saves the settings. Only a hint for showing a link: every
  // public action still checks the real switches. A shop with no website settings yet is left alone.
  // `givingTips` (the tip percents, empty when tips are off) tells the checkout page whether to ask for a tip.
  async function tellWebsite() {
    try {
      const live = await featureOn();
      const settings = await readSettings();
      const tips = live && settings.checkoutTip ? settings.tipPercents : [];
      const ref = db.collection("settings").doc("website");
      const snap = await ref.get();
      const had = snap.exists ? snap.data() : null;
      const hadTips = Array.isArray(had?.givingTips) ? had.givingTips : [];
      if (had && ((had.givingLive === true) !== live || hadTips.join(",") !== tips.join(","))) await ref.set({ givingLive: live, givingTips: tips }, { merge: true });
      return live;
    } catch (err) {
      console.warn("giving: the website link wasn't updated:", err?.message || err);
      return null;
    }
  }

  // ── The card-testing guard ────────────────────────────────────────────────────────────────────────────────────

  /** The shop's own key for form tokens, made the first time it's needed. */
  async function formKey() {
    const ref = db.collection("givingSecret").doc("key");
    const snap = await ref.get();
    if (snap.exists && typeof snap.data()?.key === "string" && snap.data().key.length >= 32) return snap.data().key;
    const key = crypto.randomBytes(32).toString("hex");
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      if (!(fresh.exists && fresh.data()?.key)) tx.set(ref, { key, createdAt: now().toISOString() });
    });
    const again = await ref.get();
    return again.data()?.key || key;
  }
  const sign = (key, issued) => crypto.createHmac("sha256", key).update(`gift-form:${issued}`).digest("hex").slice(0, 32);
  async function formToken(nowMs) {
    return `${nowMs}.${sign(await formKey(), nowMs)}`;
  }
  /** A person's form: a token this shop gave out a few seconds to a few hours ago, and the hidden field left empty. */
  async function looksHuman(body, nowMs) {
    if (typeof body?.website === "string" && body.website.trim()) return false;
    const [issuedRaw, mac] = String(body?.form || "").split(".");
    const issued = Number(issuedRaw);
    if (!Number.isFinite(issued) || typeof mac !== "string" || mac.length !== 32) return false;
    if (nowMs - issued < FORM_MIN_SECONDS * 1000 || nowMs - issued > FORM_MAX_HOURS * HOUR) return false;
    return sameHash(mac, sign(await formKey(), issued));
  }
  /** Counts one refused try for the day (never throws: counting must not stop the answer). */
  async function countBlocked(reason, nowMs) {
    try {
      await db.runTransaction(async (tx) => {
        const ref = blockedRef(dayOf(nowMs));
        const snap = await tx.get(ref);
        const had = snap.exists ? snap.data() : {};
        tx.set(ref, { ...had, day: dayOf(nowMs), [reason]: (Number(had[reason]) || 0) + 1, total: (Number(had.total) || 0) + 1, updatedAt: new Date(nowMs).toISOString() });
      });
    } catch (err) {
      console.warn("giving: a blocked try wasn't counted:", err?.message || err);
    }
  }
  /** Refused tries in the last `days` days, per reason. */
  async function blockedSince(nowMs, days = 30) {
    const out = { tooSmall: 0, tooMany: 0, bot: 0, total: 0 };
    const refs = Array.from({ length: days }, (_, i) => blockedRef(dayOf(nowMs - i * 24 * HOUR)));
    const snaps = await Promise.all(refs.map((r) => r.get().catch(() => null)));
    for (const s of snaps) {
      if (!s?.exists) continue;
      for (const k of [...BLOCK_REASONS, "total"]) out[k] += Number(s.data()?.[k]) || 0;
    }
    return out;
  }

  // ── Emails ──────────────────────────────────────────────────────────────────────────────────────────────────

  /** The giver's thank-you (with a link to their own page) and the owner's note. Never throws. */
  async function tellThanks(id, g, key, { toOwner = true } = {}) {
    try {
      const to = g.customer?.email;
      if (!to) return false;
      const fr = french(g.locale);
      const say = fr ? WORDS.fr : WORDS.en;
      const locale = fr ? "fr-CA" : "en-CA";
      const brand = await emailBrand();
      const shop = brand.shopName || shopName() || "the shop";
      const settings = await readSettings();
      const layout = { logoUrl: brand.logoUrl || "", accent: brand.accent || "", theme: brand.theme || "light", shopName: shop };
      const line = (label, value) => `<p style="margin:0 0 4px;"><strong>${label}:</strong> ${escapeHtml(value)}</p>`;
      const thanks = settings.thanks ? `<p style="margin:0 0 16px;white-space:pre-line;">${escapeHtml(settings.thanks)}</p>` : "";
      await sendEmail({
        to,
        subject: say.subject(shop),
        html: risoLayout(`
          <h2 style="margin:0 0 12px;">${say.heading}, ${escapeHtml(g.customer?.name || "")}</h2>
          <p style="margin:0 0 16px;">${escapeHtml(say.intro(shop))}</p>
          ${thanks}
          ${line(say.gift, moneyWords(g.amountMinor, g.currency, locale))}
          ${g.feeMinor > 0 ? line(say.fee, moneyWords(g.feeMinor, g.currency, locale)) : ""}
          ${g.feeMinor > 0 ? line(say.total, moneyWords(g.chargedMinor, g.currency, locale)) : ""}
          ${g.honour ? line(g.honour.kind === "memory" ? say.memory : say.honour, g.honour.name) : ""}
          ${g.anonymous ? `<p style="margin:12px 0 0;">${say.anonymous}</p>` : ""}
          <div style="margin:16px 0 0;">${key ? risoButton(escapeHtml(giftUrl(id, key)), say.button, brand.accent, brand.theme) : ""}</div>
        `, layout),
      });
      const owner = toOwner ? ownerEmail() : "";
      if (owner) {
        const who = `${g.customer?.name || "Someone"}${g.anonymous ? " (asked to stay anonymous)" : ""}`;
        await sendEmail({
          to: owner,
          subject: `[GIFT] ${who} gave ${moneyWords(g.amountMinor, g.currency)}`,
          html: risoLayout(`<h2 style="margin:0 0 12px;">${escapeHtml(who)} gave ${escapeHtml(moneyWords(g.amountMinor, g.currency))}</h2>
            <p style="margin:0 0 4px;">${escapeHtml(g.customer?.email || "")}${g.honour ? ` · ${g.honour.kind === "memory" ? "In memory of" : "In honour of"} ${escapeHtml(g.honour.name)}` : ""}</p>
            ${g.note ? `<p style="margin:8px 0 0;white-space:pre-line;">“${escapeHtml(g.note)}”</p>` : ""}
            <div style="margin:16px 0 0;">${risoButton(escapeHtml(siteLink("/admin#giving")), "Open Gifts", brand.accent, brand.theme)}</div>`, layout),
        });
      }
      return true;
    } catch (err) {
      console.warn("giving: the thank-you email failed:", err?.message || err);
      return false;
    }
  }

  async function tellRefund(g) {
    try {
      const to = g.customer?.email;
      if (!to) return false;
      const fr = french(g.locale);
      const say = fr ? WORDS.fr : WORDS.en;
      const locale = fr ? "fr-CA" : "en-CA";
      const brand = await emailBrand();
      const shop = brand.shopName || shopName() || "the shop";
      await sendEmail({
        to,
        subject: say.refundSubject(shop),
        html: risoLayout(`
          <h2 style="margin:0 0 12px;">${escapeHtml(say.refundSubject(shop))}</h2>
          <p style="margin:0 0 16px;">${escapeHtml(say.refundIntro(shop))} ${escapeHtml(moneyWords(g.chargedMinor, g.currency, locale))}.</p>
          <p style="margin:0;">${say.refundWhen}</p>
        `, { logoUrl: brand.logoUrl || "", accent: brand.accent || "", theme: brand.theme || "light", shopName: shop }),
      });
      return true;
    } catch (err) {
      console.warn("giving: the refund email failed:", err?.message || err);
      return false;
    }
  }

  // ── Paying ──────────────────────────────────────────────────────────────────────────────────────────────────

  /** Marks a held gift paid, once, and sends the thank-you. A page that closed unpaid but turns out paid still counts. */
  async function confirmPaid(id, g, { session = "", paymentIntent = null } = {}) {
    const at = now().toISOString();
    const changes = { status: "paid", paidAt: at, paidSession: session || null, paymentIntent, updatedAt: at, pendingKey: null };
    const done = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(gifts().doc(id));
      if (!fresh.exists || !["held", "cancelled"].includes(fresh.data()?.status) || fresh.data()?.paidAt) return false;
      const gift = fresh.data();
      // A gift to a fundraiser counts toward it here, once, as it is paid (even after the last day: the giver paid in time).
      const fund = gift.fundraiserId ? await tx.get(fundraisers().doc(gift.fundraiserId)) : null;
      tx.set(gifts().doc(id), changes, { merge: true });
      if (fund?.exists) {
        const f = fund.data();
        const entry = gift.wall === true && !gift.anonymous && gift.customer?.name ? { gift: id, name: String(gift.customer.name).slice(0, 80), at } : null;
        tx.set(fundraisers().doc(gift.fundraiserId), {
          raisedMinor: (Number(f.raisedMinor) || 0) + (Number(gift.amountMinor) || 0), supporters: (Number(f.supporters) || 0) + 1,
          ...(entry ? { wallEntries: wallWith(Array.isArray(f.wallEntries) ? f.wallEntries : [], entry) } : {}), updatedAt: at,
        }, { merge: true });
      }
      return true;
    });
    if (!done) return { ...g, ...((await gifts().doc(id).get()).data() || {}) };
    const next = { ...g, ...changes };
    await tellThanks(id, next, g.pendingKey || "");
    return next;
  }

  /** Reads a held gift's card pages; the first one paid for the gift's exact amount confirms it. */
  async function refreshGift(id, g, checkout) {
    if (g.status !== "held" || !checkout) return g;
    for (const sid of (g.sessions || []).slice(-5)) {
      if (!SESSION_ID.test(sid)) continue;
      const session = await checkout.read(sid).catch(() => null);
      if (!session || (session.metadata?.gift && session.metadata.gift !== id) || session.payment_status !== "paid") continue;
      if (Number.isFinite(session.amount_total) && session.amount_total !== g.chargedMinor) continue;
      return confirmPaid(id, g, { session: sid, paymentIntent: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null });
    }
    return g;
  }

  async function cancelGift(id, why) {
    const at = now().toISOString();
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(gifts().doc(id));
      if (!fresh.exists || fresh.data()?.status !== "held") return;
      tx.set(gifts().doc(id), { status: "cancelled", cancelledAt: at, cancelledBy: why, pendingKey: null, updatedAt: at }, { merge: true });
    });
  }

  /** Confirms paid pages nobody came back to and closes the ones that ran out unpaid. Runs whatever the switches say. */
  async function sweep() {
    const snap = await gifts().where("status", "==", "held").limit(100).get();
    if (snap.empty) return { confirmed: 0, closed: 0 };
    const { checkout } = await standalone();
    let confirmed = 0;
    let closed = 0;
    for (const doc of snap.docs) {
      let g = await refreshGift(doc.id, doc.data(), checkout);
      if (g.status === "paid") { confirmed += 1; continue; }
      if (Date.parse(g.createdAt || "") + PAGE_MINUTES * MINUTE > now().getTime()) continue;
      // Close every page first, then read once more: a payment that landed just before the close still counts.
      for (const sid of g.sessions || []) if (SESSION_ID.test(sid)) await checkout?.close(sid).catch(() => {});
      g = await refreshGift(doc.id, g, checkout);
      if (g.status === "paid") { confirmed += 1; continue; }
      await cancelGift(doc.id, "not paid in time");
      closed += 1;
    }
    return { confirmed, closed };
  }

  // ── Givers (validateDiscountCode actions; no sign-in) ──────────────────────────────────────────────────────────

  async function handlePublic(req, res) {
    const action = req.body?.action;
    res.set("Cache-Control", "private, no-store");
    if (!(await hitLimit(db, "giving", req, LIMITS.giving))) return fail(res, 429, "Too many tries. Please wait a few minutes and try again.");
    try {
      const nowMs = now().getTime();
      if (action === "giftView") {
        // The giver's own page works even after the shop stops taking gifts.
        const id = String(req.body?.giftId || "");
        const snap = ID.test(id) ? await gifts().doc(id).get() : null;
        if (!snap?.exists || !keyFits(snap.data(), req.body?.key)) return fail(res, 404, "We couldn't find that gift. Check the link in your email.", "not_found");
        const g = await refreshGift(id, snap.data(), snap.data().status === "held" ? (await standalone()).checkout : null);
        return res.status(200).json({ gift: publicGift(id, g) });
      }
      if (!(await featureOn())) return res.status(200).json({ on: false });
      const settings = await readSettings();
      if (action === "givingInfo") {
        const { checkout } = await standalone();
        return res.status(200).json({
          on: true, currency: currency(), minMinor: MIN_GIFT_MINOR, maxMinor: MAX_GIFT_MINOR, cardsReady: !!checkout,
          amounts: settings.amounts, otherAmount: settings.otherAmount, coverFee: settings.coverFee, honour: settings.honour,
          form: await formToken(nowMs), fundraiser: await liveFundraiser(shopToday(nowMs)).then((f) => (f ? publicFundraiser(f.id, f.data, shopToday(nowMs)) : null)),
        });
      }
      if (action === "giftStart") {
        // Bots first: a form filled in too fast, never given out by this shop, or with the hidden field filled.
        if (!(await looksHuman(req.body, nowMs))) {
          await countBlocked("bot", nowMs);
          return fail(res, 400, "Something went wrong with the form. Please reload the page and try again.", "form");
        }
        const amountMinor = centsOf(req.body?.amountMinor);
        const problem = giftAmountProblem(amountMinor, settings);
        if (problem) {
          if (problem.code === "tooSmall") await countBlocked("tooSmall", nowMs);
          const words = problem.code === "tooSmall" ? GIVING_MESSAGES.tooSmall(moneyWords(MIN_GIFT_MINOR, currency()))
            : problem.code === "tooBig" ? GIVING_MESSAGES.tooBig(moneyWords(MAX_GIFT_MINOR, currency())) : GIVING_MESSAGES.amount;
          return fail(res, 400, words, "amount");
        }
        const giver = cleanGiver(req.body?.giver, settings);
        if ("problem" in giver) return fail(res, 400, giver.problem, giver.code);
        // A few card pages an hour per visitor and per email: enough for anyone giving, too few to try a list of cards.
        const perVisitor = await hitLimit(db, "giftPage", req, { max: GIFT_PAGES_PER_HOUR, windowMs: HOUR });
        const perEmail = perVisitor && (await hitLimit(db, "giftEmail", req, { max: GIFT_PAGES_PER_EMAIL, windowMs: HOUR }, { key: `gift:${giver.email}` }));
        if (!perVisitor || !perEmail) {
          await countBlocked("tooMany", nowMs);
          return fail(res, 429, "You've tried several times in a short while. Please wait an hour and try again, or contact the shop.", "too_many");
        }
        // A gift to the fundraiser: only the one running now (a page left open past its last day gives to the shop instead).
        let fund = null;
        if (req.body?.fundraiserId) {
          fund = await liveFundraiser(shopToday(nowMs));
          if (!fund || fund.id !== String(req.body.fundraiserId)) return fail(res, 409, "This fundraiser has ended. You can still give to the shop: reload the page.", "fundraiser_ended");
        }
        const { checkout, mode } = await standalone();
        if (!checkout) return fail(res, 409, "This shop can't take card payments for gifts yet. Please contact the shop.", "not_available");
        const charge = giftCharge(amountMinor, req.body?.coverFee, settings);
        const id = randomId();
        const key = randomKey();
        const at = new Date(nowMs).toISOString();
        const record = {
          status: "held", customer: { name: giver.name, email: giver.email }, anonymous: giver.anonymous, honour: giver.honour, note: giver.note,
          ...(fund ? { fundraiserId: fund.id, wall: fund.data.wall !== false && req.body?.wall === true && !giver.anonymous } : {}),
          locale: french(req.body?.locale) ? "fr" : "en", ...charge, currency: currency(), mode, keyHashes: [hash(key)], pendingKey: key, sessions: [], createdAt: at, updatedAt: at,
        };
        await gifts().doc(id).set(record);
        const shop = shopName();
        const description = `${shop ? `${shop}: ` : ""}Gift${fund ? ` to ${fund.data.title}` : ""}${charge.feeMinor ? " (card fee covered)" : ""}`.slice(0, 250);
        const metadata = { gift: id };
        let session;
        try {
          session = await checkout.open({
            customer_email: giver.email, metadata, mode: "payment", expires_at: Math.floor(nowMs / 1000) + PAGE_MINUTES * 60,
            success_url: giftUrl(id, key),
            line_items: [{ quantity: 1, price_data: { currency: currency().toLowerCase(), unit_amount: charge.chargedMinor, product_data: { name: description } } }],
            payment_intent_data: { description, metadata },
          }, `gift-${id}`);
        } catch (err) {
          await cancelGift(id, "the card page didn't open");
          if (err?.code === "currency_mismatch") return fail(res, 409, err.message, "currency_mismatch");
          if (["test_only", "not_connected", "not_available"].includes(err?.code)) return fail(res, 409, "This shop can't take card payments for gifts yet. Please contact the shop.", "not_available");
          throw err;
        }
        await gifts().doc(id).set({ sessions: [session.id] }, { merge: true });
        return res.status(200).json({ url: session.url, giftId: id });
      }
      return fail(res, 400, "Unknown request.");
    } catch (err) {
      console.error("giving: a giver's action failed:", err?.message || err);
      return fail(res, 500, "Something went wrong on our side. Please try again in a moment.");
    }
  }

  // ── The owner (createStripeCheckoutSession action "givingAdmin") ──────────────────────────────────────────────

  async function handleAdmin(req, res) {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;
    const op = req.body?.op;
    const by = adminUser.email || "admin";
    try {
      // The owner just flipped the switch (Settings › Ways to sell): the website's links follow, on or off.
      if (op === "hint") return res.status(200).json({ ok: true, givingLive: (await tellWebsite()) === true });
      if (!(await featureOn())) return fail(res, 403, "Donations & tips aren't turned on for this shop.", "off");
      const nowMs = now().getTime();
      if (op === "list") {
        const [paid, refunded] = await Promise.all(["paid", "refunded"].map((s) => gifts().where("status", "==", s).limit(MAX_LISTED).get()));
        const list = [...paid.docs, ...refunded.docs].map((d) => adminGift(d.id, d.data()))
          .sort((a, b) => String(b.paidAt || b.createdAt).localeCompare(String(a.paidAt || a.createdAt))).slice(0, MAX_LISTED);
        const month = new Date(nowMs).toISOString().slice(0, 7);
        const counted = list.filter((g) => g.status === "paid" && !g.test);
        const totals = {
          givenMinor: counted.reduce((s, g) => s + g.amountMinor, 0),
          monthMinor: counted.filter((g) => String(g.paidAt).startsWith(month)).reduce((s, g) => s + g.amountMinor, 0),
          gifts: counted.length,
          givers: new Set(counted.map((g) => g.email)).size,
        };
        const today = shopToday(nowMs);
        const funds = (await fundraisers().limit(50).get()).docs.map((d) => adminFundraiser(d.id, d.data(), today))
          .sort((a, b) => (a.state === "ended") - (b.state === "ended") || String(b.startedAt || b.createdAt).localeCompare(String(a.startedAt || a.createdAt)));
        return res.status(200).json({ currency: currency(), settings: await readSettings(), gifts: list, totals, blocked: await blockedSince(nowMs), minMinor: MIN_GIFT_MINOR, maxMinor: MAX_GIFT_MINOR, fundraisers: funds, today });
      }
      if (op === "saveFundraiser") {
        // New or edited; `start` puts it on the Support page. One runs at a time, and an ended one stays as it was.
        const today = shopToday(nowMs);
        const clean = cleanFundraiser(req.body?.fundraiser, today);
        if ("problem" in clean) return fail(res, 400, clean.problem, clean.field);
        const start = req.body?.start === true;
        const at = new Date(nowMs).toISOString();
        const asked = String(req.body?.id || "");
        const id = asked || randomId();
        if (asked && !ID.test(asked)) return fail(res, 404, "Unknown fundraiser.");
        const running = start ? await liveFundraiser(today) : null;
        const saved = await db.runTransaction(async (tx) => {
          const snap = await tx.get(fundraisers().doc(id));
          if (asked && !snap.exists) return { error: [404, "Unknown fundraiser."] };
          const before = snap.exists ? snap.data() : null;
          if (before && fundraiserState(before, today) === "ended") return { error: [409, "This fundraiser has ended, so it can't be changed.", "ended"] };
          const live = before && fundraiserState(before, today) === "live";
          if (start && !live && running && running.id !== id) return { error: [409, `"${running.data.title}" is running now. End it first: one fundraiser runs at a time.`, "one_at_a_time"] };
          const next = {
            ...clean, status: live || start ? "live" : "draft", updatedAt: at, updatedBy: by,
            ...(before ? {} : { createdAt: at, raisedMinor: 0, supporters: 0, wallEntries: [] }),
            ...(start && !live ? { startedAt: at } : {}),
          };
          tx.set(fundraisers().doc(id), next, { merge: true });
          return { data: { ...(before || {}), ...next } };
        });
        if (saved.error) return fail(res, ...saved.error);
        return res.status(200).json({ ok: true, fundraiser: adminFundraiser(id, saved.data, today) });
      }
      if (op === "endFundraiser") {
        // A live one ends now (its gifts and wall are kept); a draft that never ran is removed.
        const id = String(req.body?.id || "");
        const snap = ID.test(id) ? await fundraisers().doc(id).get() : null;
        if (!snap?.exists) return fail(res, 404, "Unknown fundraiser.");
        const today = shopToday(nowMs);
        const f = snap.data();
        if (fundraiserState(f, today) === "draft") {
          await fundraisers().doc(id).delete();
          return res.status(200).json({ ok: true, removed: true });
        }
        if (fundraiserState(f, today) === "ended" && f.status === "ended") return res.status(200).json({ ok: true, already: true, fundraiser: adminFundraiser(id, f, today) });
        const at = new Date(nowMs).toISOString();
        const next = { ...f, status: "ended", endedAt: at, endedBy: by, updatedAt: at };
        await fundraisers().doc(id).set({ status: "ended", endedAt: at, endedBy: by, updatedAt: at }, { merge: true });
        return res.status(200).json({ ok: true, fundraiser: adminFundraiser(id, next, today) });
      }
      if (op === "saveSettings") {
        const settings = cleanGivingSettings(req.body?.settings);
        await settingsRef().set({ ...settings, updatedAt: new Date(nowMs).toISOString(), updatedBy: by });
        await tellWebsite();
        return res.status(200).json({ ok: true, settings });
      }
      if (op === "resendThanks") {
        const id = String(req.body?.giftId || "");
        const snap = ID.test(id) ? await gifts().doc(id).get() : null;
        if (!snap?.exists || snap.data().status !== "paid") return fail(res, 404, "That gift has no thank-you to send.");
        // A fresh link for this email; the last five keys keep working.
        const key = randomKey();
        await gifts().doc(id).set({ keyHashes: [...(snap.data().keyHashes || []), hash(key)].slice(-5), updatedAt: new Date(nowMs).toISOString() }, { merge: true });
        const sent = await tellThanks(id, snap.data(), key, { toOwner: false });
        if (!sent) return fail(res, 502, "The email didn't go out. Check Settings › Notifications and try again.");
        return res.status(200).json({ ok: true });
      }
      if (op === "refund") {
        // The whole gift goes back. Money first (one key per gift, so a second tap is the same refund), then the record.
        const id = String(req.body?.giftId || "");
        const snap = ID.test(id) ? await gifts().doc(id).get() : null;
        if (!snap?.exists) return fail(res, 404, "Unknown gift.");
        const g = snap.data();
        if (g.status === "refunded") return res.status(200).json({ ok: true, already: true, gift: adminGift(id, g) });
        if (g.status !== "paid") return fail(res, 409, "Only a paid gift can be refunded.");
        if (!g.paymentIntent) return fail(res, 409, "This gift has no card payment on record to refund. Refund it from your payment account.", "no_payment");
        try {
          await payments.refund({ mode: g.mode === "test" ? "test" : "live", paymentIntentId: g.paymentIntent, amountMinor: g.chargedMinor, metadata: { gift: id }, idempotencyKey: `gift-refund-${id}` });
        } catch (err) {
          console.error("giving: a refund was refused:", err?.message || err);
          return fail(res, 502, "The refund didn't go through, so nothing was changed. Try again in a moment.", "refund_failed");
        }
        const at = new Date(nowMs).toISOString();
        const changed = await db.runTransaction(async (tx) => {
          const fresh = await tx.get(gifts().doc(id));
          if (!fresh.exists || fresh.data()?.status !== "paid") return false;
          const fundId = fresh.data().fundraiserId;
          const fund = fundId ? await tx.get(fundraisers().doc(fundId)) : null;
          tx.set(gifts().doc(id), { status: "refunded", refundedAt: at, refundedBy: by, refundedMinor: g.chargedMinor, updatedAt: at }, { merge: true });
          // A refunded gift no longer counts toward its fundraiser, and leaves the wall.
          if (fund?.exists) {
            const f = fund.data();
            tx.set(fundraisers().doc(fundId), {
              raisedMinor: Math.max(0, (Number(f.raisedMinor) || 0) - (Number(fresh.data().amountMinor) || 0)), supporters: Math.max(0, (Number(f.supporters) || 0) - 1),
              wallEntries: wallWithout(Array.isArray(f.wallEntries) ? f.wallEntries : [], id), updatedAt: at,
            }, { merge: true });
          }
          return true;
        });
        const after = { ...g, ...((await gifts().doc(id).get()).data() || {}) };
        if (changed) await tellRefund(after);
        return res.status(200).json({ ok: true, already: !changed, gift: adminGift(id, after) });
      }
      return fail(res, 400, "Unknown request.");
    } catch (err) {
      console.error("giving: an owner action failed:", err?.message || err);
      return fail(res, 500, "Something went wrong on our side. Please try again in a moment.");
    }
  }

  return { handlePublic, handleAdmin, sweep, tellWebsite, featureOn, tipsTaken };
}

module.exports = { givingActions, PUBLIC_GIVING_ACTIONS, GIFT_PAGES_PER_HOUR, GIFT_PAGES_PER_EMAIL, FORM_MIN_SECONDS };
