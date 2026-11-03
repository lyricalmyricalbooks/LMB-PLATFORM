// Customers › Newsletter: the owner writes a newsletter and the shop sends it to everyone on the mailing list who
// confirmed (newsletter.js `mayMail`) and hasn't unsubscribed (`marketing-optout`). Admin only.
//
//   newsletterIssues/{id}            subject, body, buttonText, buttonUrl, status, audience, sent, skipped, failed,
//                                    cursor, leaseUntil, failedRuns, lastError, createdAt, createdBy, finishedAt
//   newsletterIssues/{id}/sent/{h}   one per address it went to (h = optOutId, a hash, never the address), created
//                                    before sending, so a re-run or a second sweep never mails anyone twice
//
// Status: queued -> sending -> sent; cancelled by the owner; paused after repeated failures or when the platform
// paused this shop's newsletters (too many spam reports or bounces). A paused issue resumes from where it stopped.
//
// Sending happens in the 15-minute sweep (runNewsletterIssues), a page at a time under a lease, never in the
// browser's request, so a list of thousands can't time out and two sweeps can't send the same issue at once.
// Newsletters skip the press's own Gmail (bulk: its daily cap is low and bulk mail from a personal account risks it)
// and go through the platform's newsletter stream (or the shop's own Resend key), with an unsubscribe link.

const { mayMail } = require("./newsletter");

