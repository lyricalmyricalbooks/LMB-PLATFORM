// The Google link's doors (code plan 6.17). The shop's server calls it with the shop's service key (`X-Shop-Id` +
// `Authorization: Bearer`), like the payment, email, domain and bookkeeping services; nothing here is reachable without
// it except Google's answer after the press's sign-in. **Off unless GOOGLE_CONNECT_ENABLED is "true"**; while off,
// `google.status` says so and the shop keeps its older Google Analytics card.
//
//   google.status                        connected or not, the Google account, the extras offered and chosen, and
//                                        every step in plain words
//   google.connectLink { returnUrl, extras }
//   google.turnOff { extras }            switches extras off at once, with no new sign-in
//                                        Google's Allow page (one sign-in, every part ticked); Google sends the press
//                                        back to `oauthCallback` (GET /google/oauth), which keeps the tokens sealed,
//                                        runs the connect job and goes back to the shop
//   google.productProblems               the books Google Shopping turned down, each with what to fix, in plain words
//   google.sheetSync { tabs: { Stock, Sales, Expenses } } (or { rows } for Stock) rewrites the tabs of one spreadsheet in the press's own Drive
//                                        (made the first time; only with the Drive box ticked), and answers its address
//   google.sheetRead { spreadsheetId, sheet?, gid? }
//                                        reads one tab of a Google Sheet the press names by its link (plan 23.42): the
//                                        tab asked for, else the one the link points at, else the first visible tab with
//                                        anything in it; answers its title, the visible tabs and the cells as text
//   google.bookingEvent { id, title, start, end, location?, details?, meet? }
//                                        one booking in the shop's Colophon calendar (the Calendar box): made or
//                                        replaced under an id from the booking's, with a Google Meet call when `meet`;
//                                        answers the call's link. `available: false` until that calendar is linked
//   google.bookingEventRemove { id }     takes that booking's event away (gone already is fine)
//   google.personLink { person }         a sign-in link for one person on the team to share when they're busy
//                                        with their own Google account (only that; `teamCalendars`)
//   google.peopleStatus { people }       which of these people have their calendar linked, and with which account
//   google.peopleBusy { people, from, to }   each linked person's busy times between two moments (up to 62 days);
//                                        `null` for someone whose calendar couldn't be read, so the shop keeps the last
//   google.personDisconnect { person }   forgets that person's link (and gives Colophon's access back to their account)
//   google.tryAgain { step }             one connect step again (the shop's Try again)
//   google.disconnect                    the closing steps of the teardown job: the shop stays open
import { createHash, randomBytes } from "node:crypto";
import { serviceKeyMatches } from "../services/email/http.js";
import { shopHosts } from "../services/payments/service.js";
import { offeredExtras } from "./config.js";
import { CONNECT_STEPS } from "./connect.js";
import { SCOPES } from "./endpoints.js";
import { teamCalendarPage } from "./teamCalendarPage.js";

export class GoogleLinkError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "GoogleLinkError";
    this.status = status;
    this.code = code;
  }
}

const STATE_MS = 15 * 60 * 1000;
/** A team member's sign-in link: passed on to them, so it lasts a day (still one use). */
const PERSON_STATE_MS = 24 * 3600 * 1000;
/** The tabs a stock sheet may have, and the most lines each takes (a heading line plus 2,000 or 5,000). */
const SHEET_TABS = Object.freeze({ Stock: 2001, Sales: 5001, Expenses: 5001 });
const MAX_SHEET_COLUMNS = 12;

/** One tab's cells: a heading line and its lines of text and numbers, nothing else. */
function sheetRows(rows, max = SHEET_TABS.Stock) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > max) throw bad(`rows must be a heading line and up to ${(max - 1).toLocaleString("en")} lines`);
  return rows.map((line) => {
    if (!Array.isArray(line) || line.length > MAX_SHEET_COLUMNS) throw bad("every line must be a list of up to 12 cells");
    return line.map((cell) => (typeof cell === "number" && Number.isFinite(cell) ? cell : typeof cell === "string" ? cell.slice(0, 300) : ""));
  });
}

