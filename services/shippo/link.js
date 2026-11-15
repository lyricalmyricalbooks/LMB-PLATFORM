// Connect Shippo (each shop its own Shippo account, Julian's choice of 14 November 2026). A press signs in to its own
// free Shippo account and says yes once; its shop then shows carriers' live prices at checkout and buys labels with
// that account. Postage is paid by the press to Shippo; no label money goes through Colophon.
//
// Shippo's partner sign-in (OAuth) needs Colophon's client id and secret, which stay here. The shop's own server asks
// through the app store door (services/apps/shopDoor.js, service key), and the token ends up only in the shop's own
// admin-only record (apps/shop functions/shippoLink.js). Nothing here keeps it.
//
//   shippo.status                      { available }   false until SHIPPO_CLIENT_ID and SHIPPO_CLIENT_SECRET are set
//   shippo.connectLink { returnUrl }   { url }         Shippo's "allow Colophon" page; Shippo comes back to `oauthCallback`
//   shippo.claim { ticket }            { accessToken } swaps the one-use ticket (and the code kept with it) for the token
//
// `oauthCallback(query)` (GET /api/shippo/oauth) takes the one-use state, keeps Shippo's code under a new one-use ticket
// for ten minutes and sends the press back to their shop with `?shippo=ok&shippoTicket=…`. The shop's admin, signed in
// as the owner, then claims it. A ticket only works for the shop that asked, and only through that shop's own server, so
// someone who sends a press a link to allow Shippo can't catch the press's account in a shop of their own.
//
//   createShippoLink({ clientId, clientSecret, utmSource, redirectUri, states, registry, auditLog, fetch, now })
//
// Clients passed in:
//   states    put(id, record); take(id) -> record | null, once only     shippoStates/<id>
//   registry  getShop(shopId)
//   auditLog  write(shopId, id, entry), optional
import { randomBytes } from "node:crypto";
import { shopHosts } from "../payments/service.js";

export const AUTHORIZE_URL = "https://goshippo.com/oauth/authorize";
export const TOKEN_URL = "https://goshippo.com/oauth/access_token";
/** How long the press has to say yes on Shippo's page. */
export const STATE_MINUTES = 30;
/** How long the shop's admin has to claim what Shippo sent back. */
export const TICKET_MINUTES = 10;
export const ONE_USE = /^[0-9a-f]{48}$/;

export class ShippoLinkError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "ShippoLinkError";
    this.status = status;
    this.code = code;
  }
}

const oneUse = () => randomBytes(24).toString("hex");

