// What a press brought over from its old shop (control room, a live shop's record; switching plan, Phase 23). The shop
// admin's "Bring your shop with you" steps each leave one line per run in the shop's own `audit-log` (apps/shop:
// functions/orderImport.js past orders, functions/giftCardImport.js gift cards, admin/ShopMoveDialogs.tsx customers,
// admin/BookImportDialog.tsx old shop links), and the hourly photo copy keeps its progress in
// `systemStatus/photoImport` (functions/photoImport.js). This reads those and nothing else, and changes nothing. So when a
// press writes "my old orders are missing", the record already says what came over, when and how much, and whether
// photos are still waiting to be copied off the old shop before it closes. For a press that brought its shop over in Get
// started, it also shows which parts of "Your move so far" are done (`firstWeek/start` `done`, plan 23.17), and past
// orders taken out again (the undo, plan 23.15) are counted off. Also: past orders re-rated later, the files they came
// from (`importedFile` on each past order), and discount codes from Discounts › Bring codes over. And the reads of the
// old shop's address (`systemStatus/oldShopScans`): which old shops read, how many products, and which failed and why.
//
// Clients passed in:
//   registry  getShop(shopId)
//   shopData  the shop's own database: get(shopId, path); find(shopId, collection, { where, limit }) -> [{ id, data }]
import { ControlError, adminOf } from "./controlRoom.js";

/** The kinds of line the import steps write, by the start of their words (the shop's own wording, kept in step). */
const STARTS = ["Brought ", "Removed ", "Old shop links: ", "Changed the rate on "];
/** The description Discounts › Bring codes over gives each code it saves (apps/shop admin/DiscountMoveDialog.tsx). */
export const MOVED_CODE = "Brought over from your old shop";
/** The shop admin's "Your move so far" parts (apps/shop admin/moveProgress.ts), ticked in `firstWeek/start` `done`. */
export const MOVE_STEPS = Object.freeze([["move-books", "Books"], ["move-customers", "Customers"], ["move-giftcards", "Gift cards"], ["move-orders", "Past orders"], ["move-links", "Pages and old links"]]);
/** A string range that holds exactly the lines starting with `start` (a plain range query: no extra index needed). */
const startsWith = (start) => [["message", ">=", start], ["message", "<", start.slice(0, -1) + String.fromCharCode(start.at(-1).charCodeAt(0) + 1)]];
const MAX_LINES = 200;
const MAX_PAST = 5000;
const SHOWN_FILES = 10;

/** The files past orders came from (`importedFile`, plan 23.33), most orders first, with how many each brought. */
export function filesOf(orders) {
  const byFile = new Map();
  for (const o of orders) {
    const file = typeof o?.importedFile === "string" && o.importedFile ? o.importedFile : null;
    if (file) byFile.set(file, (byFile.get(file) ?? 0) + 1);
  }
  return [...byFile].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, SHOWN_FILES).map(([file, orders]) => ({ file, orders }));
}

const count = (message, word) => Number(new RegExp(`(\\d+) ${word}`).exec(message)?.[1] ?? 0);
const money = (message, after) => Number(new RegExp(`CA\\$([\\d.]+) in ${after}`).exec(message)?.[1] ?? 0);

/** One audit-log line as a brought-over run, or null when it isn't one. */
export function runOf(line) {
  const message = String(line?.message ?? "");
  const at = line?.createdAt ?? null;
  if (line?.type === "orders" && message.startsWith("Brought ")) return { kind: "orders", at, count: line.orders ?? count(message, "past order"), amount: money(message, "sales") };
  // Undo (plan 23.15): a batch of past orders taken out again.
  if (line?.type === "orders" && message.startsWith("Removed ") && message.includes("brought over")) return { kind: "orders", at, count: -(line.orders ?? count(message, "past order")), removed: true };
  // A past order sold in another currency, re-rated afterwards (plans 23.23 and 23.34): one line per change, not a run.
  if (line?.type === "orders" && message.startsWith("Changed the rate on ")) return { kind: "orders", at, count: 0, rerated: Number(line.orders) || count(message, "past order") || 1 };
  if (line?.type === "giftCards" && message.startsWith("Brought ")) return { kind: "giftCards", at, count: line.cards ?? count(message, "gift card"), amount: line.balanceMinor != null ? line.balanceMinor / 100 : money(message, "balances") };
  if (line?.type === "customers" && message.startsWith("Brought ")) return { kind: "customers", at, count: count(message, "customer"), newsletter: count(message, "joined") };
  if (line?.type === "catalog" && message.startsWith("Old shop links: ")) return { kind: "links", at, count: count(message, "now lead") };
  return null;
}

