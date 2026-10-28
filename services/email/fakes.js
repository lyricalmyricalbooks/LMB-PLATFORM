// In-memory stand-ins for the email service's sent log and for Resend's answers, for tests. The real sent log is a
// Firestore collection in the platform project (`emailSent/<idempotency key>`), with the same three calls.

export function fakeSentLog() {
  const entries = new Map();
  return {
    entries,
    get: async (key) => (entries.has(key) ? { ...entries.get(key) } : null),
    put: async (key, entry) => void entries.set(key, { ...entry }),
    findSent: async (shopId, kind) => [...entries.values()].find((e) => e.shopId === shopId && e.kind === kind && e.status === "sent") ?? null,
    countSince: async (shopId, since) => [...entries.values()].filter((e) => e.shopId === shopId && e.status === "sent" && e.at >= since).length,
  };
}

/**
 * A pretend Resend behind `fetch`. `answers` is a list of { status, body } (or "network" to throw) used in order; when it
 * runs out every send is accepted. Like Resend, the same idempotency key returns the first answer without a second
 * email. `requests` keeps every call, `delivered` every email that would have gone out.
 */
export function fakeResendFetch(answers = []) {
  const queue = [...answers];
  const requests = [];
  const delivered = [];
  const byKey = new Map();
  const fetch = async (url, init) => {
    const request = { url, method: init.method, headers: { ...init.headers }, body: JSON.parse(init.body) };
    requests.push(request);
    const next = queue.shift();
    if (next === "network") throw new Error("socket hang up");
    if (next) return response(next.status, next.body);
    const key = init.headers["Idempotency-Key"];
    if (!byKey.has(key)) {
      byKey.set(key, `email_${delivered.length + 1}`);
      delivered.push(request.body);
    }
    return response(200, { id: byKey.get(key) });
  };
  return { fetch, requests, delivered };
}

const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