export function createShippoLink({ clientId, clientSecret, utmSource = "", redirectUri, states, registry, auditLog = null, fetch = globalThis.fetch, now = () => Date.now() }) {
  const available = () => Boolean(clientId && clientSecret && redirectUri);
  const refuse = (status, code, message) => new ShippoLinkError(status, code, message);
  const needAvailable = () => {
    if (!available()) throw refuse(409, "not_available", "Connect Shippo opens soon.");
  };

  async function log(shopId, kind) {
    if (!auditLog) return;
    try {
      await auditLog.write(shopId, `shippo-${kind}-${now()}`, { kind: `shippo.${kind}`, at: new Date(now()).toISOString(), by: "Colophon" });
    } catch { /* a missed note never stops the connection */ }
  }

  /** Back to the shop's own page, with the outcome (and the ticket, when there is one) in the query. */
  function backTo(returnUrl, outcome, ticket = null) {
    const url = new URL(returnUrl);
    url.searchParams.set("shippo", outcome);
    if (ticket) url.searchParams.set("shippoTicket", ticket);
    return { status: 302, headers: { Location: url.toString() }, body: { shippo: outcome } };
  }

  const OPS = {
    "shippo.status": async () => ({ available: available() }),

    "shippo.connectLink": async (row, args) => {
      needAvailable();
      let url;
      try { url = new URL(String(args.returnUrl ?? "")); } catch { throw refuse(400, "bad_request", "returnUrl must be an address"); }
      if (url.protocol !== "https:" || !shopHosts(row).has(url.hostname.toLowerCase())) throw refuse(400, "bad_request", "returnUrl must be one of the shop's own addresses");
      url.searchParams.delete("shippo");
      url.searchParams.delete("shippoTicket");
      const state = oneUse();
      await states.put(state, { kind: "state", shopId: row.shopId, returnUrl: url.toString(), expiresAt: now() + STATE_MINUTES * 60_000 });
      const authorize = new URL(AUTHORIZE_URL);
      authorize.searchParams.set("response_type", "code");
      authorize.searchParams.set("client_id", clientId);
      authorize.searchParams.set("scope", "*");
      authorize.searchParams.set("state", state);
      authorize.searchParams.set("redirect_uri", redirectUri);
      if (utmSource) authorize.searchParams.set("utm_source", utmSource);
      return { url: authorize.toString() };
    },

    "shippo.claim": async (row, args) => {
      needAvailable();
      const ticket = String(args.ticket ?? "");
      const saved = ONE_USE.test(ticket) ? await states.take(ticket) : null;
      // Spent, unknown, late or another shop's: one answer, so a ticket can't be probed.
      if (!saved || saved.kind !== "ticket" || saved.shopId !== row.shopId || saved.expiresAt < now()) {
        throw refuse(410, "expired", "That Shippo sign-in has run out. Press Connect Shippo again.");
      }
      let response;
      try {
        response = await fetch(TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
          body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code: saved.code, grant_type: "authorization_code" }).toString(),
          signal: AbortSignal.timeout(15000),
        });
      } catch {
        throw refuse(502, "unreachable", "Shippo didn't answer. Press Connect Shippo again in a minute.");
      }
      let body = null;
      try { body = await response.json(); } catch { body = null; }
      const accessToken = typeof body?.access_token === "string" ? body.access_token.trim() : "";
      if (!response.ok || !accessToken) throw refuse(502, "refused", "Shippo didn't finish the connection. Press Connect Shippo again.");
      await log(row.shopId, "connected");
      return { accessToken };
    },
  };

  return {
    available,
    /** One op from a shop the door has already proved (its registry row). */
    async op(row, name, args = {}) {
      const run = Object.hasOwn(OPS, name) ? OPS[name] : null;
      if (!run) throw refuse(400, "bad_request", "Unknown call.");
      return run(row, args && typeof args === "object" ? args : {});
    },
    ops: Object.freeze(Object.keys(OPS)),

    async oauthCallback(query = {}) {
      const state = typeof query.state === "string" ? query.state : "";
      const saved = ONE_USE.test(state) ? await states.take(state) : null;
      if (!saved || saved.kind !== "state" || saved.expiresAt < now()) {
        return { status: 400, body: { ok: false, message: "This Shippo sign-in link has run out. Go back to your shop's admin and press Connect Shippo again." } };
      }
      const row = await registry.getShop(saved.shopId);
      if (!row || row.status === "abandoned") return backTo(saved.returnUrl, "failed");
      if (query.error || typeof query.code !== "string" || !query.code || query.code.length > 512) return backTo(saved.returnUrl, "denied");
      const ticket = oneUse();
      await states.put(ticket, { kind: "ticket", shopId: saved.shopId, code: query.code, expiresAt: now() + TICKET_MINUTES * 60_000 });
      return backTo(saved.returnUrl, "ok", ticket);
    },
  };
}

/** `shippoStates/<id>` in the platform's database: one-use, read and removed together. */
export function firestoreShippoStates(platform) {
  return {
    put: (id, record) => {
      if (!ONE_USE.test(id)) throw new Error("not a one-use id");
      return platform.set(`shippoStates/${id}`, record);
    },
    take: (id) => (ONE_USE.test(String(id)) ? platform.transaction(async (tx) => {
      const found = await tx.get(`shippoStates/${id}`);
      if (found) tx.remove(`shippoStates/${id}`);
      return found;
    }) : Promise.resolve(null)),
  };
}

/** The server's settings: on once both codes are in; Shippo comes back to <PLATFORM_URL>/api/shippo/oauth. */
export function shippoLinkConfig(env = {}, platformUrl = "") {
  const clientId = String(env.SHIPPO_CLIENT_ID ?? "").trim() || null;
  const clientSecret = String(env.SHIPPO_CLIENT_SECRET ?? "").trim() || null;
  const base = String(platformUrl ?? "").replace(/\/+$/, "");
  return { clientId, clientSecret, utmSource: String(env.SHIPPO_UTM_SOURCE ?? "").trim(), redirectUri: base ? `${base}/api/shippo/oauth` : null };
}
