// The yearly giving summary (Donations & tips G3b, Beta, 18 November 2026). A registered charity's givers get one email in
// January listing every tax receipt the shop issued them for gifts received the year before, with the total, so they
// have it all in one place at tax time. On while the shop has tax receipts on and Donations › Amounts & choices ›
// "Email each giver a summary of the year's gifts in January" is ticked (`yearlySummary`, on unless off).
//
//   givingYearly/{year}             status, cursor, sent, failed, leaseUntil, failedRuns, lastError, startedAt,
//                                   finishedAt (server only: no rule opens it)
//   givingYearly/{year}/sent/{h}    one per address it went to (h = optOutId, a hash, never the address), created before
//                                   sending, so a re-run or a giver with several gifts is never mailed twice
//
// The 15-minute sweep starts the year's run on the shop's first January day it runs, then walks the gifts with a receipt
// for that year a page at a time under a lease (like fundraiserUpdates.js). For each new address it reads that giver's
// receipts for the year and sends one email. Only issued receipts count (a cancelled or replaced one is left out, its
// replacement is in), never a test gift's. Givers who unsubscribed from the shop's emails are skipped. The run stops for
// good at the end of January; a year with no receipts sends nothing.
"use strict";

const { isPausedRefusal } = require("./newsletterSend");
const { receiptAddressLine } = require("./shared/charityReceipts");

const PAGE = 200;
const MAX_SENDS_PER_RUN = 150;
const LEASE_MS = 10 * 60 * 1000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ACTIVE = ["queued", "sending"];

const french = (locale) => /^fr\b/i.test(String(locale || ""));
const moneyWords = (minor, currency, locale) => new Intl.NumberFormat(french(locale) ? "fr-CA" : "en-CA", { style: "currency", currency: String(currency || "CAD").toUpperCase() }).format(minor / 100);

/**
 * The year whose summary is due on the shop day `today` (YYYY-MM-DD), or 0: January only, tax receipts on, the yearly
 * summary not switched off. Pure.
 */
function summaryYear(settings, today) {
  if (!settings || !settings.charity || settings.yearlySummary === false) return 0;
  if (!/^\d{4}-01-\d{2}$/.test(String(today || ""))) return 0;
  return Number(today.slice(0, 4)) - 1;
}

/** The address a gift's summary goes to, or "": a paid or refunded gift with an issued, real receipt for `year`. Pure. */
function summaryRecipient(gift, year) {
  const r = gift?.receipt;
  if (!r || r.status !== "issued" || r.test || Number(r.year) !== Number(year) || gift.mode === "test") return "";
  const email = String(gift.customer?.email || "").trim().toLowerCase();
  return EMAIL.test(email) ? email : "";
}

/** One giver's receipts for the year, oldest gift first, and their totals per currency. Pure. */
function summaryOf(gifts, year, email) {
  const receipts = (gifts || [])
    .filter((g) => summaryRecipient(g, year) === email)
    .map((g) => g.receipt)
    .sort((a, b) => String(a.receivedOn).localeCompare(String(b.receivedOn)) || String(a.number).localeCompare(String(b.number)));
  const totals = {};
  for (const r of receipts) {
    const c = String(r.currency || "CAD").toUpperCase();
    totals[c] = (totals[c] || 0) + (Number(r.eligibleMinor) || 0);
  }
  const locale = (gifts || []).find((g) => summaryRecipient(g, year) === email && g.locale)?.locale || "";
  return { receipts, totals, locale };
}

