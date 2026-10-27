// Emails outside the order flow: the contact form message to the shop, the welcome email for a new customer account,
// and the admin email endpoint (sendTestEmail: the test send, Messages › Reply, the waiting-to-send queue, the weekly
// summary send-now and the Gmail check). Moved out of index.js as is (functions/CLAUDE.md › Cloud Functions › Action
// table): index.js passes in its own Firebase wrappers, db, mail transport and email helpers, so the vm-based handler
// tests' fakes still apply, and keeps each `exports.<name> =` line.

function shopEmails({
  onBrowserRequest, onDocumentCreated, admin, db, nodemailer, applyCors, requireAdmin, ADMIN_TO,
  DEFAULT_NOTIFICATIONS, RESEND_API_KEY, claimEmailSend, cleanRecipients, compileEmailTemplate,
  loadNotificationSettings, logEmailAttempt, publicOutboxEntry, sendEmail, sendQueuedEmail,
  sendWeeklySummary, siteLink,
}) {
  // Studio › Style › Customer accounts. On unless the published design turns it off.
  async function customerAccountsEnabled() {
    try {
      const design = (await db.collection("settings").doc("website").get()).data()?.design || {};
      return (design.storefront?.customerAccounts ?? design.customerAccounts) !== false;
    } catch (err) {
      console.warn("Could not read customer-accounts setting:", err);
      return true;
    }
  }

  // ──────────────────────────────────────────────────────────────
  // 11. Customer Welcome Trigger
  // ──────────────────────────────────────────────────────────────
  // Storefront contact form (ContactFormSection) → email the shop.
  const escContact = (v) => String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const onContactMessage = onDocumentCreated(
    { document: "contactMessages/{messageId}", secrets: [RESEND_API_KEY] },
    async event => {
      const m = event.data?.data() || {};
      if (!m.email || !m.message) return;
      // Anyone can write this document: a "from" that isn't one plain address (a list, a name in
      // angle brackets, a header break) is never mailed to or counted against the budget.
      const senderOk = !!cleanRecipients(m.email) && cleanRecipients(m.email).length === 1;
      const html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
          <h2 style="margin-top:0;">New message from your website</h2>
          <p><strong>From:</strong> ${escContact(m.name)} &lt;<a href="mailto:${escContact(m.email)}">${escContact(m.email)}</a>&gt;${m.phone ? ` · ${escContact(m.phone)}` : ""}</p>
          ${m.subject ? `<p><strong>Subject:</strong> ${escContact(m.subject)}</p>` : ""}
          <p style="white-space:pre-wrap;border-left:3px solid #ccc;padding-left:12px;">${escContact(m.message)}</p>
          ${m.page ? `<p style="color:#888;font-size:12px;">Sent from ${escContact(m.page)}</p>` : ""}
        </div>`;
      // A flood from one sender can't burn the shop's sending quota: past the hourly cap the
      // message still waits in Messages (status stays "new"), it just isn't emailed.
      // The shop-wide hourly/daily budget (claimEmailSend) also applies, so rotating fake sender
      // addresses can't drain the Gmail quota either.
      const notifyOwner = await claimEmailSend(db, "ownerNotify", senderOk ? m.email : "invalid-sender", { failOpen: true });
      if (!notifyOwner) console.warn("Contact message not emailed to the shop: sender or shop-wide email limit reached");
      if (notifyOwner) try {
        await sendEmail({
          queue: "contactNotify",
          to: ADMIN_TO,
          subject: `[CONTACT] ${String(m.subject || m.name || "New message").slice(0, 120)}`,
          html,
          secret: RESEND_API_KEY.value(),
        });
        // Don't undo an admin who already opened/archived it in Messages.
        await db.runTransaction(async (tx) => {
          const cur = await tx.get(event.data.ref);
          if (cur.exists && cur.get("status") === "new") tx.update(event.data.ref, { status: "emailed" });
        });
      } catch (err) {
        console.error("Contact message email failed", err);
      }

      // Confirmation to the visitor (Settings › Notifications › Contact form › Message received).
      const notificationSettings = await loadNotificationSettings();
      if (notificationSettings.contact_reply?.enabled === false) return;
      // Anyone can type any address into the form, so this email must not be a relay: at most
      // one per address per day, and none of the visitor's own text (subject/message) is echoed
      // back; only the name, escaped and shortened. Older saved templates that still use
      // {{subject}}/{{message}} get blanks.
      if (!senderOk || !(await claimEmailSend(db, "visitorReply", m.email))) return;
      // compileEmailTemplate escapes and keeps "$" literal itself.
      const safe = (v) => String(v == null ? "" : v);
      const compiled = compileEmailTemplate("contact_reply", notificationSettings, {
        customer_name: safe(m.name || "there").replace(/\s+/g, " ").trim().slice(0, 60) || "there",
        email: safe(m.email),
        subject: "",
        message: "",
      });
      try {
        await sendEmail({
          to: m.email,
          subject: compiled.subject.replace(/&lt;|&gt;|&amp;|&quot;/g, (x) => ({ "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"' }[x])),
          html: compiled.html,
          secret: RESEND_API_KEY.value(),
        });
      } catch (err) {
        console.error("Contact confirmation email failed", err);
      }
    }
  );

  const onCustomerCreated = onDocumentCreated(
    { document: "customers/{customerId}", secrets: [RESEND_API_KEY] },
    async event => {
      const customer = event.data?.data() || {};
      if (!customer.email) return;
      // Only welcome the signed-in account's own, verified address: a profile doc names any
      // email it likes, so the address must match the Auth user behind the uid (email-link
      // sign-in verifies it). Anything else would let anyone mail a stranger.
      let authUser = null;
      try {
        authUser = await admin.auth().getUser(event.params?.customerId);
      } catch (err) {
        console.warn("Welcome email skipped: no matching account", err?.code || "");
        return;
      }
      const authEmail = String(authUser?.email || "").trim().toLowerCase();
      if (!authUser?.emailVerified || !authEmail || authEmail !== String(customer.email).trim().toLowerCase()) {
        console.warn("Welcome email skipped: profile email is not the account's verified email");
        return;
      }

      const notificationSettings = await loadNotificationSettings();
      if (notificationSettings.customer_welcome?.enabled === false) {
        return;
      }
      if (!(await customerAccountsEnabled())) return;

      const compiled = compileEmailTemplate("customer_welcome", notificationSettings, {
        customer_name: customer.name || "there",
        email: customer.email,
        button_url: siteLink("/account"),
      });

      try {
        await sendEmail({
          queue: "welcome",
          to: customer.email,
          subject: compiled.subject,
          html: compiled.html,
          secret: RESEND_API_KEY.value(),
        });
        console.log("Welcome email sent to a new customer");
      } catch (err) {
        console.error("Welcome email failed", err);
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // 11. HTTP Endpoint: Send Test Email (Admin Secure)
  // ──────────────────────────────────────────────────────────────
  const sendTestEmail = onBrowserRequest(
    { secrets: [RESEND_API_KEY] },
    async (req, res) => {
      if (applyCors(req, res)) return;
      if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
      }

      const adminUser = await requireAdmin(req, res);
      if (!adminUser) return;

      const body = req.body || {};
      // Admin › Messages › Reply: answer a contact message (functions/messageReply.js).
      if (body.action === "replyToMessage") {
        try {
          const out = await require("./messageReply").handleMessageReply(body, {
            db, sendEmail, secret: RESEND_API_KEY.value(), adminEmail: adminUser.email || "",
          });
          res.status(out.status).json(out.json);
        } catch (err) {
          console.error("message reply failed:", err);
          res.status(500).json({ error: "The reply could not be sent. Check that the latest Cloud Functions are deployed." });
        }
        return;
      }
      // Settings › Notifications › Waiting to send: the retry queue (never its HTML, which can
      // hold gift-card codes and download links), Retry now and Stop retrying.
      if (body.action === "emailQueue" || body.action === "retryEmail" || body.action === "cancelEmail") {
        try {
          if (body.action === "emailQueue") {
            const snap = await db.collection("emailOutbox").orderBy("createdAt", "desc").limit(50).get();
            res.status(200).json({ entries: snap.docs.filter(d => d.data().status !== "sent").map(d => publicOutboxEntry(d.id, d.data())) });
            return;
          }
          const id = String(body.id || "");
          if (!/^[a-f0-9]{24}$/.test(id)) { res.status(400).json({ error: "Unknown queued email." }); return; }
          if (body.action === "cancelEmail") {
            const ref = db.collection("emailOutbox").doc(id);
            // Never claim "stopped" while a sweep is sending it right now (it holds the lease).
            const outcome = await db.runTransaction(async tx => {
              const snap = await tx.get(ref);
              if (!snap.exists || snap.data().status === "sent") return { gone: true };
              const lease = Date.parse(snap.data().leaseUntil || "");
              if (Number.isFinite(lease) && lease > Date.now()) return { busy: true };
              tx.delete(ref);
              return { entry: snap.data() };
            });
            if (outcome.gone) { res.status(404).json({ error: "That email is no longer waiting — it was sent or already removed." }); return; }
            if (outcome.busy) { res.status(409).json({ error: "That email is being sent right now. Refresh in a minute to see whether it went." }); return; }
            const entry = outcome.entry;
            await logEmailAttempt({ to: Array.isArray(entry.to) ? entry.to.join(", ") : String(entry.to || ""), subject: entry.subject, kind: entry.kind || "", outboxId: id,
              status: "cancelled", error: `Stopped by ${adminUser.email || "the shop"} after ${Number(entry.attempts) || 1} tries. It will not be sent.` });
            res.status(200).json({ status: "cancelled" });
            return;
          }
          const result = await sendQueuedEmail(id, { force: true });
          if (result.status === "skipped") { res.status(409).json({ error: "That email is already being sent, or is no longer waiting. Refresh the list." }); return; }
          res.status(200).json(result);
        } catch (err) {
          console.error("email queue action failed:", err);
          res.status(500).json({ error: "The email queue could not be read. Check that the latest Cloud Functions are deployed." });
        }
        return;
      }

      // Settings › Email sender › Shop alerts › Send me last week's summary now.
      if (body.action === "weeklySummaryNow") {
        try {
          const { subject } = await sendWeeklySummary();
          res.status(200).json({ ok: true, subject });
        } catch (err) {
          console.error("weeklySummaryNow failed:", err);
          res.status(500).json({ error: "The summary couldn't be sent just now. Check Recent deliveries below and try again in a minute." });
        }
        return;
      }

      // Settings › Notifications › Gmail sending › Check connection: signs in to Gmail without
      // sending anything, so a revoked or mistyped app password shows up before an order does.
      if (body.action === "verifyGmail") {
        let pass = "";
        try { pass = String((await db.collection("adminSecrets").doc("gmail").get()).data()?.appPassword || "").replace(/\s+/g, ""); }
        catch (err) { console.warn("verifyGmail: could not read the app password:", err.message); }
        if (!pass) { res.status(200).json({ ok: false, error: "No Gmail app password is saved yet." }); return; }
        try {
          const transport = nodemailer.createTransport({ service: "gmail", auth: { user: ADMIN_TO, pass }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000 });
          await transport.verify();
          res.status(200).json({ ok: true });
        } catch (err) {
          const raw = String(err?.message || err);
          const wrong = /535|invalid login|username and password not accepted|badcredentials/i.test(raw);
          res.status(200).json({ ok: false, error: wrong
            ? "Gmail refused this app password. Create a new one at myaccount.google.com › Security › App passwords and save it here."
            : `Gmail could not be reached (${raw.slice(0, 200)}). Try again in a minute.` });
        }
        return;
      }

      const { templateId, email } = body;
      if (!templateId || !email) {
        res.status(400).json({ error: "Missing templateId or email" });
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_NOTIFICATIONS, templateId) || templateId === "brand") {
        res.status(400).json({ error: "Unknown email template." });
        return;
      }
      if (!cleanRecipients(email)) {
        res.status(400).json({ error: "Enter one valid email address for the test." });
        return;
      }

      try {
        const notificationSettings = await loadNotificationSettings();
        // Send test uses what the admin sees in the editor, saved or not (bounded, admin-only).
        const draft = body.template && typeof body.template === "object" ? body.template : null;
        if (draft) {
          const field = (value, max) => (typeof value === "string" ? value.slice(0, max) : undefined);
          const fields = { subject: field(draft.subject, 300), body: field(draft.body, 10000), buttonText: field(draft.buttonText, 80), signoff: field(draft.signoff, 500) };
          notificationSettings[templateId] = { ...notificationSettings[templateId], ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) };
        }
        const draftBrand = body.brand && typeof body.brand === "object" ? body.brand : null;
        if (draftBrand) {
          const brand = { ...notificationSettings.brand };
          if (typeof draftBrand.logoUrl === "string" && (draftBrand.logoUrl === "" || /^https:\/\/[^\s"'<>]{1,500}$/.test(draftBrand.logoUrl))) brand.logoUrl = draftBrand.logoUrl;
          if (typeof draftBrand.brandColor === "string" && /^#[0-9a-f]{3,8}$/i.test(draftBrand.brandColor)) brand.brandColor = draftBrand.brandColor;
          if (draftBrand.emailTheme === "light" || draftBrand.emailTheme === "dark") brand.emailTheme = draftBrand.emailTheme;
          notificationSettings.brand = brand;
        }

        const mockVars = {
          customer_name: "Julianne Smith",
          order_id: "LM-98241",
          tracking_carrier: "Canada Post",
          tracking_number: "123456789012",
          total_price: "CA$45.00",
          payment_method: "Interac e-Transfer",
          shipping_method: "Canada Post Expedited Parcel",
          delivery_estimate: "2-4 business days after dispatch",
          order_url: siteLink("/track"),
          email: "julianne.smith@gmail.com",
          status: "out for delivery",
          subject: "Stocking your books",
          message: "Hello! Do you sell wholesale to independent bookshops?",
          tracking_url: "https://www.canadapost-postescanada.ca/track-reperage/en",
          cart_url: siteLink("/checkout"),
          button_url: siteLink("/track"),
          // Gift card email (gift_card)
          recipient_name: "Sam",
          sender_name: "Julianne",
          amount: "CA$50.00",
          code: "ABCD-EFGH-JKMN-PQRS",
          expires: "",
          shop_url: siteLink("/"),
          items_table: `
            <div style="margin: 30px 0; border-top: 1px solid #eeeeee; padding-top: 20px;">
              <h4 style="margin-top: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #888888;">Order Details</h4>
              <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <tr style="border-bottom: 1px solid #eeeeee;">
                  <td style="padding: 10px 0; font-weight: bold;">Visions of Toronto - Limited Edition (x1)</td>
                  <td style="padding: 10px 0; text-align: right; font-family: monospace;">CA$35.00</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; color: #666666;">Subtotal</td>
                  <td style="padding: 10px 0; text-align: right; font-family: monospace;">CA$35.00</td>
                </tr>
                <tr>
                  <td style="padding: 5px 0; color: #666666;">Shipping</td>
                  <td style="padding: 5px 0; text-align: right; font-family: monospace;">CA$10.00</td>
                </tr>
                <tr style="font-size: 15px; font-weight: bold; border-top: 1px solid #dddddd;">
                  <td style="padding: 15px 0;">Total</td>
                  <td style="padding: 15px 0; text-align: right; font-family: monospace;">CA$45.00</td>
                </tr>
              </table>
            </div>
          `
        };

        let sampleDownloadSection = "";
        if (templateId === "order_confirmation") {
          sampleDownloadSection = `
            <div style="margin-top:28px;padding:24px;background:#f8f6ff;border-radius:16px;border:1px solid #7c3aed20;">
              <h3 style="margin-top:0;font-size:13px;letter-spacing:.15em;text-transform:uppercase;color:#7c3aed;">Digital Library Access (Sample)</h3>
              <p style="font-size:11px;color:#666;margin-bottom:16px;line-height:1.5;">Click the links below to download your digital books. For security, these download links are active for 24 hours.</p>
              <table style="width:100%;font-size:12px;border-collapse:collapse;">
                <tr>
                  <td style="padding:8px 0;border-bottom:1px solid #7c3aed10;"><strong>Visions of Toronto - PDF Edition</strong></td>
                  <td style="padding:8px 0;text-align:right;border-bottom:1px solid #7c3aed10;">
                    <a href="#" style="display:inline-block;background:#7C3AED;color:#fff;text-decoration:none;padding:6px 12px;border-radius:6px;font-size:10px;font-weight:bold;letter-spacing:.05em;text-transform:uppercase;">Download File</a>
                  </td>
                </tr>
              </table>
            </div>
          `;
        }

        const compiled = compileEmailTemplate(templateId, notificationSettings, mockVars, sampleDownloadSection);

        await sendEmail({
          to: email,
          subject: `[TEST] ${compiled.subject}`,
          html: compiled.html,
          secret: RESEND_API_KEY.value(),
        });

        res.status(200).json({ success: true, subject: `[TEST] ${compiled.subject}` });
      } catch (err) {
        console.error("sendTestEmail failed:", err);
        res.status(500).json({ error: err.message });
      }
    }
  );

  return { onContactMessage, onCustomerCreated, sendTestEmail };
}

module.exports = { shopEmails };
