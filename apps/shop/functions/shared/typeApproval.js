// GENERATED from src/shared/typeApproval.ts by scripts/build-shared.mjs. Do not edit: change the .ts and run the script.
"use strict";
// Types that need a check before they go on sale (product types plan, round 2, 18 November 2026). Alcohol, supplements
// and CBD need a licence or carry rules that card companies enforce, so a product of such a type (`traits.approval` in
// productTypes.ts) stays a draft until Colophon has checked the shop may sell it. The check is per type, per shop: once
// a shop may sell wine, every wine it adds can go on sale.
//
// Where it lives (all in the shop's own folder):
// - `approvalRequests/{typeId}`: the owner's ask, written from the admin ({ typeId, typeName, note, askedAt, state:
//   "waiting" }). The control room answers on it (state approved or declined, with a reason).
// - `platform/approvals`: the control room's answers, `{ types: { [typeId]: { state, reason, at, by } } }`. Admins read
//   it; no browser writes it. firestore.rules refuses a published product of a type not approved here, and the server's
//   `priceOrder` refuses to sell one, so the admin's own check is only the friendly part.
// One rule for the shop, the server (functions/shared/typeApproval.js) and the rules' list (typeApproval.test.ts).
Object.defineProperty(exports, "__esModule", { value: true });
exports.APPROVAL_TYPE_IDS = exports.APPROVAL_NOTE_MAX = exports.APPROVAL_REQUESTS = exports.APPROVALS_DOC = void 0;
exports.approvalWhy = approvalWhy;
exports.approvalTypeOf = approvalTypeOf;
exports.looksAlcoholic = looksAlcoholic;
exports.mayPublish = mayPublish;
exports.approvalStatus = approvalStatus;
exports.approvalAsk = approvalAsk;
const productTypes_1 = require("./productTypes");
exports.APPROVALS_DOC = "platform/approvals";
exports.APPROVAL_REQUESTS = "approvalRequests";
/** Longest note an owner may add to an ask (licence number, what they sell). */
exports.APPROVAL_NOTE_MAX = 500;
/** Every type that needs a check, by id. firestore.rules carries the same list. */
exports.APPROVAL_TYPE_IDS = productTypes_1.PRODUCT_TYPES.filter((type) => type.traits?.approval === true).map((type) => type.id);
/** Why a type needs a check, in plain words for the owner. */
const WHY = {
    alcohol: "Selling alcohol needs a licence where you are, and card companies ask us to check it before it goes on sale.",
    supplements: "Health products have rules about what they may claim, and card companies ask us to check them before they go on sale.",
    cbd: "Card companies allow CBD and hemp only in some places and with some licences, so we check before it goes on sale.",
};
function approvalWhy(typeId) {
    return WHY[typeId] || "Card companies ask us to check this kind of product before it goes on sale.";
}
/** The type id a product needs a check for, or "" when it needs none. */
function approvalTypeOf(product) {
    const type = (0, productTypes_1.typeOfProduct)(product);
    if (type?.traits?.approval === true)
        return type.id;
    // Before 18 November 2026 wine, beer and spirits were filed under Drinks. A Drinks product whose name says it is
    // alcohol still needs the alcohol check, so one saved then can't be sold without it.
    if (type?.id === "drinks" && looksAlcoholic(product))
        return "alcohol";
    return "";
}
const ALCOHOL_WORDS = /\b(wine|wines|beer|beers|ale|lager|stout|ipa|spirits?|cider|mead|sake|gin|vodka|rum|whisk(?:e)?y|bourbon|tequila|mezcal|brandy|liqueur|vermouth|prosecco|champagne|alcohol(?:ic)?)\b/i;
const NOT_ALCOHOL = /\b(non[- ]?alcoholic|alcohol[- ]free|zero[- ]proof|de[- ]?alcoholi[sz]ed|root beer|ginger beer|0(?:\.0)?\s*%)/i;
/** True when a product's name reads as an alcoholic drink (and doesn't say it is alcohol-free). */
function looksAlcoholic(product) {
    const title = String(product?.title ?? "");
    return ALCOHOL_WORDS.test(title) && !NOT_ALCOHOL.test(title);
}
/** True when the product may go on sale: its type needs no check, or the shop's answer for it is yes. */
function mayPublish(product, approvals) {
    const typeId = approvalTypeOf(product);
    return !typeId || approvals?.types?.[typeId]?.state === "approved";
}
/**
 * Where the product's check stands: "approved", "declined" (with the control room's reason), "waiting" (asked, no
 * answer yet) or "ask" (not asked). Null when its type needs no check. An answer wins over an ask.
 */
function approvalStatus(product, approvals, request) {
    const typeId = approvalTypeOf(product);
    if (!typeId)
        return null;
    const answer = approvals?.types?.[typeId];
    const askedAt = typeof request?.askedAt === "string" ? request.askedAt : "";
    const reason = typeof answer?.reason === "string" ? answer.reason : "";
    if (answer?.state === "approved")
        return { typeId, state: "approved", reason, askedAt };
    // A new ask after a no is waiting again; the old no stays until it is answered.
    if (request?.state === "waiting" && (answer?.state !== "declined" || askedAt > String(answer?.at || "")))
        return { typeId, state: "waiting", reason: "", askedAt };
    if (answer?.state === "declined")
        return { typeId, state: "declined", reason, askedAt };
    return { typeId, state: "ask", reason: "", askedAt };
}
/** A clean ask to save in `approvalRequests/{typeId}`. */
function approvalAsk(typeId, typeName, note, nowIso) {
    return { typeId, typeName: String(typeName || typeId).slice(0, 80), note: String(note ?? "").trim().slice(0, exports.APPROVAL_NOTE_MAX), askedAt: nowIso, state: "waiting" };
}
