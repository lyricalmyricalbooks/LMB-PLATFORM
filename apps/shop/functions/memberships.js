// Memberships & subscriptions (beta; LMB-PLATFORM tasks/todo/2026-11-18-memberships-m1.md). The owner makes plans
// (monthly or yearly, an optional free trial); a signed-in customer joins on the shop's own card page in subscription
// mode, and the card provider charges them every period. The member ends it from their account (perks last to the end of
// the paid period), takes that back, or gives a new card. The owner can end one at once.
//
// On only while both switches are: the platform's (`platform/features` › `ways.memberships`, the control room) and the
// owner's (`firstWeek/start` › `ways.memberships`). Square shops wait for M4: the payments module has no subscriptions
// there, and joining says so.
//
// Records, all server-only (no rule opens them; the admin reads through `membershipsAdmin`):
//   membershipPlans/{id}   a plan (shared/membershipRules `cleanPlan`) with createdAt/updatedAt
//   memberships/{id}       one membership: `customer { email, name, uid }`, the plan as it was when they joined, `state`
//                          (shared/membershipRules MemberState), `mode` (test or live, the account its subscription lives in),
//                          `sessions` (its card pages), `subscription`, `stripeCustomer`, `periodEnd`, `trialEnd`, `card`,
//                          `cardSessions` (pages that save a new card), `checkAfter` (when the sweep reads it again) and
//                          the emails it was sent (`welcomedAt`, `failedEmailedFor`, `endingEmailedFor`, `endedEmailedAt`)
//
// The provider decides: every change of state comes from reading the subscription again (memberSubscription), whether a
// subscription event arrived (`onEvent`), the member opened their account, or the sweep found `checkAfter` passed. The
// sweep reads each live membership at least once a day and soon after its paid period ends, so a missed event only makes
// a change slower, never wrong.
//
// Public actions (through validateDiscountCode, rate limited): membershipInfo (no sign-in), membershipJoin,
// membershipMine, membershipCancel, membershipResume, membershipCard (signed in with a verified email). Owner ops go
// through createStripeCheckoutSession `action: "membershipsAdmin"`. `sweep()` runs every 5 minutes (bookingSweep).
"use strict";

const crypto = require("crypto");
const { cleanPlan, memberState, mayJoin, planPriceWords, hasPerks, cleanBoxAddress, MAX_PLANS, MAX_MEMBER_PERCENT, BOX_COUNTRIES } = require("./shared/membershipRules");
const { waysOn } = require("./shared/waysToSell");

const PUBLIC_MEMBERSHIP_ACTIONS = Object.freeze(["membershipInfo", "membershipJoin", "membershipMine", "membershipCancel", "membershipResume", "membershipCard", "membershipPage", "membershipAddress"]);
const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;
/** How long a card page stays open. */
const PAGE_MINUTES = 60;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** Card pages one person may open in an hour (join or new card). */
const PAGES_PER_HOUR = 6;
const MAX_LISTED = 500;
const ID = /^[A-Za-z0-9_-]{6,40}$/;
const SESSION_ID = /^cs_[A-Za-z0-9_]+$/;
const LIVE = ["trial", "active", "ending", "pastDue"];
/** How often a membership's invoices are read again without an invoice event (the daily check against the provider). */
const PAYMENTS_EVERY = 20 * HOUR;
/** Payments kept on one membership (ten years of monthly payments). */
const MAX_PAYMENTS = 120;

/**
 * The membership's saved payments with the provider's invoices folded in: only paid invoices with money and a paid time,
 * one per invoice id (the provider's copy wins), oldest first, the newest MAX_PAYMENTS. Pure.
 */
function mergePayments(saved, invoices) {
  const byId = new Map();
  for (const p of Array.isArray(saved) ? saved : []) if (p && p.id) byId.set(p.id, p);
  for (const inv of Array.isArray(invoices) ? invoices : []) {
    if (!inv || !inv.id || inv.status !== "paid" || !inv.paidAt) continue;
    const amountMinor = Math.round(Number(inv.amountMinor) || 0);
    if (amountMinor <= 0) continue;
    byId.set(inv.id, { id: String(inv.id), amountMinor, currency: String(inv.currency || "").toUpperCase(), paidAt: inv.paidAt, periodEnd: inv.periodEnd || "" });
  }
  return [...byId.values()].sort((a, b) => String(a.paidAt).localeCompare(String(b.paidAt))).slice(-MAX_PAYMENTS);
}

const fail = (res, status, error, code) => res.status(status).json({ error, ...(code ? { code } : {}) });
const french = (locale) => /^fr\b/i.test(String(locale || ""));
const dateWords = (iso, locale) => (iso ? new Intl.DateTimeFormat(french(locale) ? "fr-CA" : "en-CA", { dateStyle: "long" }).format(new Date(iso)) : "");