/** `{ tabs: { Stock, Sales } }`, or the older `{ rows }` for the Stock tab alone: each tab's checked cells, in tab order. */
function sheetTabs({ rows, tabs } = {}) {
  const given = tabs ?? (rows !== undefined ? { Stock: rows } : null);
  if (!given || typeof given !== "object" || Array.isArray(given)) throw bad("send the Stock tab, and the Sales and Expenses tabs if you like");
  const names = Object.keys(given);
  if (!names.includes("Stock") || names.some((name) => !Object.hasOwn(SHEET_TABS, name))) throw bad("the tabs are Stock, Sales and Expenses");
  return Object.keys(SHEET_TABS).filter((name) => names.includes(name)).map((name) => [name, sheetRows(given[name], SHEET_TABS[name])]);
}
const bad = (message) => new GoogleLinkError(400, "bad_request", message);

const MAX_READ_ROWS = 10000;
const MAX_READ_COLUMNS = 100;
/** A sheet named by its link: Google's id, and a tab by name or by the link's `gid` number. */
/** A booking's event, checked: the shop sends plain words and two times, nothing else reaches Google. */
const BOOKING_ID = /^[A-Za-z0-9_-]{6,64}$/;
const eventIdFor = (shopId, id) => `cb${createHash("sha256").update(`${shopId}/${id}`).digest("hex").slice(0, 40)}`;
function bookingEventAsked({ id, title, start, end, location, details, meet } = {}) {
  if (typeof id !== "string" || !BOOKING_ID.test(id)) throw bad("id must be a booking's id");
  const text = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
  const startMs = Date.parse(start), endMs = Date.parse(end);
  if (!text(title, 300).trim()) throw bad("title is needed");
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs || endMs - startMs > 24 * 3600 * 1000) throw bad("start and end must be a time of up to a day");
  return {
    id, meet: meet === true,
    event: {
      summary: text(title, 300).trim(), location: text(location, 300), description: text(details, 4000),
      start: { dateTime: new Date(startMs).toISOString() }, end: { dateTime: new Date(endMs).toISOString() },
    },
  };
}
const meetLink = (event) => event?.hangoutLink || event?.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri || "";

function sheetAsked({ spreadsheetId, sheet, gid } = {}) {
  if (typeof spreadsheetId !== "string" || !/^[A-Za-z0-9_-]{20,128}$/.test(spreadsheetId)) throw bad("spreadsheetId must be a Google Sheet's id");
  if (sheet !== undefined && (typeof sheet !== "string" || !sheet || sheet.length > 100)) throw bad("sheet must be a tab's name");
  if (gid !== undefined && !(Number.isInteger(gid) && gid >= 0)) throw bad("gid must be a tab number");
  return { spreadsheetId, sheet, gid };
}
/** Cells read back as text, cut to a size a shop's window takes in (10,000 lines of up to 100 cells). */
function sheetCells(rows) {
  if (rows.length > MAX_READ_ROWS) throw new GoogleLinkError(413, "sheet_too_large", "This sheet has more than 10,000 lines. Split it into smaller sheets and bring them in one at a time.");
  return rows.map((line) => (Array.isArray(line) ? line.slice(0, MAX_READ_COLUMNS) : []).map((cell) => (cell === null || cell === undefined ? "" : String(cell).slice(0, 5000))));
}

/** A person on a shop's team, by the id the shop's own team list gives them. */
const PERSON_ID = /^[A-Za-z0-9_-]{1,40}$/;
const personKey = (shopId, person) => `${shopId}/${person}`;
const MAX_PEOPLE = 20;
const MAX_BUSY_MS = 62 * 24 * 3600 * 1000;
const BUSY_AT_ONCE = 5;
function personAsked(person) {
  if (typeof person !== "string" || !PERSON_ID.test(person)) throw bad("person must be a team member's id");
  return person;
}
function peopleAsked(people) {
  if (!Array.isArray(people) || people.length > MAX_PEOPLE) throw bad(`people must be a list of up to ${MAX_PEOPLE} team members`);
  return [...new Set(people.map(personAsked))];
}

