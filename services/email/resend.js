// Resend over its REST API (POST https://api.resend.com/emails), with no package: the service passes in `fetch`, so tests
// use a fake and nothing here can send by accident.
//
// Request: JSON { from, to: [address], subject, html, text, reply_to: [address], tags: [{ name, value }] }, with
// `Authorization: Bearer <key>` and `Idempotency-Key` (at most 256 characters; Resend keeps it 24 hours: the same key and
// body returns the first answer without sending again, the same key with another body answers 409).
// Answer: 200 { id }, or an error status with { name, message }. 400/401/403/409/422 are not worth retrying; 429 and
// 5xx are, with the same idempotency key.

export const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const RETRYABLE = (status) => status === 0 || status === 429 || status >= 500;

export class ResendError extends Error {
  constructor(message, { status, code, retryable }) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

/**
 * A Resend client. `apiKey` is passed in by the email service, which reads it from its own environment; it never comes
 * from a shop or a request. `sleep` waits between retries (tests pass one that doesn't wait).
 */
export function resendClient({ apiKey, fetch, tries = 3, sleep = (ms) => new Promise((done) => setTimeout(done, ms)) }) {
  if (typeof apiKey !== "string" || !/^re_\S+$/.test(apiKey)) throw new Error("The email key is missing or is not a Resend key");
  if (typeof fetch !== "function") throw new Error("The email service needs fetch");

  return {
    /** Sends one email; resolves to { id }. Throws a ResendError (with `retryable`) when Resend refuses it. */
    async send({ from, to, subject, html, text, replyTo, idempotencyKey, tags = [] }) {
      if (typeof idempotencyKey !== "string" || !idempotencyKey || idempotencyKey.length > 256) {
        throw new Error("every email needs an idempotency key of at most 256 characters");
      }
      const body = JSON.stringify({
        from,
        to: [to],
        subject,
        ...(html ? { html } : {}),
        ...(text ? { text } : {}),
        ...(replyTo ? { reply_to: [replyTo] } : {}),
        ...(tags.length ? { tags } : {}),
      });
      let last;
      for (let attempt = 1; attempt <= tries; attempt += 1) {
        if (attempt > 1) await sleep(500 * 2 ** (attempt - 2));
        let response;
        try {
          response = await fetch(RESEND_EMAILS_URL, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
            body,
          });
        } catch (error) {
          // The network dropped: the same key makes a retry safe even if Resend got the first one.
          last = new ResendError(`Resend could not be reached (${error?.message ?? error})`, { status: 0, code: "network", retryable: true });
          continue;
        }
        const answer = await response.json().catch(() => ({}));
        if (response.ok && typeof answer?.id === "string") return { id: answer.id };
        const status = response.ok ? 502 : response.status;
        last = new ResendError(`Resend refused the email (${status}${answer?.name ? ` ${answer.name}` : ""}: ${answer?.message ?? "no answer"})`, {
          status,
          code: answer?.name ?? "unknown",
          retryable: RETRYABLE(status),
        });
        if (!last.retryable) throw last;
      }
      throw last;
    },
  };
}