/** The totals per kind, each with its runs and the latest run's date. */
export function broughtOverSummary(lines, photos, start = null, codes = [], files = []) {
  const kinds = {};
  for (const run of lines.map(runOf).filter(Boolean)) {
    const kind = (kinds[run.kind] ??= { count: 0, amount: 0, runs: 0, lastAt: null });
    kind.count += run.count;
    if (run.removed) kind.removed = (kind.removed ?? 0) - run.count;
    if (run.rerated) kind.rerated = (kind.rerated ?? 0) + run.rerated;
    kind.amount = Math.round((kind.amount + (run.amount ?? 0)) * 100) / 100;
    if (run.newsletter) kind.newsletter = (kind.newsletter ?? 0) + run.newsletter;
    if (!run.removed && !run.rerated) kind.runs += 1;
    if (run.at && (!kind.lastAt || run.at > kind.lastAt)) kind.lastAt = run.at;
  }
  const failed = photos?.failed && typeof photos.failed === "object" ? Object.keys(photos.failed).length : 0;
  if (kinds.orders && files.length) kinds.orders.files = files;
  return {
    orders: kinds.orders ?? null,
    giftCards: kinds.giftCards ?? null,
    customers: kinds.customers ?? null,
    links: kinds.links ?? null,
    // Discount codes from Discounts › Bring codes over: how many, and how many still switched on.
    codes: codes.length ? { count: codes.length, active: codes.filter((c) => c?.isActive !== false).length } : null,
    photos: photos && (photos.copiedTotal || photos.pending || failed)
      ? { copied: photos.copiedTotal ?? 0, waiting: photos.pending ?? 0, unreadable: failed, lastRunAt: photos.lastRunAt ?? null }
      : null,
    move: moveOf(start),
  };
}

/**
 * How far a moving press has got through "Your move so far", or null when it didn't bring a shop over in Get started
 * (the same rule as the shop admin's movingShop: books came over there, so that part counts as done).
 */
export function moveOf(start) {
  const bring = start?.bring;
  if (!bring || bring.skipped || (bring.from && bring.from !== "online" && bring.from !== "marketplace")) return null;
  const steps = MOVE_STEPS.map(([id, title]) => ({ id, title, done: Boolean(start.done?.[id]) || id === "move-books" }));
  return { steps, done: steps.filter((s) => s.done).length, of: steps.length, putAway: Boolean(start.done?.["move-list"]) };
}

/**
 * The product reads from the old shop's address (Books › Import › From your old shop's address, kept by the shop in
 * `systemStatus/oldShopScans`, apps/shop functions/oldShopRead.js), newest first: what each found, or why it didn't.
 */
export function scansOf(record) {
  const scans = Array.isArray(record?.scans) ? record.scans.filter((s) => s && typeof s.host === "string") : [];
  return scans.length ? scans.map((s) => ({ at: s.at ?? null, host: s.host, ok: s.ok === true, products: Number(s.products) || 0,
    forSale: typeof s.forSale === "number" ? s.forSale : null, stockShown: s.stockShown === true, partial: s.partial === true, message: s.ok ? null : String(s.message ?? "") })) : null;
}

export function createBroughtOver({ admins, registry, shopData, now = () => new Date() }) {
  return {
    async forShop(claims, { shopId } = {}) {
      adminOf(claims, admins, now().getTime());
      const row = typeof shopId === "string" && shopId ? await registry.getShop(shopId) : null;
      if (!row) throw new ControlError(404, "There's no shop with that id.");
      if (row.status !== "live") return { shopId, brought: null, words: "Not live yet, so nothing has been brought over." };
      if (!shopData?.find) throw new ControlError(503, "The control room can't read the shop's own records yet.");
      try {
        const lines = [];
        for (const start of STARTS) lines.push(...(await shopData.find(shopId, "audit-log", { where: startsWith(start), limit: MAX_LINES })).map((doc) => doc.data));
        const photos = await shopData.get(shopId, "systemStatus/photoImport");
        const codes = (await shopData.find(shopId, "discounts", { where: [["description", "==", MOVED_CODE]], limit: MAX_LINES })).map((doc) => doc.data);
        // The file names live on the past orders themselves; read only when a run of past orders came over.
        const files = lines.some((l) => l?.type === "orders" && String(l.message ?? "").startsWith("Brought "))
          ? filesOf((await shopData.find(shopId, "orders", { where: [["source", "==", "import"]], limit: MAX_PAST })).map((doc) => doc.data))
          : [];
        const brought = broughtOverSummary(lines, photos, await shopData.get(shopId, "firstWeek/start"), codes, files);
        const scans = scansOf(await shopData.get(shopId, "systemStatus/oldShopScans"));
        return { shopId, brought, scans, nothing: Object.values(brought).every((kind) => kind === null) };
      } catch (failure) {
        if (failure.status === 503) throw new ControlError(503, failure.message);
        throw new ControlError(502, `Couldn't read the shop's records: ${failure.message}`);
      }
    },
  };
}

//   POST /api/control/brought-over  { shopId }: what came over from the press's old shop, from its own records (read only)
export function broughtOverRoutes(desk) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  return { "POST /api/control/brought-over": (claims, request) => desk.forShop(claims, body(request)) };
}
