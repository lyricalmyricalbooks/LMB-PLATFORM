// The three networks' clients, each with the same shape, so the service (social.js) never spells a network's call:
//
//   authorizeUrl({ state, redirectUrl })              the press's browser goes here to say yes
//   exchangeCode({ code, redirectUrl })               -> tokens { accessToken, refreshToken?, accessExpiresAt?, refreshExpiresAt? }
//   refresh(tokens)                                   -> fresh tokens (Pinterest, TikTok); Meta's Page tokens don't end
//   places(tokens)                                    -> { accountName, places: [{ id, kind, name }], placeTokens: { id: token } }
//   sendCatalog(tokens, { feedUrl, name, currency, locale, existing })  -> { catalogId, feedId } (Meta, Pinterest)
//   publish(tokens, place, post, extra)               -> { remoteId }
//   revoke(tokens)                                    gives the press's permission back (best effort)
//
// Every address comes from endpoints.js. `fetch` is injected; tests use fakes.js. A network's refusal is a
// SocialApiError; `lost` marks a token that no longer works (the press must connect again).
import { META, META_VERSION, PINTEREST, TIKTOK } from "./endpoints.js";

export class SocialApiError extends Error {
  constructor(network, status, message, { lost = false, code = null } = {}) {
    super(message);
    this.name = "SocialApiError";
    this.network = network;
    this.status = status;
    this.lost = lost;
    this.code = code;
  }
}

const form = (fields) => new URLSearchParams(Object.entries(fields).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)])).toString();
const withQuery = (url, query = {}) => {
  const u = new URL(url);
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
  return u.toString();
};
const secondsFrom = (now, seconds) => (Number.isFinite(Number(seconds)) && Number(seconds) > 0 ? now + Number(seconds) * 1000 : null);

async function send(fetch, network, url, { method = "GET", headers = {}, body, timeoutMs = 20000 } = {}) {
  let response;
  try {
    response = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new SocialApiError(network, 503, `${network} didn't answer: ${err?.message || err}`);
  }
  let answer = null;
  try { answer = await response.json(); } catch { answer = null; }
  return { status: response.status, ok: response.ok, answer: answer ?? {} };
}

// ── Meta: Facebook Pages and their Instagram accounts ─────────────────────────────────────────────────────────────

