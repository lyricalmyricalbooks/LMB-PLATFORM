// The social service (code plan 27.1-27.3): a press's shop connects its Facebook Page and Instagram account, Pinterest
// and TikTok, sends its product file to their catalogs, and posts a product. The shop's server calls it with the shop's
// service key (`X-Shop-Id` + `Authorization: Bearer`), like the payment, email, domain and bookkeeping services; nothing
// here is reachable without it except the networks' sign-in answers. **Off unless the platform turns it on**
// (config.js `SOCIAL_ENABLED`); while off, `social.status` says so and the shop offers the by-hand steps instead.
//
//   social.status                                  each network: offered, connected, the account, its places (Pages,
//                                                  Instagram accounts, boards), the catalog, and a lost connection
//   social.connectLink { network, returnUrl }      the network's sign-in page; it sends the press back to
//                                                  `oauthCallback` (GET /<network>/oauth), which seals the tokens
//   social.sendCatalog { network, feedUrl, currency }  Meta: a catalog with a daily scheduled feed of the shop's product
//                                                  file; Pinterest: a catalog feed. Re-runnable: what exists is kept
//   social.publish { postId, placeId, imageUrl, caption, link, title?, altText?, retailerId?, tagProduct? }
//                                                  one post in one place. Never twice: `sent` holds one record per
//                                                  shop, post and place, claimed before the network is called
//   social.disconnect { network }                  gives the permission back; the catalog ids stay for a reconnect
//
// A token the network no longer accepts marks the connection lost: posting stops and the shop's Sales channels page
// says to connect again. Each change is logged in the registry and the shop's audit log.
//
// Clients (fakes in fakes.js):
//   clients      { meta?, pinterest?, tiktok? } from networks.js (only the networks whose keys are set)
//   registry     getShop(shopId), recordEvent(shopId, entry)
//   auditLog     write(shopId, id, entry)
//   connections  get(shopId, network), set(shopId, network, record), listFor(shopId)
//   states       put(state, { shopId, network, returnUrl, expiresAt }); take(state) -> that record | null (once only)
//   sent         get(key); claim(key, record, { staleBefore }) -> { claimed, existing } (atomic); put(key, record)
import { randomBytes } from "node:crypto";
import { serviceKeyMatches } from "../email/http.js";
import { seal, unseal } from "../payments/tokenSeal.js";
import { shopHosts } from "../payments/service.js";
import { CAPTION_MAX, NETWORKS, NETWORK_NAMES } from "./endpoints.js";
import { SocialApiError } from "./networks.js";

export class SocialError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "SocialError";
    this.status = status;
    this.code = code;
  }
}

const STATE_MS = 15 * 60 * 1000;
const REFRESH_BEFORE_MS = 5 * 60 * 1000;
/** A claim older than this is taken to have died half-way and may be tried again. */
export const SENDING_STALE_MS = 10 * 60 * 1000;
const POST_ID = /^[A-Za-z0-9_-]{1,64}$/;
const PLACE_ID = /^(fb|ig|pin|tt):[A-Za-z0-9_.-]{1,80}$/;
const RETAILER_ID = /^[A-Za-z0-9_.:-]{1,100}$/;

const bad = (message) => new SocialError(400, "bad_request", message);
const nameOf = (network) => NETWORK_NAMES[network] ?? network;

function httpsUrl(value, what) {
  let url;
  try { url = new URL(String(value ?? "")); } catch { throw bad(`${what} must be an address`); }
  if (url.protocol !== "https:") throw bad(`${what} must be an https address`);
  return url;
}

/** Plain words for a network's refusal: what the press sees. The network's own words go to the control room only. */
function refusalWords(network, err) {
  if (err.lost) return `${nameOf(network)} stopped accepting this shop's connection. Connect it again from Sales channels.`;
  if (err.code === "no_business") return "Facebook needs a business portfolio to hold your catalog. Make one in Meta Business Suite, then try again.";
  if (err.code === "no_catalog") return "TikTok's catalog comes with TikTok Shop, which isn't linked yet. Your TikTok posts still link to your shop.";
  if (err.status >= 500) return `${nameOf(network)} didn't answer. Try again in a few minutes.`;
  return `${nameOf(network)} turned that down. Check the photo and the words, then try again.`;
}

