// The text sender: one Twilio message per call, with an injected `fetch` (tests use fakes.js). The keys come from
// config.js. Twilio has no idempotency key, so only its slow-down answer (429) is called retryable: a dropped
// connection or a server error may still have sent the text, and a second text is worse than a missing one.
const API = "https://api.twilio.com/2010-04-01";

// Twilio's answers that a retry can never fix: a number that can't get texts, one that replied STOP, a landline.
const NEVER = new Set([21211, 21214, 21217, 21401, 21407, 21408, 21610, 21612, 21614, 30003, 30005, 30006]);

export function twilioClient({ fetch, sid, token, from }) {
  const auth = `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;
  return {
    /** { to: "+1…", body } -> { id, parts }; throws with `retryable` and `optedOut` when Twilio says no. */
    async send({ to, body }) {
      const form = new URLSearchParams({ To: to, Body: body, ...(from.startsWith("MG") ? { MessagingServiceSid: from } : { From: from }) });
      let response;
      try {
        response = await fetch(`${API}/Accounts/${sid}/Messages.json`, {
          method: "POST", headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString(),
        });
      } catch (error) {
        throw Object.assign(new Error(`The text company couldn't be reached (${error?.message ?? error}).`), { retryable: false, unsure: true });
      }
      const answer = await response.json().catch(() => ({}));
      if (response.ok && answer?.sid) return { id: String(answer.sid), parts: Math.max(1, Number(answer.num_segments) || 1) };
      const code = Number(answer?.code) || 0;
      throw Object.assign(new Error(`The text company refused the text (${response.status}${code ? `, ${code}` : ""}: ${String(answer?.message ?? "no answer").slice(0, 200)}).`), {
        retryable: response.status === 429, optedOut: code === 21610, permanent: NEVER.has(code),
      });
    },
  };
}