export function createMetaClient({ fetch, app, version = META_VERSION, now = () => Date.now() }) {
  const graph = META.graph(version);
  async function gx(path, { method = "GET", token, query = {}, fields } = {}) {
    const isGet = method === "GET" || method === "DELETE";
    const params = { ...query, ...(token ? { access_token: token } : {}) };
    const url = isGet ? withQuery(`${graph}${path}`, params) : `${graph}${path}`;
    const { status, ok, answer } = await send(fetch, "meta", url, {
      method,
      ...(isGet ? {} : { headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form({ ...params, ...fields }) }),
    });
    if (!ok || answer.error) {
      const code = answer.error?.code ?? null;
      throw new SocialApiError("meta", status || 400, answer.error?.message || "Meta refused the call.", { lost: code === META.lostTokenCode || status === 401, code });
    }
    return answer;
  }

  return {
    network: "meta",
    authorizeUrl: ({ state, redirectUrl }) => withQuery(META.authorize(version), {
      client_id: app.id, redirect_uri: redirectUrl, state, response_type: "code", scope: META.scopes.join(","),
    }),
    async exchangeCode({ code, redirectUrl }) {
      const short = await gx("/oauth/access_token", { query: { client_id: app.id, client_secret: app.secret, redirect_uri: redirectUrl, code } });
      // A long-lived user token (about 60 days); the Page tokens read with it never end. [MF]
      const long = await gx("/oauth/access_token", { query: { grant_type: "fb_exchange_token", client_id: app.id, client_secret: app.secret, fb_exchange_token: short.access_token } });
      return { accessToken: long.access_token, accessExpiresAt: secondsFrom(now(), long.expires_in) };
    },
    async refresh(tokens) { return tokens; },
    async places(tokens) {
      const me = await gx("/me", { token: tokens.accessToken, query: { fields: "id,name" } });
      const pages = await gx("/me/accounts", { token: tokens.accessToken, query: { fields: "id,name,access_token,instagram_business_account{id,username}", limit: 100 } });
      const places = [];
      const placeTokens = {};
      for (const page of pages.data ?? []) {
        if (!page?.id || !page.access_token) continue;
        places.push({ id: `fb:${page.id}`, kind: "facebookPage", name: page.name || "Facebook Page" });
        placeTokens[`fb:${page.id}`] = page.access_token;
        const ig = page.instagram_business_account;
        if (ig?.id) {
          places.push({ id: `ig:${ig.id}`, kind: "instagram", name: ig.username ? `@${ig.username}` : "Instagram", pageId: page.id });
          placeTokens[`ig:${ig.id}`] = page.access_token;
        }
      }
      return { accountName: me.name || null, places, placeTokens };
    },
    async sendCatalog(tokens, { feedUrl, name, currency, existing = {} }) {
      let catalogId = existing.catalogId ?? null;
      if (!catalogId) {
        const businesses = await gx("/me/businesses", { token: tokens.accessToken, query: { fields: "id,name" } });
        const business = businesses.data?.[0];
        if (!business?.id) throw new SocialApiError("meta", 409, "No business account", { code: "no_business" });
        catalogId = (await gx(`/${business.id}/owned_product_catalogs`, { method: "POST", token: tokens.accessToken, fields: { name } })).id;
      }
      let feedId = existing.feedId ?? null;
      if (!feedId) {
        feedId = (await gx(`/${catalogId}/product_feeds`, {
          method: "POST", token: tokens.accessToken,
          fields: { name, default_currency: currency, schedule: JSON.stringify({ interval: "DAILY", url: feedUrl, hour: 3 }) },
        })).id;
      }
      return { catalogId: String(catalogId), feedId: String(feedId) };
    },
    /** The catalog's own id for a product the shop's file lists as `retailerId`, or null while Meta hasn't read it. [MF] */
    async findProduct(tokens, catalogId, retailerId) {
      const found = await gx(`/${catalogId}/products`, { token: tokens.accessToken, query: { fields: "id,retailer_id", filter: JSON.stringify({ retailer_id: { eq: retailerId } }) } });
      return found.data?.[0]?.id ?? null;
    },
    async publish(tokens, place, post, { productId = null } = {}) {
      const token = tokens.placeTokens?.[place.id];
      if (!token) throw new SocialApiError("meta", 401, "That Page is no longer shared", { lost: true });
      const caption = post.link ? `${post.caption}\n\n${post.link}` : post.caption;
      if (place.kind === "facebookPage") {
        const pageId = place.id.slice(3);
        const done = await gx(`/${pageId}/photos`, { method: "POST", token, fields: { url: post.imageUrl, message: caption } });
        return { remoteId: String(done.post_id || done.id) };
      }
      const igId = place.id.slice(3);
      const fields = { image_url: post.imageUrl, caption, ...(post.altText ? { alt_text: post.altText } : {}) };
      if (productId) fields.product_tags = JSON.stringify([{ product_id: productId, x: 0.5, y: 0.5 }]);
      const container = await gx(`/${igId}/media`, { method: "POST", token, fields });
      const done = await gx(`/${igId}/media_publish`, { method: "POST", token, fields: { creation_id: container.id } });
      return { remoteId: String(done.id) };
    },
    async revoke(tokens) { await gx("/me/permissions", { method: "DELETE", token: tokens.accessToken }); },
  };
}

// ── Pinterest ─────────────────────────────────────────────────────────────────────────────────────────────────────

