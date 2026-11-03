// A press's data, on request (code plan 19.16). One button builds the press's whole export: every collection of its
// shop (books, orders, customers, discounts, reviews, pages, settings, newsletter and the rest a press keeps) and its
// stockroom's records, as spreadsheet files with a short README.txt, plus one zip holding them all. They are written
// to storage under exports/{shopId}/{stamp}/ and the owner is emailed a download link that works 7 days. Used when a
// press leaves, for a privacy request, and in the 90 days after a shop closes (services/billing/closing.js; see
// `closingExportHook` below).
//
// Two doors, both emailing the shop's owner (email kind `data-export-ready`):
//   - the control room: POST /api/control/export { shopId, reason } (platform admins; logged in the registry, the
//     shop's audit log and the activity log);
//   - the press's account page: POST /api/account/export { shopId } (the shop's owner only; at most one a day per shop;
//     logged in the registry and the shop's audit log).
//
// Clients passed in:
//   shopData       list(shopId, collection) -> [{ id, data }]; get(shopId, path): the shop's own database (clients/shop.js)
//   stockroomData  optional: ready(shopId); get(shopId, path): the stockroom's own database, laid out as the stockroom
//                  keeps it (settings/catalog { data: JSON of books by id }, books/<id>/data/<part> { data: JSON })
//   storage        write(path, content, { contentType }); signedUrl(path, { expiresAt }) -> a link that works until then
//                  (Cloud Storage's signed links work at most 7 days, which is the export's link)
//   store          the exports made: get(id); set(id, row); list({ shopId }) -> rows (fakes.js)
//   registry       getShop(shopId); recordEvent(shopId, entry)
//   auditLog       ready(shopId); write(shopId, id, entry)
//   activity       optional: the control room's activity log (control-room/activity.js)
//   email          sendPlatform({ kind, to, data, idempotencyKey, shopId }) (services/email)
//   roleIn         (person, shopId) -> role | null (accounts.js roleIn): the owner check for the press's own button
import { createHash } from "node:crypto";
import { toCsv, withoutPrivate, zipFiles } from "./files.js";
import { ControlError, MIN_REASON, adminOf, eachInTurn } from "../../control-room/controlRoom.js";
import { activityEntry } from "../../control-room/activity.js";
import { PLANS } from "../../setup/steps.js";
import { dateText } from "../billing/billing.js";
import { personOf, SignupError } from "../../signup/signup.js";

/** The download link works this many days. */
export const EXPORT_DAYS = 7;
/** A press can ask for one export a day per shop. */
export const OWNER_EVERY_HOURS = 24;
/** A build still "making" after this long was stopped part-way (a killed request): it no longer holds the owner back. */
export const MAKING_STALE_MINUTES = 15;

/**
 * The shop's collections, each one file, with what the README says it holds. Settings are nested, so they are a JSON
 * file. Never exported: the shop's private sign-in and payment settings (`adminSecrets`), its working records (holds,
 * claims, limits, logs) and the team list (the account page has it).
 */
export const SHOP_COLLECTIONS = Object.freeze([
  ["books", "your books and products, with prices and stock"],
  ["authors", "the authors and artists on your books"],
  ["orders", "every order, with what was bought, the shopper's details and where it went"],
  ["customers", "shoppers who made an account"],
  ["discounts", "discount codes and sales"],
  ["giftCards", "gift cards and what is left on them"],
  ["reviews", "shoppers' reviews"],
  ["pages", "your own pages (about, contact and the rest)"],
  ["newsletter", "people who signed up for your newsletter"],
  ["stockists", "shops and places that stock your books"],
  ["shipping-profiles", "your shipping prices and zones"],
].map(([name, words]) => Object.freeze({ name, file: `${name}.csv`, words })));
export const SETTINGS = Object.freeze({ name: "settings", file: "settings.json", words: "your shop's settings: name, look, shipping, emails and checkout choices" });

