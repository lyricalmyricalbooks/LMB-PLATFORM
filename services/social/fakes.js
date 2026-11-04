// In-memory stand-ins for the social service's tests: pretend Meta, Pinterest and TikTok behind one `fetch` (sign-in,
// tokens and every call the clients make) and the service's own stores. Nothing here reaches a real network.
import { META, META_VERSION, PINTEREST, TIKTOK } from "./endpoints.js";

const json = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

/**
 * `world.meta.codes` / `.pinterest.codes` / `.tiktok.codes` hold the sign-in codes a press can bring back. `world.cutOff(network)`
 * plays the press removing the app (every token stops working). `world.fail(matcher, answer)` makes the next call whose
 * address matches answer `{ status, body }` once. `requests` keeps every call; `posts` every post made.
 */
export function fakeSocialFetch({ apps } = {}) {
  const requests = [];
  const posts = [];
  const catalogs = [];
  const failures = [];
  let next = 1000;
  const id = () => String(next++);
  const live = { meta: new Set(), pinterest: new Set(), tiktok: new Set() };
  const refreshes = { pinterest: new Set(), tiktok: new Set() };
  const world = {
    requests, posts, catalogs,
    meta: { codes: new Set(["meta-code"]), businesses: [{ id: "77", name: "Moth Press" }], products: new Map(), revoked: 0 },
    pinterest: { codes: new Set(["pin-code"]), expiresIn: 2592000 },
    tiktok: { codes: new Set(["tt-code"]), privacy: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"], revoked: 0 },
    cutOff(network) { live[network].clear(); if (refreshes[network]) refreshes[network].clear(); },
    fail(match, answer) { failures.push({ match, answer }); },
  };
  const graph = META.graph(META_VERSION);

  async function fetch(url, init = {}) {
    const method = init.method || "GET";
    const body = typeof init.body === "string" ? init.body : "";
    requests.push({ url, method, headers: init.headers ?? {}, body });
    const failAt = failures.findIndex((f) => url.includes(f.match));
    if (failAt >= 0) { const [f] = failures.splice(failAt, 1); return json(f.answer.status, f.answer.body); }
    const u = new URL(url);
    const q = u.searchParams;
    const fields = Object.fromEntries(new URLSearchParams(body));

    // ── Meta ──
    if (url.startsWith(graph)) {
      const path = u.pathname.replace(/^\/v\d+\.\d+/, "");
      const token = q.get("access_token") || fields.access_token;
      const metaErr = (code = 190) => json(400, { error: { message: "Error validating access token", type: "OAuthException", code } });
      if (path === "/oauth/access_token") {
        if (q.get("client_id") !== apps.meta.id || q.get("client_secret") !== apps.meta.secret) return json(400, { error: { message: "bad client", code: 1 } });
        if (q.get("grant_type") === "fb_exchange_token") { const t = `meta-long-${id()}`; live.meta.add(t); return json(200, { access_token: t, token_type: "bearer", expires_in: 5184000 }); }
        if (!world.meta.codes.has(q.get("code"))) return json(400, { error: { message: "bad code", code: 100 } });
        return json(200, { access_token: `meta-short-${id()}`, token_type: "bearer", expires_in: 3600 });
      }
      if (!live.meta.has(token) && !String(token).startsWith("page-")) return metaErr();
      if (String(token).startsWith("page-") && !live.meta.size) return metaErr();
      if (path === "/me") return json(200, { id: "5", name: "Jo Moth" });
      if (path === "/me/accounts") return json(200, { data: [
        { id: "111", name: "Moth Press", access_token: "page-111", instagram_business_account: { id: "222", username: "mothpress" } },
        { id: "333", name: "Moth Events", access_token: "page-333" },
      ] });
      if (path === "/me/permissions" && method === "DELETE") { world.meta.revoked++; live.meta.clear(); return json(200, { success: true }); }
      if (path === "/me/businesses") return json(200, { data: world.meta.businesses });
      let m;
      if ((m = /^\/(\d+)\/owned_product_catalogs$/.exec(path)) && method === "POST") { const c = id(); catalogs.push({ network: "meta", kind: "catalog", id: c, business: m[1], name: fields.name }); return json(200, { id: c }); }
      if ((m = /^\/(\d+)\/product_feeds$/.exec(path)) && method === "POST") { const f = id(); catalogs.push({ network: "meta", kind: "feed", id: f, catalog: m[1], schedule: JSON.parse(fields.schedule) }); return json(200, { id: f }); }
      if ((m = /^\/(\d+)\/products$/.exec(path))) {
        const want = JSON.parse(q.get("filter")).retailer_id.eq;
        const pid = world.meta.products.get(want);
        return json(200, { data: pid ? [{ id: pid, retailer_id: want }] : [] });
      }
      if ((m = /^\/(\d+)\/photos$/.exec(path)) && method === "POST") { const p = { network: "meta", place: `fb:${m[1]}`, id: `${m[1]}_${id()}`, fields }; posts.push(p); return json(200, { id: id(), post_id: p.id }); }
      if ((m = /^\/(\d+)\/media$/.exec(path)) && method === "POST") return json(200, { id: `container-${id()}`, _fields: fields, _ig: m[1] });
      if ((m = /^\/(\d+)\/media_publish$/.exec(path)) && method === "POST") {
        const create = requests.slice().reverse().find((r) => r.url.endsWith(`/${m[1]}/media`));
        const p = { network: "meta", place: `ig:${m[1]}`, id: id(), fields: Object.fromEntries(new URLSearchParams(create.body)) };
        posts.push(p);
        return json(200, { id: p.id });
      }
      return json(404, { error: { message: `no fake for ${method} ${path}`, code: 100 } });
    }

    // ── Pinterest ──
    if (url === PINTEREST.token) {
      if (init.headers.Authorization !== `Basic ${Buffer.from(`${apps.pinterest.id}:${apps.pinterest.secret}`).toString("base64")}`) return json(401, { code: 1, message: "bad client" });
      if (fields.grant_type === "authorization_code" && !world.pinterest.codes.has(fields.code)) return json(400, { code: 2, message: "bad code" });
      if (fields.grant_type === "refresh_token" && !refreshes.pinterest.has(fields.refresh_token)) return json(400, { code: 3, message: "bad refresh" });
      const a = `pin-access-${id()}`;
      const r = `pin-refresh-${id()}`;
      live.pinterest.add(a); refreshes.pinterest.add(r);
      return json(200, { access_token: a, refresh_token: r, expires_in: world.pinterest.expiresIn, refresh_token_expires_in: 31536000, token_type: "bearer" });
    }
    if (url.startsWith(PINTEREST.api)) {
      const token = String(init.headers.Authorization || "").replace("Bearer ", "");
      if (!live.pinterest.has(token)) return json(401, { code: 2, message: "Authentication failed." });
      const path = u.pathname.replace(/^\/v5/, "");
      const payload = body ? JSON.parse(body) : {};
      if (path === "/user_account") return json(200, { username: "mothpress" });
      if (path === "/boards") return json(200, { items: [{ id: "900", name: "New books" }, { id: "901", name: "Studio" }] });
      if (path === "/pins" && method === "POST") { const p = { network: "pinterest", place: `pin:${payload.board_id}`, id: id(), fields: payload }; posts.push(p); return json(201, { id: p.id }); }
      if (path === "/catalogs/feeds" && method === "POST") { const f = id(); catalogs.push({ network: "pinterest", kind: "feed", id: f, ...payload }); return json(201, { id: f }); }
      return json(404, { code: 404, message: "no fake" });
    }

    // ── TikTok ──
    if (url === TIKTOK.token) {
      if (fields.client_key !== apps.tiktok.id || fields.client_secret !== apps.tiktok.secret) return json(400, { error: "invalid_client", error_description: "bad client" });
      if (fields.grant_type === "authorization_code" && !world.tiktok.codes.has(fields.code)) return json(400, { error: "invalid_grant", error_description: "bad code" });
      if (fields.grant_type === "refresh_token" && !refreshes.tiktok.has(fields.refresh_token)) return json(400, { error: "invalid_grant", error_description: "bad refresh" });
      const a = `tt-access-${id()}`;
      const r = `tt-refresh-${id()}`;
      live.tiktok.add(a); refreshes.tiktok.add(r);
      return json(200, { access_token: a, refresh_token: r, open_id: "open-7", expires_in: 86400, refresh_expires_in: 31536000, scope: "user.info.basic,video.publish" });
    }
    if (url === TIKTOK.revoke) { world.tiktok.revoked++; live.tiktok.clear(); return json(200, {}); }
    if (url.startsWith(TIKTOK.api)) {
      const token = String(init.headers.Authorization || "").replace("Bearer ", "");
      if (!live.tiktok.has(token)) return json(401, { error: { code: "access_token_invalid", message: "The access token is invalid" } });
      const path = u.pathname.replace(/^\/v2/, "");
      const ok = { code: "ok", message: "" };
      if (path === "/user/info/") return json(200, { data: { user: { open_id: "open-7", display_name: "Moth Press" } }, error: ok });
      if (path === "/post/publish/creator_info/query/") return json(200, { data: { privacy_level_options: world.tiktok.privacy }, error: ok });
      if (path === "/post/publish/content/init/") { const p = { network: "tiktok", place: "tt:open-7", id: `pub-${id()}`, fields: JSON.parse(body) }; posts.push(p); return json(200, { data: { publish_id: p.id }, error: ok }); }
      return json(404, { error: { code: "not_found", message: "no fake" } });
    }
    throw new Error(`fakeSocialFetch: nothing answers ${method} ${url}`);
  }
  return { fetch, world };
}

export function fakeConnections() {
  const rows = new Map();
  return {
    rows,
    async get(shopId, network) { const r = rows.get(`${shopId}:${network}`); return r ? structuredClone(r) : null; },
    async set(shopId, network, record) { rows.set(`${shopId}:${network}`, structuredClone(record)); },
    async listFor(shopId) { return [...rows.entries()].filter(([k]) => k.startsWith(`${shopId}:`)).map(([, v]) => structuredClone(v)); },
  };
}

export function fakeStates() {
  const rows = new Map();
  return {
    rows,
    async put(state, record) { rows.set(state, { ...record }); },
    async take(state) { const r = rows.get(state) ?? null; rows.delete(state); return r; },
  };
}

export function fakeSent() {
  const rows = new Map();
  return {
    rows,
    async get(key) { return rows.has(key) ? { ...rows.get(key) } : null; },
    async put(key, record) { rows.set(key, { ...record }); },
    // Atomic in the real store (a transaction): a key that is posted, or being sent since `staleBefore`, is not taken.
    async claim(key, record, { staleBefore }) {
      const existing = rows.get(key) ?? null;
      if (existing && (existing.state === "posted" || (existing.state === "sending" && existing.at > staleBefore))) return { claimed: false, existing: { ...existing } };
      rows.set(key, { ...record });
      return { claimed: true, existing };
    },
  };
}
