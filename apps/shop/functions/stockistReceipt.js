// Admin › Stockroom › Stockists › Mark paid › "Email a receipt": tells a stockist their payment arrived.
// Called through the admin-only sendTestEmail function (`action: "stockistReceipt"`, requireAdmin) and only when the
// owner presses the button; sent through sendEmail (the owner's sender, logged to emailLog like every other send).
// The invoice itself lives in the stockroom's records, which the page has just saved; this only words the email.
const { cleanRecipients, cleanSubject } = require("./emailOutbox");
const { pressName } = require("./shared/shopIdentity");

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const line = (v, max) => String(v ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, max);

class ReceiptProblem extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** Pure: the receipt email. Throws ReceiptProblem when the address or the details are unusable. */
function buildStockistReceipt(input, { shopName = "" } = {}) {
  shopName = String(shopName || "").trim() || pressName(null);
  const to = cleanRecipients(String(input?.to || ""));
  if (!to || to.length !== 1) throw new ReceiptProblem(400, "This stockist has no valid email address.");
  const invoiceNum = line(input?.invoiceNum, 60);
  const amount = line(input?.amount, 40);
  const paidOn = line(input?.paidOn, 40);
  const name = line(input?.stockistName, 120);
  if (!amount) throw new ReceiptProblem(400, "The receipt needs the amount paid.");
  const note = String(input?.note ?? "").replace(/\r\n?/g, "\n").trim().slice(0, 1000);
  const subject = cleanSubject(`Payment received${invoiceNum ? ` for ${invoiceNum}` : ""} — ${shopName}`);
  const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;line-height:1.55;">
        <p style="margin:0 0 16px;">Hi ${esc(name || "there")},</p>
        <p style="margin:0 0 16px;">Thank you — we received your payment of <strong>${esc(amount)}</strong>${invoiceNum ? ` for invoice <strong>${esc(invoiceNum)}</strong>` : ""}${paidOn ? ` on ${esc(paidOn)}` : ""}. It is marked paid.</p>
        ${note ? `<p style="white-space:pre-wrap;margin:0 0 16px;">${esc(note)}</p>` : ""}
        <p style="margin:0;">— ${esc(shopName)}</p>
      </div>`;
  return { to: to[0], subject, html };
}

/** Handle the action. deps: { db, sendEmail, secret, setupName }. Returns { status, json }. */
async function handleStockistReceipt(reqBody, { db, sendEmail, secret, setupName = "" }) {
  let shopName = pressName(null, setupName);
  try {
    const website = (await db.collection("settings").doc("website").get()).data() || {};
    shopName = String(website.communications?.fromName || "").trim() || pressName(website, setupName);
  } catch (err) {
    console.warn("Stockist receipt: the shop's name could not be read:", err?.message || err);
  }
  let email;
  try {
    email = buildStockistReceipt(reqBody, { shopName });
  } catch (err) {
    if (err instanceof ReceiptProblem) return { status: err.status, json: { error: err.message } };
    throw err;
  }
  try {
    await sendEmail({ to: email.to, subject: email.subject, html: email.html, secret, queue: "", about: {} });
  } catch (err) {
    return { status: 502, json: { error: `The receipt was not sent: ${String(err?.message || "the email service refused it").slice(0, 300)}` } };
  }
  return { status: 200, json: { sent: true, to: email.to, subject: email.subject } };
}

/**
 * Pure: an owner-written note to one stockist (the invoice reminder, worded in the admin by the stockroom's own
 * buildReminderEmail). Plain text only: every paragraph is escaped, so nothing but words reaches the email.
 */
function buildStockistNote(input) {
  const to = cleanRecipients(String(input?.to || ""));
  if (!to || to.length !== 1) throw new ReceiptProblem(400, "This invoice has no valid email address.");
  const subject = cleanSubject(line(input?.subject, 200));
  const text = String(input?.text ?? "").replace(/\r\n?/g, "\n").trim().slice(0, 4000);
  if (!subject || !text) throw new ReceiptProblem(400, "The reminder needs a subject and words.");
  const paras = text.split(/\n{2,}/).map((p) => `<p style="white-space:pre-wrap;margin:0 0 16px;">${esc(p)}</p>`).join("");
  return { to: to[0], subject, html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;line-height:1.55;">${paras}</div>` };
}

async function handleStockistNote(reqBody, { sendEmail, secret }) {
  let email;
  try {
    email = buildStockistNote(reqBody);
  } catch (err) {
    if (err instanceof ReceiptProblem) return { status: err.status, json: { error: err.message } };
    throw err;
  }
  try {
    await sendEmail({ to: email.to, subject: email.subject, html: email.html, secret, queue: "", about: {} });
  } catch (err) {
    return { status: 502, json: { error: `The reminder was not sent: ${String(err?.message || "the email service refused it").slice(0, 300)}` } };
  }
  return { status: 200, json: { sent: true, to: email.to } };
}

module.exports = { buildStockistReceipt, handleStockistReceipt, buildStockistNote, handleStockistNote, ReceiptProblem };
