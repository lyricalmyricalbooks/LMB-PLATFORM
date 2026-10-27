// Digital e-book delivery rules (round-2 PR 4). Pure and tested (digitalDelivery.test.js); downloadDigitalAsset and
// the order-confirmation email in index.js both use them, so the email lists exactly what the endpoint will serve.
//
//  - Links are not forever-reusable: each order line (book + edition) may be downloaded DOWNLOAD_LIMIT times; the
//    count is kept on the order (`downloadCounts`, server-only: publicOrderView never sends it) and the owner can
//    reset it from Order detail. Each click mints a fresh, short-lived signed Storage URL.
//  - Box sets deliver their e-book parts: a request may name a component's book id.
//  - One file per digital edition: the edition's own file wins, the book-level file is the fallback.
//  - Cancelled or disputed orders are refused.
//  - The saved file gets a clean name (book title + extension), downloads as an attachment, with a real content type.

const DOWNLOAD_LIMIT = 10;
const SIGNED_URL_MINUTES = 15;

// Same list as fulfillmentGuard: a settled dispute no longer blocks anything.
const SETTLED_DISPUTES = ["won", "lost", "warning_closed", "closed", "charge_refunded"];

const DEFAULT_DOWNLOAD_NOTE = `Use the buttons below to download your digital books. Each book can be downloaded up to ${DOWNLOAD_LIMIT} times from this email; if you need more, reply to this email. You can also download from your account or the order tracking page at any time.`;

/** A reason to refuse every download for this order, or "" when it may be served. { status, message } */
function downloadRefusal(order) {
  if (!order || order.paymentStatus !== "paid") return { status: 402, message: "Order has not been paid yet" };
  if (order.status === "cancelled") return { status: 403, message: "This order was cancelled, so its downloads are no longer available." };
  if (order.disputeStatus && !SETTLED_DISPUTES.includes(String(order.disputeStatus))) {
    return { status: 403, message: "This payment is being disputed, so downloads are paused until it is settled. Please reply to your order email." };
  }
  return null;
}

const sameVariant = (a, b) => String(a || "") === String(b || "");

/**
 * Everything on the order that could deliver `itemId`: its own lines, and the parts of box sets whose book is
 * `itemId`. `variantId` (optional) narrows to one edition. Each hit: { bookId, variantId, line, bundle }
 * where `bundle` is the box-set line for a part (else null).
 */
function deliveryCandidates(order, itemId, variantId) {
  const out = [];
  for (const line of (order && order.items) || []) {
    if (!line || line.giftCard === true) continue;
    if (line.id === itemId && (variantId === undefined || variantId === "" || sameVariant(line.variantId, variantId))) {
      out.push({ bookId: line.id, variantId: line.variantId || "", line, bundle: null });
    }
    if (line.bundle === true && Array.isArray(line.components)) {
      for (const part of line.components) {
        if (!part || part.id !== itemId) continue;
        if (variantId !== undefined && variantId !== "" && !sameVariant(part.variantId, variantId)) continue;
        out.push({ bookId: part.id, variantId: part.variantId || "", line: part, bundle: line });
      }
    }
  }
  return out;
}

/** The Storage file name for this edition: its own file, else the book's. "" when neither is set. */
function pickFileName(book, variantId) {
  const variant = variantId ? ((book && book.variants) || []).find(v => v && v.id === variantId) : null;
  return String((variant && variant.digitalFileName) || (book && book.digitalFileName) || "");
}

/** A key safe to use as a Firestore map field for one book + edition. */
function countKey(bookId, variantId) {
  return `${bookId}__${variantId || "base"}`.replace(/[^A-Za-z0-9_-]/g, "_");
}

const CONTENT_TYPES = {
  pdf: "application/pdf",
  epub: "application/epub+zip",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  m4b: "audio/mp4",
  zip: "application/zip",
};

function extensionOf(fileName) {
  const match = /\.([A-Za-z0-9]{1,5})$/.exec(String(fileName || ""));
  return match ? match[1].toLowerCase() : "";
}

function contentTypeFor(fileName) {
  return CONTENT_TYPES[extensionOf(fileName)] || "application/octet-stream";
}

/** "My Book.pdf" from the title and the stored name (the upload's epoch-millisecond prefix is dropped). */
function downloadFilename(title, fileName) {
  const ext = extensionOf(fileName);
  const stored = String(fileName || "").replace(/^\d{10,}-/, "");
  const base = String(title || "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120)
    || stored.replace(/\.[A-Za-z0-9]{1,5}$/, "") || "download";
  return ext ? `${base}.${ext}` : base;
}

/** Content-Disposition for the signed URL: attachment with an ASCII fallback plus the exact UTF-8 name. */
function contentDisposition(filename) {
  const ascii = filename.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "").trim() || "download";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

/**
 * Reads a counter map and decides whether one more download is allowed. Pure; the caller writes `next`
 * inside the transaction that read `counts`.
 */
function nextDownloadCount(counts, key, limit = DOWNLOAD_LIMIT) {
  const used = Number((counts || {})[key]) || 0;
  if (used >= limit) return { ok: false, used };
  return { ok: true, used, next: { ...(counts || {}), [key]: used + 1 } };
}

/**
 * The digital entries an order email lists. `loadBook(id)` returns the catalog book (or null);
 * `isPhysical(line)` and `catalogDigital(book, variant)` are index.js's own rules; `preorderActive` as in shared/preorder.js.
 * Each entry: { itemId, variantId, title, pendingUntil } where pendingUntil is "" (downloadable now),
 * a YYYY-MM-DD date, or "announced" (pre-order with no date yet).
 */
async function emailDigitalEntries(order, { loadBook, isPhysical, catalogDigital, preorderActive, releaseDateOf, today }) {
  const entries = [];
  const pendingFor = (preorder, releaseDate) => {
    if (preorder !== true) return "";
    if (!releaseDate) return "announced";
    return String(releaseDate) > today ? String(releaseDate) : "";
  };
  for (const line of (order && order.items) || []) {
    if (!line || line.giftCard === true) continue;
    if (!isPhysical(line)) {
      entries.push({ itemId: line.id, variantId: line.variantId || "", title: line.title, pendingUntil: pendingFor(line.preorder, line.releaseDate) });
    }
    if (line.bundle === true && Array.isArray(line.components)) {
      for (const part of line.components) {
        if (!part || !part.id) continue;
        const book = await loadBook(part.id);
        if (!book || book.productType === "giftCard") continue;
        const variant = part.variantId ? (book.variants || []).find(v => v && v.id === part.variantId) || null : null;
        if (!catalogDigital(book, variant)) continue;
        const waiting = line.preorder === true && preorderActive(book);
        entries.push({
          itemId: part.id, variantId: part.variantId || "",
          title: part.title || book.title || line.title,
          pendingUntil: waiting ? (releaseDateOf(book) || "announced") : "",
        });
      }
    }
  }
  return entries;
}

module.exports = {
  DOWNLOAD_LIMIT, SIGNED_URL_MINUTES, DEFAULT_DOWNLOAD_NOTE,
  downloadRefusal, deliveryCandidates, pickFileName, countKey, contentTypeFor, extensionOf,
  downloadFilename, contentDisposition, nextDownloadCount, emailDigitalEntries,
};