const WORDS = {
  en: {
    welcomeSubject: (shop) => `Welcome to ${shop}'s membership`,
    welcome: (plan, shop) => `You're now a member of ${shop}: ${plan}.`,
    trial: (date) => `Your free trial runs until ${date}. Your first payment is taken then.`,
    next: (date) => `Your next payment is on ${date}.`,
    failedSubject: (shop) => `Your ${shop} membership payment didn't go through`,
    failed: "We couldn't take this period's payment from your card. We'll try again over the next few days; you keep your membership meanwhile. To avoid losing it, add a new card.",
    endingSubject: (shop) => `Your ${shop} membership is ending`,
    ending: (date) => `Your membership won't renew. You keep everything it gives you until ${date}. Changed your mind? You can keep it from your account before then.`,
    endedSubject: (shop) => `Your ${shop} membership has ended`,
    ended: "Your membership has ended and no more payments will be taken. Thank you for being a member.",
    button: "Open your membership",
    cardButton: "Add a new card",
  },
  fr: {
    welcomeSubject: (shop) => `Bienvenue parmi les membres de ${shop}`,
    welcome: (plan, shop) => `Vous êtes maintenant membre de ${shop} : ${plan}.`,
    trial: (date) => `Votre essai gratuit dure jusqu'au ${date}. Le premier paiement sera pris à cette date.`,
    next: (date) => `Votre prochain paiement est le ${date}.`,
    failedSubject: (shop) => `Le paiement de votre abonnement à ${shop} n'a pas fonctionné`,
    failed: "Nous n'avons pas pu prélever le paiement de cette période sur votre carte. Nous réessaierons dans les prochains jours; vous gardez votre abonnement d'ici là. Pour ne pas le perdre, ajoutez une nouvelle carte.",
    endingSubject: (shop) => `Votre abonnement à ${shop} prend fin`,
    ending: (date) => `Votre abonnement ne sera pas renouvelé. Vous gardez tous ses avantages jusqu'au ${date}. Vous avez changé d'idée? Vous pouvez le garder depuis votre compte d'ici là.`,
    endedSubject: (shop) => `Votre abonnement à ${shop} est terminé`,
    ended: "Votre abonnement est terminé et aucun autre paiement ne sera pris. Merci d'avoir été membre.",
    button: "Ouvrir votre abonnement",
    cardButton: "Ajouter une nouvelle carte",
  },
};

/** A plan as anyone sees it. */
const publicPlan = (id, p, currency) => ({ id, name: p.name, description: p.description || "", perks: p.perks || [], interval: p.interval, priceMinor: p.priceMinor, trialDays: p.trialDays || 0, memberPercent: percentOf(p), currency, ...(p.box ? { box: p.box } : {}) });
/** The address the card page took (Stripe's older and newer places for it), cleaned; null when there is none (M3a). */
function sessionAddress(session) {
  const ship = session?.collected_information?.shipping_details || session?.shipping_details || null;
  if (!ship?.address) return null;
  return cleanBoxAddress({ name: ship.name, ...ship.address });
}
/** A plan's member price percent (M2a), 0 when it has none or it isn't a whole 1 to 50. */
const percentOf = (p) => (Number.isInteger(p?.memberPercent) && p.memberPercent > 0 && p.memberPercent <= MAX_MEMBER_PERCENT ? p.memberPercent : 0);
/** A membership as its member sees it (never ids of the provider or keys). */
const memberView = (id, m) => ({
  id, state: m.state || "pending", plan: m.plan || null, periodEnd: m.periodEnd || "", trialEnd: m.trialEnd || "", card: m.card || null,
  startedAt: m.startedAt || "", endedAt: m.endedAt || "", test: m.mode === "test", cardPending: (m.cardSessions || []).some((c) => !c.done),
  ...(m.box ? { box: true, address: m.address || null } : {}),
});
/** A membership as the owner sees it. */
const adminMember = (id, m) => ({ ...memberView(id, m), name: m.customer?.name || "", email: m.customer?.email || "", planId: m.planId || "", createdAt: m.createdAt || "", checkedAt: m.checkedAt || "" });

/** When the sweep should read a membership again: soon after its paid period ends, and at least daily. Pure. */
function nextCheck(state, periodEnd, nowMs) {
  if (state === "ended") return null;
  if (state === "pending") return new Date(nowMs + PAGE_MINUTES * MINUTE).toISOString();
  if (state === "pastDue") return new Date(nowMs + 6 * HOUR).toISOString();
  const end = Date.parse(periodEnd || "");
  const soonAfterEnd = Number.isFinite(end) ? end + HOUR : Infinity;
  return new Date(Math.max(nowMs + 15 * MINUTE, Math.min(soonAfterEnd, nowMs + DAY))).toISOString();
}

