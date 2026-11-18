// Updates to a fundraiser's supporters (Donations & tips G2c, Beta, 18 November 2026). Donations › Fundraiser › Write an
// update: the owner writes a subject and a message and the shop emails everyone who gave to that fundraiser (a paid gift;
// a refunded one no longer counts), once per address however many gifts they made. Running or ended fundraisers both
// can send (an ended one still has rewards to post and news to share). Admin only, through `givingAdmin`.
//
//   fundraiserUpdates/{id}            fundraiserId, title (the fundraiser's name then), subject, body, status, audience,
//                                     sent, failed, cursor, leaseUntil, failedRuns, lastError, createdAt, createdBy,
//                                     finishedAt (server only: no rule opens it)
//   fundraiserUpdates/{id}/sent/{h}   one per address it went to (h = optOutId, a hash, never the address), created
//                                     before sending, so a re-run or a second gift by the same person never mails twice
//
// Status: queued -> sending -> sent; cancelled by the owner; paused after repeated failures. Sending happens in the
// 15-minute sweep a page of gifts at a time under a lease, like the newsletter (newsletterSend.js), so a fundraiser with
// thousands of givers can't time out and two sweeps can't send the same update. One update per fundraiser at a time.
// Givers who unsubscribed from the shop's emails (`marketing-optout`) are skipped, and every email has the link.
"use strict";

const { isPausedRefusal } = require("./newsletterSend");

