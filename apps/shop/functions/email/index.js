// The shop's one door for email (code plan 1.13): every email the server sends goes through `send` here, which tries
// Gmail (when an app password is saved) and then the backup (the platform's shared sender on a platform shop, else
// Resend), logs every attempt to emailLog and parks an important email
// that both refuse in the retry queue (emailOutbox). `checkGmail` is Settings › Email sender › Check connection.
// Moved out of index.js as is; built the same way as functions/payments: index.js passes in its own db, lazy Resend and
// nodemailer, secrets and helpers, so the vm-based handler tests' fakes still apply and nothing here loads a mail
// package itself. email/email.test.js pins it with a fake Firestore, Gmail and Resend.
//
// The interface: send(message), logEmailAttempt(entry), enqueueEmail(entry), checkGmail(). index.js keeps `sendEmail`
// as its own name for send (handler tests swap it out); the retry queue's runner (sendQueuedEmail) stays in index.js.

const { cleanRecipients, cleanSubject, cleanFromName, isPermanentEmailError, nextRetryAt } = require("../emailOutbox");
const { explainEmailError } = require("../emailErrors");
const { risoLayout } = require("../emailTheme");
const { footerAddress } = require("../marketingOptOut");

// Bounded waits: a hung connection must not stall a trigger or the 15-minute sweep.
const GMAIL_TIMEOUTS = { connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000 };

/**
 * @param {object} deps
 * @param {object} deps.db Firestore (settings, adminSecrets/gmail, emailLog, emailOutbox)
 * @param {object} deps.crypto Node's crypto (queue ids)
 * @param {Function} deps.Resend constructor: `new Resend(apiKey)`
 * @param {{ createTransport: Function }} deps.nodemailer
 * @param {string} deps.ownerEmail the shop owner's address (Gmail signs in as it)
 * @param {string} deps.senderName default sender name, until Settings › Communications sets one
 * @param {string} deps.senderEmail default sender address, same
 * @param {(id: string) => Promise<object>} deps.readAdminSecret
 * @param {() => string} deps.resendSecretValue the deployed RESEND_API_KEY, "" when not declared
 * @param {(value: unknown) => string} deps.escapeHtml
 * @param {{ send: Function } | null} [deps.platformSender] the platform's shared sender (email/platformSender.js). When
 *   given, it replaces Resend as the backup: Gmail (the press's own address) still goes first, and a shop whose Gmail
 *   works never reaches it. Null: the shop's own Resend key, as before.
 */
