// In-memory stand-ins for the email service's sent log, Google's answers and the newsletter reputation store, for tests. The real sent log is a
// Firestore collection in the platform project (`emailSent/<idempotency key>`), with the same three calls.
import { createEmailService } from "./index.js";

export function fakeSentLog() {
  const entries = new Map();
  return {
    entries,
    get: async (key) => (entries.has(key) ? { ...entries.get(key) } : null),
    put: async (key, entry) => void entries.set(key, { ...entry }),
    findSent: async (shopId, kind) => [...entries.values()].find((e) => e.shopId === shopId && e.kind === kind && e.status === "sent") ?? null,
    countSince: async (shopId, since, stream) => [...entries.values()].filter((e) => e.shopId === shopId && e.status === "sent" && e.at >= since && (!stream || (e.stream ?? "orders") === stream)).length,
    // The platform's own emails about one shop, newest first (control-room/timeline.js, plan 19.10).
    listForShop: async (shopId, { limit = 200 } = {}) => [...entries.values()].filter((e) => e.shopId === shopId && e.platform === true)
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit).map((e) => ({ ...e })),
  };
}

/** Reads back an email that gmail.js wrote (RFC 2822, base64 parts) as { from, to: [..], subject, html, text, reply_to, tags }. */
export function readMime(mime) {
  const [head, ...rest] = mime.split("\r\n\r\n");
  const headers = Object.fromEntries(head.split("\r\n").map((line) => [line.slice(0, line.indexOf(":")).toLowerCase(), line.slice(line.indexOf(":") + 1).trim()]));
  const unword = (v) => (v ?? "").replace(/=\?UTF-8\?B\?([^?]*)\?=/g, (_, b) => Buffer.from(b, "base64").toString("utf8"));
  const body = rest.join("\r\n\r\n");
  const part = (type) => {
    const m = new RegExp(`Content-Type: ${type}; charset=UTF-8\\r\\nContent-Transfer-Encoding: base64\\r\\n\\r\\n([A-Za-z0-9+/=\\r\\n]*)`).exec(body);
    return m ? Buffer.from(m[1].replace(/\r\n/g, ""), "base64").toString("utf8") : undefined;
  };
  const from = unword(headers.from).replace(/^([^"<][^<]*?) </, '"$1" <');
  return {
    from,
    to: [headers.to],
    subject: unword(headers.subject),
    ...(part("text/html") !== undefined ? { html: part("text/html") } : {}),
    ...(part("text/plain") !== undefined ? { text: part("text/plain") } : {}),
    ...(headers["reply-to"] ? { reply_to: [headers["reply-to"]] } : {}),
    ...(headers["x-colophon-tags"] ? { tags: headers["x-colophon-tags"].split("; ").map((t) => ({ name: t.slice(0, t.indexOf("=")), value: t.slice(t.indexOf("=") + 1) })) } : {}),
    key: headers["x-colophon-key"],
  };
}

/**
 * A pretend Google behind `fetch`: Cloud Run's token, IAM's signing, the token swap and Gmail's send. `answers` is a
 * list of { status, body } (or "network" to throw) used in order for sends; when it runs out every send is accepted.
 * `requests` keeps every send (`body`: the email read back, `headers["Idempotency-Key"]`: its X-Colophon-Key),
 * `delivered` every email that went out, `auth` the signing calls. `tokenAnswer` replaces the token swap's answer.
 */
export function fakeGmailFetch(answers = [], { tokenAnswer = null } = {}) {
  const queue = [...answers];
  const requests = [];
  const delivered = [];
  const auth = [];
  const fetch = async (url, init = {}) => {
    if (url.startsWith("http://metadata.google.internal/")) return response(200, { access_token: "server-token", expires_in: 3600 });
    if (url.startsWith("https://iamcredentials.googleapis.com/")) {
      auth.push({ url, payload: JSON.parse(JSON.parse(init.body).payload) });
      return response(200, { keyId: "k1", signedJwt: "signed.jwt.token" });
    }
    if (url.startsWith("https://oauth2.googleapis.com/token")) return tokenAnswer ? response(tokenAnswer.status, tokenAnswer.body) : response(200, { access_token: "mail-token", expires_in: 3600 });
    const raw = JSON.parse(init.body).raw;
    const message = readMime(Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    const { key, ...body } = message;
    const request = { url, method: init.method, headers: { ...init.headers, "Idempotency-Key": key }, body };
    requests.push(request);
    const next = queue.shift();
    if (next === "network") throw new Error("socket hang up");
    if (next) return response(next.status, next.body);
    delivered.push(body);
    return response(200, { id: `email_${delivered.length}` });
  };
  return { fetch, requests, delivered, auth };
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
 * The real email service with pretend Google, delivering through `deliver(email) -> { id }` (email: { from, to: [..],
 * subject, html, text, reply_to, tags }). The walkthrough uses it to show the platform's real emails in its practice
 * inbox (walkthrough/practiceEmail.js).
 */
export function practiceEmailService({ env = {}, registry, deliver }) {
  const google = fakeGmailFetch();
  const fetch = async (url, init = {}) => {
    if (!url.startsWith("https://gmail.googleapis.com/")) return google.fetch(url, init);
    const raw = JSON.parse(init.body).raw;
    const { key: _key, ...email } = readMime(Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    const { id } = await deliver(email);
    return new Response(JSON.stringify({ id }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  return createEmailService({ env: { ...env, ...pretendEmailEnv() }, fetch, registry, sentLog: fakeSentLog() });
}

/** Email sending switched on with a made-up project, for tests that build the hosted server (server/fakes.js). */
export const pretendEmailEnv = () => ({ GMAIL_SENDING: "on", GMAIL_ACCOUNT: "platform-mail@lmb-platform-prod.iam.gserviceaccount.com" });
