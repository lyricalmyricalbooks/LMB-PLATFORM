// Mailchimp's Marketing API, read 11 November 2026 (https://mailchimp.com/developer/). Only the documented calls are used:
//
//   GET  https://login.mailchimp.com/oauth2/authorize?response_type=code&client_id&redirect_uri   the press says yes
//   POST https://login.mailchimp.com/oauth2/token   grant_type=authorization_code, client_id, client_secret,
//        redirect_uri, code (form body)   -> { access_token }   tokens never expire, so there's no refresh
//   GET  https://login.mailchimp.com/oauth2/metadata   Authorization: OAuth <token>   -> { dc }   the account's server
//   On https://<dc>.api.mailchimp.com/3.0, with Authorization: Bearer <token>:
//     GET   /lists?count&fields                                   the press's audiences
//     PUT   /lists/{list}/members/{md5 of lower-case email}       add or update; status_if_new, tags
//     POST  /lists/{list}/members/{hash}/tags                     { tags: [{ name, status: "active" }] } -> 204
//     PATCH /lists/{list}/members/{hash}                          { status: "unsubscribed" }
//     GET   /lists/{list}/members?status=unsubscribed&since_last_changed&count&offset&fields
//
// Errors are problem objects ({ title, detail, status }); an account may hold 10 connections at once, so calls go one at a
// time per press.
import { createHash } from "node:crypto";

export const MAILCHIMP_LOGIN = "https://login.mailchimp.com";
const SERVER = /^[a-z]{2,4}[0-9]{1,3}$/;
/** Each account lives on its own server: https://<dc>.<host>/3.0 */
const HOST = "api.mailchimp.com";

export class MailchimpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Mailchimp's member id: the MD5 of the lower-case address. */
export const memberHash = (email) => createHash("md5").update(String(email ?? "").trim().toLowerCase()).digest("hex");

function problemOf(status, body) {
  if (status === 401 || status === 403) return "Mailchimp no longer lets Colophon in. Connect Mailchimp again.";
  if (status === 404) return "Mailchimp couldn't find that audience. Pick it again.";
  if (status === 429) return "Mailchimp asked us to slow down. We'll try again shortly.";
  const said = typeof body?.detail === "string" ? body.detail : typeof body?.title === "string" ? body.title : "";
  if (status === 400) return said ? `Mailchimp said: ${said.slice(0, 300)}` : "Mailchimp couldn't take that.";
  return "Mailchimp isn't answering right now. We'll try again shortly.";
}

async function read(response) {
  const text = await response.text().catch(() => "");
  try { return text ? JSON.parse(text) : null; } catch { return null; }
}

/** Where the press goes to say yes to Colophon in Mailchimp. */
export function authorizeUrl({ clientId, redirectUri }) {
  const query = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri });
  return `${MAILCHIMP_LOGIN}/oauth2/authorize?${query}`;
}

/** Swaps Mailchimp's code for the press's token and finds the account's server. */
export async function connectAccount({ clientId, clientSecret, redirectUri, code, fetch = globalThis.fetch, timeoutMs = 15000 }) {
  const form = new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code });
  const tokenResponse = await fetch(`${MAILCHIMP_LOGIN}/oauth2/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: form.toString(), signal: AbortSignal.timeout(timeoutMs),
  }).catch(() => null);
  if (!tokenResponse) throw new MailchimpError(503, "Mailchimp isn't answering right now. Try again in a minute.");
  const tokenBody = await read(tokenResponse);
  if (!tokenResponse.ok || typeof tokenBody?.access_token !== "string") throw new MailchimpError(400, "Mailchimp didn't finish connecting. Press Connect Mailchimp again.");
  const meta = await fetch(`${MAILCHIMP_LOGIN}/oauth2/metadata`, { headers: { Authorization: `OAuth ${tokenBody.access_token}`, Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) }).catch(() => null);
  const metaBody = meta ? await read(meta) : null;
  const dc = String(metaBody?.dc ?? "");
  if (!meta?.ok || !SERVER.test(dc)) throw new MailchimpError(502, "Mailchimp didn't say where your account lives. Try connecting again.");
  return { accessToken: tokenBody.access_token, dc };
}

/** Calls for one press's Mailchimp account. */
export function createMailchimpClient({ accessToken, dc, fetch = globalThis.fetch, timeoutMs = 15000 }) {
  if (!SERVER.test(String(dc ?? ""))) throw new MailchimpError(400, "That isn't a Mailchimp server.");
  const root = `https://${dc}.${HOST}/3.0`;

  async function call(method, path, body) {
    const response = await fetch(`${root}${path}`, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    }).catch(() => null);
    if (!response) throw new MailchimpError(503, "Mailchimp isn't answering right now. We'll try again shortly.");
    const answer = await read(response);
    if (!response.ok) throw new MailchimpError(response.status, problemOf(response.status, answer));
    return answer;
  }
  const member = (listId, email) => `/lists/${encodeURIComponent(listId)}/members/${memberHash(email)}`;

  return {
    async lists() {
      const answer = await call("GET", "/lists?count=100&fields=lists.id,lists.name,lists.stats.member_count");
      return (answer?.lists ?? []).map((list) => ({ id: String(list.id), name: String(list.name ?? "").slice(0, 100), members: Number(list.stats?.member_count ?? 0) }));
    },
    /** Adds the address as subscribed if it's new. Someone who unsubscribed in Mailchimp stays unsubscribed. */
    async upsertMember(listId, email, tags = []) {
      return call("PUT", member(listId, email), { email_address: email, status_if_new: "subscribed", ...(tags.length ? { tags } : {}) });
    },
    async tag(listId, email, names) {
      if (!names.length) return null;
      return call("POST", `${member(listId, email)}/tags`, { tags: names.map((name) => ({ name: String(name).slice(0, 100), status: "active" })) });
    },
    /** `hash` is the member id (memberHash), so the address itself needn't be kept. */
    async unsubscribe(listId, hash) {
      if (!/^[a-f0-9]{32}$/.test(String(hash))) throw new MailchimpError(400, "That isn't a Mailchimp member.");
      return call("PATCH", `/lists/${encodeURIComponent(listId)}/members/${hash}`, { status: "unsubscribed" });
    },
    /** Addresses unsubscribed in Mailchimp since `since`, a page at a time. */
    async unsubscribedSince(listId, since, offset = 0) {
      const query = new URLSearchParams({ status: "unsubscribed", count: "1000", offset: String(offset), fields: "members.email_address,members.last_changed,total_items" });
      if (since) query.set("since_last_changed", since);
      const answer = await call("GET", `/lists/${encodeURIComponent(listId)}/members?${query}`);
      return { members: (answer?.members ?? []).map((m) => ({ email: String(m.email_address ?? "").toLowerCase(), changedAt: String(m.last_changed ?? "") })), total: Number(answer?.total_items ?? 0) };
    },
  };
}