export function createPinterestClient({ fetch, app, now = () => Date.now() }) {
  const basic = `Basic ${Buffer.from(`${app.id}:${app.secret}`).toString("base64")}`;
  async function px(path, { method = "GET", token, json, query } = {}) {
    const url = withQuery(`${PINTEREST.api}${path}`, query);
    const { status, ok, answer } = await send(fetch, "pinterest", url, {
      method, headers: { Authorization: `Bearer ${token}`, ...(json ? { "Content-Type": "application/json" } : {}) },
      body: json ? JSON.stringify(json) : undefined,
    });
    if (!ok) throw new SocialApiError("pinterest", status, answer.message || "Pinterest refused the call.", { lost: status === 401, code: answer.code ?? null });
    return answer;
  }
  async function tokenCall(fields) {
    const { status, ok, answer } = await send(fetch, "pinterest", PINTEREST.token, {
      method: "POST", headers: { Authorization: basic, "Content-Type": "application/x-www-form-urlencoded" }, body: form(fields),
    });
    if (!ok || !answer.access_token) throw new SocialApiError("pinterest", status || 400, answer.message || "Pinterest refused the sign-in.", { lost: fields.grant_type === "refresh_token" });
    const at = now();
    return {
      accessToken: answer.access_token,
      refreshToken: answer.refresh_token ?? fields.refresh_token ?? null,
      accessExpiresAt: secondsFrom(at, answer.expires_in),
      refreshExpiresAt: secondsFrom(at, answer.refresh_token_expires_in),
    };
  }
  return {
    network: "pinterest",
    authorizeUrl: ({ state, redirectUrl }) => withQuery(PINTEREST.authorize, {
      client_id: app.id, redirect_uri: redirectUrl, response_type: "code", scope: PINTEREST.scopes.join(","), state,
    }),
    exchangeCode: ({ code, redirectUrl }) => tokenCall({ grant_type: "authorization_code", code, redirect_uri: redirectUrl }),
    async refresh(tokens) {
      const fresh = await tokenCall({ grant_type: "refresh_token", refresh_token: tokens.refreshToken });
      return { ...tokens, ...fresh, refreshExpiresAt: fresh.refreshExpiresAt ?? tokens.refreshExpiresAt ?? null };
    },
    async places(tokens) {
      const me = await px("/user_account", { token: tokens.accessToken });
      const boards = await px("/boards", { token: tokens.accessToken, query: { page_size: 100 } });
      return {
        accountName: me.username || null,
        places: (boards.items ?? []).filter((b) => b?.id).map((b) => ({ id: `pin:${b.id}`, kind: "pinterestBoard", name: b.name || "Board" })),
        placeTokens: {},
      };
    },
    async sendCatalog(tokens, { feedUrl, name, currency, locale, existing = {} }) {
      if (existing.feedId) return { catalogId: existing.catalogId ?? null, feedId: existing.feedId };
      const feed = await px("/catalogs/feeds", {
        method: "POST", token: tokens.accessToken,
        json: { name, format: "CSV", location: feedUrl, default_currency: currency, default_locale: locale, catalog_type: "RETAIL" },
      });
      return { catalogId: feed.catalog_id ? String(feed.catalog_id) : null, feedId: String(feed.id) };
    },
    async publish(tokens, place, post) {
      const pin = await px("/pins", {
        method: "POST", token: tokens.accessToken,
        json: {
          board_id: place.id.slice(4), link: post.link, title: (post.title || "").slice(0, 100), description: post.caption.slice(0, 500),
          ...(post.altText ? { alt_text: post.altText.slice(0, 500) } : {}),
          media_source: { source_type: "image_url", url: post.imageUrl },
        },
      });
      return { remoteId: String(pin.id) };
    },
    async revoke() { /* Pinterest has no revoke call; the press removes the app in their settings. Tokens are deleted here. */ },
  };
}

// ── TikTok ────────────────────────────────────────────────────────────────────────────────────────────────────────

