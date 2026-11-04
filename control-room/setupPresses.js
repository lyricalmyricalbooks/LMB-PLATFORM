// Presses setting up (the control room's "Setting up" page): every press that signed up at the front door (code plan
// 18.2 to 18.8) and is still in setup mode, or has pressed Open my shop. Before this page the control room only saw a
// press once its shop was being made, so a press that signed up and stopped at setup was invisible.
//
// It reads the setup records (`presses/<pressId>`, signup/pressRecord.js) and the shop registry, and changes nothing.
// What it shows of a record is what the press typed (name, what it sells, country, plan, looks, "Selling somewhere
// already?", email language) and the platform's own dates. Never the owner's sign-in id or the kept file's path.
//
// Clients passed in:
//   presses   the front door's store (clients/platformStores.js firestoreFrontDoorStores): list() -> every record
//   registry  the shop registry: listShops()
import { adminOf, ControlError } from "./controlRoom.js";
import { SETUP_EXPIRY_DAYS } from "../signup/pressRecord.js";
import { PUBLISHES } from "../signup/form.js";

const DAY = 86_400_000;
/** "zines" -> "Zines": the words the press picked from at the front door. */
const sellsWords = (id) => PUBLISHES.options.find((option) => option.id === id)?.label ?? id;
/** A press idle this long in setup is shown as going soon: its record is removed at SETUP_EXPIRY_DAYS. */
export const GOING_SOON_DAYS = SETUP_EXPIRY_DAYS - 15;
/** A press that pressed Open my shop this long ago without a live shop needs a look. */
export const STUCK_OPENING_HOURS = 24;

const idleDays = (record, now) => {
  const seen = Date.parse(record.lastSeenAt ?? record.createdAt ?? "");
  return Number.isFinite(seen) ? Math.max(0, Math.floor((now - seen) / DAY)) : null;
};

/** What a press still has to fill in before Open my shop works (signup/frontDoor.js OPEN_NEEDS), in plain words. */
export function stillToDo(record) {
  const missing = [];
  if (!record.pressName) missing.push("press name");
  if (!record.country) missing.push("country");
  return missing;
}

/**
 * How far the press has got through setup mode's guide: the same steps and count as the shop's setup guide
 * (apps/shop/src/setupMode/pages.ts guideSteps and guideProgress; a test keeps the steps in step). The bring-over step
 * counts only once done, as there. `next` is the first step not done that isn't optional.
 */
export function guideOf(record) {
  const website = record.plan !== "stockroom";
  const books = { id: "books", title: "Bring products over", done: Boolean(record.stagedImport), optional: true };
  const look = website ? [{ id: "look", title: "Choose the website's look", done: Boolean(record.look) }] : [];
  const steps = [
    { id: "plan", title: "Pick what to set up", done: Boolean(record.plan) },
    { id: "details", title: "Press details", done: Boolean(record.pressName && record.sells && record.country) },
    ...(record.moving === "fresh" ? [...look, books] : [books, ...look]),
    // Optional, as in the shop's guide: the free address always works.
    ...(website ? [{ id: "domain", title: "Choose the web address", done: record.domainChoice === "free" || (record.domainChoice === "own" && Boolean(record.domain)), optional: true }] : []),
    { id: "open", title: "Create the shop", done: record.status === "opening" || record.status === "open" },
  ];
  const counted = steps.filter((step) => !step.optional || step.done);
  const next = steps.find((step) => !step.done && !step.optional) ?? null;
  return { done: counted.filter((step) => step.done).length, total: counted.length, next: next?.title ?? null, steps: steps.map(({ id, done }) => ({ id, done })) };
}

/**
 * One press as the page shows it, with `flag` set when it needs a look:
 *   "stuck"       pressed Open my shop over a day ago and its shop isn't live
 *   "going-soon"  idle in setup long enough that its record is removed within 15 days
 */
