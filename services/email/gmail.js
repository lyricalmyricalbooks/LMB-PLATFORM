// Google's Gmail API, sending from the platform's own Google Workspace mailbox (notifications@ the platform domain),
// with no package and no key file:
//
//   1. The server's own Google token (server/metadata.js on Cloud Run) asks IAM to sign a token for the mail account:
//      POST https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/{account}:signJwt  { payload }
//      payload { iss: account, sub: <the mailbox>, scope: gmail.send, aud: oauth2 token address, iat, exp }
//      (the server's account needs "Service Account Token Creator" on the mail account; server/deploy.js grants it).
//   2. Google swaps the signed token for one that may send as the mailbox (domain-wide delegation, which Julian allows
//      once in the Workspace admin for the mail account's client id and the gmail.send scope):
//      POST https://oauth2.googleapis.com/token  grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=...
//   3. POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send  { raw: base64url(RFC 2822 message) } -> { id }
//
// Gmail has no idempotency key, so a send is never repeated after an answer that might mean it went (a dropped
// connection, a 500). Only "slow down" answers (429, 403 rate limits, 503) are retried here; the sent log (index.js)
// keeps a second call with the same key from sending again.
//
// Limits Julian should know (Google Workspace, per mailbox): about 2,000 emails a day and 10,000 recipients a day.
// Over that, Gmail refuses sends for up to 24 hours. Shops whose own Gmail is connected send from it and don't count.

export const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
export const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const IAM_SIGN_URL = (account) => `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(account)}:signJwt`;
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const RATE_REASONS = /rateLimitExceeded|userRateLimitExceeded|dailyLimitExceeded|quotaExceeded/;
const EARLY_MS = 60_000;

export class GmailError extends Error {
  constructor(message, { status, code, retryable }) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    // The other service's answer, never words for a press (signup/api.js isOurError).
    this.fromProvider = "google";
  }
}

const b64 = (text) => Buffer.from(text, "utf8").toString("base64");
const b64url = (text) => b64(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const wrap = (text) => text.replace(/.{1,76}/g, "$&\r\n");
/** A header value with anything beyond plain ASCII written the RFC 2047 way. */
const word = (text) => (/^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${b64(text)}?=`);
const oneLine = (text) => String(text ?? "").replace(/[\r\n]+/g, " ");
/** `"Name" <address>` with a non-ASCII name encoded; the address stays as it is. */
export function encodeAddress(line) {
  const m = /^"(.*)"\s*<([^<>]+)>$/.exec(oneLine(line).trim());
  if (!m) return oneLine(line).trim();
  return /^[\x20-\x7e]*$/.test(m[1]) ? `"${m[1]}" <${m[2]}>` : `${word(m[1])} <${m[2]}>`;
}

/**
 * One email as RFC 2822 text: From, To, Reply-To, Subject, a plain-words part and an HTML part. `tags` ({ name, value })
 * travel as one X-Colophon-Tags header, and the idempotency key as X-Colophon-Key, so a sent email can be found in the
 * mailbox.
 */
export function mimeMessage({ from, to, subject, html, text, replyTo, idempotencyKey, tags = [] }, boundary = `colophon-${Math.random().toString(36).slice(2)}`) {
  const headers = [
    `From: ${encodeAddress(from)}`,
    `To: ${oneLine(to)}`,
    ...(replyTo ? [`Reply-To: ${oneLine(replyTo)}`] : []),
    `Subject: ${word(oneLine(subject))}`,
    "MIME-Version: 1.0",
    ...(idempotencyKey ? [`X-Colophon-Key: ${oneLine(idempotencyKey)}`] : []),
    ...(tags.length ? [`X-Colophon-Tags: ${tags.map((t) => `${t.name}=${t.value}`).join("; ")}`] : []),
  ];
  const part = (type, body) => [`--${boundary}`, `Content-Type: ${type}; charset=UTF-8`, "Content-Transfer-Encoding: base64", "", wrap(b64(body))].join("\r\n");
  const parts = [text ? part("text/plain", text) : null, html ? part("text/html", html) : null].filter(Boolean);
  return [...headers, `Content-Type: multipart/alternative; boundary="${boundary}"`, "", ...parts, `--${boundary}--`, ""].join("\r\n");
}

/**
 * A Gmail sender. `token()` is the server's own Google token (server/metadata.js); `account` the service account that
 * may send as `mailbox` (domain-wide delegation). `sleep` waits between retries (tests pass one that doesn't wait).
 */
export function gmailClient({ fetch, token, account, mailbox, tries = 3, now = () => Date.now(), sleep = (ms) => new Promise((done) => setTimeout(done, ms)) }) {
  if (typeof fetch !== "function") throw new Error("The email service needs fetch");
  if (typeof token !== "function") throw new Error("The email service needs the server's Google token");
  if (!/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(account ?? "")) throw new Error("The email account must be a Google service account");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mailbox ?? "")) throw new Error("The email service needs the mailbox it sends from");
  let held = null; // { token, until }

  const json = async (response) => response.json().catch(() => ({}));
  const refused = (what, status, answer) => {
    const reason = answer?.error?.errors?.[0]?.reason ?? answer?.error?.status ?? answer?.error ?? "unknown";
    const rate = status === 429 || status === 503 || (status === 403 && RATE_REASONS.test(String(reason)));
    const message = answer?.error?.message ?? answer?.error_description ?? "no answer";
    return new GmailError(`Google refused ${what} (${status} ${reason}: ${message})`, { status, code: String(reason), retryable: rate });
  };

  async function mailToken() {
    if (held && now() < held.until) return held.token;
    const iat = Math.floor(now() / 1000);
    const payload = { iss: account, sub: mailbox, scope: GMAIL_SEND_SCOPE, aud: OAUTH_TOKEN_URL, iat, exp: iat + 3600 };
    const signed = await fetch(IAM_SIGN_URL(account), {
      method: "POST",
      headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ payload: JSON.stringify(payload) }),
    });
    const signedAnswer = await json(signed);
    if (!signed.ok || !signedAnswer.signedJwt) throw refused("to sign the mail token", signed.status, signedAnswer);
    const swapped = await fetch(OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signedAnswer.signedJwt }).toString(),
    });
    const tokenAnswer = await json(swapped);
    // unauthorized_client: the Workspace admin hasn't allowed the mail account (domain-wide delegation) yet.
    if (!swapped.ok || !tokenAnswer.access_token) throw refused("the mail token", swapped.status, tokenAnswer);
    held = { token: tokenAnswer.access_token, until: now() + (Number(tokenAnswer.expires_in) || 3600) * 1000 - EARLY_MS };
    return held.token;
  }

  return {
    /** Sends one email; resolves to { id }. Throws a GmailError (with `retryable`) when Google refuses it. */
    async send(message) {
      const raw = b64url(mimeMessage(message));
      let last;
      for (let attempt = 1; attempt <= tries; attempt += 1) {
        if (attempt > 1) await sleep(500 * 2 ** (attempt - 2));
        const access = await mailToken();
        let response;
        try {
          response = await fetch(GMAIL_SEND_URL, { method: "POST", headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" }, body: JSON.stringify({ raw }) });
        } catch (error) {
          // It may have gone: never sent twice from here. The caller may try again later.
          throw new GmailError(`Gmail could not be reached (${error?.message ?? error})`, { status: 0, code: "network", retryable: true });
        }
        const answer = await json(response);
        if (response.ok && typeof answer?.id === "string") return { id: answer.id };
        if (response.status === 401) held = null;
        last = refused("the email", response.ok ? 502 : response.status, answer);
        if (!last.retryable) throw last;
      }
      throw last;
    },
  };
}