/** The stockroom's records per book (apps/stockroom/src/lib/merge-state.js LIST_PARTS, without its own bookkeeping). */
export const STOCKROOM_PARTS = Object.freeze([
  ["ledger", "the stock ledger: every copy in and out, with running totals"],
  ["hist", "sales and stock history"],
  ["expenses", "expenses"],
  ["stores", "stores and consignment"],
  ["artistTransfers", "money moved to artists"],
  ["artistPayouts", "artist payouts"],
  ["artistReceivables", "what artists are owed"],
].map(([part, words]) => Object.freeze({ part, file: `stockroom-${part}.csv`, words })));

const parse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};
const stampOf = (date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

/** The README.txt: what each file holds and how many rows, in plain words. */
function readme({ pressName, shopId, madeAt, expiresAt, files }) {
  return [
    `${pressName}: all your data`,
    "",
    `Made on ${dateText(madeAt)} for the shop ${shopId}. The link to this download works until ${dateText(expiresAt)}.`,
    "Each .csv file opens in any spreadsheet app (Numbers, Excel, Google Sheets, LibreOffice). Each row is one record; the first column is its id.",
    "Fields inside fields show as name.part, and lists show as text in one cell.",
    "",
    "What is in it:",
    ...files.map((f) => `  ${f.file}: ${f.words} (${f.rows} ${f.rows === 1 ? "row" : "rows"})`),
    "",
    "Your customers' names, emails and addresses are in orders.csv, customers.csv and newsletter.csv. Keep these files somewhere safe, and delete them when you no longer need them.",
    "Passwords and private sign-in settings are never included.",
  ].join("\r\n") + "\r\n";
}

/**
 * Builds one export: reads every collection, writes each file and the zip to storage under exports/{shopId}/{stamp}/,
 * and returns the zip's link with its expiry. `apps` says which databases to read (the plan's apps).
 */
export async function buildExport({ shopId, pressName = shopId, apps = { shop: true, stockroom: true }, shopData, stockroomData, storage, now = new Date() }) {
  const madeAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + EXPORT_DAYS * 86_400_000).toISOString();
  const stamp = stampOf(now);
  const folder = `exports/${shopId}/${stamp}`;
  const files = [];

  if (apps.shop) {
    for (const collection of SHOP_COLLECTIONS) {
      const rows = await shopData.list(shopId, collection.name);
      files.push({ ...collection, rows: rows.length, content: toCsv(rows), contentType: "text/csv; charset=utf-8" });
    }
    const settings = await shopData.list(shopId, SETTINGS.name);
    const nested = Object.fromEntries(settings.map(({ id, data }) => [id, withoutPrivate(data)]));
    files.push({ ...SETTINGS, rows: settings.length, content: `${JSON.stringify(nested, null, 2)}\n`, contentType: "application/json" });
  }

  if (apps.stockroom && stockroomData && (await stockroomData.ready(shopId))) {
    const catalogDoc = await stockroomData.get(shopId, "settings/catalog");
    const catalog = catalogDoc ? parse(catalogDoc.data) ?? {} : {};
    const books = Object.entries(catalog).filter(([id, book]) => !id.startsWith("_") && book && typeof book === "object");
    files.push({ name: "stockroom-books", file: "stockroom-books.csv", words: "the books in your stockroom", rows: books.length, content: toCsv(books.map(([id, data]) => ({ id, data }))), contentType: "text/csv; charset=utf-8" });
    const parts = Object.fromEntries(STOCKROOM_PARTS.map(({ part }) => [part, []]));
    // A book's parts are read together, eight books at a time (300 books was 2,100 reads one after another).
    const perBook = new Array(books.length);
    await eachInTurn(books.map(([bookId], b) => ({ bookId, b })), 8, async ({ bookId, b }) => {
      perBook[b] = await Promise.all(STOCKROOM_PARTS.map(({ part }) => stockroomData.get(shopId, `books/${bookId}/data/${part}`)));
    });
    books.forEach(([bookId], b) => {
      STOCKROOM_PARTS.forEach(({ part }, p) => {
        const doc = perBook[b][p];
        const list = doc ? parse(doc.data) : null;
        if (!Array.isArray(list)) return;
        list.forEach((entry, i) => parts[part].push({ bookId, id: entry?.id ?? `${bookId}-${i + 1}`, data: entry && typeof entry === "object" ? entry : { value: entry } }));
      });
    });
    for (const spec of STOCKROOM_PARTS) {
      files.push({ name: `stockroom-${spec.part}`, file: spec.file, words: `stockroom: ${spec.words}`, rows: parts[spec.part].length, content: toCsv(parts[spec.part], { lead: ["bookId"] }), contentType: "text/csv; charset=utf-8" });
    }
  }

  files.push({ name: "readme", file: "README.txt", words: "this note", rows: 0, content: readme({ pressName, shopId, madeAt, expiresAt, files }), contentType: "text/plain; charset=utf-8" });
  for (const f of files) await storage.write(`${folder}/${f.file}`, f.content, { contentType: f.contentType });
  const zipName = `${shopId}-data-${madeAt.slice(0, 10)}.zip`;
  await storage.write(`${folder}/${zipName}`, zipFiles(files.map((f) => ({ name: f.file, content: f.content })), now), { contentType: "application/zip" });
  const link = await storage.signedUrl(`${folder}/${zipName}`, { expiresAt });
  return { shopId, stamp, folder, zip: `${folder}/${zipName}`, link, madeAt, expiresAt, files: files.map(({ file, rows }) => ({ file, rows })) };
}