const MAX_SUBJECT = 150;
const MAX_BODY = 20000;
const MAX_BUTTON_TEXT = 40;
const PAGE = 100;
const MAX_SENDS_PER_RUN = 250;
const LEASE_MS = 10 * 60 * 1000;
const MAX_FAILED_RUNS = 5;
const ACTIVE = ["queued", "sending"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const clean = (value, max) => String(value ?? "").replace(/\r\n?/g, "\n").trim().slice(0, max);

/** The newsletter as the owner wrote it, trimmed to size. Pure. */
function newsletterDraft(input = {}) {
  return {
    subject: clean(input.subject, MAX_SUBJECT).replace(/\s+/g, " "),
    body: clean(input.body, MAX_BODY),
    buttonText: clean(input.buttonText, MAX_BUTTON_TEXT).replace(/\s+/g, " "),
    buttonUrl: clean(input.buttonUrl, 2000),
  };
}

/** Why this draft can't be sent, in the owner's words, or "". Pure. */
function newsletterDraftProblem(draft) {
  if (!draft.subject) return "Give the newsletter a subject line.";
  if (!draft.body) return "Write something in the newsletter before sending it.";
  if (draft.buttonText && !draft.buttonUrl) return "Add the web address the button opens, or clear the button words.";
  if (draft.buttonUrl && !/^https:\/\/[^\s<>"']+$/i.test(draft.buttonUrl)) return "The button's web address must start with https://.";
  return "";
}

/**
 * The email for one person. The owner's words are escaped (they are text, not HTML) and placed in the shop's
 * usual email frame by compileEmailTemplate; {{shop_name}} still works because braces survive escaping.
 */
function newsletterEmail(draft, { compileEmailTemplate, notificationSettings = {}, escapeHtml, unsubscribeUrl }) {
  const settings = {
    ...notificationSettings,
    newsletter: {
      subject: draft.subject,
      body: escapeHtml(draft.body),
      buttonText: draft.buttonUrl ? escapeHtml(draft.buttonText || "Read more") : "",
      signoff: "{{shop_name}}",
    },
  };
  const footer = `<p style="margin-top:28px;font-size:11px;color:#888;">You're getting this because you signed up for news from {{shop_name}}. `
    + `<a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe</a> at any time.</p>`;
  const compiled = compileEmailTemplate("newsletter", settings, { button_url: draft.buttonUrl }, footer);
  const shopName = escapeHtml(String(settings.shopName || "").trim());
  return { subject: compiled.subject, html: compiled.html.replace(/\{\{\s*shop_name\s*\}\}/g, shopName || "us") };
}

/** True when the platform refused because this shop's newsletters are paused (services/email/reputation.js). */
const isPausedRefusal = err => /newsletter is paused|newsletter-paused/i.test(String(err?.message || err || ""));

/** Who may be mailed: a confirmed address that hasn't unsubscribed. */
function mailable(record, optedOut, optOutId) {
  const email = String(record?.email || "").trim().toLowerCase();
  return mayMail(record) && EMAIL.test(email) && !optedOut.has(optOutId(email)) ? email : "";
}

/**
 * Sends a page or more of one active issue. Called by the 15-minute sweep.
 * deps: { db, now, listSubscribers(afterId, limit) -> [{ id, data }], optedOutIds() -> Set, optOutId(email),
 *         sendEmail({ to, subject, html, bulk, kind }) (never `queue`: this run retries itself, the outbox must not), compileEmailTemplate, notificationSettings, escapeHtml,
 *         unsubscribeUrl(email), budgetMs }
 */
async function runNewsletterIssues(deps) {
  const { db } = deps;
  const now = deps.now ? deps.now() : Date.now();
  const started = Date.now();
  const budgetMs = deps.budgetMs ?? 60000;
  const snap = await db.collection("newsletterIssues").where("status", "in", ACTIVE).limit(10).get();
  const docs = snap.docs.slice().sort((a, b) => String(a.data().createdAt || "").localeCompare(String(b.data().createdAt || "")));
  if (!docs.length) return { issue: null, sent: 0 };
  const ref = docs[0].ref;

  // Lease: only one sweep works on an issue at a time.
  const issue = await db.runTransaction(async tx => {
    const fresh = await tx.get(ref);
    const data = fresh.exists ? fresh.data() : null;
    if (!data || !ACTIVE.includes(data.status)) return null;
    if (data.leaseUntil && Date.parse(data.leaseUntil) > now) return null;
    tx.update(ref, { status: "sending", leaseUntil: new Date(now + LEASE_MS).toISOString(), ...(data.startedAt ? {} : { startedAt: new Date(now).toISOString() }) });
    return data;
  });
  if (!issue) return { issue: ref.id, sent: 0, skipped: "busy" };

  const draft = newsletterDraft(issue);
  const optedOut = await deps.optedOutIds();
  let cursor = String(issue.cursor || "");
  let sent = 0, skipped = 0, failed = 0, done = false, stop = "";
  const finish = {};

  outer: while (sent < MAX_SENDS_PER_RUN && Date.now() - started < budgetMs) {
    const page = await deps.listSubscribers(cursor, PAGE);
    for (const row of page) {
      if (sent >= MAX_SENDS_PER_RUN || Date.now() - started >= budgetMs) break outer;
      const email = mailable(row.data, optedOut, deps.optOutId);
      if (!email) { cursor = row.id; skipped += 1; continue; }
      const claim = ref.collection("sent").doc(deps.optOutId(email));
      try {
        await claim.create({ at: new Date().toISOString() });
      } catch {
        cursor = row.id; // already sent by an earlier run
        continue;
      }
      try {
        const message = newsletterEmail(draft, { ...deps, unsubscribeUrl: deps.unsubscribeUrl(email) });
        await deps.sendEmail({ to: email, subject: message.subject, html: message.html, bulk: true, kind: "newsletter" });
        sent += 1;
        cursor = row.id;
      } catch (err) {
        if (err?.permanent && !isPausedRefusal(err)) {
          // A bad address: no retry can fix it. Keep the claim so it isn't tried again.
          failed += 1;
          cursor = row.id;
          continue;
        }
        await claim.delete().catch(() => {});
        stop = isPausedRefusal(err) ? "paused" : "failed";
        finish.lastError = isPausedRefusal(err)
          ? "Sending paused: too many people marked your newsletters as spam, or too many addresses bounced. Support will check your list with you, then sending can resume."
          : `The last try failed (${String(err?.message || err).slice(0, 200)}). It will try again in about 15 minutes.`;
        break outer;
      }
    }
    if (page.length < PAGE) { done = true; break; }
  }

  const counts = {
    sent: (Number(issue.sent) || 0) + sent,
    skipped: (Number(issue.skipped) || 0) + skipped,
    failed: (Number(issue.failed) || 0) + failed,
  };
  const at = new Date().toISOString();
  let status = "sending";
  if (done && !stop) {
    Object.assign(finish, { finishedAt: at, failedRuns: 0, lastError: "" });
    status = "sent";
  } else if (stop === "paused") status = "paused";
  else if (stop === "failed") {
    finish.failedRuns = (Number(issue.failedRuns) || 0) + 1;
    if (finish.failedRuns >= MAX_FAILED_RUNS) {
      status = "paused";
      finish.lastError = `Sending stopped after ${MAX_FAILED_RUNS} failed tries in a row. Check Settings › Email sender, then press Resume.`;
    }
  } else finish.failedRuns = 0;

  // Re-read the status: the owner may have cancelled while this run was sending.
  await db.runTransaction(async tx => {
    const fresh = await tx.get(ref);
    const current = fresh.exists ? fresh.data().status : "";
    tx.update(ref, { ...counts, cursor, leaseUntil: null, updatedAt: at, ...finish, status: current === "cancelled" ? "cancelled" : status });
  });
  return { issue: ref.id, sent, skipped, failed, status };
}

/**
 * The admin action `newsletterAdmin` on createStripeCheckoutSession: op "audience" | "test" | "send" | "cancel" | "resume".
 * deps: { db, requireAdmin, readBody?, countAudience() -> number, sendEmail, compileEmailTemplate, loadNotificationSettings,
 *         escapeHtml, unsubscribeLink() -> Promise<(email) => url>, recordAudit?(text), now? }
 */
function newsletterAdminActions(deps) {
  const { db } = deps;
  const nowIso = () => new Date(deps.now ? deps.now() : Date.now()).toISOString();

  async function handleNewsletterAdmin(req, res) {
    const who = await deps.requireAdmin(req, res);
    if (!who) return;
    const body = req.body || {};
    const op = String(body.op || "");
    try {
      if (op === "audience") {
        res.status(200).json({ audience: await deps.countAudience() });
        return;
      }
      if (op === "test" || op === "send") {
        const draft = newsletterDraft(body);
        const problem = newsletterDraftProblem(draft);
        if (problem) { res.status(400).json({ error: problem }); return; }
        if (op === "test") {
          const to = String(who.email || "").trim().toLowerCase();
          if (!EMAIL.test(to)) { res.status(400).json({ error: "Your sign-in has no email address to send the test to." }); return; }
          const message = newsletterEmail(draft, { ...deps, notificationSettings: await deps.loadNotificationSettings(), unsubscribeUrl: (await deps.unsubscribeLink())(to) });
          await deps.sendEmail({ to, subject: `[Test] ${message.subject}`, html: message.html, bulk: true });
          res.status(200).json({ ok: true, to });
          return;
        }
        const busy = "A newsletter is still sending. Wait for it to finish, or cancel it, before sending another.";
        const activeQuery = db.collection("newsletterIssues").where("status", "in", ACTIVE).limit(1);
        if (!(await activeQuery.get()).empty) { res.status(409).json({ error: busy }); return; }
        const audience = await deps.countAudience();
        if (!audience) { res.status(400).json({ error: "Nobody on your mailing list has confirmed yet, so there is no one to send to." }); return; }
        // Checked again and queued in one transaction: two Send presses at once (two tabs, a retried request) would
        // otherwise both find nothing sending and queue two issues, and everyone would get the newsletter twice.
        const doc = db.collection("newsletterIssues").doc();
        const queued = await db.runTransaction(async tx => {
          if (!(await tx.get(activeQuery)).empty) return false;
          tx.create(doc, {
            ...draft, status: "queued", audience, sent: 0, skipped: 0, failed: 0, cursor: "", failedRuns: 0, lastError: "",
            leaseUntil: null, createdAt: nowIso(), createdBy: String(who.email || who.uid || ""),
          });
          return true;
        });
        if (!queued) { res.status(409).json({ error: busy }); return; }
        if (deps.recordAudit) await deps.recordAudit(`Queued newsletter "${draft.subject}" for ${audience} subscriber${audience === 1 ? "" : "s"}`).catch(() => {});
        res.status(200).json({ ok: true, id: doc.id, audience });
        return;
      }
      if (op === "cancel" || op === "resume") {
        const id = String(body.id || "");
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) { res.status(400).json({ error: "Which newsletter?" }); return; }
        const ref = db.collection("newsletterIssues").doc(id);
        const answer = await db.runTransaction(async tx => {
          const snap = await tx.get(ref);
          if (!snap.exists) return { status: 404, error: "That newsletter no longer exists." };
          const status = snap.data().status;
          if (op === "cancel") {
            if (![...ACTIVE, "paused"].includes(status)) return { status: 409, error: "That newsletter has already finished." };
            tx.update(ref, { status: "cancelled", cancelledAt: nowIso(), updatedAt: nowIso() });
          } else {
            if (status !== "paused") return { status: 409, error: "Only a paused newsletter can be resumed." };
            tx.update(ref, { status: "queued", failedRuns: 0, lastError: "", leaseUntil: null, updatedAt: nowIso() });
          }
          return { status: 200 };
        });
        if (answer.status !== 200) { res.status(answer.status).json({ error: answer.error }); return; }
        if (deps.recordAudit) await deps.recordAudit(`${op === "cancel" ? "Cancelled" : "Resumed"} newsletter ${id}`).catch(() => {});
        res.status(200).json({ ok: true });
        return;
      }
      res.status(400).json({ error: "Unknown newsletter action." });
    } catch (err) {
      console.error("newsletterAdmin failed:", err);
      res.status(500).json({ error: `The newsletter could not be ${op === "test" ? "sent as a test" : "saved"}: ${String(err?.message || err).slice(0, 200)}` });
    }
  }

  return { handleNewsletterAdmin };
}

/** How many people a newsletter would reach now. */
function audienceCount(records, optedOut, optOutId) {
  const seen = new Set();
  for (const record of records) {
    const email = mailable(record, optedOut, optOutId);
    if (email) seen.add(email);
  }
  return seen.size;
}

module.exports = {
  newsletterDraft, newsletterDraftProblem, newsletterEmail, runNewsletterIssues, newsletterAdminActions, audienceCount, isPausedRefusal,
  MAX_SENDS_PER_RUN, MAX_FAILED_RUNS, PAGE,
};
