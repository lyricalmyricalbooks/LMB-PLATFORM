// The Mailchimp app (code plan 26.12, docs/app-store.md): Colophon's own email marketing app, on the same app store
// plumbing as any outside app.
//
//   1. The press adds "Mailchimp" from Settings › Apps. The permission page asks to see orders and to see and change
//      customers; coming back, the connect page (accounts/mailchimp.html) calls `begin`, which swaps the install code for
//      the app's key and answers Mailchimp's own "allow Colophon" address. Mailchimp sends the press back to the same
//      page, which calls `finish`; the press picks an audience when the account has more than one.
//   2. Every 15 minutes (`sweep`, the `mailchimp-sync` job), for each connected shop:
//      - people who confirmed the shop's newsletter, and never unsubscribed, are added to the audience (only new ones are
//        made "subscribed"; someone who unsubscribed in Mailchimp stays unsubscribed), tagged "Shop newsletter";
//      - someone who unsubscribes in the shop (its emails' link, a privacy request) is unsubscribed in Mailchimp;
//      - someone who unsubscribes in Mailchimp is unsubscribed in the shop too (POST /api/apps/v1/subscribers/unsubscribe).
//   3. When an order is paid (alert orders/paid), a buyer who is on the list is tagged "Customer" and "Bought: <title>".
//
// Only addresses the shop sent are ever touched in Mailchimp. Per address the app keeps two fingerprints (the shop's
// opt-out id and Mailchimp's member id), never the address. Removing the app or disconnecting forgets the shop.
//
//   createMailchimpApp({ appId, appSecret, clientId, clientSecret, connections, members, sealKey, exchange, appCall,
//                        roleIn, fetch, now, returnAddress })
//
// Clients passed in:
//   connections  get(shopId); put(shopId, row); remove(shopId); list()      mailchimpShops/<shopId>
//   members      get(id); put(id, row); removeShop(shopId)                   mailchimpMembers/<shopId~optOutId>
import { createHash, timingSafeEqual } from "node:crypto";
import { SignupError, personOf } from "../../signup/signup.js";
import { seal, unseal } from "../payments/tokenSeal.js";
import { alertSignature } from "../apps/alerts.js";
import { optOutId } from "../apps/connection.js";
import { MailchimpError, authorizeUrl, connectAccount, createMailchimpClient, memberHash } from "./client.js";

export const SHOP = /^[a-z0-9][a-z0-9-]{1,62}$/;
/** Addresses added per shop per run, so one big list can't hold up the others. */
export const PER_RUN = 1000;
export const NEWSLETTER_TAG = "Shop newsletter";
const V1 = ["", "api", "apps", "v1"].join("/");
const sha256 = (value) => createHash("sha256").update(String(value), "utf8").digest("hex");
const text = (value, max = 200) => (typeof value === "string" ? value.trim().slice(0, max) : "");

