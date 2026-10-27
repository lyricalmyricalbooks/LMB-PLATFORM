// GENERATED from src/shared/promotions.ts by scripts/build-shared.mjs. Do not edit: change the .ts and run the script.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isGiftCardProduct = exports.isBundle = exports.MAX_BUNDLE_PARTS = exports.MAX_ADD_ONS = exports.PromotionProblem = void 0;
exports.saleWindowOpen = saleWindowOpen;
exports.saleActive = saleActive;
exports.saleEndDate = saleEndDate;
exports.bookAddOns = bookAddOns;
exports.addOnSelection = addOnSelection;
exports.bundleComponents = bundleComponents;
exports.stockLines = stockLines;
exports.bundleWeightGrams = bundleWeightGrams;
exports.bundleAvailable = bundleAvailable;
exports.giftCardDetails = giftCardDetails;
// Catalog merchandising rules, one copy for the shop and the server (src/shared/CLAUDE.md): scheduled
// sale windows, paid add-ons (signed copy, inscription, gift wrap), box sets / bundles and gift-card
// products. The server prices from its generated copy (functions/shared/promotions.js) with catalog data
// it read itself; the shop uses the same rules to decide what shoppers see.
const preorder_1 = require("./preorder");
const weightGrams_1 = require("./weightGrams");
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** A line option the catalog refuses. `message` mirrors the server; shoppers see Text & labels copy chosen by `code`. */
class PromotionProblem extends Error {
    code;
    values;
    constructor(code, message, values = {}) {
        super(message);
        this.name = "PromotionProblem";
        this.code = code;
        this.values = values;
    }
}
exports.PromotionProblem = PromotionProblem;
// ── Scheduled sales ────────────────────────────────────────────────
/** Books › edit › Pricing "Sale starts" / "Sale ends": Toronto shop dates, both inclusive; blank = open. */
function saleWindowOpen(book, now = new Date()) {
    const today = (0, preorder_1.shopDate)(now);
    const start = String((book && book.saleStartsAt) || "").slice(0, 10);
    const end = String((book && book.saleEndsAt) || "").slice(0, 10);
    if (DATE_ONLY.test(start) && start > today)
        return false;
    if (DATE_ONLY.test(end) && end < today)
        return false;
    return true;
}
/** The sale price is charged only when this is true (functions/catalogPrice.js). */
function saleActive(book, now = new Date()) {
    return !!book && !!book.isOnSale && Number(book.salePrice) > 0 && saleWindowOpen(book, now);
}
/** The sale's last day (YYYY-MM-DD) while a dated sale is on, else "". */
function saleEndDate(book, now = new Date()) {
    if (!saleActive(book, now))
        return "";
    const end = String(book.saleEndsAt || "").slice(0, 10);
    return DATE_ONLY.test(end) ? end : "";
}
// ── Paid add-ons ───────────────────────────────────────────────────
exports.MAX_ADD_ONS = 6;
function bookAddOns(book) {
    if (!book || (0, exports.isGiftCardProduct)(book) || (0, exports.isBundle)(book))
        return [];
    const seen = new Set();
    const out = [];
    for (const raw of Array.isArray(book.addOns) ? book.addOns : []) {
        if (!raw || typeof raw.id !== "string" || !raw.id || seen.has(raw.id))
            continue;
        const label = String(raw.label || "").trim().slice(0, 80);
        const price = Number(raw.price);
        if (!label || !Number.isFinite(price) || price < 0 || raw.enabled === false)
            continue;
        seen.add(raw.id);
        const kind = raw.kind === "text" ? "text" : "option";
        const maxLength = Math.max(1, Math.min(300, Math.floor(Number(raw.maxLength) || 120)));
        out.push({ id: raw.id.slice(0, 60), label, price: Math.round(price * 100) / 100, kind, ...(kind === "text" ? { maxLength } : {}) });
        if (out.length >= exports.MAX_ADD_ONS)
            break;
    }
    return out;
}
/**
 * The add-ons picked for one line, checked against the catalog (same rule as the server).
 * Throws for an add-on that no longer exists or a missing inscription. `price` is per copy.
 */
