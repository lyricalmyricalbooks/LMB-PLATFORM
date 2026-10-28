// In-memory stand-ins for the email service's sent log, Resend's answers and the newsletter reputation store, for tests. The real sent log is a
// Firestore collection in the platform project (`emailSent/<idempotency key>`), with the same three calls.

export function fakeSentLog() {
  const entries = new Map();
  return {
    entries,
    get: async (key) => (entries.has(key) ? { ...entries.get(key) } : null),
    put: async (key, entry) => void entries.set(key, { ...entry }),
    findSent: async (shopId, kind) => [...entries.values()].find((e) => e.shopId === shopId && e.kind === kind && e.status === "sent") ?? null,
    countSince: async (shopId, since, stream) => [...entries.values()].filter((e) => e.shopId === shopId && e.status === "sent" && e.at >= since && (!stream || (e.stream ?? "orders") === stream)).length,
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

/** The newsletter reputation store (reputation.js), in memory: each shop's pause state and its counted events. */
export function fakeReputationStore() {
  const states = new Map();
  const events = new Map();
  return {
    states,
    getState: async (shopId) => structuredClone(states.get(shopId) ?? null),
    setState: async (shopId, state) => void states.set(shopId, structuredClone(state)),
    addEvent: async (shopId, event) => {
      const list = events.get(shopId) ?? [];
      if (list.some((e) => e.id === event.id)) return false;
      events.set(shopId, [...list, { ...event }]);
      return true;
    },
    events: async (shopId, since) => (events.get(shopId) ?? []).filter((e) => e.at >= since).map((e) => ({ ...e })),
  };
}

/**
 * A pretend Resend domains list (ownDomain.js). `world.records(name)` are the records Resend asks for; a test moves a
 * domain with `setStatus(name, "verified" | "not_started" | "failed")`. `calls` keeps every change asked for.
 */
export function fakeResendDomains() {
  const domains = new Map();
  const calls = [];
  const byId = (id) => [...domains.values()].find((d) => d.id === id) ?? null;
  return {
    domains,
    calls,
    setStatus(name, status) { domains.get(name).status = status; },
    find: async (name) => (domains.has(name) ? structuredClone(domains.get(name)) : null),
    async create(name) {
      calls.push(["create", name]);
      if (domains.has(name)) throw new Error(`${name} is already added`);
      const domain = {
        id: `dom_${domains.size + 1}`, name, status: "not_started",
        records: [
          { record: "SPF", name: "send", type: "MX", value: "feedback-smtp.example.amazonses.com", priority: 10 },
          { record: "SPF", name: "send", type: "TXT", value: "v=spf1 include:amazonses.com ~all" },
          { record: "DKIM", name: "resend._domainkey", type: "TXT", value: "p=MIGfMA0GCSqGSIb3DQEB" },
        ],
      };
      domains.set(name, domain);
      return structuredClone(domain);
    },
    get: async (id) => structuredClone(byId(id)),
    async verify(id) { calls.push(["verify", id]); return { id }; },
    async remove(id) {
      calls.push(["remove", id]);
      const found = byId(id);
      if (found) domains.delete(found.name);
    },
  };
}