export function createMailchimpApp({
  appId, appSecret, clientId, clientSecret, connections, members, sealKey, exchange, appCall, roleIn,
  fetch = globalThis.fetch, now = () => new Date(), returnAddress,
}) {
  const at = () => now().toISOString();
  const ready = () => Boolean(appId && appSecret && clientId && clientSecret && sealKey);
  const bound = (shopId) => `mailchimp:${shopId}`;
  const open = (row) => unseal(sealKey, bound(row.shopId), row.sealed);
  const clientOf = (row, secrets) => createMailchimpClient({ accessToken: secrets.accessToken, dc: row.dc, fetch });
  const memberId = (shopId, fingerprint) => `${shopId}~${fingerprint}`;
  const problem = (error) => ({ at: at(), words: error.message });

  function needReady() {
    if (!ready()) throw new SignupError(503, "Mailchimp isn't connected to Colophon yet. Try again soon.");
  }

  async function ownerOf(claims, shopId) {
    const person = personOf(claims);
    if (typeof shopId !== "string" || !SHOP.test(shopId)) throw new SignupError(400, "Pick a shop.");
    const role = await roleIn(person, shopId);
    if (role !== "owner") throw new SignupError(403, role ? "Only the shop's owner can connect Mailchimp." : "You're not on that shop's team.");
    return person;
  }

  /** Calls the app connection with this shop's key, like any app. */
  const asApp = (secrets, method, path, body, idempotencyKey) => appCall({
    method, path, body,
    headers: { authorization: `Bearer ${secrets.appKey}`, "content-type": "application/json", ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}) },
  });

  async function forget(shopId, why) {
    const row = await connections.get(shopId);
    if (row) await connections.remove(shopId);
    await members.removeShop(shopId);
    return { removed: Boolean(row), why };
  }

  function view(row) {
    if (!row) return { available: true, appId, connected: false, stage: "none" };
    return {
      available: true, appId, stage: row.stage, connected: row.stage === "connected",
      audience: row.listId ? { id: row.listId, name: row.listName } : null,
      ...(row.stage === "choose" ? { lists: row.lists ?? [] } : {}),
      added: row.added ?? 0, lastSyncAt: row.lastSyncAt ?? null, lastProblem: row.lastProblem ?? null,
    };
  }

  /** Reads one page from the shop through the app connection. */
  async function shopPage(secrets, what, query) {
    const answer = await asApp(secrets, "GET", `${V1}/${what}?${new URLSearchParams(query)}`);
    if (answer.status === 401) {
      const error = new Error("removed");
      error.removed = true;
      throw error;
    }
    if (answer.status !== 200) throw new Error(answer.body?.message ?? "The shop didn't answer.");
    return answer.body;
  }

  /** One shop's run: new readers in, unsubscribes both ways. */
  async function syncShop(row) {
    const secrets = open(row);
    const client = clientOf(row, secrets);
    const started = at();
    const cursors = { ...(row.cursors ?? {}) };
    let added = 0;

    // 1. New readers of the shop's newsletter.
    const since = cursors.subscribers ?? "";
    let after = "";
    for (let budget = PER_RUN; budget > 0;) {
      const page = await shopPage(secrets, "subscribers", { limit: String(Math.min(250, budget)), ...(since ? { since } : {}), ...(after ? { after } : {}) });
      for (const reader of page.subscribers ?? []) {
        const fingerprint = optOutId(reader.email);
        const known = await members.get(memberId(row.shopId, fingerprint));
        // Someone already sent stays as Mailchimp has them (the last reader of a run is read again on the next one).
        if (!known) {
          await client.upsertMember(row.listId, reader.email, [NEWSLETTER_TAG]);
          added += 1;
          await members.put(memberId(row.shopId, fingerprint), { shopId: row.shopId, fingerprint, hash: memberHash(reader.email), addedAt: at() });
        }
        if (reader.subscribedAt) cursors.subscribers = reader.subscribedAt;
        budget -= 1;
      }
      if (!page.next) break;
      after = page.next;
    }

    // 2. Unsubscribed in the shop: unsubscribed in Mailchimp.
    const shopOut = await shopPage(secrets, "unsubscribes", { limit: "250", ...(cursors.shopOptOuts ? { since: cursors.shopOptOuts } : { since: row.connectedAt }) });
    for (const out of shopOut.unsubscribes ?? []) {
      const known = await members.get(memberId(row.shopId, out.id));
      if (known && !known.unsubscribed) {
        await client.unsubscribe(row.listId, known.hash);
        await members.put(memberId(row.shopId, out.id), { ...known, unsubscribed: "shop", unsubscribedAt: at() });
      }
      if (out.at) cursors.shopOptOuts = out.at;
    }

    // 3. Unsubscribed in Mailchimp: unsubscribed in the shop. Only addresses the shop sent are ever acted on.
    const mcSince = cursors.mailchimp ?? row.connectedAt;
    for (let offset = 0; offset < 5000;) {
      const { members: gone, total } = await client.unsubscribedSince(row.listId, mcSince, offset);
      for (const person of gone) {
        const fingerprint = optOutId(person.email);
        const known = await members.get(memberId(row.shopId, fingerprint));
        if (!known || known.unsubscribed) continue;
        const answer = await asApp(secrets, "POST", `${V1}/subscribers/unsubscribe`, { email: person.email }, `mailchimp-out-${fingerprint}`);
        if (answer.status === 401) {
          const error = new Error("removed");
          error.removed = true;
          throw error;
        }
        if (answer.status === 200 || answer.status === 202) await members.put(memberId(row.shopId, fingerprint), { ...known, unsubscribed: "mailchimp", unsubscribedAt: at() });
      }
      offset += gone.length;
      if (!gone.length || offset >= total) break;
    }
    // A minute's overlap, so a change landing while we read is seen twice, never missed.
    cursors.mailchimp = new Date(Date.parse(started) - 60_000).toISOString();

    await connections.put(row.shopId, { ...row, cursors, added: (row.added ?? 0) + added, lastSyncAt: at(), lastProblem: null });
    return added;
  }

  return {
    ready,
    async status(claims, { shopId } = {}) {
      await ownerOf(claims, shopId);
      if (!ready()) return { available: false, connected: false };
      return view(await connections.get(shopId));
    },

    /** Back from the permission page with an install code (or reconnecting): where to send the press in Mailchimp. */
    async begin(claims, { shopId, code } = {}) {
      needReady();
      const person = await ownerOf(claims, shopId);
      const before = await connections.get(shopId);
      let appKey = before ? open(before).appKey : null;
      if (code) {
        const swapped = await exchange({ appId, secret: appSecret, code, returnAddress });
        if (swapped.shopId !== shopId) throw new SignupError(400, "That code was for another shop. Add the app again from Settings › Apps.");
        appKey = swapped.accessToken;
      }
      if (!appKey) throw new SignupError(400, "Add Mailchimp from Settings › Apps first.");
      const kept = before ? open(before) : {};
      await connections.put(shopId, {
        ...(before ?? { shopId, connectedAt: at(), stage: "mailchimp" }),
        shopId, sealed: seal(sealKey, bound(shopId), { ...kept, appKey }), startedBy: person.email, updatedAt: at(),
      });
      return { url: authorizeUrl({ clientId, redirectUri: returnAddress }) };
    },

    /** Back from Mailchimp with its code: keep the press's token, then the audience. */
    async finish(claims, { shopId, code } = {}) {
      needReady();
      const person = await ownerOf(claims, shopId);
      const before = await connections.get(shopId);
      if (!before) throw new SignupError(400, "Add Mailchimp from Settings › Apps first.");
      if (typeof code !== "string" || !code) throw new SignupError(400, "Mailchimp didn't send us back. Press Connect Mailchimp again.");
      let account;
      let lists;
      try {
        account = await connectAccount({ clientId, clientSecret, redirectUri: returnAddress, code, fetch });
        lists = await createMailchimpClient({ ...account, fetch }).lists();
      } catch (error) {
        if (error instanceof MailchimpError) throw new SignupError(error.status >= 500 ? 503 : 400, error.message);
        throw error;
      }
      if (!lists.length) throw new SignupError(400, "Your Mailchimp account has no audience yet. Make one in Mailchimp, then connect again.");
      const kept = open(before);
      const one = lists.length === 1 ? lists[0] : lists.find((list) => list.id === before.listId);
      const row = {
        ...before, sealed: seal(sealKey, bound(shopId), { appKey: kept.appKey, accessToken: account.accessToken }), dc: account.dc,
        tokenFingerprint: sha256(account.accessToken).slice(0, 12), connectedBy: person.email, updatedAt: at(), lastProblem: null,
        ...(one ? { stage: "connected", listId: one.id, listName: one.name, lists: null } : { stage: "choose", lists }),
      };
      await connections.put(shopId, row);
      return view(row);
    },

    /** The account's audiences, to change which one readers go to. */
    async lists(claims, { shopId } = {}) {
      needReady();
      await ownerOf(claims, shopId);
      const row = await connections.get(shopId);
      if (!row?.dc) throw new SignupError(400, "Connect Mailchimp first.");
      try {
        return { lists: await clientOf(row, open(row)).lists(), current: row.listId ?? null };
      } catch (error) {
        if (error instanceof MailchimpError) throw new SignupError(error.status >= 500 ? 503 : 400, error.message);
        throw error;
      }
    },

    /** The audience new readers go to. Changing it starts the list again from the beginning. */
    async pickAudience(claims, { shopId, listId } = {}) {
      needReady();
      await ownerOf(claims, shopId);
      const row = await connections.get(shopId);
      if (!row?.dc) throw new SignupError(400, "Connect Mailchimp first.");
      let lists;
      try {
        lists = await clientOf(row, open(row)).lists();
      } catch (error) {
        if (error instanceof MailchimpError) throw new SignupError(error.status >= 500 ? 503 : 400, error.message);
        throw error;
      }
      const list = lists.find((l) => l.id === listId);
      if (!list) throw new SignupError(400, "Pick one of your Mailchimp audiences.");
      const changed = row.listId !== list.id;
      const next = { ...row, stage: "connected", listId: list.id, listName: list.name, lists: null, updatedAt: at(), ...(changed ? { cursors: {}, added: 0 } : {}) };
      if (changed) await members.removeShop(shopId);
      await connections.put(shopId, next);
      return view(next);
    },

    async disconnect(claims, { shopId } = {}) {
      await ownerOf(claims, shopId);
      return forget(shopId, "disconnected by the owner");
    },

    async alert({ headers = {}, rawBody = "" }) {
      needReady();
      const given = Buffer.from(String(headers["x-colophon-signature"] ?? ""));
      const expected = Buffer.from(alertSignature(sha256(appSecret), rawBody));
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new SignupError(401, "That alert isn't signed by Colophon.");
      let alert;
      try { alert = JSON.parse(rawBody); } catch { throw new SignupError(400, "That alert isn't readable."); }
      const shopId = text(alert?.shopId, 63);
      if (!SHOP.test(shopId)) return { ignored: "no shop" };
      if (alert.topic === "app/uninstalled") return forget(shopId, "app removed");
      if (alert.topic !== "orders/paid") return { ignored: alert.topic };
      const row = await connections.get(shopId);
      if (row?.stage !== "connected") return { ignored: "not connected" };
      const order = alert.data?.order ?? {};
      const email = text(order.customer?.email, 254).toLowerCase();
      if (!email) return { ignored: "no email" };
      const known = await members.get(memberId(shopId, optOutId(email)));
      // Only people on the newsletter: a buyer who never signed up is never added to Mailchimp.
      if (!known || known.unsubscribed) return { ignored: "not on the newsletter" };
      const titles = [...new Set((order.items ?? []).map((item) => text(item.title, 90)).filter(Boolean))].slice(0, 10);
      try {
        await clientOf(row, open(row)).tag(row.listId, email, ["Customer", ...titles.map((title) => `Bought: ${title}`)]);
      } catch (error) {
        if (!(error instanceof MailchimpError)) throw error;
        if (error.status === 401 || error.status === 403) await connections.put(shopId, { ...row, lastProblem: problem(error) });
        // Anything else: the alert is sent again later.
        if (error.status >= 500 || error.status === 429) throw new SignupError(503, error.message);
        return { problem: error.message };
      }
      return { tagged: titles.length + 1 };
    },

    async sweep() {
      const summary = { shops: 0, added: 0, problems: 0 };
      if (!ready()) return { ...summary, skipped: "not connected" };
      for (const row of await connections.list()) {
        if (row.stage !== "connected") continue;
        summary.shops += 1;
        try {
          summary.added += await syncShop(row);
        } catch (error) {
          summary.problems += 1;
          if (error.removed) { await forget(row.shopId, "app removed from the shop"); continue; }
          if (error instanceof MailchimpError) await connections.put(row.shopId, { ...row, lastProblem: problem(error) });
        }
      }
      return summary;
    },
  };
}