const MAX_SUBJECT = 150;
const MAX_BODY = 10000;
const PAGE = 200;
const MAX_SENDS_PER_RUN = 150;
const LEASE_MS = 10 * 60 * 1000;
const MAX_FAILED_RUNS = 5;
const MAX_LISTED = 10;
const ACTIVE = ["queued", "sending"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ID = /^[A-Za-z0-9_-]{6,40}$/;

const clean = (value, max) => String(value ?? "").replace(/\r\n?/g, "\n").trim().slice(0, max);
const french = (locale) => /^fr\b/i.test(String(locale || ""));

/** The update as the owner wrote it, trimmed to size. Pure. */
function updateDraft(input = {}) {
  return { subject: clean(input.subject, MAX_SUBJECT).replace(/\s+/g, " "), body: clean(input.body, MAX_BODY) };
}

/** Why this update can't be sent, in the owner's words, or "". Pure. */
function updateDraftProblem(draft) {
  if (!draft.subject) return "Give the update a subject line.";
  if (!draft.body) return "Write something in the update before sending it.";
  return "";
}

/** The address a gift's update goes to, or "" when it gets none (not paid, another fundraiser, no address). Pure. */
function updateRecipient(gift, fundraiserId) {
  if (!gift || gift.status !== "paid" || String(gift.fundraiserId || "") !== String(fundraiserId)) return "";
  const email = String(gift.customer?.email || "").trim().toLowerCase();
  return EMAIL.test(email) ? email : "";
}

/** How many people an update would reach now: paid givers, once per address, less those who unsubscribed. Pure. */
function updateAudience(gifts, fundraiserId, optedOut = new Set(), optOutId = (e) => e) {
  const seen = new Set();
  for (const g of gifts || []) {
    const email = updateRecipient(g, fundraiserId);
    if (email && !optedOut.has(optOutId(email))) seen.add(email);
  }
  return seen.size;
}

// The fixed words around the owner's message, in the giver's language (the gift keeps the browser's).
const WORDS = {
  en: {
    intro: (title, shop) => `${shop} has news about ${title}, which you supported.`,
    button: "See the fundraiser",
    why: (title, shop) => `You're getting this because you gave to ${title} at ${shop}.`,
    unsubscribe: "Unsubscribe",
  },
  fr: {
    intro: (title, shop) => `${shop} a des nouvelles de ${title}, que vous avez soutenu.`,
    button: "Voir la collecte",
    why: (title, shop) => `Vous recevez ce courriel parce que vous avez donné à ${title} chez ${shop}.`,
    unsubscribe: "Se désabonner",
  },
};

/**
 * One giver's email: the owner's subject and words (escaped: text, not HTML) in the shop's usual email frame, a button
 * to the Support page and the unsubscribe link. Pure.
 */
function updateEmail({ draft, title, layout = {}, locale = "", supportUrl, unsubscribeUrl, escapeHtml, risoLayout, risoButton }) {
  const say = french(locale) ? WORDS.fr : WORDS.en;
  const shop = String(layout.shopName || "").trim() || "the shop";
  const name = String(title || "").trim() || "the fundraiser";
  const html = risoLayout(`
    <p style="margin:0 0 12px;color:#555;font-size:13px;">${escapeHtml(say.intro(name, shop))}</p>
    <h2 style="margin:0 0 12px;">${escapeHtml(draft.subject)}</h2>
    <div style="margin:0 0 16px;white-space:pre-line;">${escapeHtml(draft.body)}</div>
    <div style="margin:16px 0 0;">${risoButton(escapeHtml(supportUrl), say.button, layout.accent, layout.theme)}</div>
    <p style="margin:28px 0 0;font-size:11px;color:#888;">${escapeHtml(say.why(name, shop))} <a href="${escapeHtml(unsubscribeUrl)}">${say.unsubscribe}</a></p>
  `, { ...layout, shopName: shop });
  return { subject: draft.subject, html };
}

/** What the admin sees of an update. Pure. */
const updateView = (id, d) => ({
  id, fundraiserId: d.fundraiserId || "", subject: d.subject || "", status: d.status || "queued", audience: Number(d.audience) || 0,
  sent: Number(d.sent) || 0, failed: Number(d.failed) || 0, createdAt: d.createdAt || "", finishedAt: d.finishedAt || "", lastError: d.lastError || "",
});

/**
 * Sends a page or more of the oldest active update. Called by the 15-minute sweep.
 * deps: { db, now?, listGifts(fundraiserId, afterId, limit) -> [{ id, data }], optedOutIds() -> Set, optOutId(email),
 *         sendEmail({ to, subject, html, bulk, kind }), escapeHtml, risoLayout, risoButton, layout() -> { shopName, logoUrl,
 *         accent, theme }, supportUrl, unsubscribeUrl(email), budgetMs? }
 */
async function runFundraiserUpdates(deps) {
  const { db } = deps;
  const now = deps.now ? deps.now() : Date.now();
  const started = Date.now();
  const budgetMs = deps.budgetMs ?? 60000;
  const snap = await db.collection("fundraiserUpdates").where("status", "in", ACTIVE).limit(10).get();
  const docs = snap.docs.slice().sort((a, b) => String(a.data().createdAt || "").localeCompare(String(b.data().createdAt || "")));
  if (!docs.length) return { update: null, sent: 0 };
  const ref = docs[0].ref;

  // Lease: only one sweep works on an update at a time.
  const job = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    const data = fresh.exists ? fresh.data() : null;
    if (!data || !ACTIVE.includes(data.status)) return null;
    if (data.leaseUntil && Date.parse(data.leaseUntil) > now) return null;
    tx.update(ref, { status: "sending", leaseUntil: new Date(now + LEASE_MS).toISOString() });
    return data;
  });
  if (!job) return { update: ref.id, sent: 0, skipped: "busy" };

  const draft = updateDraft(job);
  const optedOut = await deps.optedOutIds();
  const layout = await deps.layout();
  let cursor = String(job.cursor || "");
  let sent = 0, failed = 0, done = false, stop = false, paused = false;
  const finish = {};

  outer: while (sent < MAX_SENDS_PER_RUN && Date.now() - started < budgetMs) {
    const page = await deps.listGifts(job.fundraiserId, cursor, PAGE);
    for (const row of page) {
      if (sent >= MAX_SENDS_PER_RUN || Date.now() - started >= budgetMs) break outer;
      const email = updateRecipient(row.data, job.fundraiserId);
      const hashId = email ? deps.optOutId(email) : "";
      if (!email || optedOut.has(hashId)) { cursor = row.id; continue; }
      const claim = ref.collection("sent").doc(hashId);
      try {
        await claim.create({ at: new Date().toISOString() });
      } catch {
        cursor = row.id; // sent already: an earlier run, or another gift by the same person
        continue;
      }
      try {
        const message = updateEmail({
          draft, title: job.title, layout, locale: row.data.locale, supportUrl: deps.supportUrl, unsubscribeUrl: deps.unsubscribeUrl(email),
          escapeHtml: deps.escapeHtml, risoLayout: deps.risoLayout, risoButton: deps.risoButton,
        });
        await deps.sendEmail({ to: email, subject: message.subject, html: message.html, bulk: true, kind: "campaign-fundraiser-update" }); // the platform's newsletter stream (services/email/streams.js)
        sent += 1;
        cursor = row.id;
      } catch (err) {
        if (err?.permanent && !isPausedRefusal(err)) { failed += 1; cursor = row.id; continue; } // a bad address: keep the claim
        await claim.delete().catch(() => {});
        stop = true;
        paused = isPausedRefusal(err);
        finish.lastError = paused
          ? "Sending paused: too many people marked your emails as spam, or too many addresses bounced. Support will check with you, then it can carry on."
          : `The last try failed (${String(err?.message || err).slice(0, 200)}). It will try again in about 15 minutes.`;
        break outer;
      }
    }
    if (page.length < PAGE) { done = true; break; }
  }

  const at = new Date().toISOString();
  let status = "sending";
  if (done && !stop) { status = "sent"; Object.assign(finish, { finishedAt: at, failedRuns: 0, lastError: "" }); }
  else if (paused) status = "paused";
  else if (stop) {
    finish.failedRuns = (Number(job.failedRuns) || 0) + 1;
    if (finish.failedRuns >= MAX_FAILED_RUNS) {
      status = "paused";
      finish.lastError = `Sending stopped after ${MAX_FAILED_RUNS} failed tries in a row. Check Settings › Email sender, then press Carry on.`;
    }
  } else finish.failedRuns = 0;

  // Re-read the status: the owner may have stopped it while this run was sending.
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    const current = fresh.exists ? fresh.data().status : "";
    tx.update(ref, {
      sent: (Number(job.sent) || 0) + sent, failed: (Number(job.failed) || 0) + failed, cursor, leaseUntil: null, updatedAt: at,
      ...finish, status: current === "cancelled" ? "cancelled" : status,
    });
  });
  return { update: ref.id, sent, failed, status };
}

