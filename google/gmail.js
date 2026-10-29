// The shop's emails from the press's own Gmail (code plan 6.20), through the same Google sign-in. Off until Julian
// switches GOOGLE_GMAIL_SENDING on, once Google has approved Colophon's sign-in screen with its sending permission (a sensitive one, so no yearly outside review).
// The email service takes `gmailSend` from here (services/email/index.js); when Gmail refuses, it sends the usual way.

/** Base64url text of a plain MIME email, as Gmail's send call takes it. Header values lose line breaks. */
export function rawEmail({ from, to, replyTo, subject, text, html }) {
  const line = (value) => String(value ?? "").replace(/[\r\n]+/g, " ").trim();
  const boundary = `colophon-${Math.random().toString(36).slice(2)}`;
  const word = (value) => `=?UTF-8?B?${Buffer.from(line(value), "utf8").toString("base64")}?=`;
  const parts = [
    `From: ${line(from)}`, `To: ${line(to)}`, ...(replyTo ? [`Reply-To: ${line(replyTo)}`] : []),
    `Subject: ${word(subject)}`, "MIME-Version: 1.0", `Content-Type: multipart/alternative; boundary="${boundary}"`, "",
    `--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "", text ?? "",
    ...(html ? [`--${boundary}`, "Content-Type: text/html; charset=UTF-8", "", html] : []),
    `--${boundary}--`, "",
  ];
  return Buffer.from(parts.join("\r\n"), "utf8").toString("base64url");
}

/**
 * Gmail's own sending limits (code plan 15.24): about 500 messages a day from a free Gmail address and 2,000 from a
 * Google Workspace one. A press's address on gmail.com or googlemail.com is a free account; any other is Workspace.
 * Shop emails stop going through Gmail at 80% of the limit and go the usual way until the next day (UTC), so a launch-day
 * rush plus the press's own mail never reaches the limit and starts failing order emails.
 */
export const GMAIL_LIMITS = Object.freeze({ free: 500, workspace: 2000 });
export const GMAIL_STOP_AT = 0.8;
export const gmailDailyLimit = (address) => (/@(?:gmail|googlemail)\.com$/i.test(String(address ?? "").trim()) ? GMAIL_LIMITS.free : GMAIL_LIMITS.workspace);

export function createGmailSend({ google, tokens, registry, config, now = () => Date.now() }) {
  return async function gmailSend(shopId, { to, replyTo, subject, text, html }) {
    if (!config.gmailSending) throw new Error("Gmail sending isn't switched on");
    const row = await registry.getShop(shopId);
    if (row?.gmailSender?.on !== true) throw new Error(`${shopId} doesn't send from Gmail`);
    const day = new Date(now()).toISOString().slice(0, 10);
    const sent24 = row.gmailSends?.day === day ? row.gmailSends.count : 0;
    const stopAt = Math.floor(gmailDailyLimit(row.gmailSender.address) * GMAIL_STOP_AT);
    if (sent24 >= stopAt) throw new Error(`${shopId} has sent ${sent24} emails through Gmail today, close to Gmail's daily limit; sending the usual way until tomorrow`);
    const access = await tokens.fresh(shopId);
    if (!access) throw new Error(`${shopId} has no Google link`);
    const name = String(row.pressName || shopId).replace(/[\r\n"<>\\]+/g, " ").trim();
    const sent = await google.sendGmail(access.token, rawEmail({ from: `"${name}" <${row.gmailSender.address}>`, to, replyTo, subject, text, html }));
    // Counted after a send that worked. Two sends at the same moment can both read the same number: the 20% left under
    // the limit is the room for that.
    await registry.updateShop(shopId, { gmailSends: { day, count: sent24 + 1 } });
    return { id: sent.id };
  };
}