function createEmail({ db, crypto, Resend, nodemailer, ownerEmail, senderName, senderEmail, readAdminSecret, resendSecretValue, escapeHtml, platformSender = null }) {
  // Admin-only delivery log (firestore.rules: emailLog is readable by the admin, writable by no client).
  // Shown in Admin › Notifications so failed sends are visible instead of only in Functions logs.
  async function logEmailAttempt(entry) {
    try {
      await db.collection("emailLog").add({ ...entry, at: new Date().toISOString() });
    } catch (err) {
      console.warn("Could not write emailLog entry:", err);
    }
  }

  // `queue` (a short kind, e.g. "orderConfirmed"): when every sender refuses, park the email in
  // the server-only retry queue (emailOutbox) instead of losing it; the thrown error carries
  // `.queued` (the queue id). `outboxId` marks a send made by the retry queue itself.
  // `attachments` ([{ filename, content: Buffer, contentType }]) go with the email but never into the retry queue (pass no `queue`).
  async function send({ to, subject, html, secret, queue = "", outboxId = "", attempt = 0, claimId = "", about = {}, attachments = [] }) {
    const recipientList = cleanRecipients(to);
    subject = cleanSubject(subject);
    const sourceHtml = html;
    // Order emails name their order, so Order detail › Activity can list its delivery attempts.
    const aboutOrder = typeof about?.orderId === "string" && about.orderId ? { orderId: about.orderId } : {};
    const logBase = { to: Array.isArray(to) ? to.join(", ") : String(to || ""), subject, ...(queue ? { kind: String(queue) } : {}), ...(outboxId ? { outboxId } : {}), ...aboutOrder };
    if (!recipientList) {
      // Permanent: no retry can fix an address, and a bad one may be an attempt to inject headers.
      const message = `${String(logBase.to).replace(/[\r\n]+/g, " ").slice(0, 120) || "(no address)"} is not a valid email address, so nothing was sent.`;
      await logEmailAttempt({ ...logBase, to: String(logBase.to).replace(/[\r\n]+/g, " ").slice(0, 254), status: "failed", error: message, permanent: true });
      const err = new Error(message); err.permanent = true; throw err;
    }
    to = recipientList.length === 1 ? recipientList[0] : recipientList;
    // One id for this email across every try: the queue entry's id, and Resend's idempotency key,
    // so a reply lost after Resend accepted the message can't turn into a second copy.
    const queueId = outboxId || (queue ? crypto.randomBytes(12).toString("hex") : "");
    const okExtra = { ...(queue ? { kind: String(queue) } : {}), ...(outboxId ? { outboxId } : {}), ...(attempt > 1 ? { attempt } : {}), ...aboutOrder };
    // Callers that forgot to pass the Functions secret still get it (every function that can
    // send mail declares RESEND_API_KEY): resendSecretValue() reads "" when it isn't declared.
    secret = secret || resendSecretValue();
    let apiKey = secret;
    let keySource = secret ? "secret" : "none";
    let fromName = senderName;
    let fromEmail = senderEmail;
    let replyTo = null;
    let brand = {};
    let mailingAddress = "";

    try {
      const settingsDoc = await db.collection("settings").doc("website").get();
      if (settingsDoc.exists) {
        const settings = settingsDoc.data() || {};
        const comms = settings.communications || {};
        if (comms.fromName) fromName = comms.fromName;
        if (comms.replyTo) replyTo = comms.replyTo;
        if (comms.fromEmail) fromEmail = comms.fromEmail;
        if (comms.resendApiKey) { apiKey = comms.resendApiKey; keySource = "settings"; }
        mailingAddress = footerAddress(settings.location);
      }
    } catch (err) {
      console.warn("Failed to load custom sender details, using default fallbacks:", err);
    }

    // Also check settings/notifications for custom API Key
    try {
      const notificationsDoc = await db.collection("settings").doc("notifications").get();
      if (notificationsDoc.exists) {
        const notifications = notificationsDoc.data() || {};
        if (notifications.resendApiKey) { apiKey = notifications.resendApiKey; keySource = "settings"; }
        if (notifications.brand && notifications.brand.resendApiKey) { apiKey = notifications.brand.resendApiKey; keySource = "settings"; }
        brand = notifications.brand || {};
      }
    } catch (err) {
      console.warn("Failed to load notifications custom API Key:", err);
    }

    const privateResend = await readAdminSecret("resend");
    if (privateResend.apiKey) { apiKey = privateResend.apiKey; keySource = "settings"; }

    if (typeof apiKey === "string") apiKey = apiKey.trim();
    const recipients = Array.isArray(to) ? to.join(", ") : String(to || "");
    // Every email footer carries the shop's postal address (Settings › General › Location).
    const withFooter = doc => mailingAddress && doc ? doc.replace("<!--fm-footer-extra-->", ` &middot; ${escapeHtml(mailingAddress)}`) : doc;

    // Gmail SMTP is the primary sender while the shop has no verified domain in Resend. Gmail
    // always sends from the authenticated account, so customers get real inbox delivery.
    // If it is unset or fails, fall through to Resend below.
    let gmailPass = "";
    try {
      const gmailDoc = await db.collection("adminSecrets").doc("gmail").get();
      if (gmailDoc.exists) gmailPass = String(gmailDoc.data()?.appPassword || "").replace(/\s+/g, "");
    } catch (err) {
      console.warn("Could not read adminSecrets/gmail:", err);
    }
    let gmailProblem = "";
    if (gmailPass) {
      try {
        if (html && !/<html[\s>]/i.test(html)) {
          html = risoLayout(html, { logoUrl: brand.logoUrl || "", accent: brand.brandColor, theme: brand.emailTheme });
        }
          const transport = nodemailer.createTransport({ service: "gmail", auth: { user: ownerEmail, pass: gmailPass }, ...GMAIL_TIMEOUTS });
        const info = await transport.sendMail({
          from: `"${cleanFromName(fromName)}" <${ownerEmail}>`,
          to,
          subject,
          html: withFooter(html),
          replyTo: replyTo || undefined,
          ...(attachments.length ? { attachments } : {}),
        });
        await logEmailAttempt({ to: recipients, subject, status: "sent", from: ownerEmail, keySource: "gmail", id: info.messageId || null, ...okExtra });
        return { id: info.messageId || null };
      } catch (err) {
        console.error("Gmail SMTP send failed, falling back to Resend:", err);
        gmailProblem = `Gmail SMTP rejected the send (${err?.message || err}). Re-enter the Gmail app password in Settings › Notifications › Gmail sending.`;
        // Not a failure yet: Resend below may still deliver it. Only the final outcome counts as "failed".
        await logEmailAttempt({ to: recipients, subject, status: "fallback", from: ownerEmail, keySource: "gmail", ...okExtra,
          error: `${gmailProblem} Trying the backup sender (${platformSender ? "the platform's shared sender" : "Resend"}).` });
      }
    }
    const fail = async (message, extra = {}) => {
      const error = gmailProblem ? `${message} (${gmailProblem})` : message;
      const thrown = new Error(message);
      // The retry queue logs its own outcome (try N of M / gave up).
      if (outboxId) throw thrown;
      if (queue && !isPermanentEmailError(error)) {
        const queued = await enqueueEmail({ id: queueId, to: recipientList, subject, html: sourceHtml, kind: queue, error, claimId, about });
        if (queued) {
          await logEmailAttempt({ to: recipients, subject, status: "queued", error: `${error} Saved to try again automatically.`, from: fromEmail, keySource, kind: String(queue), outboxId: queued.id, retryAt: queued.nextAttemptAt, ...aboutOrder, ...extra });
          thrown.queued = queued.id;
          throw thrown;
        }
      }
      await logEmailAttempt({ to: recipients, subject, status: "failed", error, from: fromEmail, keySource, ...(queue ? { kind: String(queue) } : {}), ...aboutOrder, ...extra });
      throw thrown;
    };

    // Platform shops: the backup is the platform's shared sender (the shop's name, the platform's address, replies to
    // the shop), never a Resend key in this shop. One request per recipient, each with its own idempotency key, so a
    // retry after a partial send never doubles an email.
    if (platformSender) {
      if (html && !/<html[\s>]/i.test(html)) {
        html = risoLayout(html, { logoUrl: brand.logoUrl || "", accent: brand.brandColor, theme: brand.emailTheme });
      }
      // A queued email keeps its queue id across every retry. Any other email gets a key made from what it is (who,
      // subject, kind, order, words) and the hour, so a caller that tries the same email again soon after a partial
      // send reaches only the recipients still missing it; the same email sent on purpose later is a new email.
      const key = queueId || crypto.createHash("sha256")
        .update(JSON.stringify([recipientList, subject, String(queue || ""), aboutOrder.orderId || "", String(sourceHtml || ""), Math.floor(Date.now() / 3_600_000)]))
        .digest("hex").slice(0, 32);
      const platformLog = { from: "platform", keySource: "platform" };
      let firstId = null;
      try {
        for (const address of recipientList) {
          const { id } = await platformSender.send({ kind: queue || "shop-email", to: address, subject, html: withFooter(html), idempotencyKey: `${key}:${address}` });
          firstId = firstId || id || null;
        }
      } catch (err) {
        const message = err?.message || String(err);
        // A refusal no retry can fix (the service said so) is logged once and never queued.
        if (err?.permanent && !outboxId) {
          await logEmailAttempt({ to: recipients, subject, status: "failed", error: gmailProblem ? `${message} (${gmailProblem})` : message, permanent: true,
            ...(queue ? { kind: String(queue) } : {}), ...aboutOrder, ...platformLog });
          throw Object.assign(new Error(message), { permanent: true });
        }
        await fail(message, platformLog);
      }
      await logEmailAttempt({ to: recipients, subject, status: "sent", id: firstId, ...okExtra, ...platformLog,
        ...(attachments.length ? { note: "The shared sender sends no attachments, so this email went without its file." } : {}) });
      return { id: firstId };
    }

    if (!apiKey || apiKey === "dummy_value" || !apiKey.startsWith("re_")) {
      await fail(explainEmailError("Missing API key", { fromEmail }));
    }

    const resend = new Resend(apiKey);

    // Every email gets the Riso Press shell (light/dark, accent and logo from Notifications › Email branding);
    // templates from compileEmailTemplate are already full documents.
    if (html && !/<html[\s>]/i.test(html)) {
      html = risoLayout(html, { logoUrl: brand.logoUrl || "", accent: brand.brandColor, theme: brand.emailTheme });
    }

    // If using a Resend onboarding key, force the sender to onboarding@resend.dev
    if (apiKey.startsWith("re_onb_")) {
      fromEmail = "onboarding@resend.dev";
    }

    const send = (fromAddress) => {
      let timer;
      const timeout = new Promise(resolve => { timer = setTimeout(() => resolve({ data: null, error: { message: "Resend did not answer within 20 seconds." } }), 20000); });
      const request = resend.emails.send({
        from: `${cleanFromName(fromName)} <${fromAddress}>`,
        to,
        subject,
        html: withFooter(html),
        replyTo: replyTo || undefined,
        ...(attachments.length ? { attachments: attachments.map(a => ({ filename: a.filename, content: a.content, contentType: a.contentType })) } : {}),
      }, queueId ? { idempotencyKey: `${queueId}:${fromAddress}` } : undefined)
        .catch(err => ({ data: null, error: { message: err?.message || String(err) } }));
      return Promise.race([request, timeout]).finally(() => clearTimeout(timer));
    };

    let response = await send(fromEmail);
    let usedSandbox = fromEmail === "onboarding@resend.dev";

    if (response.error && !usedSandbox) {
      const errorMsg = (response.error.message || "").toLowerCase();
      // If it's a domain validation / verification error, retry using the Resend sandbox address
      if (["verify", "domain", "sender", "from address", "unverified"].some(word => errorMsg.includes(word))) {
        console.warn(`Domain not verified for '${fromEmail}'. Retrying send via 'onboarding@resend.dev' sandbox fallback...`);
        const fallbackResponse = await send("onboarding@resend.dev");
        usedSandbox = true;
        if (!fallbackResponse.error) {
          await logEmailAttempt({ to: recipients, subject, status: "sent", from: "onboarding@resend.dev", keySource, id: fallbackResponse.data?.id || null, sandbox: true, ...okExtra,
            note: `${fromEmail.split("@")[1] || "Sender domain"} is not verified in Resend; sent from onboarding@resend.dev, which only reaches the Resend account owner.` });
          return fallbackResponse.data;
        }
        response = fallbackResponse; // If fallback also fails, report the fallback's error
      }
    }

    if (response.error) {
      console.error(`Resend rejected email to ${recipients}:`, response.error);
      await fail(explainEmailError(response.error.message, { fromEmail, usedSandbox }), usedSandbox ? { sandbox: true } : {});
    }
    await logEmailAttempt({ to: recipients, subject, status: "sent", from: usedSandbox ? "onboarding@resend.dev" : fromEmail, keySource, id: response.data?.id || null, ...(usedSandbox ? { sandbox: true } : {}), ...okExtra });
    return response.data;
  }

  // ── Email retry queue (server-only emailOutbox; rules in ../emailOutbox) ──
  async function enqueueEmail({ id = "", to, subject, html, kind, error, claimId = "", about = {} }) {
    id = id || crypto.randomBytes(12).toString("hex");
    const now = Date.now();
    const entry = {
      to, subject, html: String(html || ""), kind: String(kind || ""), status: "pending", attempts: 1,
      createdAt: new Date(now).toISOString(), lastAttemptAt: new Date(now).toISOString(),
      nextAttemptAt: nextRetryAt(1, now), lastError: String(error || "").slice(0, 1000), leaseUntil: null,
      ...(claimId ? { claimId } : {}),
      // Re-checked before each retry (an order refunded meanwhile, a gift card voided) and used by privacy erase.
      toLower: to.map(addr => String(addr).toLowerCase()),
      ...(typeof about.orderId === "string" && about.orderId ? { orderId: about.orderId } : {}),
      ...(typeof about.giftCardId === "string" && about.giftCardId ? { giftCardId: about.giftCardId } : {}),
    };
    try {
      await db.collection("emailOutbox").doc(id).set(entry);
      return { id, nextAttemptAt: entry.nextAttemptAt };
    } catch (err) {
      console.warn("Could not save the email for a retry:", err.message);
      return null;
    }
  }

  // Settings › Notifications › Gmail sending › Check connection: signs in to Gmail without
  // sending anything, so a revoked or mistyped app password shows up before an order does.
  async function checkGmail() {
    let pass = "";
    try { pass = String((await db.collection("adminSecrets").doc("gmail").get()).data()?.appPassword || "").replace(/\s+/g, ""); }
    catch (err) { console.warn("verifyGmail: could not read the app password:", err.message); }
    if (!pass) return { ok: false, error: "No Gmail app password is saved yet." };
    try {
      const transport = nodemailer.createTransport({ service: "gmail", auth: { user: ownerEmail, pass }, ...GMAIL_TIMEOUTS });
      await transport.verify();
      return { ok: true };
    } catch (err) {
      const raw = String(err?.message || err);
      const wrong = /535|invalid login|username and password not accepted|badcredentials/i.test(raw);
      return { ok: false, error: wrong
        ? "Gmail refused this app password. Create a new one at myaccount.google.com › Security › App passwords and save it here."
        : `Gmail could not be reached (${raw.slice(0, 200)}). Try again in a minute.` };
    }
  }

  // Settings › Email sender › Gmail sending: which address Gmail sends from, whether a password is saved, and what
  // happens without one ("platform": the platform's shared sender with the shop's name; "resend": the shop's own key).
  async function senderStatus() {
    let gmailSaved = false;
    try { gmailSaved = Boolean(String((await db.collection("adminSecrets").doc("gmail").get()).data()?.appPassword || "").trim()); }
    catch (err) { console.warn("senderStatus: could not read the app password:", err.message); }
    return { ok: true, gmailAddress: ownerEmail, gmailSaved, backup: platformSender ? "platform" : "resend" };
  }

  return { send, logEmailAttempt, enqueueEmail, checkGmail, senderStatus };
}

module.exports = { createEmail };