export function createSocialService({ clients, registry, auditLog, connections, states, sent, config, now = () => Date.now() }) {
  const iso = (ms = now()) => new Date(ms).toISOString();
  const bound = (shopId, network) => `social/${shopId}/${network}`;
  const sealKey = () => {
    if (!config.tokenKey) throw new SocialError(503, "social_off", "Social channels aren't set up on the platform yet.");
    return config.tokenKey;
  };
  const offered = (network) => Boolean(config.enabled && clients[network]);
  const connected = (conn) => Boolean(conn?.sealed && !conn.disconnectedAt);

  async function logChange(shopId, id, entry) {
    const full = { id, source: "social-service", at: iso(), ...entry };
    await registry.recordEvent(shopId, full);
    await auditLog.write(shopId, id, full);
  }

  function networkArg(args) {
    const network = args?.network;
    if (!NETWORKS.includes(network)) throw bad("network must be one of " + NETWORKS.join(", "));
    if (!offered(network)) throw new SocialError(409, "network_off", `${nameOf(network)} isn't available yet.`);
    return network;
  }

  async function status(row) {
    const networks = [];
    for (const network of NETWORKS) {
      const conn = await connections.get(row.shopId, network);
      const linked = connected(conn);
      networks.push({
        network, name: nameOf(network), available: offered(network),
        connected: linked && !conn.problem,
        problem: linked ? conn.problem ?? null : null,
        accountName: linked ? conn.accountName ?? null : null,
        places: linked ? (conn.places ?? []).map(({ id, kind, name }) => ({ id, kind, name })) : [],
        catalog: conn?.catalog?.feedId ? { sentAt: conn.catalog.sentAt, feedUrl: conn.catalog.feedUrl } : null,
        canSendCatalog: network !== "tiktok",
        connectedAt: linked ? conn.connectedAt ?? null : null,
      });
    }
    return { enabled: Boolean(config.enabled), networks };
  }

  async function connectLink(row, args = {}) {
    const network = networkArg(args);
    const url = httpsUrl(args.returnUrl, "returnUrl");
    if (!shopHosts(row).has(url.hostname.toLowerCase())) throw bad("returnUrl must be one of the shop's own addresses");
    const state = randomBytes(24).toString("hex");
    const expiresAt = now() + STATE_MS;
    await states.put(state, { shopId: row.shopId, network, returnUrl: url.toString(), expiresAt });
    return { url: clients[network].authorizeUrl({ state, redirectUrl: config.redirectUrl(network) }), expiresAt: Math.floor(expiresAt / 1000) };
  }

  /** Opens the connection's tokens (fresh ones when they are about to end), runs `job`, and marks the link lost if the
   *  network no longer accepts it. */
  async function withTokens(row, network, job) {
    const conn = await connections.get(row.shopId, network);
    if (!connected(conn)) throw new SocialError(409, "not_connected", `${nameOf(network)} isn't connected. Connect it from Sales channels.`);
    if (conn.problem === "lost") throw new SocialError(409, "lost", refusalWords(network, { lost: true }));
    const client = clients[network];
    let tokens = unseal(sealKey(), bound(row.shopId, network), conn.sealed);
    try {
      if (tokens.refreshToken && tokens.accessExpiresAt && tokens.accessExpiresAt - now() <= REFRESH_BEFORE_MS) {
        tokens = await client.refresh(tokens);
        await connections.set(row.shopId, network, { ...conn, sealed: seal(sealKey(), bound(row.shopId, network), tokens), refreshedAt: iso() });
      }
      return await job(tokens, client, conn);
    } catch (err) {
      if (err instanceof SocialApiError && err.lost) {
        const latest = await connections.get(row.shopId, network);
        if (latest && !latest.problem) {
          await connections.set(row.shopId, network, { ...latest, problem: "lost", lostAt: iso(), lostDetail: err.message });
          await logChange(row.shopId, `social-lost-${network}-${now()}`, { kind: "social.lost", network, detail: err.message });
        }
      }
      throw err;
    }
  }

  async function sendCatalog(row, args = {}) {
    const network = networkArg(args);
    if (network === "tiktok") throw new SocialApiError("tiktok", 409, "no catalog", { code: "no_catalog" });
    const feed = httpsUrl(args.feedUrl, "feedUrl");
    if (!shopHosts(row).has(feed.hostname.toLowerCase())) throw bad("feedUrl must be on one of the shop's own addresses");
    const currency = String(args.currency ?? "CAD").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw bad("currency must be a three-letter code");
    return withTokens(row, network, async (tokens, client, conn) => {
      const existing = conn.catalog?.feedUrl === feed.toString() ? conn.catalog : { catalogId: conn.catalog?.catalogId ?? null };
      const done = await client.sendCatalog(tokens, {
        feedUrl: feed.toString(), name: `${row.pressName || "Shop"} products`, currency, locale: "en-CA", existing,
      });
      const unchanged = existing.feedId && existing.feedId === done.feedId && existing.catalogId === done.catalogId;
      if (unchanged) return { catalog: { sentAt: conn.catalog.sentAt, feedUrl: conn.catalog.feedUrl }, changed: false };
      const catalog = { catalogId: done.catalogId, feedId: done.feedId, feedUrl: feed.toString(), sentAt: iso() };
      const latest = await connections.get(row.shopId, network);
      await connections.set(row.shopId, network, { ...latest, catalog });
      await logChange(row.shopId, `social-catalog-${network}-${now()}`, { kind: "social.catalog", network, catalogId: done.catalogId, feedId: done.feedId });
      return { catalog: { sentAt: catalog.sentAt, feedUrl: catalog.feedUrl }, changed: true };
    });
  }

  function readPost(row, args) {
    if (!POST_ID.test(String(args.postId ?? ""))) throw bad("postId is needed");
    if (!PLACE_ID.test(String(args.placeId ?? ""))) throw bad("placeId is needed");
    const image = httpsUrl(args.imageUrl, "imageUrl");
    const link = httpsUrl(args.link, "link");
    if (!shopHosts(row).has(link.hostname.toLowerCase())) throw bad("link must be on one of the shop's own addresses");
    const caption = typeof args.caption === "string" ? args.caption.trim() : "";
    if (!caption) throw bad("caption is needed");
    if (caption.length > CAPTION_MAX) throw bad(`caption must be at most ${CAPTION_MAX} letters`);
    const title = typeof args.title === "string" ? args.title.trim().slice(0, 200) : "";
    const altText = typeof args.altText === "string" ? args.altText.trim().slice(0, 500) : "";
    const retailerId = typeof args.retailerId === "string" && RETAILER_ID.test(args.retailerId) ? args.retailerId : null;
    return { postId: args.postId, placeId: args.placeId, imageUrl: image.toString(), link: link.toString(), caption, title, altText, retailerId, tagProduct: args.tagProduct !== false };
  }

  const networkOfPlace = (placeId) => ({ fb: "meta", ig: "meta", pin: "pinterest", tt: "tiktok" })[placeId.split(":")[0]];

  async function publish(row, args = {}) {
    const post = readPost(row, args);
    const network = networkOfPlace(post.placeId);
    if (!offered(network)) throw new SocialError(409, "network_off", `${nameOf(network)} isn't available yet.`);
    const conn = await connections.get(row.shopId, network);
    const place = connected(conn) ? (conn.places ?? []).find((p) => p.id === post.placeId) : null;
    if (!place) throw new SocialError(409, "no_place", `That place isn't connected any more. Choose another in the post.`);
    const key = `${row.shopId}/${post.postId}/${post.placeId}`;
    const { claimed, existing } = await sent.claim(key, { state: "sending", at: iso(), shopId: row.shopId, network, placeId: post.placeId }, { staleBefore: iso(now() - SENDING_STALE_MS) });
    if (!claimed) {
      if (existing?.state === "posted") return { state: "posted", remoteId: existing.remoteId, at: existing.at, already: true };
      return { state: "sending" };
    }
    try {
      const done = await withTokens(row, network, async (tokens, client, latest) => {
        let productId = null;
        if (place.kind === "instagram" && post.tagProduct && post.retailerId && latest.catalog?.catalogId && client.findProduct) {
          // A product Meta hasn't read from the file yet just goes untagged.
          try { productId = await client.findProduct(tokens, latest.catalog.catalogId, post.retailerId); } catch { productId = null; }
        }
        const result = await client.publish(tokens, place, post, { productId });
        return { ...result, tagged: Boolean(productId) };
      });
      const record = { state: "posted", at: iso(), shopId: row.shopId, network, placeId: post.placeId, remoteId: done.remoteId, tagged: done.tagged, ...(done.privacy ? { privacy: done.privacy } : {}) };
      await sent.put(key, record);
      await logChange(row.shopId, `social-posted-${post.postId}-${post.placeId}`, { kind: "social.posted", network, placeId: post.placeId, postId: post.postId, remoteId: done.remoteId });
      return { state: "posted", remoteId: done.remoteId, at: record.at, tagged: done.tagged, ...(done.privacy && done.privacy !== "PUBLIC_TO_EVERYONE" ? { privateOnly: true } : {}) };
    } catch (err) {
      const words = err instanceof SocialApiError ? refusalWords(network, err) : err instanceof SocialError ? err.message : `${nameOf(network)} didn't answer. Try again in a few minutes.`;
      await sent.put(key, { state: "failed", at: iso(), shopId: row.shopId, network, placeId: post.placeId, message: words, detail: String(err?.message || err).slice(0, 500) });
      await logChange(row.shopId, `social-failed-${post.postId}-${post.placeId}-${now()}`, { kind: "social.failed", network, placeId: post.placeId, postId: post.postId, detail: String(err?.message || err).slice(0, 500) });
      if (err instanceof SocialError) throw err;
      if (err instanceof SocialApiError) throw new SocialError(err.lost ? 409 : 422, err.lost ? "lost" : "refused", words);
      console.error("Social post failed:", err);
      throw new SocialError(502, "network_error", words);
    }
  }

  async function disconnect(row, args = {}) {
    const network = args?.network;
    if (!NETWORKS.includes(network)) throw bad("network must be one of " + NETWORKS.join(", "));
    const conn = await connections.get(row.shopId, network);
    if (!connected(conn)) return { disconnected: false };
    if (clients[network] && config.tokenKey) {
      try { await clients[network].revoke(unseal(config.tokenKey, bound(row.shopId, network), conn.sealed)); } catch (err) {
        console.error(`Giving back ${network} permission for ${row.shopId} failed:`, err?.message || err);
      }
    }
    await connections.set(row.shopId, network, { ...conn, sealed: null, places: [], disconnectedAt: iso(), problem: null });
    await logChange(row.shopId, `social-disconnected-${network}-${now()}`, { kind: "social.disconnected", network });
    return { disconnected: true };
  }

  const OPS = {
    "social.status": (row) => status(row),
    "social.connectLink": (row, args) => connectLink(row, args),
    "social.sendCatalog": (row, args) => sendCatalog(row, args),
    "social.publish": (row, args) => publish(row, args),
    "social.disconnect": (row, args) => disconnect(row, args),
  };

  const backTo = (returnUrl, network, outcome) => {
    const url = new URL(returnUrl);
    url.searchParams.set("social", outcome);
    url.searchParams.set("network", network);
    return { status: 302, headers: { Location: url.toString() }, body: { social: outcome } };
  };

  return {
    status, connectLink, sendCatalog, publish, disconnect,

    /** The shop's door: `X-Shop-Id` + `Authorization: Bearer <service key>`, body { op, args }. */
    async shopCall({ headers, body } = {}) {
      try {
        const get = (name) => {
          const found = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name);
          return typeof found?.[1] === "string" ? found[1] : "";
        };
        const shopId = get("x-shop-id");
        const row = shopId ? await registry.getShop(shopId) : null;
        // One answer for "no such shop" and "wrong key", so the door can't be used to find shop ids.
        if (!row || !serviceKeyMatches(get("authorization").replace(/^Bearer\s+/i, ""), row.serviceKeyHash)) {
          throw new SocialError(401, "unknown_shop", "This shop can't use the platform's social channels.");
        }
        if (row.status === "abandoned") throw new SocialError(403, "shop_closed", "This shop is closed.");
        const op = body && typeof body === "object" && Object.hasOwn(OPS, body.op) ? OPS[body.op] : null;
        if (!op) throw bad("Unknown call.");
        if (body.op !== "social.status" && body.op !== "social.disconnect" && !config.enabled) {
          throw new SocialError(409, "social_off", "Social channels aren't turned on yet.");
        }
        const args = body.args && typeof body.args === "object" && !Array.isArray(body.args) ? body.args : {};
        return { status: 200, body: await op({ ...row, shopId }, args) };
      } catch (err) {
        if (err instanceof SocialError) return { status: err.status, body: { error: { code: err.code, message: err.message } } };
        if (err instanceof SocialApiError) {
          return { status: err.lost ? 409 : err.status >= 500 ? 502 : 422, body: { error: { code: err.lost ? "lost" : err.code === "no_catalog" || err.code === "no_business" ? err.code : "refused", message: refusalWords(err.network, err) } } };
        }
        console.error("Social service error:", err);
        return { status: 502, body: { error: { code: "social_error", message: "The platform couldn't do that just now. Try again in a minute." } } };
      }
    },

    /**
     * A network sends the press back here (GET /<network>/oauth) with `code` and `state`, or `error` when they said no.
     * Answers with a redirect to the shop's Sales channels page (`?social=connected|denied|failed&network=…`), except
     * for a state it doesn't know, which can't be sent anywhere safe.
     */
    async oauthCallback(network, query = {}) {
      const state = typeof query.state === "string" ? query.state : "";
      const saved = /^[0-9a-f]{48}$/.test(state) ? await states.take(state) : null;
      if (!saved || saved.expiresAt < now() || saved.network !== network) {
        return { status: 400, body: { error: "This sign-in link has expired. Go back to your shop's Sales channels and press Connect again." } };
      }
      const row = await registry.getShop(saved.shopId);
      if (!row || !offered(network)) return backTo(saved.returnUrl, network, "failed");
      if (query.error || typeof query.code !== "string" || !query.code) return backTo(saved.returnUrl, network, "denied");
      const client = clients[network];
      let tokens;
      let found;
      try {
        tokens = await client.exchangeCode({ code: query.code, redirectUrl: config.redirectUrl(network) });
        found = await client.places(tokens);
      } catch (err) {
        console.error(`${network} sign-in for ${saved.shopId} failed:`, err?.message || err);
        return backTo(saved.returnUrl, network, "failed");
      }
      const existing = await connections.get(row.shopId, network);
      await connections.set(row.shopId, network, {
        shopId: row.shopId, network, accountName: found.accountName ?? null,
        places: found.places.map(({ id, kind, name }) => ({ id, kind, name })),
        sealed: seal(sealKey(), bound(row.shopId, network), { ...tokens, placeTokens: found.placeTokens ?? {} }),
        connectedAt: iso(), disconnectedAt: null, problem: null, lostAt: null, lostDetail: null,
        // The catalog stays across a reconnect, so a second one is never made.
        catalog: existing?.catalog ?? null,
      });
      await logChange(row.shopId, `social-connected-${network}-${now()}`, { kind: "social.connected", network, places: found.places.length });
      return backTo(saved.returnUrl, network, found.places.length ? "connected" : "no_places");
    },

    /** For the control room (plan 27.8): every network's connection for one shop, with the networks' own words. */
    async controlRoom(shopId) {
      const out = [];
      for (const network of NETWORKS) {
        const conn = await connections.get(shopId, network);
        if (!conn) continue;
        out.push({
          network, name: nameOf(network), connected: connected(conn), problem: conn.problem ?? null, lostAt: conn.lostAt ?? null,
          lostDetail: conn.lostDetail ?? null, accountName: conn.accountName ?? null, places: (conn.places ?? []).length,
          catalog: conn.catalog ? { sentAt: conn.catalog.sentAt, feedUrl: conn.catalog.feedUrl } : null,
          connectedAt: conn.connectedAt ?? null, disconnectedAt: conn.disconnectedAt ?? null,
        });
      }
      return out;
    },
  };
}