/**
 * The owner's update ops, answered by giving.js `handleAdmin`: "updateCount" | "updateTest" | "updateSend" |
 * "updateCancel" | "updateResume". `recent()` lists the last updates of each fundraiser for op "list".
 * deps: { db, countAudience(fundraiserId) -> number, sendEmail, escapeHtml, risoLayout, risoButton, layout(), supportUrl() -> url,
 *         unsubscribeLink() -> Promise<(email) => url>, now? }
 */
function fundraiserUpdateActions(deps) {
  const { db } = deps;
  const updates = () => db.collection("fundraiserUpdates");
  const nowIso = () => new Date(deps.now ? deps.now() : Date.now()).toISOString();
  const OPS = ["updateCount", "updateTest", "updateSend", "updateCancel", "updateResume"];

  /** The last few updates per fundraiser, newest first: { [fundraiserId]: UpdateView[] }. */
  async function recent() {
    const snap = await updates().limit(500).get();
    const out = {};
    for (const d of snap.docs.slice().sort((a, b) => String(b.data().createdAt || "").localeCompare(String(a.data().createdAt || "")))) {
      const v = updateView(d.id, d.data());
      const list = (out[v.fundraiserId] ||= []);
      if (list.length < MAX_LISTED) list.push(v);
    }
    return out;
  }

  /** Answers one op; returns false when the op isn't an update op. */
  async function handle(op, body, who, res, fundraiser) {
    if (!OPS.includes(op)) return false;
    const fundraiserId = String(body?.fundraiserId || "");
    if (!ID.test(fundraiserId)) { res.status(400).json({ error: "Which fundraiser?" }); return true; }
    const f = await fundraiser(fundraiserId);
    if (!f) { res.status(404).json({ error: "That fundraiser no longer exists." }); return true; }
    if (op === "updateCount") {
      res.status(200).json({ ok: true, audience: await deps.countAudience(fundraiserId) });
      return true;
    }
    if (op === "updateTest" || op === "updateSend") {
      const draft = updateDraft(body);
      const problem = updateDraftProblem(draft);
      if (problem) { res.status(400).json({ error: problem, code: draft.subject ? "body" : "subject" }); return true; }
      if (op === "updateTest") {
        const to = String(who.email || "").trim().toLowerCase();
        if (!EMAIL.test(to)) { res.status(400).json({ error: "Your sign-in has no email address to send the test to." }); return true; }
        const message = updateEmail({
          draft, title: f.title, layout: await deps.layout(), supportUrl: deps.supportUrl(), unsubscribeUrl: (await deps.unsubscribeLink())(to),
          escapeHtml: deps.escapeHtml, risoLayout: deps.risoLayout, risoButton: deps.risoButton,
        });
        await deps.sendEmail({ to, subject: `[Test] ${message.subject}`, html: message.html });
        res.status(200).json({ ok: true, to });
        return true;
      }
      const audience = await deps.countAudience(fundraiserId);
      if (!audience) { res.status(400).json({ error: "Nobody has given to this fundraiser yet, so there is no one to send the update to." }); return true; }
      const busy = "The last update is still sending. Wait for it to finish, or stop it, before sending another.";
      // Checked again and queued in one transaction: two Send presses at once would otherwise queue two updates.
      const activeQuery = updates().where("fundraiserId", "==", fundraiserId).where("status", "in", ACTIVE).limit(1);
      const doc = updates().doc();
      const at = nowIso();
      const record = {
        fundraiserId, title: String(f.title || "").slice(0, 120), ...draft, status: "queued", audience, sent: 0, failed: 0, cursor: "",
        failedRuns: 0, lastError: "", leaseUntil: null, createdAt: at, createdBy: String(who.email || who.uid || ""),
      };
      const queued = await db.runTransaction(async (tx) => {
        if (!(await tx.get(activeQuery)).empty) return false;
        tx.create(doc, record);
        return true;
      });
      if (!queued) { res.status(409).json({ error: busy, code: "busy" }); return true; }
      res.status(200).json({ ok: true, update: updateView(doc.id, record) });
      return true;
    }
    // updateCancel / updateResume
    const id = String(body?.id || "");
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) { res.status(400).json({ error: "Which update?" }); return true; }
    const ref = updates().doc(id);
    const answer = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.data().fundraiserId !== fundraiserId) return { status: 404, error: "That update no longer exists." };
      const status = snap.data().status;
      if (op === "updateCancel") {
        if (![...ACTIVE, "paused"].includes(status)) return { status: 409, error: "That update has already gone to everyone." };
        tx.update(ref, { status: "cancelled", cancelledAt: nowIso(), updatedAt: nowIso() });
        return { status: 200, view: updateView(id, { ...snap.data(), status: "cancelled" }) };
      }
      if (status !== "paused") return { status: 409, error: "Only a paused update can carry on." };
      tx.update(ref, { status: "queued", failedRuns: 0, lastError: "", leaseUntil: null, updatedAt: nowIso() });
      return { status: 200, view: updateView(id, { ...snap.data(), status: "queued", lastError: "" }) };
    });
    if (answer.status !== 200) { res.status(answer.status).json({ error: answer.error }); return true; }
    res.status(200).json({ ok: true, update: answer.view });
    return true;
  }

  return { handle, recent };
}

module.exports = {
  updateDraft, updateDraftProblem, updateRecipient, updateAudience, updateEmail, updateView, runFundraiserUpdates, fundraiserUpdateActions,
  MAX_SENDS_PER_RUN, MAX_SUBJECT, MAX_BODY, PAGE,
};