function addOnSelection(book, requested) {
    const picked = Array.isArray(requested) ? requested : [];
    if (!picked.length)
        return { addOns: [], price: 0 };
    const offered = new Map(bookAddOns(book).map((addOn) => [addOn.id, addOn]));
    const seen = new Set();
    const addOns = [];
    for (const choice of picked.slice(0, exports.MAX_ADD_ONS)) {
        const id = choice && typeof choice.id === "string" ? choice.id : "";
        if (!id || seen.has(id))
            continue;
        const addOn = offered.get(id);
        if (!addOn)
            throw new PromotionProblem("addon_gone", `An extra you picked for "${(book && book.title) || "this book"}" is no longer offered. Please remove the book and add it again.`, { id });
        seen.add(id);
        if (addOn.kind === "text") {
            const text = String((choice && choice.text) || "").replace(/\s+/g, " ").trim().slice(0, addOn.maxLength);
            if (!text)
                throw new PromotionProblem("addon_text_missing", `Add the wording for "${addOn.label}" on "${(book && book.title) || "this book"}".`, { id, label: addOn.label });
            addOns.push({ id, label: addOn.label, price: addOn.price, text });
        }
        else {
            addOns.push({ id, label: addOn.label, price: addOn.price });
        }
    }
    const price = Math.round(addOns.reduce((sum, addOn) => sum + addOn.price, 0) * 100) / 100;
    return { addOns, price };
}
// ── Box sets / bundles ─────────────────────────────────────────────
exports.MAX_BUNDLE_PARTS = 20;
function bundleComponents(book) {
    if (!book || !Array.isArray(book.bundleItems))
        return [];
    const out = [];
    for (const raw of book.bundleItems) {
        if (!raw || typeof raw.bookId !== "string" || !raw.bookId)
            continue;
        const quantity = Math.max(1, Math.min(20, Math.floor(Number(raw.quantity) || 1)));
        out.push({ id: raw.bookId, variantId: typeof raw.variantId === "string" && raw.variantId ? raw.variantId : null, quantity });
        if (out.length >= exports.MAX_BUNDLE_PARTS)
            break;
    }
    return out;
}
const isBundle = (book) => bundleComponents(book).length > 0;
exports.isBundle = isBundle;
/**
 * Order lines with every box set replaced by the books inside it, so stock holds, stock decrements and
 * restocks all count the real books. Lines without components pass through.
 */
function stockLines(items) {
    const out = [];
    for (const item of items || []) {
        if (!item)
            continue;
        if (Array.isArray(item.components) && item.components.length) {
            const sets = Math.max(0, Math.floor(Number(item.quantity) || 0));
            for (const part of item.components) {
                if (!part || typeof part.id !== "string" || !part.id)
                    continue;
                out.push({ id: part.id, variantId: part.variantId || null, quantity: sets * Math.max(1, Math.floor(Number(part.quantity) || 1)) });
            }
        }
        else {
            out.push(item);
        }
    }
    return out;
}
/**
 * A box set with no weight of its own weighs what its books weigh (each part at its chosen edition's
 * weight, times its quantity); null when any part has no weight. Mirrors the server (functions/index.js
 * `priceOrder` / `getShippoRates`), so the quote shown at checkout is the quote that is charged.
 */
function bundleWeightGrams(book, booksById) {
    const parts = bundleComponents(book);
    if (!parts.length)
        return null;
    let total = 0;
    for (const part of parts) {
        const partBook = booksById.get(part.id);
        if (!partBook)
            return null;
        const variant = part.variantId ? (partBook.variants || []).find((v) => v.id === part.variantId) : null;
        const grams = (0, weightGrams_1.parseWeightGrams)(variant?.weight) ?? (0, weightGrams_1.parseWeightGrams)(partBook.weight);
        if (grams == null)
            return null;
        total += grams * part.quantity;
    }
    return total;
}
function partStock(book, variantId) {
    if (!book)
        return 0;
    if (book.trackInventory !== true || book.allowBackorder === true)
        return Infinity;
    if (variantId) {
        const variant = (book.variants || []).find((v) => v && v.id === variantId);
        return variant ? Math.max(0, Number(variant.stock ?? variant.stockLevel) || 0) : 0;
    }
    return Math.max(0, Number(book.stockLevel) || 0);
}
/** How many sets the parts' stock allows; Infinity when no part tracks stock. Needs raw catalog data. */
function bundleAvailable(book, getBook) {
    let sets = Infinity;
    for (const part of bundleComponents(book)) {
        const stock = partStock(getBook(part.id), part.variantId);
        sets = Math.min(sets, Math.floor(stock / part.quantity));
    }
    return sets;
}
// ── Gift-card products ─────────────────────────────────────────────
const isGiftCardProduct = (book) => !!book && book.productType === "giftCard";
exports.isGiftCardProduct = isGiftCardProduct;
/** Cleans the recipient form; throws when the email is filled in but malformed (blank = the buyer). */
function giftCardDetails(requested) {
    const raw = requested && typeof requested === "object" ? requested : {};
    const recipientEmail = String(raw.recipientEmail || "").trim().toLowerCase().slice(0, 320);
    if (recipientEmail && !EMAIL.test(recipientEmail))
        throw new PromotionProblem("gift_email", "Check the gift card recipient's email address.");
    return {
        recipientName: String(raw.recipientName || "").trim().slice(0, 100),
        recipientEmail,
        senderName: String(raw.senderName || "").trim().slice(0, 100),
        message: String(raw.message || "").trim().slice(0, 300),
    };
}