const WORDS = {
  en: {
    subject: (year, shop) => `Your ${year} tax receipts from ${shop}`,
    heading: (year) => `Your gifts in ${year}`,
    intro: (year, shop) => `Thank you for supporting ${shop} in ${year}. Here are the tax receipts we issued you, all in one place for tax time.`,
    receipt: "Receipt", received: "Gift received", amount: "Eligible amount", total: "Total",
    keep: "Each receipt was sent to you when you gave. This summary lists them; keep the receipts themselves for your records.",
    charityNo: { ca: "Charity registration number", us: "Tax ID (EIN)" },
    why: (shop) => `You're getting this because you gave to ${shop} and asked for a tax receipt.`,
    unsubscribe: "Unsubscribe",
  },
  fr: {
    subject: (year, shop) => `Vos reçus fiscaux ${year} de ${shop}`,
    heading: (year) => `Vos dons en ${year}`,
    intro: (year, shop) => `Merci d'avoir soutenu ${shop} en ${year}. Voici les reçus fiscaux que nous vous avons remis, réunis pour la période des impôts.`,
    receipt: "Reçu", received: "Don reçu le", amount: "Montant admissible", total: "Total",
    keep: "Chaque reçu vous a été envoyé au moment du don. Ce résumé les énumère; gardez les reçus eux-mêmes pour vos dossiers.",
    charityNo: { ca: "Numéro d'enregistrement de l'organisme", us: "Numéro fiscal (EIN)" },
    why: (shop) => `Vous recevez ce courriel parce que vous avez donné à ${shop} et demandé un reçu fiscal.`,
    unsubscribe: "Se désabonner",
  },
};

/** One giver's summary email, in the shop's usual frame. Pure. */
function summaryEmail({ year, summary, charity, layout = {}, unsubscribeUrl, escapeHtml, risoLayout }) {
  const say = french(summary.locale) ? WORDS.fr : WORDS.en;
  const shop = String(layout.shopName || "").trim() || String(charity?.name || "") || "the charity";
  const money = (minor, currency) => escapeHtml(moneyWords(minor, currency, summary.locale));
  const cell = "padding:6px 8px;border-bottom:1px solid #ddd;text-align:left;";
  const rows = summary.receipts.map((r) => `<tr><td style="${cell}">${escapeHtml(r.number)}</td><td style="${cell}">${escapeHtml(r.receivedOn)}</td><td style="${cell}text-align:right;">${money(r.eligibleMinor, r.currency)}</td></tr>`).join("");
  const totals = Object.entries(summary.totals).map(([c, m]) => `<tr><td style="${cell}font-weight:bold;" colspan="2">${say.total}</td><td style="${cell}text-align:right;font-weight:bold;">${money(m, c)}</td></tr>`).join("");
  const kind = charity?.kind === "us" ? "us" : "ca";
  const donor = summary.receipts[summary.receipts.length - 1];
  const donorLine = donor ? [donor.name, receiptAddressLine(donor.address)].filter(Boolean).join(", ") : "";
  const html = risoLayout(`
    <h2 style="margin:0 0 12px;">${escapeHtml(say.heading(year))}</h2>
    <p style="margin:0 0 16px;">${escapeHtml(say.intro(year, shop))}</p>
    ${donorLine ? `<p style="margin:0 0 12px;">${escapeHtml(donorLine)}</p>` : ""}
    <table style="width:100%;border-collapse:collapse;margin:0 0 16px;font-size:14px;">
      <thead><tr><th style="${cell}">${say.receipt}</th><th style="${cell}">${say.received}</th><th style="${cell}text-align:right;">${say.amount}</th></tr></thead>
      <tbody>${rows}${totals}</tbody>
    </table>
    ${charity ? `<p style="margin:0 0 4px;">${escapeHtml(charity.name)}, ${escapeHtml(charity.address)}</p><p style="margin:0 0 12px;"><strong>${say.charityNo[kind]}:</strong> ${escapeHtml(charity.number)}</p>` : ""}
    <p style="margin:0 0 0;font-size:12px;color:#555;">${escapeHtml(say.keep)}</p>
    <p style="margin:28px 0 0;font-size:11px;color:#888;">${escapeHtml(say.why(shop))} <a href="${escapeHtml(unsubscribeUrl)}">${say.unsubscribe}</a></p>
  `, { ...layout, shopName: shop });
  return { subject: say.subject(year, shop), html };
}

/**
 * Starts or carries on the year's summary. Called by the 15-minute sweep.
 * deps: { db, today() -> YYYY-MM-DD (shop day), settings() -> cleaned giving settings, listGifts(year, afterId, limit) ->
 *         [{ id, data }], giverGifts(year, email) -> [gift data], optedOutIds() -> Set, optOutId(email), sendEmail,
 *         escapeHtml, risoLayout, layout(), unsubscribeUrl(email), budgetMs? }
 */
