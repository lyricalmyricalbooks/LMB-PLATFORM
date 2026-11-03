// Running low (code plan 24.3): the daily 8am email to the owner also lists products, or editions of them, whose
// shelf count has reached the shop's low-stock line (Inventory › "Low-stock at or below", default 5). Each one is
// listed once when it goes low and once more if it sells out; restocked above the line, its mark is cleared so the
// next dip is reported again. Pure: scheduledJobs.js reads the books, the line and the marks, and saves the marks only
// after the email went out.
//
// Counted the way the Inventory page counts (src/app/admin/inventoryInsights.ts › buildInventory): only products with
// stock tracking on, one row per edition, never digital editions, box sets (their sets come from parts) or gift cards,
// and never drafts or archived products.

const { isBundle, isGiftCardProduct } = require("./shared/promotions");
const { isDigitalEdition } = require("./inventoryLink");

const DEFAULT_LOW_STOCK = 5;

/** Inventory's low-stock line from settings/website (mirrors lowStockThreshold in inventoryInsights.ts). */
function lowStockLine(settings) {
  const raw = settings?.inventory?.lowStockThreshold;
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 100000 ? Math.floor(n) : DEFAULT_LOW_STOCK;
}

const count = (v) => Math.max(0, Math.floor(Number(v) || 0));
/** stockLevel first, then stock, as the server and Inventory read it. */
const shelf = (item) => count(item?.stockLevel !== undefined ? item.stockLevel : item?.stock);

/** Every tracked shelf count at or below the line: { key, bookId, title, edition, stock, state: "low" | "out" }. */
function lowStockRows(books, line) {
  const rows = [];
  for (const book of books || []) {
    if (!book?.id || book.trackInventory !== true) continue;
    if (book.status === "archived" || book.status === "draft") continue;
    if (isBundle(book) || isGiftCardProduct(book)) continue;
    const title = String(book.title || "Untitled");
    const variants = Array.isArray(book.variants) ? book.variants.filter((v) => v && v.id) : [];
    const editions = variants.length ? variants : [null];
    for (const variant of editions) {
      if (isDigitalEdition(book, variant)) continue;
      const stock = shelf(variant || book);
      if (stock > line) continue;
      rows.push({
        key: variant ? `${book.id}::${variant.id}` : book.id,
        bookId: book.id,
        title,
        edition: variant ? String(variant.name || variant.format || "") : "",
        stock,
        state: stock <= 0 ? "out" : "low",
      });
    }
  }
  return rows.sort((a, b) => a.stock - b.stock || a.title.localeCompare(b.title));
}

/**
 * Which rows to report today, and the marks to save once the email is sent. `reported` is the saved
 * { [key]: "low" | "out" }. A row is new when it has no mark, or was marked low and is now sold out. Marks keep only
 * today's low rows, so a restocked item loses its mark.
 */
function newlyLow(rows, reported = {}) {
  const marks = {};
  const fresh = [];
  for (const row of rows) {
    const before = reported?.[row.key];
    if (!before || (before === "low" && row.state === "out")) fresh.push(row);
    marks[row.key] = row.state;
  }
  return { fresh, marks };
}

/** One line for the email: "Moth Notes (Hardcover): 2 left" or "...: sold out". */
function lowStockLabel(row) {
  const name = row.edition ? `${row.title} (${row.edition})` : row.title;
  return { name, detail: row.state === "out" ? "sold out" : `${row.stock} left` };
}

/** Settings › Notifications › Shop alerts › Running low (on unless switched off). */
function lowStockEmailEnabled(notificationSettings) {
  return notificationSettings?.shopAlerts?.lowStock !== false;
}

module.exports = { DEFAULT_LOW_STOCK, lowStockLine, lowStockRows, newlyLow, lowStockLabel, lowStockEmailEnabled };
