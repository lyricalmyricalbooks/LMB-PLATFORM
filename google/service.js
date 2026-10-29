// The Google link's doors (code plan 6.17). The shop's server calls it with the shop's service key (`X-Shop-Id` +
// `Authorization: Bearer`), like the payment, email, domain and bookkeeping services; nothing here is reachable without
// it except Google's answer after the press's sign-in. **Off unless GOOGLE_CONNECT_ENABLED is "true"**; while off,
// `google.status` says so and the shop keeps its older Google Analytics card.
//
//   google.status                        connected or not, the Google account, the extras offered and chosen, and
//                                        every step in plain words
//   google.connectLink { returnUrl, extras }
//                                        Google's Allow page (one sign-in, every part ticked); Google sends the press
//                                        back to `oauthCallback` (GET /google/oauth), which keeps the tokens sealed,
//                                        runs the connect job and goes back to the shop
//   google.productProblems               the books Google Shopping turned down, each with what to fix, in plain words
//   google.sheetSync { rows }            writes the shop's stock list into one spreadsheet in the press's own Google Drive
//                                        (made the first time; only with the Drive box ticked), and answers its address
//   google.tryAgain { step }             one connect step again (the shop's Try again)
//   google.disconnect                    the closing steps of the teardown job: the shop stays open
import { randomBytes } from "node:crypto";
import { serviceKeyMatches } from "../services/email/http.js";
import { shopHosts } from "../services/payments/service.js";
import { offeredExtras } from "./config.js";
import { CONNECT_STEPS } from "./connect.js";
import { SCOPES } from "./endpoints.js";

export class GoogleLinkError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "GoogleLinkError";
    this.status = status;
    this.code = code;
  }
}

const STATE_MS = 15 * 60 * 1000;
const MAX_SHEET_ROWS = 2001;
const MAX_SHEET_COLUMNS = 12;

/** The cells the shop sends: a heading row and up to 2,000 lines of text and numbers, nothing else. */
function sheetRows(rows) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > MAX_SHEET_ROWS) throw bad("rows must be a heading line and up to 2,000 lines");
  return rows.map((line) => {
    if (!Array.isArray(line) || line.length > MAX_SHEET_COLUMNS) throw bad("every line must be a list of up to 12 cells");
    return line.map((cell) => (typeof cell === "number" && Number.isFinite(cell) ? cell : typeof cell === "string" ? cell.slice(0, 300) : ""));
  });
}
const bad = (message) => new GoogleLinkError(400, "bad_request", message);

