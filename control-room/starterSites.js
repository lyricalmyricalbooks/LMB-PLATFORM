// Starter websites (starters and Studio rethink, step 6, 24 November 2026): which whole-website starters new and
// existing shops are offered, in what order, and which carry a "New" tag. A starter is a THEME_LIBRARY entry listed in
// the shop's `STARTER_SITES` (apps/shop/src/app/admin/lookGallery.ts); STARTERS below mirrors that list with the names
// the shop shows, and starterSites.test.js keeps the two in step.
//
// The choice is one platform record (`starters` in the platform's small records):
//   { order: [id], hidden: [id], fresh: [id], known: [id], hiddenStyles: ["starter/style"], updatedAt, by }
// `known` is every starter the owner has seen on this page: a starter added to the shop later is not in it, so shops
// keep it hidden until the owner turns it on here. With no record at all (never saved), shops show every starter in the
// shop's own order.
//
// How it reaches shops: the platform writes the admin-only `platform/starters` document into each live shop's folder
// (like platform/messages). Saving writes every shop at once; `sweep()` (run with the press messages job) writes it
// again for shops made since. The shop's Choose your look and Studio › Designs read it (apps/shop
// src/app/admin/platformStarters.ts); a shop that can't read it shows every starter.
//
// Styles (next starters plan phase 2): every starter comes in three named styles (apps/shop studio/starterStyles.ts);
// `hiddenStyles` hides one from shops by `starter/style` id. The starter's own (first) style can't be hidden.
// Versions (next starters plan phase 4): `version` is each starter's newest release (apps/shop studio/starterVersions.ts,
// kept in step by starterSites.test.js), so the page can say how many live shops are on it.
//
// Clients passed in:
//   settingsStore  the platform's small records: get(name); set(name, value)
//   registry       listShops()
//   auditLog       ready(shopId): whether the shop's database exists yet
//   shopData       get(shopId, path); set(shopId, path, data)
//   activity       optional: the activity log (activity.js)
import { ControlError, adminOf, eachInTurn } from "./controlRoom.js";
import { activityEntry } from "./activity.js";
import { PLANS } from "../setup/steps.js";

/** The shop's starters, in the shop's own order (lookGallery.ts STARTER_SITES), with the names it shows. */
export const STARTERS = Object.freeze([
  { id: "juniper-slow-season", name: "Slow Season", version: 1, styles: [{ id: "terracotta", name: "Terracotta" }, { id: "sage", name: "Sage" }, { id: "night", name: "Night" }] },
  { id: "juniper-catalogue", name: "Catalogue", version: 1, styles: [{ id: "acid", name: "Acid" }, { id: "blueprint", name: "Blueprint" }, { id: "night", name: "Night" }] },
  { id: "aurel-editorial", name: "Aurel", version: 1, styles: [{ id: "cobalt", name: "Cobalt" }, { id: "sand", name: "Sand" }, { id: "night", name: "Night" }] },
]);
/** Every style that can be hidden (all but each starter's own), as `starter/style`. */
const HIDEABLE_STYLES = STARTERS.flatMap((s) => s.styles.slice(1).map((x) => `${s.id}/${x.id}`));
const styleList = (value) => [...new Set((Array.isArray(value) ? value : []).filter((id) => HIDEABLE_STYLES.includes(id)))];
export const STARTERS_RECORD = "starters";
export const STARTERS_DOC = "platform/starters";
const IDS = STARTERS.map((s) => s.id);
const SHOPS_AT_ONCE = 4;

const idList = (value) => [...new Set((Array.isArray(value) ? value : []).filter((id) => IDS.includes(id)))];

/** A saved record cleaned to known starters only (unknown ids from an older list are dropped). */
export function cleanRecord(record) {
  if (!record || typeof record !== "object") return null;
  const known = idList(record.known);
  const order = idList(record.order);
  return {
    order: [...order, ...known.filter((id) => !order.includes(id))],
    hidden: idList(record.hidden).filter((id) => known.includes(id)),
    fresh: idList(record.fresh).filter((id) => known.includes(id)),
    known,
    hiddenStyles: styleList(record.hiddenStyles),
    updatedAt: record.updatedAt ?? null,
    by: record.by ?? null,
  };
}

/**
 * What the page shows for each starter, in the order shops see them: shown, hidden, or waiting (added to the shop
 * after the last save, so hidden until turned on). With no record, every starter shows in the shop's order.
 */
export function starterRows(record) {
  const saved = cleanRecord(record);
  const stylesOf = (starter) => starter.styles.map((x, i) => ({ ...x, own: i === 0, shown: i === 0 || !saved?.hiddenStyles.includes(`${starter.id}/${x.id}`) }));
  if (!saved) return STARTERS.map((s) => ({ ...s, styles: stylesOf(s), state: "shown", fresh: false }));
  const ordered = [...saved.order, ...IDS.filter((id) => !saved.order.includes(id))];
  return ordered.map((id) => {
    const starter = STARTERS.find((s) => s.id === id);
    return {
      ...starter,
      styles: stylesOf(starter),
      state: !saved.known.includes(id) ? "waiting" : saved.hidden.includes(id) ? "hidden" : "shown",
      fresh: saved.fresh.includes(id),
    };
  });
}