export function setupPress(record, { shop, now }) {
  const idle = idleDays(record, now);
  const seen = Date.parse(record.lastSeenAt ?? record.createdAt ?? "");
  const removesOn = record.status === "setup" && Number.isFinite(seen) ? new Date(seen + SETUP_EXPIRY_DAYS * DAY).toISOString() : null;
  const opened = Date.parse(record.openedAt ?? "");
  const shopLive = shop?.status === "live";
  let flag = null;
  if (record.status === "opening" && !shopLive && Number.isFinite(opened) && now - opened >= STUCK_OPENING_HOURS * 3_600_000) flag = "stuck";
  else if (record.status === "setup" && idle !== null && idle >= GOING_SOON_DAYS) flag = "going-soon";
  return {
    pressId: record.pressId,
    pressName: record.pressName || "",
    ownerEmail: record.ownerEmail ?? null,
    status: record.status,
    plan: record.plan || "",
    sells: record.sells ? sellsWords(record.sells) : "",
    country: record.country || "",
    look: record.look || "",
    adminLook: record.adminLook || "",
    moving: record.moving || "",
    language: record.language || "",
    // What the press sees of its kept product file: never the path.
    import: record.stagedImport ? { name: record.stagedImport.name ?? "", rows: record.stagedImport.rows ?? null, at: record.stagedImport.at ?? null } : null,
    stillToDo: record.status === "setup" ? stillToDo(record) : [],
    guide: guideOf(record),
    createdAt: record.createdAt ?? null,
    lastSeenAt: record.lastSeenAt ?? null,
    idleDays: idle,
    removesOn,
    openedAt: record.openedAt ?? null,
    shopId: record.shopId || null,
    shopStatus: shop?.status ?? null,
    shopMessage: record.shopMessage || "",
    // The removal warnings emailed for this visit (signup/setupClock.js): { "30": at, "7": at }.
    warned: record.setupWarnings?.seen === record.lastSeenAt ? record.setupWarnings.sent ?? {} : {},
    expiredAt: record.expiredAt ?? null,
    flag,
  };
}

/** How many records chose each look ("" = not chosen yet), most chosen first. */
function tally(records, field) {
  const counts = new Map();
  for (const record of records) {
    const id = record[field] || "";
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts].map(([id, count]) => ({ id, count })).sort((a, b) => (a.id === "") - (b.id === "") || b.count - a.count || a.id.localeCompare(b.id));
}

const ORDER = { stuck: 0, "going-soon": 1 };
const STATUS_ORDER = { setup: 0, opening: 1, open: 2, expired: 3 };

/** The page: the counts, the looks presses picked, and every press, the ones needing a look first. */
export function setupSummary({ records, rows = [], now = Date.now() }) {
  const shops = new Map(rows.map((row) => [row.shopId, row]));
  const presses = records.map((record) => setupPress(record, { shop: record.shopId ? shops.get(record.shopId) : null, now }));
  presses.sort((a, b) => (ORDER[a.flag] ?? 9) - (ORDER[b.flag] ?? 9)
    || (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
    || String(b.lastSeenAt ?? "").localeCompare(String(a.lastSeenAt ?? "")));
  const weekAgo = now - 7 * DAY;
  const inSetup = presses.filter((p) => p.status === "setup");
  const counts = {
    inSetup: inSetup.length,
    readyToOpen: inSetup.filter((p) => p.stillToDo.length === 0).length,
    signedUpThisWeek: presses.filter((p) => Date.parse(p.createdAt ?? "") >= weekAgo).length,
    opening: presses.filter((p) => p.status === "opening" && p.shopStatus !== "live").length,
    opened: presses.filter((p) => p.shopStatus === "live").length,
    stuck: presses.filter((p) => p.flag === "stuck").length,
    goingSoon: presses.filter((p) => p.flag === "going-soon").length,
    bringingShopOver: inSetup.filter((p) => p.moving === "yes").length,
    withProductFile: inSetup.filter((p) => p.import).length,
  };
  return { counts, looks: { website: tally(records, "look"), admin: tally(records, "adminLook") }, presses };
}

/** The page's door. Platform admins only; nothing here changes anything, so nothing asks for a reason. */
export function createSetupDesk({ admins, presses, registry, now = () => new Date() }) {
  return {
    async list(claims) {
      adminOf(claims, admins, now().getTime());
      if (!presses?.list) throw new ControlError(503, "The control room can't read the presses setting up right now.");
      const records = await presses.list();
      const rows = registry ? await registry.listShops() : [];
      return setupSummary({ records, rows, now: now().getTime() });
    },
  };
}

//   GET /api/control/presses   every press in setup or opening: counts, looks chosen, and each press (plan 18.x)
export function setupRoutes(desk) {
  return { "GET /api/control/presses": (claims) => desk.list(claims) };
}