export function createDataExports({ shopData, stockroomData, storage, store, registry, auditLog, activity, email, roleIn, admins, now = () => new Date() }) {
  async function log(shopId, what, detail, { toActivity = false } = {}) {
    const stamp = now().toISOString();
    const entry = { id: `data-export-${stamp}-${what}-${createHash("sha256").update(JSON.stringify(detail)).digest("hex").slice(0, 8)}`, source: "data-export", at: stamp, what, ...detail };
    await registry.recordEvent(shopId, entry);
    if (await auditLog.ready(shopId)) await auditLog.write(shopId, entry.id, entry);
    if (toActivity && activity) await activity.record(activityEntry({ at: stamp, by: detail.by, what, shopId, detail }));
  }

  /**
   * Builds, records and emails one export. The row is "making" during the build, "ready" only once the email has gone,
   * and "failed" when the build or the email fails (a failed one doesn't count against the owner's once a day).
   */
  async function make(row, { asked, by, reason = null }) {
    if (!row.ownerEmail) throw new ControlError(409, "That shop has no owner email to send the link to.");
    const started = now();
    const id = `${row.shopId}-${stampOf(started)}`;
    const base = { id, shopId: row.shopId, asked, by, reason, at: started.toISOString() };
    await store.set(id, { ...base, status: "making" });
    let built;
    try {
      built = await buildExport({ shopId: row.shopId, pressName: row.pressName ?? row.shopId, apps: PLANS[row.plan] ?? { shop: true, stockroom: true }, shopData, stockroomData, storage, now: started });
    } catch (failure) {
      await store.set(id, { ...base, status: "failed", problem: failure.message });
      throw new ControlError(502, "The copy of the shop's data couldn't be made just now. Nothing was sent; try again in a few minutes.");
    }
    const files = { folder: built.folder, zip: built.zip, expiresAt: built.expiresAt, files: built.files };
    try {
      await email.sendPlatform({
        kind: "data-export-ready", to: row.ownerEmail, shopId: row.shopId, idempotencyKey: `data-export/${id}`,
        data: { pressName: row.pressName ?? row.shopId, link: built.link, until: dateText(built.expiresAt), asked, reason: asked === "platform" ? reason : null },
      });
    } catch (failure) {
      await store.set(id, { ...base, status: "failed", ...files, problem: `email: ${failure.message}` });
      throw new ControlError(502, "The copy was made, but the email with its link couldn't be sent just now. Nothing was emailed; try again in a few minutes.");
    }
    await store.set(id, { ...base, status: "ready", ...files, emailedTo: row.ownerEmail });
    return { id, built };
  }

  /** The newest owner export that still counts: emailed (ready), or being made right now (not stale). */
  const counts = (e, nowMs) => e.asked === "owner" && Date.parse(e.at) > nowMs - OWNER_EVERY_HOURS * 3600_000
    && (e.status === "ready" || (e.status === "making" && Date.parse(e.at) > nowMs - MAKING_STALE_MINUTES * 60_000));

  return {
    /** The control room's button: any shop, with a reason; logged everywhere before it is built. */
    async forPlatform(claims, { shopId, reason } = {}) {
      const by = adminOf(claims, admins, now().getTime());
      const why = typeof reason === "string" ? reason.trim() : "";
      if (why.length < MIN_REASON) throw new ControlError(400, `Say why, in at least ${MIN_REASON} characters. It goes in the shop's log.`);
      const row = typeof shopId === "string" ? await registry.getShop(shopId) : null;
      if (!row) throw new ControlError(404, "There's no shop with that id.");
      await log(shopId, "data-export", { by, reason: why.slice(0, 500), asked: "platform" }, { toActivity: true });
      const { id, built } = await make(row, { asked: "platform", by, reason: why.slice(0, 500) });
      return { shopId, id, emailedTo: row.ownerEmail, expiresAt: built.expiresAt, files: built.files };
    },

    /** The press's own button on the account page: the shop's owner only, at most one a day per shop. */
    async forOwner(claims, { shopId } = {}) {
      const person = personOf(claims);
      if (typeof shopId !== "string" || (await roleIn(person, shopId)) !== "owner") throw new SignupError(403, "Only the shop's owner can download all its data.");
      const row = await registry.getShop(shopId);
      if (!row) throw new SignupError(404, "There's no shop with that id.");
      const nowMs = now().getTime();
      // The check and the claim are one step on the shop's lock row (a transaction in the real store), so two clicks
      // at the same moment can't both pass.
      const lockId = `owner-lock-${shopId}`;
      let held = null;
      await store.update(lockId, (lock) => {
        if (lock && counts(lock, nowMs)) {
          held = lock;
          return null;
        }
        return { id: lockId, kind: "owner-lock", lockFor: shopId, asked: "owner", status: "making", at: new Date(nowMs).toISOString() };
      });
      if (held) {
        const next = new Date(Date.parse(held.at) + OWNER_EVERY_HOURS * 3600_000);
        const when = next.toLocaleString("en-CA", { timeZone: "America/Toronto", dateStyle: "long", timeStyle: "short" }).replace(/\.$/, "");
        if (held.status === "making") throw new SignupError(429, `Your copy is being made right now. We'll email the link to ${row.ownerEmail} in a few minutes.`);
        throw new SignupError(429, `You asked for a copy less than a day ago, and we emailed the link to ${row.ownerEmail}. It still works. You can ask again after ${when}.`);
      }
      const settle = (status) => store.update(lockId, (lock) => ({ ...lock, status }));
      try {
        await log(shopId, "data-export", { by: person.email, asked: "owner" });
        const { built } = await make(row, { asked: "owner", by: person.email });
        await settle("ready");
        return { shopId, emailedTo: row.ownerEmail, expiresAt: built.expiresAt };
      } catch (failure) {
        await settle("failed");
        throw failure;
      }
    },

    /**
     * The closing sweep's onClose hook (services/billing/closing.js): when a shop closes, its owner is emailed a fresh
     * copy of everything, so the 90 days to download start with the files in hand. Safe to run again: another copy is
     * made and emailed, nothing else changes.
     */
    async forClosing(shop) {
      const row = (await registry.getShop(shop.shopId)) ?? shop;
      await log(row.shopId, "data-export", { by: "the platform", asked: "closing" });
      const { built } = await make(row, { asked: "platform", by: "the platform", reason: "your shop has closed, so here is everything in it" });
      return { shopId: row.shopId, expiresAt: built.expiresAt };
    },
  };
}

/** The closing sweep's hook: `createClosingSweep({ hooks: { onClose: [closingExportHook(exports)] } })`. */
export const closingExportHook = (exports) => async (shop) => {
  await exports.forClosing(shop);
};

/** The two doors: the control room's (admins) and the account page's (the shop's owner). */
export function exportRoutes(exports) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  return {
    "POST /api/control/export": (claims, request) => exports.forPlatform(claims, body(request)),
    "POST /api/account/export": (claims, request) => exports.forOwner(claims, body(request)),
  };
}