export function createGoogleService({ config, google, tokens, states, registry, connect, teardown, now = () => Date.now() }) {
  const isOn = () => config.enabled && Boolean(config.app);

  /** The permissions to ask for: the core parts, Gmail sending once switched on, and each extra ticked. */
  function scopesFor(extras) {
    return [
      ...SCOPES.identity, ...SCOPES.analytics, ...SCOPES.searchConsole, ...SCOPES.merchantCenter,
      ...(config.gmailSending ? SCOPES.email : []),
      ...extras.flatMap((extra) => SCOPES[extra]),
    ];
  }

  async function status(row) {
    if (!isOn()) return { enabled: false };
    const conn = await tokens.get(row.shopId);
    const g = row.google ?? {};
    return {
      enabled: true,
      connected: tokens.live(conn),
      accountEmail: tokens.live(conn) ? conn.accountEmail : null,
      connectedAt: tokens.live(conn) ? g.connectedAt ?? null : null,
      extrasOffered: offeredExtras(config),
      extrasChosen: tokens.live(conn) ? conn.extras ?? [] : [],
      gmailSending: config.gmailSending,
      steps: tokens.live(conn) ? (g.steps ?? []).filter((s) => CONNECT_STEPS.includes(s.step)).map(({ step, state, detail, at }) => ({ step, state, detail, at })) : [],
    };
  }

  async function connectLink(row, { returnUrl, extras = [] } = {}) {
    let url;
    try { url = new URL(returnUrl); } catch { throw bad("returnUrl must be an address"); }
    if (url.protocol !== "https:" || !shopHosts(row).has(url.hostname.toLowerCase())) throw bad("returnUrl must be one of the shop's own addresses");
    const offered = offeredExtras(config);
    if (!Array.isArray(extras) || extras.some((e) => !offered.includes(e))) throw bad("extras must be ones this shop is offered");
    const chosen = offered.filter((e) => extras.includes(e));
    const state = randomBytes(24).toString("hex");
    const expiresAt = now() + STATE_MS;
    await states.put(state, { shopId: row.shopId, returnUrl: url.toString(), extras: chosen, expiresAt });
    return { url: google.authorizeUrl({ state, scopes: scopesFor(chosen), loginHint: row.ownerEmail }), expiresAt: Math.floor(expiresAt / 1000) };
  }

  const OPS = {
    "google.status": (row) => status(row),
    async "google.sheetSync"(row, { rows } = {}) {
      const values = sheetRows(rows);
      const grant = await tokens.fresh(row.shopId);
      if (!grant || !SCOPES.drive.every((scope) => grant.scopes.includes(scope))) return { available: false };
      const known = row.google?.sheet ?? {};
      let sheet = known.spreadsheetId ? known : null;
      if (!sheet) {
        const made = await google.createSpreadsheet(grant.token, `${row.pressName || row.shopId} stock from Colophon`);
        sheet = { spreadsheetId: made.spreadsheetId, url: made.spreadsheetUrl, madeAt: new Date(now()).toISOString() };
      }
      try {
        await google.writeStockSheet(grant.token, sheet.spreadsheetId, values);
      } catch (err) {
        // The press deleted the sheet in their Drive: make a fresh one next time rather than failing for good.
        if (err?.status === 404 && known.spreadsheetId) { await registry.updateShop(row.shopId, { google: { ...(row.google ?? {}), sheet: null } }); return { available: true, gone: true }; }
        throw err;
      }
      const next = { ...sheet, writtenAt: new Date(now()).toISOString(), rows: values.length - 1 };
      await registry.updateShop(row.shopId, { google: { ...(row.google ?? {}), sheet: next } });
      return { available: true, url: next.url, writtenAt: next.writtenAt, rows: next.rows };
    },
    async "google.productProblems"(row) {
      const account = row.google?.merchantCenter?.account;
      const grant = account ? await tokens.fresh(row.shopId) : null;
      if (!grant || !SCOPES.merchantCenter.every((scope) => grant.scopes.includes(scope))) return { available: false, problems: [] };
      const problems = await google.listProductProblems(grant.token, account);
      return { available: true, checkedAt: new Date(now()).toISOString(), problems: problems.slice(0, 200) };
    },
    "google.connectLink": (row, args) => connectLink(row, args),
    async "google.tryAgain"(row, { step } = {}) {
      if (!CONNECT_STEPS.includes(step)) throw bad("Unknown step.");
      if (!tokens.live(await tokens.get(row.shopId))) throw new GoogleLinkError(409, "not_connected", "Connect Google first.");
      await connect.run(row.shopId, { only: [step] });
      return status(await registry.getShop(row.shopId).then((r) => ({ ...r, shopId: row.shopId })));
    },
    async "google.disconnect"(row) {
      await teardown.disconnect(row.shopId);
      return status(await registry.getShop(row.shopId).then((r) => ({ ...r, shopId: row.shopId })));
    },
  };

  const backTo = (returnUrl, outcome) => {
    const url = new URL(returnUrl);
    url.searchParams.set("google", outcome);
    return { status: 302, headers: { Location: url.toString() }, body: { google: outcome } };
  };

  return {
    status, connectLink, scopesFor,

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
          throw new GoogleLinkError(401, "unknown_shop", "This shop can't use the platform's Google link.");
        }
        if (row.status === "abandoned") throw new GoogleLinkError(403, "shop_closed", "This shop is closed.");
        const op = body && typeof body === "object" && Object.hasOwn(OPS, body.op) ? OPS[body.op] : null;
        if (!op) throw bad("Unknown call.");
        if (body.op !== "google.status" && !isOn()) throw new GoogleLinkError(409, "google_off", "Connect Google isn't turned on yet.");
        const args = body.args && typeof body.args === "object" && !Array.isArray(body.args) ? body.args : {};
        return { status: 200, body: await op({ ...row, shopId }, args) };
      } catch (err) {
        if (err instanceof GoogleLinkError) return { status: err.status, body: { error: { code: err.code, message: err.message } } };
        console.error("Google link error:", err);
        return { status: 502, body: { error: { code: "google_error", message: "Google didn't answer. Try again in a minute." } } };
      }
    },

    /**
     * Google sends the press back here (GET /google/oauth) with `code` and `state`, or `error` when they said no. A "no"
     * changes nothing. Answers with a redirect to the shop's admin (`?google=connected|denied|failed`), except for a state
     * it doesn't know, which can't be sent anywhere safe.
     */
    async oauthCallback(query = {}) {
      const state = typeof query.state === "string" ? query.state : "";
      const saved = /^[0-9a-f]{48}$/.test(state) ? await states.take(state) : null;
      if (!saved || saved.expiresAt < now()) return { status: 400, body: { error: "This sign-in link has expired. Go back to your shop's admin and press Connect Google again." } };
      const row = await registry.getShop(saved.shopId);
      if (!row || !isOn()) return backTo(saved.returnUrl, "failed");
      if (query.error || typeof query.code !== "string" || !query.code) return backTo(saved.returnUrl, "denied");
      let granted;
      let accountEmail;
      try {
        granted = await google.exchangeCode(query.code);
        accountEmail = (await google.whoami(granted.accessToken)).email;
      } catch (err) {
        console.error(`Google sign-in for ${saved.shopId} failed:`, err?.message || err);
        return backTo(saved.returnUrl, "failed");
      }
      await tokens.save(saved.shopId, granted, { accountEmail, extras: saved.extras ?? [] });
      try {
        await connect.run(saved.shopId);
      } catch (err) {
        // The grant is kept; each step that failed shows Try again.
        console.error(`Google connect for ${saved.shopId} stopped:`, err?.message || err);
      }
      return backTo(saved.returnUrl, "connected");
    },
  };
}
