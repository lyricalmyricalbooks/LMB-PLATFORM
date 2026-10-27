// Customs paperwork for international labels (Shippo customs items + declaration).
// Per-book answers live on the book (Books › edit › Details › Customs): customsDescription,
// hsTariffNumber, customsOriginCountry. Blank = the defaults below, which suit printed books.
// Pure (no Firestore, no Shippo): index.js reads the catalog and posts what this builds.
const { isPhysicalItem } = require("./shared/localFulfillment");
const { countryCodeOf } = require("./shared/addressRules");

const DEFAULT_DESCRIPTION = "Printed books";
const DEFAULT_HS_CODE = "4901.99"; // Printed books, brochures and similar: other (not single sheets)
const GRAMS_PER_LB = 453.592; // older catalog values typed in lb still read correctly
const { FALLBACK_COPY_GRAMS } = require("./parcelWeight"); // the label tool's own per-copy assumption

// 4 to 10 digits, optionally dotted (4901, 4901.99, 4901.99.0000, 490199).
const HS_PATTERN = /^\d{4}(?:[.\s-]?\d{2}){0,3}$/;
const validHsCode = value => HS_PATTERN.test(String(value || "").trim());
const cleanHsCode = value => (validHsCode(value) ? String(value).trim() : DEFAULT_HS_CODE);
const cleanDescription = value => String(value || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 100) || DEFAULT_DESCRIPTION;

// A parcel needs customs paperwork when it crosses a border.
function needsCustoms(fromCountry, toCountry) {
  const from = countryCodeOf(fromCountry) || "CA";
  const to = countryCodeOf(toCountry);
  return !!to && from !== to;
}

// Grams for one copy from the catalog ("450 g", "0.5 kg", "1 lb", bare number = grams); null when unknown.
function copyGrams(weight) {
  const text = String(weight ?? "").trim().toLowerCase();
  if (!text) return null;
  const n = parseFloat(text);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (/kg/.test(text)) return n * 1000;
  if (/lb|pound/.test(text)) return n * GRAMS_PER_LB;
  if (/oz|ounce/.test(text)) return n * 28.3495;
  return n;
}

/**
 * One customs item per physical order line: description, tariff number, value, origin and weight.
 * `books` maps book id -> catalog book (for the per-book fields); `defaultOrigin` is the shop's country.
 * Value is what the customer actually paid for the line (discount shared out), never below 1 cent.
 */
function customsItems(order, books, defaultOrigin) {
  const lines = (order.items || []).filter(item => item && isPhysicalItem(item));
  const subtotal = Number(order.subtotal) || lines.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0);
  const discount = Math.max(0, Number(order.discount) || 0);
  const ratio = subtotal > 0 ? Math.min(1, Math.max(0, (subtotal - discount) / subtotal)) : 1;
  return lines.map(item => {
    const quantity = Math.max(1, Math.min(99, Math.floor(Number(item.quantity) || 1)));
    const book = (books && books[item.id]) || {};
    const variant = item.variantId ? (book.variants || []).find(v => v.id === item.variantId) || null : null;
    const grams = copyGrams(variant?.weight) ?? copyGrams(book.weight);
    const unit = Number(item.basePrice ?? item.price) || 0;
    const addOns = (item.addOns || []).reduce((sum, a) => sum + (Number(a.price) || 0), 0);
    const lineValue = Math.max(0.01, Math.round((unit + addOns) * quantity * ratio * 100) / 100);
    const origin = countryCodeOf(book.customsOriginCountry) || countryCodeOf(defaultOrigin) || "CA";
    return {
      description: cleanDescription(book.customsDescription),
      quantity,
      net_weight: ((grams != null ? grams : FALLBACK_COPY_GRAMS) * quantity).toFixed(1),
      mass_unit: "g",
      value_amount: lineValue.toFixed(2),
      value_currency: "CAD",
      origin_country: origin,
      tariff_number: cleanHsCode(book.hsTariffNumber),
      ...(item.id ? { sku_code: String(item.id).slice(0, 50) } : {}),
    };
  });
}

// The declaration that ties the item ids together. Shippo requires the certify flags.
function customsDeclaration(itemIds, order, signer, fromCountry) {
  return {
    contents_type: "MERCHANDISE",
    contents_explanation: DEFAULT_DESCRIPTION,
    non_delivery_option: "RETURN",
    certify: true,
    certify_signer: String(signer || "Lyricalmyrical Books").slice(0, 100),
    incoterm: "DDU",
    invoice: String(order.orderId || "").slice(0, 100) || undefined,
    items: itemIds,
    // Shippo wants an exemption code only for shipments leaving the US.
    ...(countryCodeOf(fromCountry) === "US" ? { eel_pfc: "NOEEI_30_37_a" } : {}),
  };
}

module.exports = { DEFAULT_DESCRIPTION, DEFAULT_HS_CODE, validHsCode, cleanHsCode, needsCustoms, customsItems, customsDeclaration, copyGrams };