function membershipActions({
  db, requireAdmin, identify, payments, shopTestMode, hitLimit, LIMITS, siteLink, shopName = () => "", currency,
  sendEmail = async () => {}, emailBrand = async () => ({}), ownerEmail = () => "",
  escapeHtml, risoLayout, risoButton, now = () => new Date(),
  randomId = () => crypto.randomBytes(12).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 16).padEnd(8, "0"),
}) {
  const plans = () => db.collection("membershipPlans");
  const members = () => db.collection("memberships");
  const accountUrl = (query = "") => siteLink(`/account/membership${query}`);

  async function featureOn() {
    const [features, start] = await Promise.all([
      db.collection("platform").doc("features").get().catch(() => null),
      db.collection("firstWeek").doc("start").get().catch(() => null),
    ]);
    return waysOn(features?.exists ? features.data() : null, start?.exists ? start.data() : null).includes("memberships");
  }
  /** The card account of one mode, and its subscriptions (null on a provider that has none yet). */
  async function account(mode) {
    const checkout = await payments.standaloneCheckout(mode === "test" ? "test" : "live");
    return { checkout, subscriptions: checkout?.subscriptions || null };
  }
  async function currentMode() { return (await shopTestMode()) ? "test" : "live"; }

  // The website shows its Membership link from `settings/website.membershipsLive` (a hint only; every action checks).
  async function tellWebsite() {
    try {
      const live = await featureOn();
      const ref = db.collection("settings").doc("website");
      const snap = await ref.get();
      if (snap.exists && (snap.data().membershipsLive === true) !== live) await ref.set({ membershipsLive: live }, { merge: true });
      return live;
    } catch (err) {
      console.warn("memberships: the website link wasn't updated:", err?.message || err);
      return null;
    }
  }

  async function listPlans({ hidden = false } = {}) {
    const snap = await plans().limit(50).get();
    return snap.docs.map((d) => ({ id: d.id, data: d.data() }))
      .filter((p) => hidden || p.data.hidden !== true)
      .sort((a, b) => (a.data.priceMinor - b.data.priceMinor) || String(a.data.createdAt || "").localeCompare(String(b.data.createdAt || "")));
  }

  // ── Emails ─────────────────────────────────────────────────────────────────────────────────────────────────────

  async function tellMember(kind, m) {
    try {
      const say = french(m.locale) ? WORDS.fr : WORDS.en;
      const brand = await emailBrand();
      const shop = String(brand.shopName || shopName() || "").trim() || "the shop";
      const planLine = m.plan ? `${m.plan.name} (${planPriceWords(m.plan.priceMinor, m.plan.interval, m.plan.currency, french(m.locale) ? "fr-CA" : "en-CA")})` : "";
      const p = (t) => `<p style="margin:0 0 12px;">${escapeHtml(t)}</p>`;
      let subject, body, button = say.button, link = accountUrl();
      if (kind === "welcome") {
        subject = say.welcomeSubject(shop);
        body = p(say.welcome(planLine, shop)) + (m.state === "trial" && m.trialEnd ? p(say.trial(dateWords(m.trialEnd, m.locale))) : m.periodEnd ? p(say.next(dateWords(m.periodEnd, m.locale))) : "");
      } else if (kind === "failed") {
        subject = say.failedSubject(shop); body = p(say.failed); button = say.cardButton; link = accountUrl("?card=1");
      } else if (kind === "ending") {
        subject = say.endingSubject(shop); body = p(say.ending(dateWords(m.periodEnd, m.locale)));
      } else {
        subject = say.endedSubject(shop); body = p(say.ended);
      }
      const html = risoLayout(`<h2 style="margin:0 0 12px;">${escapeHtml(subject)}</h2>${body}<div style="margin:16px 0 0;">${risoButton(escapeHtml(link), button, brand.accent, brand.theme)}</div>`, { ...brand, shopName: shop });
      await sendEmail({ to: m.customer.email, subject: m.mode === "test" ? `[TEST] ${subject}` : subject, html, queue: `membership-${kind}` });
    } catch (err) {
      console.warn(`memberships: the ${kind} email wasn't sent:`, err?.message || err);
    }
  }
  async function tellOwner(m) {
    const to = ownerEmail();
    if (!to) return;
    const line = `${m.customer.name || m.customer.email} joined ${m.plan?.name || "a plan"}.`;
    await sendEmail({ to, subject: `${m.mode === "test" ? "[TEST] " : ""}[MEMBER] New member: ${m.plan?.name || ""}`.trim(), html: risoLayout(`<p>${escapeHtml(line)}</p><p>${risoButton(escapeHtml(siteLink("/admin#members")), "Open Members")}</p>`, {}) }).catch(() => {});
  }

  // ── Reading the provider ───────────────────────────────────────────────────────────────────────────────────────

  /**
   * Writes what the provider says about a membership's subscription and sends the email the change calls for, once.
   * Returns the membership as saved.
   */
  async function apply(id, sub) {
    const nowMs = now().getTime();
    const at = new Date(nowMs).toISOString();
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(members().doc(id));
      if (!snap.exists) return null;
      const before = snap.data();
      const state = memberState(sub.status, sub.cancelAtPeriodEnd);
      const fields = {
        state, subscription: sub.id, stripeCustomer: sub.customer || before.stripeCustomer || "", periodEnd: sub.periodEnd || before.periodEnd || "",
        trialEnd: sub.trialEnd || "", card: sub.card || before.card || null, checkedAt: at, checkAfter: nextCheck(state, sub.periodEnd, nowMs), updatedAt: at,
        ...(state !== "pending" && !before.startedAt ? { startedAt: at } : {}),
        ...(state === "ended" && !before.endedAt ? { endedAt: sub.endedAt || at } : {}),
      };
      // Each email once: welcome on starting, failed once per period, ending once per period, ended once.
      const emails = [];
      if (state !== "pending" && state !== "ended" && !before.welcomedAt) { emails.push("welcome"); fields.welcomedAt = at; }
      if (state === "pastDue" && before.failedEmailedFor !== fields.periodEnd) { emails.push("failed"); fields.failedEmailedFor = fields.periodEnd; }
      if (state === "ending" && before.endingEmailedFor !== fields.periodEnd) { emails.push("ending"); fields.endingEmailedFor = fields.periodEnd; }
      if (state === "ended" && before.startedAt && !before.endedEmailedAt) { emails.push("ended"); fields.endedEmailedAt = at; }
      tx.set(members().doc(id), fields, { merge: true });
      return { m: { ...before, ...fields }, emails, joined: !before.startedAt && state !== "pending" && state !== "ended" };
    });
    if (!result) return null;
    for (const kind of result.emails) await tellMember(kind, result.m);
    if (result.joined) await tellOwner(result.m);
    return result.m;
  }

  /** A pending membership whose card page was finished: its subscription. */
  async function fromSessions(id, m, acc) {
    for (const sid of (m.sessions || []).slice(-5)) {
      if (!SESSION_ID.test(sid)) continue;
      const session = await acc.checkout.read(sid).catch(() => null);
      if (!session || (session.metadata?.membership && session.metadata.membership !== id) || session.status !== "complete") continue;
      const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (!subId) continue;
      const sub = await acc.subscriptions.read(subId);
      if (sub && sub.metadata?.membership && sub.metadata.membership !== id) continue;
      if (!sub) continue;
      // A box plan's card page took the address the boxes go to (M3a); the member can change it later.
      const address = m.box && !m.address ? sessionAddress(session) : null;
      if (address) await members().doc(id).set({ address, updatedAt: now().toISOString() }, { merge: true });
      return apply(id, sub);
    }
    return null;
  }

  /** New cards from finished card pages go onto the subscription. */
  async function takeNewCards(id, m, acc) {
    const open = (m.cardSessions || []).filter((c) => !c.done && SESSION_ID.test(c.id));
    if (!open.length || !m.subscription) return m;
    let card = null;
    const done = new Set();
    for (const c of open) {
      const saved = await acc.checkout.savedCard(c.id).catch(() => null);
      if (saved?.paymentMethod) {
        await acc.subscriptions.setCard(m.subscription, saved.paymentMethod);
        card = { brand: saved.brand, last4: saved.last4 };
        done.add(c.id);
      } else if (Date.parse(c.at || "") + PAGE_MINUTES * MINUTE < now().getTime()) done.add(c.id);
    }
    if (!done.size) return m;
    const cardSessions = (m.cardSessions || []).map((c) => (done.has(c.id) ? { ...c, done: true } : c)).slice(-10);
    await members().doc(id).set({ cardSessions, ...(card ? { card } : {}), updatedAt: now().toISOString() }, { merge: true });
    return { ...m, cardSessions, ...(card ? { card } : {}) };
  }

  /**
   * The membership's paid invoices, kept on it for the money pages (`payments`). Read when an invoice event arrived
   * (`force`), else at most every PAYMENTS_EVERY, so the daily sweep checks each live membership against the provider.
   * Never throws: a failed read keeps what was saved.
   */
  async function recordPayments(id, m, acc, force) {
    if (!acc.subscriptions?.invoices || !m.subscription) return m;
    const nowMs = now().getTime();
    if (!force && Date.parse(m.paymentsReadAt || "") + PAYMENTS_EVERY > nowMs) return m;
    try {
      const invoices = await acc.subscriptions.invoices(m.subscription, 24);
      const fields = { payments: mergePayments(m.payments, invoices), paymentsReadAt: new Date(nowMs).toISOString() };
      await members().doc(id).set(fields, { merge: true });
      return { ...m, ...fields };
    } catch (err) {
      console.warn(`memberships: couldn't read the payments of ${id}:`, err?.message || err);
      return m;
    }
  }

  /** Reads one membership again from the provider. Never throws: a failed read keeps what was saved. */
  async function refresh(id, m, { invoices = false } = {}) {
    try {
      const acc = await account(m.mode);
      if (!acc.subscriptions) return m;
      if (m.state === "pending" && !m.subscription) {
        const started = await fromSessions(id, m, acc);
        return started ? recordPayments(id, started, acc, true) : m;
      }
      if (!m.subscription) return m;
      const withCard = await takeNewCards(id, m, acc);
      const sub = await acc.subscriptions.read(m.subscription);
      const saved = sub ? (await apply(id, sub)) || withCard : withCard;
      return recordPayments(id, saved, acc, invoices);
    } catch (err) {
      console.warn(`memberships: couldn't read ${id}:`, err?.message || err);
      return m;
    }
  }

  /** A subscription or invoice event (stripeWebhook): reads that membership again. Ignores anything else. */
  async function onEvent(event) {
    const type = String(event?.type || "");
    if (!/^(customer\.subscription\.|invoice\.)/.test(type)) return false;
    const object = event.data?.object || {};
    const subId = type.startsWith("invoice.")
      ? (typeof object.subscription === "string" ? object.subscription : object.subscription?.id || object.parent?.subscription_details?.subscription || "")
      : object.id;
    if (!/^sub_[A-Za-z0-9_]+$/.test(String(subId || ""))) return false;
    const snap = await members().where("subscription", "==", subId).limit(1).get();
    if (snap.empty) return false;
    await refresh(snap.docs[0].id, snap.docs[0].data(), { invoices: type.startsWith("invoice.") });
    return true;
  }

  /** Pending pages nobody finished are closed; live memberships due a read are read. Runs whatever the switches say. */
  async function sweep() {
    const nowMs = now().getTime();
    const snap = await members().where("checkAfter", "<=", new Date(nowMs).toISOString()).limit(50).get();
    let read = 0, closed = 0;
    for (const doc of snap.docs) {
      let m = doc.data();
      m = await refresh(doc.id, m);
      read += 1;
      if (m.state === "pending" && Date.parse(m.createdAt || "") + PAGE_MINUTES * MINUTE <= nowMs) {
        const acc = await account(m.mode).catch(() => null);
        for (const sid of m.sessions || []) if (SESSION_ID.test(sid)) await acc?.checkout?.close(sid).catch(() => {});
        if (acc?.subscriptions && (await fromSessions(doc.id, m, acc).catch(() => null))) continue;
        await members().doc(doc.id).set({ state: "ended", neverStarted: true, checkAfter: null, endedAt: new Date(nowMs).toISOString(), updatedAt: new Date(nowMs).toISOString() }, { merge: true });
        closed += 1;
      }
    }
    return { read, closed };
  }

  // ── Members (validateDiscountCode actions) ─────────────────────────────────────────────────────────────────────

  async function mine(email) {
    const snap = await members().where("customer.email", "==", email).limit(20).get();
    return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  }

  async function handlePublic(req, res) {
    const action = req.body?.action;
    res.set("Cache-Control", "private, no-store");
    if (!(await hitLimit(db, "membership", req, LIMITS.membership))) return fail(res, 429, "Too many tries. Please wait a few minutes and try again.");
    try {
      const nowMs = now().getTime();
      if (action === "membershipInfo") {
        if (!(await featureOn())) return res.status(200).json({ on: false });
        const acc = await account(await currentMode());
        return res.status(200).json({ on: true, currency: currency(), ready: !!acc.subscriptions, plans: (await listPlans()).map((p) => publicPlan(p.id, p.data, currency())) });
      }
      if (action === "membershipPage") {
        // A members-only page (M2b): status "members", which no rule lets a shopper read. Anyone learns its title (for
        // the "for members" box); only a signed-in member with perks in this mode gets its words.
        const slug = String(req.body?.slug || "").toLowerCase();
        if (!SLUG.test(slug) || !(await featureOn())) return fail(res, 404, "There's no page here.", "not_found");
        const found = await db.collection("pages").where("slug", "==", slug).where("status", "==", "members").limit(1).get();
        const doc = found.docs[0];
        if (!doc) return fail(res, 404, "There's no page here.", "not_found");
        const p = doc.data();
        const viewer = await identify(req);
        const member = viewer?.email ? await hasMembership(viewer.email, (await currentMode()) === "test") : false;
        const shown = { id: doc.id, slug, title: String(p.title || "") };
        if (!member) return res.status(200).json({ locked: true, signedIn: !!viewer?.email, page: shown });
        return res.status(200).json({ locked: false, page: { ...shown, body: String(p.body || ""), seoTitle: p.seoTitle || "", metaDescription: p.metaDescription || "", updatedAt: p.updatedAt || "" } });
      }
      const who = await identify(req);
      if (!who?.email) return fail(res, 401, "Please sign in to your account first.", "sign_in");

      if (action === "membershipMine") {
        // A member's own account works even after the shop stops taking new members.
        const rows = await mine(who.email);
        const out = [];
        for (const r of rows) {
          // Never read yet (no checkedAt) counts as stale: a page just finished must show at once.
          const stale = r.data.state !== "ended" && !(Date.parse(r.data.checkedAt || "") + 5 * MINUTE >= nowMs);
          const m = stale || (r.data.cardSessions || []).some((c) => !c.done) ? await refresh(r.id, r.data) : r.data;
          if (!m.neverStarted) out.push(memberView(r.id, m));
        }
        out.sort((a, b) => (a.state === "ended") - (b.state === "ended") || String(b.startedAt).localeCompare(String(a.startedAt)));
        return res.status(200).json({ memberships: out, currency: currency() });
      }

      if (action === "membershipJoin") {
        if (!(await featureOn())) return fail(res, 409, "This shop isn't taking new members right now.", "off");
        const planId = String(req.body?.planId || "");
        const planSnap = ID.test(planId) ? await plans().doc(planId).get() : null;
        if (!planSnap?.exists || planSnap.data().hidden === true) return fail(res, 404, "That plan isn't available any more. Reload the page to see the plans.", "plan");
        const plan = planSnap.data();
        // One membership at a time: refresh what they have first, so a lapsed one doesn't block them.
        const existing = [];
        for (const r of await mine(who.email)) existing.push((await refresh(r.id, r.data)).state || "pending");
        if (!mayJoin(existing)) return fail(res, 409, "You're already a member. You can see your membership in your account.", "member");
        if (!(await hitLimit(db, "membershipPage", req, { max: PAGES_PER_HOUR, windowMs: HOUR }, { key: `member:${who.email}` }))) {
          return fail(res, 429, "You've tried several times in a short while. Please wait an hour and try again.", "too_many");
        }
        const mode = await currentMode();
        const acc = await account(mode);
        if (!acc.subscriptions) return fail(res, 409, "This shop can't take membership payments yet. Please contact the shop.", "not_available");
        const id = randomId();
        const at = new Date(nowMs).toISOString();
        const record = {
          planId, plan: { name: plan.name, interval: plan.interval, priceMinor: plan.priceMinor, trialDays: plan.trialDays || 0, currency: currency() },
          customer: { email: who.email, name: String(who.name || "").slice(0, 100), uid: who.uid || "" }, state: "pending", mode, sessions: [], cardSessions: [],
          locale: french(req.body?.locale) ? "fr" : "en", createdAt: at, updatedAt: at, checkAfter: nextCheck("pending", "", nowMs),
          ...(plan.box ? { box: true } : {}),
        };
        await members().doc(id).set(record);
        const shop = shopName();
        const name = `${shop ? `${shop}: ` : ""}${plan.name}`.slice(0, 250);
        const metadata = { membership: id };
        let session;
        try {
          session = await acc.checkout.open({
            // No client_reference_id: that names an order, and the webhook's order path must never see this page.
            mode: "subscription", customer_email: who.email, metadata,
            expires_at: Math.floor(nowMs / 1000) + PAGE_MINUTES * 60,
            success_url: accountUrl(`?joined=${encodeURIComponent(id)}`), cancel_url: siteLink("/membership"),
            line_items: [{ quantity: 1, price_data: { currency: currency().toLowerCase(), unit_amount: plan.priceMinor, recurring: { interval: plan.interval }, product_data: { name } } }],
            subscription_data: { description: name, metadata, ...(plan.trialDays ? { trial_period_days: plan.trialDays } : {}) },
            // A plan that ships a box asks where to send it, on the provider's own page (M3a).
            ...(plan.box ? { shipping_address_collection: { allowed_countries: [...BOX_COUNTRIES] } } : {}),
          }, `membership-${id}`);
        } catch (err) {
          await members().doc(id).set({ state: "ended", neverStarted: true, checkAfter: null, updatedAt: now().toISOString() }, { merge: true });
          if (["test_only", "not_connected", "not_available"].includes(err?.code)) return fail(res, 409, "This shop can't take membership payments yet. Please contact the shop.", "not_available");
          throw err;
        }
        await members().doc(id).set({ sessions: [session.id] }, { merge: true });
        return res.status(200).json({ url: session.url, id });
      }

      // The member's own membership: cancel, resume, new card.
      const id = String(req.body?.id || "");
      const snap = ID.test(id) ? await members().doc(id).get() : null;
      if (!snap?.exists || snap.data().customer?.email !== who.email) return fail(res, 404, "We couldn't find that membership.", "not_found");
      const m = snap.data();
      if (action === "membershipAddress") {
        // Where the boxes go (M3a): only on a box membership that hasn't ended.
        if (!m.box || m.state === "ended") return fail(res, 409, "That membership doesn't send boxes.", "state");
        const address = cleanBoxAddress(req.body?.address);
        if (!address) return fail(res, 400, "Enter a full address in Canada or the United States.", "address");
        await members().doc(id).set({ address, updatedAt: now().toISOString() }, { merge: true });
        return res.status(200).json({ membership: memberView(id, { ...m, address }) });
      }
      const acc = await account(m.mode);
      if (!acc.subscriptions || !m.subscription) return fail(res, 409, "That membership can't be changed right now. Please contact the shop.", "not_available");
      if (action === "membershipCancel") {
        if (!["trial", "active", "pastDue"].includes(m.state)) return fail(res, 409, m.state === "ending" ? "Your membership is already set to end." : "That membership has ended.", "state");
        const saved = await apply(id, await acc.subscriptions.cancelAtEnd(m.subscription));
        return res.status(200).json({ membership: memberView(id, saved || m) });
      }
      if (action === "membershipResume") {
        if (m.state !== "ending") return fail(res, 409, "That membership isn't set to end.", "state");
        const saved = await apply(id, await acc.subscriptions.resume(m.subscription));
        return res.status(200).json({ membership: memberView(id, saved || m) });
      }
      if (action === "membershipCard") {
        if (m.state === "ended" || !m.stripeCustomer) return fail(res, 409, "That membership has ended.", "state");
        if (!(await hitLimit(db, "membershipPage", req, { max: PAGES_PER_HOUR, windowMs: HOUR }, { key: `member:${who.email}` }))) {
          return fail(res, 429, "You've tried several times in a short while. Please wait an hour and try again.", "too_many");
        }
        const n = (m.cardSessions || []).length + 1;
        const session = await acc.checkout.open({
          mode: "setup", currency: currency().toLowerCase(), customer: m.stripeCustomer, metadata: { membership: id },
          expires_at: Math.floor(nowMs / 1000) + PAGE_MINUTES * 60,
          success_url: accountUrl(`?card=${encodeURIComponent(id)}`), cancel_url: accountUrl(),
          setup_intent_data: { description: "New card for your membership", metadata: { membership: id } },
        }, `membership-card-${id}-${n}`);
        const cardSessions = [...(m.cardSessions || []), { id: session.id, at: new Date(nowMs).toISOString(), done: false }].slice(-10);
        await members().doc(id).set({ cardSessions, updatedAt: new Date(nowMs).toISOString() }, { merge: true });
        return res.status(200).json({ url: session.url });
      }
      return fail(res, 400, "Unknown request.");
    } catch (err) {
      console.error("memberships: a member's action failed:", err?.message || err);
      return fail(res, 500, "Something went wrong on our side. Please try again in a moment.");
    }
  }

  // ── The owner (createStripeCheckoutSession action "membershipsAdmin") ──────────────────────────────────────────

  async function handleAdmin(req, res) {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;
    const op = req.body?.op;
    try {
      if (op === "hint") return res.status(200).json({ ok: true, membershipsLive: (await tellWebsite()) === true });
      if (!(await featureOn())) return fail(res, 403, "Memberships aren't turned on for this shop.", "off");
      const at = now().toISOString();
      if (op === "list") {
        const [allPlans, rows] = await Promise.all([listPlans({ hidden: true }), members().limit(MAX_LISTED).get()]);
        const list = rows.docs.filter((d) => !d.data().neverStarted).map((d) => adminMember(d.id, d.data()))
          .sort((a, b) => (a.state === "ended") - (b.state === "ended") || String(b.startedAt || b.createdAt).localeCompare(String(a.startedAt || a.createdAt)));
        const counted = list.filter((x) => !x.test && LIVE.includes(x.state));
        const monthly = counted.reduce((s, x) => s + (x.plan ? (x.plan.interval === "year" ? Math.round(x.plan.priceMinor / 12) : x.plan.priceMinor) : 0), 0);
        const perPlan = Object.fromEntries(allPlans.map((p) => [p.id, counted.filter((x) => x.planId === p.id).length]));
        const acc = await account(await currentMode());
        return res.status(200).json({
          currency: currency(), ready: !!acc.subscriptions, plans: allPlans.map((p) => ({ ...publicPlan(p.id, p.data, currency()), hidden: p.data.hidden === true, members: perPlan[p.id] || 0 })),
          members: list, totals: { members: counted.length, monthlyMinor: monthly, pastDue: counted.filter((x) => x.state === "pastDue").length },
        });
      }
      if (op === "payments") {
        // Every membership payment, for Bookkeeping and the Tax centre (no names or emails: the books never need them).
        const rows = await members().limit(MAX_LISTED).get();
        const payments = [];
        for (const d of rows.docs) {
          const m = d.data();
          for (const p of Array.isArray(m.payments) ? m.payments : []) {
            payments.push({ id: p.id, membershipId: d.id, plan: m.plan?.name || "", amountMinor: p.amountMinor, currency: p.currency || currency(), paidAt: p.paidAt, test: m.mode === "test" });
          }
        }
        return res.status(200).json({ currency: currency(), payments });
      }
      if (op === "savePlan") {
        const clean = cleanPlan(req.body?.plan);
        if ("problem" in clean) return fail(res, 400, clean.problem, clean.field);
        const asked = String(req.body?.id || "");
        if (asked) {
          if (!ID.test(asked)) return fail(res, 404, "Unknown plan.");
          const snap = await plans().doc(asked).get();
          if (!snap.exists) return fail(res, 404, "Unknown plan.");
          // A plan's price and how often it is paid are fixed once made: members joined at that price. The owner makes a
          // new plan (and hides the old one) to change them.
          const before = snap.data();
          if (before.priceMinor !== clean.plan.priceMinor || before.interval !== clean.plan.interval) {
            return fail(res, 409, "A plan's price and how often it is paid can't change after it is made, because members joined at that price. Make a new plan and hide this one.", "price");
          }
          // `box: null` takes a box off (a merge would keep the old one).
          await plans().doc(asked).set({ ...clean.plan, box: clean.plan.box || null, updatedAt: at }, { merge: true });
          // A box added to a plan people already joined: their memberships send boxes too, and each member is asked for
          // an address in their account (M3a).
          if (clean.plan.box && !before.box) {
            const joined = await members().where("planId", "==", asked).limit(MAX_LISTED).get();
            await Promise.all(joined.docs.filter((d) => d.data().state !== "ended" && !d.data().box).map((d) => members().doc(d.id).set({ box: true, updatedAt: at }, { merge: true })));
          }
          return res.status(200).json({ ok: true, id: asked });
        }
        if ((await plans().limit(MAX_PLANS + 1).get()).size >= MAX_PLANS) return fail(res, 409, `A shop can have up to ${MAX_PLANS} plans. Hide one you no longer need instead.`, "too_many");
        const id = randomId();
        await plans().doc(id).set({ ...clean.plan, createdAt: at, updatedAt: at });
        return res.status(200).json({ ok: true, id });
      }
      if (op === "endNow") {
        const id = String(req.body?.id || "");
        const snap = ID.test(id) ? await members().doc(id).get() : null;
        if (!snap?.exists) return fail(res, 404, "Unknown membership.");
        const m = snap.data();
        if (m.state === "ended") return fail(res, 409, "That membership has already ended.");
        const acc = await account(m.mode);
        if (!acc.subscriptions || !m.subscription) return fail(res, 409, "That membership can't be changed right now.");
        const saved = await apply(id, await acc.subscriptions.endNow(m.subscription));
        await members().doc(id).set({ endedBy: adminUser.email || "admin" }, { merge: true });
        return res.status(200).json({ ok: true, member: adminMember(id, saved || m) });
      }
      if (op === "refresh") {
        const id = String(req.body?.id || "");
        const snap = ID.test(id) ? await members().doc(id).get() : null;
        if (!snap?.exists) return fail(res, 404, "Unknown membership.");
        return res.status(200).json({ ok: true, member: adminMember(id, await refresh(id, snap.data())) });
      }
      return fail(res, 400, "Unknown request.");
    } catch (err) {
      console.error("memberships: an owner's action failed:", err?.message || err);
      return fail(res, 500, "That didn't save just now. Please try again.");
    }
  }

  // ── Member prices (M2a) ────────────────────────────────────────────────────────────────────────────────────────

  /**
   * The member price one membership gives right now, or null: Memberships is on, the membership has its perks (trial,
   * active, ending or a payment being retried), it lives in the same mode as the checkout (a test membership never lowers
   * a real order's prices) and its plan still exists (its percent may be 0: Free for members still counts). Read again on every pricing, so a membership that ends
   * after checkout claimed it stops counting at once.
   */
  async function priceFor(membershipId, testMode) {
    if (typeof membershipId !== "string" || !ID.test(membershipId)) return null;
    const snap = await members().doc(membershipId).get();
    const m = snap.exists ? snap.data() : null;
    if (!m || !hasPerks(m.state) || (m.mode === "test") !== (testMode === true) || !m.planId) return null;
    const plan = await plans().doc(String(m.planId)).get();
    const percent = plan.exists ? percentOf(plan.data()) : 0;
    // A plan with no percent still counts: its members get products marked Free for members (M2b).
    if (!plan.exists || !(await featureOn())) return null;
    return { membershipId, percent, plan: String(plan.data().name || "") };
  }
  /** Whether this customer has a membership with perks in this mode (members-only pages, M2b). */
  async function hasMembership(email, testMode) {
    return (await mine(email)).some((r) => hasPerks(r.data.state) && (r.data.mode === "test") === (testMode === true));
  }
  /** The signed-in customer's membership that gives the best member price in this mode, or null. */
  async function bestFor(email, testMode) {
    let best = null;
    for (const r of await mine(email)) {
      const price = await priceFor(r.id, testMode);
      if (price && (!best || price.percent > best.percent)) best = price;
    }
    return best;
  }

  return { handlePublic, handleAdmin, sweep, onEvent, featureOn, tellWebsite, priceFor, bestFor, hasMembership };
}

module.exports = { membershipActions, PUBLIC_MEMBERSHIP_ACTIONS, nextCheck, mergePayments, PAGE_MINUTES };