export function createTikTokClient({ fetch, app, now = () => Date.now() }) {
  const tiktokError = (status, answer, fallback) => {
    const code = answer?.error?.code ?? answer?.error ?? null;
    const lost = status === 401 || code === "access_token_invalid" || code === "invalid_grant";
    return new SocialApiError("tiktok", status || 400, answer?.error?.message || answer?.error_description || fallback, { lost, code });
  };
  async function tx(path, { token, json, query } = {}) {
    const { status, ok, answer } = await send(fetch, "tiktok", withQuery(`${TIKTOK.api}${path}`, query), {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" }, body: JSON.stringify(json ?? {}),
    });
    if (!ok || (answer.error?.code && answer.error.code !== "ok")) throw tiktokError(status, answer, "TikTok refused the call.");
    return answer.data ?? {};
  }
  async function tokenCall(url, fields) {
    const { status, ok, answer } = await send(fetch, "tiktok", url, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form({ client_key: app.id, client_secret: app.secret, ...fields }),
    });
    if (!ok || answer.error) throw tiktokError(status, answer, "TikTok refused the sign-in.");
    return answer;
  }
  async function tokens(fields) {
    const answer = await tokenCall(TIKTOK.token, fields);
    const at = now();
    return {
      accessToken: answer.access_token, refreshToken: answer.refresh_token ?? null, openId: answer.open_id ?? null,
      accessExpiresAt: secondsFrom(at, answer.expires_in), refreshExpiresAt: secondsFrom(at, answer.refresh_expires_in),
    };
  }
  return {
    network: "tiktok",
    authorizeUrl: ({ state, redirectUrl }) => withQuery(TIKTOK.authorize, {
      client_key: app.id, scope: TIKTOK.scopes.join(","), response_type: "code", redirect_uri: redirectUrl, state,
    }),
    exchangeCode: ({ code, redirectUrl }) => tokens({ grant_type: "authorization_code", code, redirect_uri: redirectUrl }),
    async refresh(old) {
      try {
        return { ...old, ...(await tokens({ grant_type: "refresh_token", refresh_token: old.refreshToken })) };
      } catch (err) {
        if (err instanceof SocialApiError) err.lost = true;
        throw err;
      }
    },
    async places(t) {
      const { status, ok, answer } = await send(fetch, "tiktok", withQuery(`${TIKTOK.api}/user/info/`, { fields: "open_id,display_name" }), {
        headers: { Authorization: `Bearer ${t.accessToken}` },
      });
      if (!ok || (answer.error?.code && answer.error.code !== "ok")) throw tiktokError(status, answer, "TikTok refused the call.");
      const name = answer.data?.user?.display_name || null;
      return { accountName: name, places: [{ id: `tt:${t.openId || "me"}`, kind: "tiktok", name: name || "TikTok" }], placeTokens: {} };
    },
    async sendCatalog() { throw new SocialApiError("tiktok", 409, "TikTok's catalog needs TikTok Shop", { code: "no_catalog" }); },
    async publish(t, _place, post) {
      // The creator's own privacy choices come first [T]: public when allowed, otherwise the first one offered (an
      // unaudited app is offered "only me").
      const creator = await tx("/post/publish/creator_info/query/", { token: t.accessToken });
      const options = Array.isArray(creator.privacy_level_options) ? creator.privacy_level_options : [];
      const privacy = options.includes("PUBLIC_TO_EVERYONE") ? "PUBLIC_TO_EVERYONE" : options[0] || "SELF_ONLY";
      const done = await tx("/post/publish/content/init/", {
        token: t.accessToken,
        json: {
          media_type: "PHOTO", post_mode: "DIRECT_POST",
          post_info: {
            title: (post.title || "").slice(0, TIKTOK.titleMax),
            description: (post.link ? `${post.caption}\n\n${post.link}` : post.caption).slice(0, TIKTOK.descriptionMax),
            privacy_level: privacy, disable_comment: false, auto_add_music: true,
          },
          source_info: { source: "PULL_FROM_URL", photo_images: [post.imageUrl], photo_cover_index: 0 },
        },
      });
      return { remoteId: String(done.publish_id || ""), privacy };
    },
    async revoke(t) { await tokenCall(TIKTOK.revoke, { token: t.accessToken }); },
  };
}

export function createNetworkClients({ fetch, config, now }) {
  const clients = {};
  if (config.apps.meta) clients.meta = createMetaClient({ fetch, app: config.apps.meta, version: config.metaVersion || undefined, now });
  if (config.apps.pinterest) clients.pinterest = createPinterestClient({ fetch, app: config.apps.pinterest, now });
  if (config.apps.tiktok) clients.tiktok = createTikTokClient({ fetch, app: config.apps.tiktok, now });
  return clients;
}