export function createGoogleService({ config, google, tokens, people = null, states, registry, connect, teardown, now = () => Date.now() }) {
  // On for every shop once Google approved the sign-in screen (GOOGLE_CONNECT_ENABLED). Before that, with the keys in
  // place, only the platform's test shop gets it: Google's "testing" sign-in lets its listed test users in (config.js).
  const isOn = (row) => Boolean(config.app) && (config.enabled || (config.testing === true && row?.testShop === true));

  /** The permissions to ask for: the core parts, Gmail sending once switched on, and each extra ticked. */
  function scopesFor(extras) {
    return [
      ...SCOPES.identity, ...SCOPES.analytics, ...SCOPES.searchConsole, ...SCOPES.merchantCenter,
      ...(config.gmailSending ? SCOPES.email : []),
      ...extras.flatMap((extra) => SCOPES[extra]),
      // Reading a sheet the press brings in rides on the Drive box (plan 23.42).
      ...(extras.includes("drive") ? SCOPES.sheets : []),
    ];
  }

  /** Extras the press switched off stop at once; what they made in the press's Google account stays theirs. */
  async function stopDropped(shopId, before = [], after = []) {
    const dropped = before.filter((e) => !after.includes(e));
    if (!dropped.length) return [];
    const shop = await registry.getShop(shopId);
    const g = shop?.google ?? {};
    const at = new Date(now()).toISOString();
    // The Ads link is the one extra that changes something at Google; it comes off (already gone counts as done).
    if (dropped.includes("ads") && g.ads?.linkName && !g.ads.stoppedAt) {
      const grant = await tokens.fresh(shopId);
      if (grant) await google.removeProductLink(grant.token, g.ads.customerId, g.ads.linkName).catch((err) => { if (err?.status !== 404) throw err; });
    }
    const stopped = Object.fromEntries(dropped.filter((e) => g[e] && !g[e].stoppedAt).map((e) => [e, { ...g[e], stoppedAt: at }]));
    // A switched-off extra leaves the list of parts, so a later sign-in that ticks it again starts it afresh.
    const steps = (g.steps ?? []).filter((s) => !dropped.includes(s.step));
    await registry.updateShop(shopId, { google: { ...g, ...stopped, steps } });
    return dropped;
  }

  /** The shop's Colophon calendar and a fresh token for it, only while the Calendar box is ticked and allowed. */
  async function calendarTarget(row) {
    const cal = row.google?.calendar;
    if (!cal?.calendarId || cal.stoppedAt) return null;
    const grant = await tokens.fresh(row.shopId);
    if (!grant || !(grant.extras ?? []).includes("calendar") || !SCOPES.calendar.every((scope) => grant.scopes.includes(scope))) return null;
    return { token: grant.token, calendarId: cal.calendarId };
  }

  async function status(row) {
    if (!isOn(row)) return { enabled: false };
    const conn = await tokens.get(row.shopId);
    const g = row.google ?? {};
    return {
      enabled: true,
      connected: tokens.live(conn),
      accountEmail: tokens.live(conn) ? conn.accountEmail : null,
      connectedAt: tokens.live(conn) ? g.connectedAt ?? null : null,
      needsReconnect: tokens.needsReconnect(conn),
      extrasOffered: offeredExtras(config),
      extrasChosen: tokens.live(conn) ? conn.extras ?? [] : [],
      gmailSending: config.gmailSending,
      // The stock sheet in the press's Drive, once one was sent: where it is and when it was last written.
      sheet: tokens.live(conn) && g.sheet?.url ? { url: g.sheet.url, writtenAt: g.sheet.writtenAt ?? null, rows: g.sheet.rows ?? 0, sales: g.sheet.sales ?? null, expenses: g.sheet.expenses ?? null } : null,
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
    // One Google account for the whole shop: once connected, Google's page opens on that account, not just the owner's.
    const conn = await tokens.get(row.shopId);
    const loginHint = (tokens.live(conn) && conn.accountEmail) || row.ownerEmail;
    return { url: google.authorizeUrl({ state, scopes: scopesFor(chosen), loginHint }), expiresAt: Math.floor(expiresAt / 1000) };
  }

  // ---- A services shop's team: each person links their own calendar, so their busy times close those times ----

  /** People's links are on only with the later extras (Google reviews the permission in its later round). */
  const teamOn = () => Boolean(people) && Boolean(config.laterExtras);

  /** The shop's list of linked people, kept on its row so closing the shop can forget every one. */
  async function notePerson(shopId, person, linked) {
    const fresh = await registry.getShop(shopId);
    const g = fresh?.google ?? {};
    const list = new Set(Array.isArray(g.people) ? g.people : []);
    if (linked) list.add(person); else list.delete(person);
    await registry.updateShop(shopId, { google: { ...g, people: [...list].slice(0, 200) } });
  }

  /**
   * Forgets one person's link. Colophon's grant at Google is left alone: Google keeps one grant per account, and the same
   * account may be the shop's own, another person's here or someone's in another shop, so giving it back could cut them
   * off. The tokens are deleted here, and the person can remove Colophon from their Google account page themselves.
   */
  async function forgetPerson(row, person) {
    const key = personKey(row.shopId, person);
    const conn = await people.get(key);
    if (!people.live(conn)) { await notePerson(row.shopId, person, false); return { forgotten: false }; }
    await people.revoke(key, { atGoogle: false });
    await notePerson(row.shopId, person, false);
    return { forgotten: true };
  }

  const OPS = {
    async "google.personLink"(row, { person } = {}) {
      if (!teamOn()) return { available: false };
      const who = personAsked(person);
      const state = randomBytes(24).toString("hex");
      // Passed on to the person and opened on their own phone, so it lasts a day (still one use). They land on a short
      // page from the platform (teamCalendarPage.js), not the shop's admin they can't sign in to.
      const expiresAt = now() + PERSON_STATE_MS;
      await states.put(state, { shopId: row.shopId, person: who, expiresAt });
      return { available: true, url: google.authorizeUrl({ state, scopes: [...SCOPES.identity, ...SCOPES.teamCalendars] }), expiresAt: Math.floor(expiresAt / 1000) };
    },
    async "google.peopleStatus"(row, { people: asked } = {}) {
      if (!teamOn()) return { available: false, people: {} };
      const list = peopleAsked(asked);
      const out = {};
      for (const person of list) {
        const conn = await people.get(personKey(row.shopId, person));
        out[person] = people.live(conn) ? { linked: true, accountEmail: conn.accountEmail || "", needsReconnect: people.needsReconnect(conn), linkedAt: conn.connectedAt || null } : { linked: false };
      }
      return { available: true, people: out };
    },
    async "google.peopleBusy"(row, { people: asked, from, to } = {}) {
      if (!teamOn()) return { available: false, busy: {} };
      const list = peopleAsked(asked);
      const fromMs = Date.parse(from), toMs = Date.parse(to);
      if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs || toMs - fromMs > MAX_BUSY_MS) throw bad("from and to must be two times up to 62 days apart");
      const busy = {};
      // A few at a time, so a big team still answers well inside the shop's wait for the platform.
      const readOne = async (person) => {
        const conn = await people.get(personKey(row.shopId, person));
        // Not linked: nothing closes their times. Linked but unreadable: null, so the shop keeps what it had.
        if (!people.live(conn)) { busy[person] = []; return; }
        try {
          const grant = await people.fresh(personKey(row.shopId, person));
          if (!grant) { busy[person] = null; return; }
          const spans = await google.freeBusy(grant.token, new Date(fromMs).toISOString(), new Date(toMs).toISOString());
          busy[person] = spans.filter((b) => Number.isFinite(Date.parse(b.start)) && Date.parse(b.end) > Date.parse(b.start)).slice(0, 2000);
        } catch (err) {
          console.warn(`A team member's busy times for ${row.shopId} couldn't be read:`, err?.message || err);
          busy[person] = null;
        }
      };
      for (let i = 0; i < list.length; i += BUSY_AT_ONCE) await Promise.all(list.slice(i, i + BUSY_AT_ONCE).map(readOne));
      return { available: true, busy };
    },
    async "google.personDisconnect"(row, { person } = {}) {
      if (!people) return { available: false };
      return { available: true, ...(await forgetPerson(row, personAsked(person))) };
    },
    "google.status": (row) => status(row),
    async "google.sheetSync"(row, args = {}) {
      const tabs = sheetTabs(args);
      const grant = await tokens.fresh(row.shopId);
      // Only with the Drive box ticked: Google keeps an unticked extra's permission in the grant, so the scopes alone
      // don't say the press still wants a sheet.
      if (!grant || !(grant.extras ?? []).includes("drive") || !SCOPES.drive.every((scope) => grant.scopes.includes(scope))) return { available: false };
      // Written over a fresh read of the row, so a connect step that finished meanwhile isn't undone.
      const saveSheet = async (sheet) => {
        const fresh = await registry.getShop(row.shopId);
        await registry.updateShop(row.shopId, { google: { ...(fresh?.google ?? row.google ?? {}), sheet } });
      };
      const known = row.google?.sheet ?? {};
      let sheet = known.spreadsheetId ? known : null;
      const names = tabs.map(([name]) => name);
      if (!sheet) {
        const made = await google.createSpreadsheet(grant.token, `${row.pressName || row.shopId} stock from Colophon`, names);
        sheet = { spreadsheetId: made.spreadsheetId, url: made.spreadsheetUrl, madeAt: new Date(now()).toISOString() };
        // Kept before the first write: if that write fails, the next try fills this sheet instead of making another.
        await saveSheet(sheet);
      }
      try {
        // A sheet made before the Sales tab existed gets it added; the press's own extra tabs are left alone.
        if (known.spreadsheetId) {
          const have = await google.sheetTabs(grant.token, sheet.spreadsheetId);
          const missing = names.filter((name) => !have.includes(name));
          if (missing.length) await google.addSheetTabs(grant.token, sheet.spreadsheetId, missing);
        }
        for (const [name, values] of tabs) await google.writeSheetTab(grant.token, sheet.spreadsheetId, name, values);
      } catch (err) {
        // The press deleted the sheet in their Drive: make a fresh one next time rather than failing for good.
        if (err?.status === 404 && known.spreadsheetId) { await saveSheet(null); return { available: true, gone: true }; }
        throw err;
      }
      const lines = Object.fromEntries(tabs.map(([name, values]) => [name, values.length - 1]));
      const extra = { ...(lines.Sales !== undefined ? { sales: lines.Sales } : {}), ...(lines.Expenses !== undefined ? { expenses: lines.Expenses } : {}) };
      const next = { ...sheet, writtenAt: new Date(now()).toISOString(), rows: lines.Stock, ...extra };
      await saveSheet(next);
      return { available: true, url: next.url, writtenAt: next.writtenAt, rows: next.rows, ...extra };
    },
    async "google.sheetRead"(row, args = {}) {
      const { spreadsheetId, sheet, gid } = sheetAsked(args);
      const grant = await tokens.fresh(row.shopId);
      if (!grant || !SCOPES.sheets.every((scope) => grant.scopes.includes(scope))) return { available: false };
      let book;
      try {
        book = await google.readSheetInfo(grant.token, spreadsheetId);
      } catch (err) {
        if (err?.status === 404 || err?.status === 403) throw new GoogleLinkError(404, "sheet_not_found", "Google can't open that sheet. Check the link, and that the sheet belongs to the Google account linked to your shop or is shared with it.");
        throw err;
      }
      const tabs = book.tabs.filter((t) => !t.hidden);
      let pick = sheet !== undefined ? book.tabs.find((t) => t.title === sheet) : gid !== undefined ? book.tabs.find((t) => t.id === gid) : null;
      if (sheet !== undefined && !pick) throw new GoogleLinkError(404, "tab_not_found", `This sheet has no tab called “${sheet}”. Bring it in again.`);
      // As with a file: with no tab named, a cover or empty first tab is passed over.
      const order = pick ? [pick] : tabs.length ? tabs : book.tabs.slice(0, 1);
      let rows = [];
      for (const tab of order.slice(0, 5)) {
        rows = await google.readSheetValues(grant.token, spreadsheetId, tab.title);
        pick = tab;
        if (rows.length) break;
      }
      return { available: true, title: book.title, sheet: pick?.title ?? "", sheets: tabs.map((t) => t.title), rows: sheetCells(rows) };
    },
    async "google.bookingEvent"(row, args = {}) {
      const { id, event, meet } = bookingEventAsked(args);
      const target = await calendarTarget(row);
      if (!target) return { available: false };
      const saved = await google.putEvent(target.token, target.calendarId, eventIdFor(row.shopId, id), event, { meet });
      return { available: true, meetUrl: meet ? meetLink(saved) : "" };
    },
    async "google.bookingEventRemove"(row, { id } = {}) {
      if (typeof id !== "string" || !BOOKING_ID.test(id)) throw bad("id must be a booking's id");
      const target = await calendarTarget(row);
      if (!target) return { available: false };
      try {
        await google.deleteEvent(target.token, target.calendarId, eventIdFor(row.shopId, id));
      } catch (err) {
        if (err?.status !== 404 && err?.status !== 410) throw err;
      }
      return { available: true };
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
    /** Switch extras off with no trip to Google: only ones that are on, and the grant itself is kept. */
    async "google.turnOff"(row, { extras } = {}) {
      const conn = await tokens.get(row.shopId);
      if (!tokens.live(conn)) throw new GoogleLinkError(409, "not_connected", "Connect Google first.");
      const on = conn.extras ?? [];
      if (!Array.isArray(extras) || !extras.length || extras.some((e) => !on.includes(e))) throw bad("extras must be ones that are on");
      const keep = on.filter((e) => !extras.includes(e));
      await tokens.setExtras(row.shopId, keep);
      await stopDropped(row.shopId, on, keep);
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

  /** A team member allowed their busy times: their own grant, kept apart from the shop's. */
  async function personSignedIn(row, saved, code) {
    const back = (outcome) => teamCalendarPage(outcome, row.pressName);
    if (!teamOn()) return back("failed");
    if (typeof code !== "string" || !code) return back("denied");
    try {
      const granted = await google.exchangeCode(code);
      if (!SCOPES.teamCalendars.every((scope) => (granted.scopes ?? []).includes(scope))) {
        // They unticked the one thing asked for: nothing is kept.
        await google.revoke(granted.refreshToken || granted.accessToken).catch(() => {});
        return back("denied");
      }
      const accountEmail = (await google.whoami(granted.accessToken)).email;
      await people.save(personKey(row.shopId, saved.person), granted, { accountEmail });
      await notePerson(row.shopId, saved.person, true);
      return back("linked");
    } catch (err) {
      console.error(`A team member's Google sign-in for ${row.shopId} failed:`, err?.message || err);
      return back("failed");
    }
  }

  return {
    status, connectLink, scopesFor,
    forgetPerson,

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
        if (body.op !== "google.status" && !isOn(row)) throw new GoogleLinkError(409, "google_off", "Connect Google isn't turned on yet.");
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
      if (!row || !isOn(row)) return saved.person ? teamCalendarPage("failed", row?.pressName) : backTo(saved.returnUrl, "failed");
      if (saved.person) return personSignedIn({ ...row, shopId: saved.shopId }, saved, query.error ? "" : query.code);
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
      // One Google account runs every part of a shop. Signing in with another one while connected would split them, so
      // nothing changes, Colophon gives that account's new access straight back, and the press is told which one to use.
      const before = await tokens.get(saved.shopId);
      if (tokens.live(before) && before.accountEmail && accountEmail && before.accountEmail.toLowerCase() !== accountEmail.toLowerCase()) {
        await google.revoke(granted.refreshToken || granted.accessToken).catch(() => {});
        // Written down for the control room, so "Google won't connect" has an answer: when, and which account was tried.
        const tries = row.google?.refusedSignIn;
        await registry.updateShop(saved.shopId, { google: { ...(row.google ?? {}), refusedSignIn: { at: new Date(now()).toISOString(), triedEmail: String(accountEmail).slice(0, 200), times: (tries?.times ?? 0) + 1 } } })
          .catch((err) => console.error(`Noting the refused Google sign-in for ${saved.shopId} failed:`, err?.message || err));
        return backTo(saved.returnUrl, "other_account");
      }
      await tokens.save(saved.shopId, granted, { accountEmail, extras: saved.extras ?? [] });
      // The right account got through, so the control room's "turned away a sign-in" note is answered: take it off.
      if (row.google?.refusedSignIn) {
        const { refusedSignIn: _done, ...rest } = (await registry.getShop(saved.shopId))?.google ?? {};
        await registry.updateShop(saved.shopId, { google: rest })
          .catch((err) => console.error(`Clearing the refused Google sign-in for ${saved.shopId} failed:`, err?.message || err));
      }
      if (tokens.live(before)) await stopDropped(saved.shopId, before.extras ?? [], saved.extras ?? []);
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
