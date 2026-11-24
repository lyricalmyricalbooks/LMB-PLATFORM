// GENERATED from src/shared/promoTexts.ts by scripts/build-shared.mjs. Do not edit: change the .ts and run the script.
"use strict";
// Promo texts (Bookings plan 4, step 5.6): one text to a group of clients, such as "Openings this Friday". Only clients who
// ticked "Text me offers" on a booking get them (their own yes, separate from reminder texts), only in the daytime on the
// shop's clock, at most one a day, always with the shop's name and how to stop. One copy for the admin and the server.
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROMO_UNTIL_HOUR = exports.PROMO_FROM_HOUR = exports.PROMO_GAP_HOURS = exports.MAX_PROMO_TEXTS = exports.MAX_PROMO = exports.MIN_PROMO = exports.RECENT_DAYS = exports.PROMO_GROUPS = void 0;
exports.cleanPromo = cleanPromo;
exports.cleanGroup = cleanGroup;
exports.promoBody = promoBody;
exports.textParts = textParts;
exports.promoHours = promoHours;
exports.phoneKey = phoneKey;
exports.PROMO_GROUPS = [
    { id: "all", label: "Everyone who said yes" },
    { id: "recent", label: "Clients who came in the last 90 days" },
    { id: "service", label: "Clients who booked one service" },
];
exports.RECENT_DAYS = 90;
exports.MIN_PROMO = 10;
exports.MAX_PROMO = 300;
/** The most texts one promo sends. */
exports.MAX_PROMO_TEXTS = 500;
/** Hours between two promos. */
exports.PROMO_GAP_HOURS = 24;
/** Promos go out from 9 a.m. until 8 p.m. on the shop's clock. */
exports.PROMO_FROM_HOUR = 9;
exports.PROMO_UNTIL_HOUR = 20;
/** The owner's words, trimmed and on one line; a problem in plain words when too short or too long. */
function cleanPromo(value) {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    if (text.length < exports.MIN_PROMO)
        return { problem: `Write at least ${exports.MIN_PROMO} letters.` };
    if (text.length > exports.MAX_PROMO)
        return { problem: `Keep it to ${exports.MAX_PROMO} letters or fewer.` };
    return { text };
}
function cleanGroup(value) {
    return value === "recent" || value === "service" ? value : "all";
}
/** The whole text as clients get it: the shop's name first, the words, then how to stop. */
function promoBody(text, shop, lang = "en") {
    const stop = lang === "fr" ? "Répondez STOP pour ne plus recevoir de textos." : "Reply STOP to stop texts.";
    const name = String(shop || "").trim();
    return `${name ? `${name}: ` : ""}${text} ${stop}`;
}
// The plain text alphabet phones send 160 to a part in; anything else (an emoji, curly quotes) means 70.
const PLAIN = /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/;
/** How many parts a text is billed as: 160 plain letters in one (153 a part after that), 70 otherwise (67 after). */
function textParts(body) {
    const chars = [...String(body || "")].length;
    if (!chars)
        return 0;
    const [one, many] = PLAIN.test(body) ? [160, 153] : [70, 67];
    return chars <= one ? 1 : Math.ceil(chars / many);
}
/** The hour (0 to 23) on the shop's clock. */
function hourIn(ms, zone) {
    const hour = new Intl.DateTimeFormat("en-CA", { timeZone: zone, hour: "numeric", hourCycle: "h23" }).format(ms);
    return Number(hour) % 24;
}
/** Whether a promo may go out now: daytime on the shop's clock. */
function promoHours(ms, zone) {
    const h = hourIn(ms, zone);
    return h >= exports.PROMO_FROM_HOUR && h < exports.PROMO_UNTIL_HOUR;
}
/** Digits of a phone number, for telling two bookings of the same person apart from two people. */
function phoneKey(phone) {
    return String(phone ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
}
