// Admin › Messages › Reply: answer a storefront contact message from inside the admin.
// Called through the admin-only sendTestEmail function (`action: "replyToMessage"`, requireAdmin);
// the email goes out through sendEmail (Gmail, then Resend), which logs every attempt to emailLog.
const { cleanRecipients, cleanSubject } = require("./emailOutbox");

const MAX_REPLY = 5000;
const MAX_REPLIES_KEPT = 50;
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

class ReplyProblem extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** Pure: the email for a reply. Throws ReplyProblem when the reply or the address is unusable. */
function buildMessageReply(message, rawBody, { shopName = "Lyricalmyrical Books" } = {}) {
  const body = String(rawBody ?? "").replace(/\r\n?/g, "\n").trim();
  if (!body) throw new ReplyProblem(400, "Write a reply first.");
  if (body.length > MAX_REPLY) throw new ReplyProblem(400, `Keep the reply under ${MAX_REPLY} characters.`);
  const to = cleanRecipients(String(message?.email || ""));
  if (!to || to.length !== 1) throw new ReplyProblem(400, "This message has no valid email address to reply to.");
  const subject = cleanSubject(`Re: ${message?.subject || "your message to " + shopName}`);
  const quoted = String(message?.message || "").slice(0, 2000);
  const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;line-height:1.55;">
        <p style="white-space:pre-wrap;margin:0 0 24px;">${esc(body)}</p>
        <p style="margin:0 0 24px;">— ${esc(shopName)}</p>
        ${quoted ? `<div style="border-left:3px solid #ccc;padding-left:12px;color:#666;font-size:13px;">
          <p style="margin:0 0 6px;">${esc(message?.name || "You")} wrote:</p>
          <p style="white-space:pre-wrap;margin:0;">${esc(quoted)}</p>
        </div>` : ""}
      </div>`;
  return { to: to[0], subject, html, body };
}

/** Pure: the message's replies list after adding one (newest last, bounded). */
function withReply(existing, entry) {
  const list = Array.isArray(existing) ? existing.slice() : [];
  list.push(entry);
  return list.slice(-MAX_REPLIES_KEPT);
}

/**
 * Handle the action. deps: { db, sendEmail, secret, adminEmail, now }.
 * Returns { status, json } for the HTTP response.
 */
async function handleMessageReply(reqBody, { db, sendEmail, secret, adminEmail = "", now = () => new Date() }) {
  const id = String(reqBody?.messageId || "");
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return { status: 400, json: { error: "Unknown message." } };
  const ref = db.collection("contactMessages").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { status: 404, json: { error: "That message no longer exists." } };
  let email;
  try {
    email = buildMessageReply(snap.data(), reqBody?.body);
  } catch (err) {
    if (err instanceof ReplyProblem) return { status: err.status, json: { error: err.message } };
    throw err;
  }
  try {
    await sendEmail({ to: email.to, subject: email.subject, html: email.html, secret, queue: "", about: {} });
  } catch (err) {
    return { status: 502, json: { error: `The reply was not sent: ${String(err?.message || "the email service refused it").slice(0, 300)}` } };
  }
  const entry = { at: now().toISOString(), body: email.body, by: String(adminEmail || "").slice(0, 254) };
  await db.runTransaction(async tx => {
    const cur = await tx.get(ref);
    if (!cur.exists) return;
    tx.update(ref, { replies: withReply(cur.data().replies, entry), status: "replied", repliedAt: entry.at });
  });
  return { status: 200, json: { reply: entry } };
}

module.exports = { buildMessageReply, withReply, handleMessageReply, ReplyProblem, MAX_REPLY };
