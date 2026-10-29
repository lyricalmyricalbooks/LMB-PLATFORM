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

export function createGmailSend({ google, tokens, registry, config }) {
  return async function gmailSend(shopId, { to, replyTo, subject, text, html }) {
    if (!config.gmailSending) throw new Error("Gmail sending isn't switched on");
    const row = await registry.getShop(shopId);
    if (row?.gmailSender?.on !== true) throw new Error(`${shopId} doesn't send from Gmail`);
    const access = await tokens.fresh(shopId);
    if (!access) throw new Error(`${shopId} has no Google link`);
    const name = String(row.pressName || shopId).replace(/[\r\n"<>\\]+/g, " ").trim();
    const sent = await google.sendGmail(access.token, rawEmail({ from: `"${name}" <${row.gmailSender.address}>`, to, replyTo, subject, text, html }));
    return { id: sent.id };
  };
}