async function runYearlySummary(deps) {
  const { db } = deps;
  const started = Date.now();
  const budgetMs = deps.budgetMs ?? 45000;
  const today = deps.today();
  const settings = await deps.settings();
  const year = summaryYear(settings, today);
  if (!year) return { year: 0, sent: 0 };
  const ref = db.collection("givingYearly").doc(String(year));
  const nowMs = Date.now();

  // Start the year once, then lease it: only one sweep works on it at a time.
  const job = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    const data = fresh.exists ? fresh.data() : null;
    if (!data) {
      const record = { year, status: "sending", cursor: "", sent: 0, failed: 0, failedRuns: 0, lastError: "", startedAt: new Date(nowMs).toISOString(), leaseUntil: new Date(nowMs + LEASE_MS).toISOString() };
      tx.create(ref, record);
      return record;
    }
    if (!ACTIVE.includes(data.status)) return null;
    if (data.leaseUntil && Date.parse(data.leaseUntil) > nowMs) return null;
    tx.update(ref, { status: "sending", leaseUntil: new Date(nowMs + LEASE_MS).toISOString() });
    return data;
  });
  if (!job) return { year, sent: 0, skipped: "done-or-busy" };

  const optedOut = await deps.optedOutIds();
  const layout = await deps.layout();
  let cursor = String(job.cursor || "");
  let sent = 0, failed = 0, done = false, stop = false;
  const finish = {};

  outer: while (sent < MAX_SENDS_PER_RUN && Date.now() - started < budgetMs) {
    const page = await deps.listGifts(year, cursor, PAGE);
    for (const row of page) {
      if (sent >= MAX_SENDS_PER_RUN || Date.now() - started >= budgetMs) break outer;
      const email = summaryRecipient(row.data, year);
      const hashId = email ? deps.optOutId(email) : "";
      if (!email || optedOut.has(hashId)) { cursor = row.id; continue; }
      const claim = ref.collection("sent").doc(hashId);
      try {
        await claim.create({ at: new Date().toISOString() });
      } catch {
        cursor = row.id; // this giver already has theirs
        continue;
      }
      try {
        const summary = summaryOf(await deps.giverGifts(year, email), year, email);
        if (!summary.receipts.length) { cursor = row.id; continue; }
        const message = summaryEmail({ year, summary, charity: settings.charity, layout, unsubscribeUrl: deps.unsubscribeUrl(email), escapeHtml: deps.escapeHtml, risoLayout: deps.risoLayout });
        // A tax summary is something the giver needs: the orders stream, not the newsletter one (services/email/streams.js).
        await deps.sendEmail({ to: email, subject: message.subject, html: message.html, bulk: true, kind: "giving-yearly-summary" });
        sent += 1;
        cursor = row.id;
      } catch (err) {
        if (err?.permanent && !isPausedRefusal(err)) { failed += 1; cursor = row.id; continue; }
        await claim.delete().catch(() => {});
        stop = true;
        finish.lastError = isPausedRefusal(err)
          ? "Sending is paused by the email service for now. It will try again in about 15 minutes."
          : `The last try failed (${String(err?.message || err).slice(0, 200)}). It will try again in about 15 minutes.`;
        break outer;
      }
    }
    if (page.length < PAGE) { done = true; break; }
  }

  // A failed run simply tries again at the next sweep; January's end stops it for good (summaryYear).
  const at = new Date().toISOString();
  const status = done && !stop ? "sent" : "sending";
  if (status === "sent") Object.assign(finish, { finishedAt: at, failedRuns: 0, lastError: "" });
  else finish.failedRuns = stop ? (Number(job.failedRuns) || 0) + 1 : 0;
  await ref.update({ sent: (Number(job.sent) || 0) + sent, failed: (Number(job.failed) || 0) + failed, cursor, leaseUntil: null, updatedAt: at, status, ...finish });
  return { year, sent, failed, status };
}

module.exports = { summaryYear, summaryRecipient, summaryOf, summaryEmail, runYearlySummary, MAX_SENDS_PER_RUN, PAGE };