/** The document a shop reads: the order, what is hidden or new, and which starters the owner has seen. */
export function shopDocOf(record) {
  const saved = cleanRecord(record);
  if (!saved) return null;
  return { order: saved.order, hidden: saved.hidden, fresh: saved.fresh, known: saved.known, hiddenStyles: saved.hiddenStyles, updatedAt: saved.updatedAt };
}

/**
 * A choice from the page made into a record: `starters` is the list in the order chosen, each { id, shown, fresh,
 * hiddenStyles: [styleId] } (hiddenStyles optional; a starter's own style is never hidden).
 * Every starter must be in it once, and at least one must stay shown, so a new shop always has a starter to pick.
 */
export function recordFrom(starters, by, at) {
  if (!Array.isArray(starters)) throw new ControlError(400, "Send the starters in the order shops should see them.");
  const ids = starters.map((s) => s?.id);
  if (ids.length !== IDS.length || IDS.some((id) => !ids.includes(id))) throw new ControlError(400, "Every starter has to be in the list once. Refresh the page and try again.");
  if (!starters.some((s) => s.shown === true)) throw new ControlError(400, "Keep at least one starter showing, so new shops have one to pick.");
  return {
    order: ids,
    hidden: starters.filter((s) => s.shown !== true).map((s) => s.id),
    fresh: starters.filter((s) => s.fresh === true).map((s) => s.id),
    known: ids,
    hiddenStyles: styleList(starters.flatMap((s) => (Array.isArray(s.hiddenStyles) ? s.hiddenStyles : []).map((style) => `${s.id}/${style}`))),
    updatedAt: at,
    by,
  };
}

const reachable = (row) => row && row.status === "live" && !row.closure && (PLANS[row.plan] ?? { shop: true }).shop;

export function createStarterSites({ admins, settingsStore, registry, auditLog, shopData, activity = null, now = () => new Date() }) {
  const at = () => now().toISOString();

  /** Writes one shop's document when it changed. Returns whether the shop now has it. */
  async function publishShop(row, doc) {
    if (!(await auditLog.ready(row.shopId))) return false;
    const saved = await shopData.get(row.shopId, STARTERS_DOC);
    const same = (a, b) => JSON.stringify({ ...a, updatedAt: null }) === JSON.stringify({ ...b, updatedAt: null });
    if (saved && same(saved, doc)) return true;
    await shopData.set(row.shopId, STARTERS_DOC, doc);
    return true;
  }

  /** Every live shop with a website gets the document; one shop's trouble never stops the rest. */
  async function publishAll(doc) {
    const rows = (await registry.listShops()).filter(reachable);
    const failed = [];
    let shops = 0;
    await eachInTurn(rows, SHOPS_AT_ONCE, async (row) => {
      try {
        if (await publishShop(row, doc)) shops += 1;
      } catch (failure) {
        failed.push({ shopId: row.shopId, pressName: row.pressName ?? row.shopId, error: failure.message });
      }
    });
    return { shops, failed };
  }

  return {
    /** The starters as shops see them now, for Setting up › Starter websites. */
    async list(claims) {
      adminOf(claims, admins, now().getTime());
      const record = cleanRecord(await settingsStore.get(STARTERS_RECORD));
      return { starters: starterRows(record), saved: Boolean(record), updatedAt: record?.updatedAt ?? null, by: record?.by ?? null };
    },

    /** Saves the order, what shows and what is new, and writes it to every live shop. Saving the same choice again writes nothing new to shops. */
    async save(claims, { starters } = {}) {
      const by = adminOf(claims, admins, now().getTime());
      const stamp = at();
      const record = recordFrom(starters, by, stamp);
      const before = cleanRecord(await settingsStore.get(STARTERS_RECORD));
      const changed = !before || ["order", "hidden", "fresh", "known", "hiddenStyles"].some((k) => JSON.stringify(before[k]) !== JSON.stringify(record[k]));
      if (changed) {
        await settingsStore.set(STARTERS_RECORD, record);
        if (activity) await activity.record(activityEntry({ at: stamp, by, what: "starters-set", shopId: null, detail: { order: record.order, hidden: record.hidden, fresh: record.fresh, hiddenStyles: record.hiddenStyles } }));
      }
      const saved = changed ? record : before;
      const { shops, failed } = await publishAll(shopDocOf(saved));
      return { starters: starterRows(saved), saved: true, changed, updatedAt: saved.updatedAt, by: saved.by, shops, failed };
    },

    /** Nightly: shops made since the last save get the document too. Nothing to do while the record was never saved. */
    async sweep() {
      const doc = shopDocOf(await settingsStore.get(STARTERS_RECORD));
      if (!doc) return { shops: 0, failed: [], saved: false };
      return { ...(await publishAll(doc)), saved: true };
    },
  };
}

//   GET  /api/control/starters       the starters as shops see them
//   POST /api/control/starters/save  { starters: [{ id, shown, fresh, hiddenStyles }] } in the order shops should see them
export function starterSitesRoutes(desk) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  return {
    "GET /api/control/starters": (claims) => desk.list(claims),
    "POST /api/control/starters/save": (claims, request) => desk.save(claims, body(request)),
  };
}
