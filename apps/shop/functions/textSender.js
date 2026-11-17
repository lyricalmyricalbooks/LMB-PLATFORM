// Text-message reminders (Services plan phase 7, 17 November 2026). The shop never holds the text company's keys: it
// asks the platform's texts door (LMB-PLATFORM services/texts, PLATFORM_TEXTS_URL) to send each text, proving who it is
// with its service key, like email. The platform bills the shop for its texts at cost on its monthly bill.
//
//   status()                                -> { available, price }   price: one text part, "1.6¢"; cached a few minutes
//   send({ to, body, kind, idempotencyKey }) -> { ok, id?, parts?, alreadySent?, retryable?, optedOut?, message? }
//
// A shop without the door (or one the platform hasn't opened texts to) answers `available: false`, and the admin's
// switch says "Opening soon". `send` never throws: a text is a nice extra next to the reminder email, never in its way.
const STATUS_MS = 5 * 60_000;

function createTextSender({ url, shopId, serviceKey, fetch = globalThis.fetch, now = () => Date.now(), timeoutMs = 20000 }) {
  const open = /^https:\/\/[^\s]+$/.test(String(url || ""));
  // One server runs every shop, so the answer is kept per shop.
  const cached = new Map();
  const idNow = () => String(typeof shopId === "function" ? shopId() : shopId);

  async function call(op, args = {}) {
    const key = String((typeof serviceKey === "function" ? serviceKey() : serviceKey) || "").trim();
    if (!open || !key) return { ok: false, retryable: false, message: "This shop isn't connected to the platform's texts." };
    try {
      const response = await fetch(`${url}/shop`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shop-Id": idNow(), Authorization: `Bearer ${key}` },
        body: JSON.stringify({ op: `texts.${op}`, args }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body) return { ok: false, retryable: response.status >= 500 || response.status === 429, message: String(body?.message || body?.error?.message || `The platform answered ${response.status}.`).slice(0, 300) };
      return body;
    } catch (err) {
      return { ok: false, retryable: false, message: `The platform's texts couldn't be reached (${err?.message || err}).` };
    }
  }

  return {
    async status() {
      if (!open) return { available: false, price: "" };
      const id = idNow();
      const kept = cached.get(id);
      if (kept && now() - kept.at < STATUS_MS) return kept.value;
      const answer = await call("status");
      const value = { available: answer?.available === true, price: typeof answer?.price === "string" ? answer.price : "" };
      cached.set(id, { at: now(), value });
      return value;
    },
    send: (message) => call("send", message),
  };
}

module.exports = { createTextSender };
