// "Tell buyers" after a new version of a download (Digital D2b, Beta, 17 November 2026). Books › edit › Digital product ›
// Tell buyers about a new version: the owner adds an optional note and the shop emails everyone who bought the product
// their download links again. Admin only.
//
//   digitalUpdates/{id}              bookId, title, note, status, audience, sent, skipped, failed, cursor, leaseUntil,
//                                    failedRuns, lastError, createdAt, createdBy, finishedAt (server only: no rule)
//   digitalUpdates/{id}/sent/{order} one per order it went to, created before sending, so a re-run never mails twice
//
// Status: queued -> sending -> sent; cancelled by the owner; paused after repeated failures. Sending happens in the
// 15-minute sweep a page of orders at a time under a lease, like the newsletter (newsletterSend.js), so a product with
// thousands of buyers can't time out and two sweeps can't send the same job. One job per product at a time.

const { deliveryCandidates, downloadRefusal } = require("./digitalDelivery");

const MAX_NOTE = 2000;
const PAGE = 200;
const MAX_SENDS_PER_RUN = 150;
const LEASE_MS = 10 * 60 * 1000;
const MAX_FAILED_RUNS = 5;
const ACTIVE = ["queued", "sending"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ID = /^[A-Za-z0-9_-]{1,128}$/;

const cleanNote = (value) => String(value ?? "").replace(/\r\n?/g, "\n").trim().slice(0, MAX_NOTE);

/**
 * The download lines an order holds for `bookId`, when that order may still download (paid, not cancelled, no open
 * dispute) and isn't a test: [{ itemId, variantId }] once each, or [] when the order gets no email. `isDigital(variantId, hit)`
 * says whether that edition downloads (a printed edition of the same product gets no email). Pure.
 */
function updateLines(order, bookId, isDigital = () => true) {
  if (!order || order.isTest || order.sandboxPayment || order.practiceOrder) return [];
  if (downloadRefusal(order)) return [];
  const email = String(order.customer?.email || order.email || "").trim();
  if (!EMAIL.test(email) || !order.downloadToken) return [];
  const seen = new Set();
  const out = [];
  for (const hit of deliveryCandidates(order, String(bookId), "")) {
    if (!isDigital(String(hit.variantId || ""), hit)) continue; // a printed edition of the same product gets no email
    const key = `${hit.bookId}|${hit.variantId || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ itemId: String(hit.bookId), variantId: String(hit.variantId || "") });
  }
  return out;
}

/** How many orders a job for `bookId` would email now. Pure. */
function updateAudience(orders, bookId, isDigital) {
  return (orders || []).filter((o) => updateLines(o, bookId, isDigital).length > 0).length;
}

/**
 * One buyer's email: the product's name, the owner's note (escaped: text, not HTML) and a link per download line.
 * `linkFor(orderId, order, line)` gives the download link (the same one as the order email). Pure.
 */
function updateEmail({ title, note, order, orderId, lines, shopName, escapeHtml, linkFor }) {
  const name = escapeHtml(String(title || "your download"));
  const shop = escapeHtml(String(shopName || "").trim() || "the shop");
  const buttons = lines.map((line) => `<p style="margin:10px 0;"><a href="${escapeHtml(linkFor(orderId, order, line))}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;font-size:14px;font-weight:bold;">Download the new version</a></p>`).join("");
  const words = note ? `<p style="margin:16px 0;white-space:pre-line;">${escapeHtml(note)}</p>` : "";
  return {
    subject: `A new version of ${String(title || "your download").slice(0, 120)} is ready`,
    html: `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:560px;">
<p style="margin:0 0 12px;">Hello${order?.customer?.name ? ` ${escapeHtml(String(order.customer.name).split(" ")[0])}` : ""},</p>
<p style="margin:0 0 12px;">${shop} has put up a new version of <strong>${name}</strong>, which you bought. It's ready to download now, at no cost.</p>
${words}${buttons}
<p style="margin:16px 0 0;font-size:12px;color:#666;">You're getting this because you bought ${name} from ${shop}. Your earlier copy still works.</p>
</div>`,
  };
}

/**
 * Sends a page or more of one active job. Called by the 15-minute sweep.
 * deps: { db, now?, listOrders(afterId, limit) -> [{ id, data }], sendEmail({ to, subject, html, bulk }), escapeHtml,
 *         shopName, linkFor(orderId, order, line), digitalCheck(bookId) -> (variantId, hit) => boolean, budgetMs? }
 */
async function runDigitalUpdates(deps) {
  const { db } = deps;
  const now = deps.now ? deps.now() : Date.now();
  const started = Date.now();
  const budgetMs = deps.budgetMs ?? 60000;
  const snap = await db.collection("digitalUpdates").where("status", "in", ACTIVE).limit(10).get();
  const docs = snap.docs.slice().sort((a, b) => String(a.data().createdAt || "").localeCompare(String(b.data().createdAt || "")));
  if (!docs.length) return { job: null, sent: 0 };
  const ref = docs[0].ref;

  const job = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    const data = fresh.exists ? fresh.data() : null;
    if (!data || !ACTIVE.includes(data.status)) return null;
    if (data.leaseUntil && Date.parse(data.leaseUntil) > now) return null;
    tx.update(ref, { status: "sending", leaseUntil: new Date(now + LEASE_MS).toISOString() });
    return data;
  });
  if (!job) return { job: ref.id, sent: 0, skipped: "busy" };

  const isDigital = deps.digitalCheck ? await deps.digitalCheck(job.bookId) : () => true;
  let cursor = String(job.cursor || "");
  let sent = 0, failed = 0, done = false, stop = false;
  const finish = {};

  outer: while (sent < MAX_SENDS_PER_RUN && Date.now() - started < budgetMs) {
    const page = await deps.listOrders(cursor, PAGE);
    for (const row of page) {
      if (sent >= MAX_SENDS_PER_RUN || Date.now() - started >= budgetMs) break outer;
      const lines = updateLines(row.data, job.bookId, isDigital);
      if (!lines.length) { cursor = row.id; continue; }
      const claim = ref.collection("sent").doc(String(row.id));
      try {
        await claim.create({ at: new Date().toISOString() });
      } catch {
        cursor = row.id; // an earlier run sent this one
        continue;
      }
      try {
        const message = updateEmail({ title: job.title, note: job.note, order: row.data, orderId: row.id, lines, shopName: deps.shopName, escapeHtml: deps.escapeHtml, linkFor: deps.linkFor });
        const to = String(row.data.customer?.email || row.data.email).trim();
        await deps.sendEmail({ to, subject: message.subject, html: message.html, bulk: true });
        sent += 1;
        cursor = row.id;
      } catch (err) {
        if (err?.permanent) { failed += 1; cursor = row.id; continue; } // a bad address: keep the claim
        await claim.delete().catch(() => {});
        stop = true;
        finish.lastError = `The last try failed (${String(err?.message || err).slice(0, 200)}). It will try again in about 15 minutes.`;
        break outer;
      }
    }
    if (page.length < PAGE) { done = true; break; }
  }

  const at = new Date().toISOString();
  let status = "sending";
  if (done && !stop) { status = "sent"; Object.assign(finish, { finishedAt: at, failedRuns: 0, lastError: "" }); }
  else if (stop) {
    finish.failedRuns = (Number(job.failedRuns) || 0) + 1;
    if (finish.failedRuns >= MAX_FAILED_RUNS) {
      status = "paused";
      finish.lastError = `Sending stopped after ${MAX_FAILED_RUNS} failed tries in a row. Check Settings › Email sender, then try again.`;
    }
  } else finish.failedRuns = 0;

  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    const current = fresh.exists ? fresh.data().status : "";
    tx.update(ref, {
      sent: (Number(job.sent) || 0) + sent, failed: (Number(job.failed) || 0) + failed, cursor, leaseUntil: null, updatedAt: at,
      ...finish, status: current === "cancelled" ? "cancelled" : status,
    });
  });
  return { job: ref.id, sent, failed, status };
}

/** What the admin sees of a job. Pure. */
const jobView = (id, d) => ({
  id, status: d.status, audience: Number(d.audience) || 0, sent: Number(d.sent) || 0, failed: Number(d.failed) || 0,
  createdAt: d.createdAt || "", finishedAt: d.finishedAt || "", lastError: d.lastError || "",
});

/**
 * The admin action `digitalUpdate` on createStripeCheckoutSession: op "status" | "count" | "send" | "cancel" | "resume".
 * deps: { db, requireAdmin, countBuyers(bookId) -> number, recordAudit?(text), now? }
 */
function digitalUpdateActions(deps) {
  const { db } = deps;
  const nowIso = () => new Date(deps.now ? deps.now() : Date.now()).toISOString();
  const latestFor = async (bookId) => {
    const snap = await db.collection("digitalUpdates").where("bookId", "==", bookId).limit(50).get();
    const docs = snap.docs.slice().sort((a, b) => String(b.data().createdAt || "").localeCompare(String(a.data().createdAt || "")));
    return docs[0] || null;
  };

  async function handleDigitalUpdate(req, res) {
    const who = await deps.requireAdmin(req, res);
    if (!who) return;
    const body = req.body || {};
    const op = String(body.op || "");
    const bookId = String(body.bookId || "");
    if (!ID.test(bookId)) { res.status(400).json({ error: "Which product?" }); return; }
    try {
      if (op === "status" || op === "count") {
        const latest = await latestFor(bookId);
        res.status(200).json({ buyers: await deps.countBuyers(bookId), latest: latest ? jobView(latest.id, latest.data()) : null });
        return;
      }
      if (op === "send") {
        const book = await db.collection("books").doc(bookId).get();
        if (!book.exists) { res.status(404).json({ error: "That product no longer exists." }); return; }
        const buyers = await deps.countBuyers(bookId);
        if (!buyers) { res.status(400).json({ error: "Nobody has bought this yet, so there is no one to tell." }); return; }
        const busy = "Buyers are still being told about the last version. Wait for it to finish, or stop it, first.";
        const activeQuery = db.collection("digitalUpdates").where("bookId", "==", bookId).where("status", "in", ACTIVE).limit(1);
        const doc = db.collection("digitalUpdates").doc();
        const title = String(book.data().title || "").slice(0, 200);
        const queued = await db.runTransaction(async (tx) => {
          if (!(await tx.get(activeQuery)).empty) return false;
          tx.create(doc, {
            bookId, title, note: cleanNote(body.note), status: "queued", audience: buyers, sent: 0, failed: 0, cursor: "",
            failedRuns: 0, lastError: "", leaseUntil: null, createdAt: nowIso(), createdBy: String(who.email || who.uid || ""),
          });
          return true;
        });
        if (!queued) { res.status(409).json({ error: busy }); return; }
        if (deps.recordAudit) await deps.recordAudit(`Telling ${buyers} buyer${buyers === 1 ? "" : "s"} about a new version of "${title}"`).catch(() => {});
        res.status(200).json({ ok: true, latest: jobView(doc.id, { status: "queued", audience: buyers, createdAt: nowIso() }) });
        return;
      }
      if (op === "cancel" || op === "resume") {
        const latest = await latestFor(bookId);
        if (!latest) { res.status(404).json({ error: "There is nothing to stop." }); return; }
        const answer = await db.runTransaction(async (tx) => {
          const snap = await tx.get(latest.ref);
          const status = snap.data().status;
          if (op === "cancel") {
            if (![...ACTIVE, "paused"].includes(status)) return { status: 409, error: "Every buyer has already been told." };
            tx.update(latest.ref, { status: "cancelled", updatedAt: nowIso() });
          } else {
            if (status !== "paused") return { status: 409, error: "Only a paused send can carry on." };
            tx.update(latest.ref, { status: "queued", failedRuns: 0, lastError: "", leaseUntil: null, updatedAt: nowIso() });
          }
          return { status: 200 };
        });
        if (answer.status !== 200) { res.status(answer.status).json({ error: answer.error }); return; }
        res.status(200).json({ ok: true });
        return;
      }
      res.status(400).json({ error: "Unknown action." });
    } catch (err) {
      console.error("digitalUpdate failed:", err);
      res.status(500).json({ error: "That didn't go through. Please try again." });
    }
  }
  return { handleDigitalUpdate };
}

module.exports = { updateLines, updateAudience, updateEmail, runDigitalUpdates, digitalUpdateActions, MAX_SENDS_PER_RUN, MAX_NOTE };
