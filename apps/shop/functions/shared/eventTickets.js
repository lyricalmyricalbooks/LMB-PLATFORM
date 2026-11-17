// GENERATED from src/shared/eventTickets.ts by scripts/build-shared.mjs. Do not edit: change the .ts and run the script.
"use strict";
// Events and tickets (beta; tasks/todo/2026-11-17-events-tickets-e1.md): what an event and its ticket kinds are, how
// many places are left and what an order of tickets costs. One source for the admin, the shop's pages and the server
// (functions/shared/eventTickets.js is a generated copy; functions/events.js keeps the records).
//
// An event has a day and time, a place and up to MAX_TICKET_KINDS kinds of ticket ("General", "Student"), each with a
// price (0 is free) and a number of places. Sales are open while the event is live and hasn't started.
//
// Places are counted in one small record per event (`eventPlaces/{eventId}`): `sold` per ticket kind, and `held` per
// order still paying, each with the time its hold ends. The server reads and writes it in the same transaction as the
// order, so the last ticket can't be sold twice.
Object.defineProperty(exports, "__esModule", { value: true });
exports.TICKET_MESSAGES = exports.MAX_TICKET_MINOR = exports.MIN_TICKET_MINOR = exports.MAX_PER_ORDER = exports.MAX_PLACES = exports.MAX_TICKET_KINDS = exports.MAX_EVENTS = void 0;
exports.cleanTicketKind = cleanTicketKind;
exports.cleanEvent = cleanEvent;
exports.salesOpen = salesOpen;
exports.placesTaken = placesTaken;
exports.placesLeft = placesLeft;
exports.soldCount = soldCount;
exports.orderLines = orderLines;
exports.lineCounts = lineCounts;
exports.withHold = withHold;
exports.withSold = withSold;
exports.withoutHold = withoutHold;
exports.withReturned = withReturned;
exports.refundMinorFor = refundMinorFor;
exports.ticketCodeFrom = ticketCodeFrom;
exports.cleanTicketCode = cleanTicketCode;
exports.eventWhen = eventWhen;
exports.MAX_EVENTS = 200;
exports.MAX_TICKET_KINDS = 12;
exports.MAX_PLACES = 100_000;
exports.MAX_PER_ORDER = 20;
/** The smallest amount a card page takes (the same floor as Bookings). */
exports.MIN_TICKET_MINOR = 50;
exports.MAX_TICKET_MINOR = 1_000_000;
const text = (value, max) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "");
const longText = (value, max) => (typeof value === "string" ? value.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim().slice(0, max) : "");
const KIND_ID = /^[A-Za-z0-9_-]{1,24}$/;
const webLink = (value) => {
    const link = text(value, 500);
    return /^https:\/\/[^\s<>"']+$/i.test(link) ? link : "";
};
const isoTime = (value) => {
    const ms = typeof value === "string" ? Date.parse(value) : NaN;
    return Number.isFinite(ms) ? new Date(ms).toISOString() : "";
};
/** A ticket kind as saved, or the problem in plain words. `fallbackId` names a kind sent without an id. */
function cleanTicketKind(raw, fallbackId) {
    const k = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const name = text(k.name, 60);
    if (!name)
        return { problem: "Give each ticket a name, like General." };
    const priceMinor = Math.round(Number(k.priceMinor) || 0);
    if (priceMinor < 0)
        return { problem: "A ticket's price can't be less than nothing." };
    if (priceMinor > 0 && priceMinor < exports.MIN_TICKET_MINOR)
        return { problem: "A paid ticket costs at least 0.50. Use 0 for a free one." };
    if (priceMinor > exports.MAX_TICKET_MINOR)
        return { problem: "That price is too high for one ticket." };
    const places = Math.round(Number(k.places));
    if (!Number.isFinite(places) || places < 1)
        return { problem: `Say how many "${name}" tickets there are: at least 1.` };
    if (places > exports.MAX_PLACES)
        return { problem: "That's more tickets than one event can have here." };
    const most = Math.round(Number(k.maxPerOrder));
    const maxPerOrder = Number.isFinite(most) && most >= 1 ? Math.min(most, exports.MAX_PER_ORDER) : Math.min(10, exports.MAX_PER_ORDER);
    const id = typeof k.id === "string" && KIND_ID.test(k.id) ? k.id : fallbackId;
    return { id, name, priceMinor, places, maxPerOrder };
}
/** An event as saved, or the problem in plain words. */
function cleanEvent(raw, id = "") {
    const e = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const title = text(e.title, 120);
    if (!title)
        return { problem: "Give the event a name." };
    const start = isoTime(e.start);
    if (!start)
        return { problem: "Say when the event starts." };
    const end = isoTime(e.end);
    if (end && Date.parse(end) <= Date.parse(start))
        return { problem: "The event ends after it starts." };
    const list = Array.isArray(e.tickets) ? e.tickets : [];
    if (!list.length)
        return { problem: "Add at least one ticket." };
    if (list.length > exports.MAX_TICKET_KINDS)
        return { problem: `An event can have up to ${exports.MAX_TICKET_KINDS} kinds of ticket.` };
    const tickets = [];
    for (const [i, item] of list.entries()) {
        const kind = cleanTicketKind(item, `t${i + 1}`);
        if ("problem" in kind)
            return kind;
        if (tickets.some((t) => t.id === kind.id))
            return { problem: "Two tickets share an id. Remove one and add it again." };
        tickets.push(kind);
    }
    const status = e.status === "live" || e.status === "cancelled" ? e.status : "draft";
    return {
        id, title, description: longText(e.description, 4000), start, end, venue: text(e.venue, 120), address: text(e.address, 240),
        onlineUrl: webLink(e.onlineUrl), photo: webLink(e.photo), status, chargeTax: e.chargeTax === true, tickets,
    };
}
/** True while tickets can be bought: the event is live and hasn't started. */
function salesOpen(event, nowMs) {
    return event.status === "live" && Date.parse(event.start) > nowMs;
}
const count = (value) => Math.max(0, Math.round(Number(value) || 0));
/** Tickets taken per kind: sold, plus held by orders still paying (`except` leaves one order's own hold out). */
function placesTaken(places, nowMs, except = "") {
    const taken = {};
    for (const [kind, n] of Object.entries(places?.sold ?? {}))
        taken[kind] = count(n);
    for (const [orderId, hold] of Object.entries(places?.held ?? {})) {
        if (orderId === except || !(Date.parse(hold?.until ?? "") > nowMs))
            continue;
        for (const [kind, n] of Object.entries(hold.lines ?? {}))
            taken[kind] = (taken[kind] ?? 0) + count(n);
    }
    return taken;
}
/** Places left per ticket kind, never below zero. */
function placesLeft(event, places, nowMs, except = "") {
    const taken = placesTaken(places, nowMs, except);
    return Object.fromEntries(event.tickets.map((t) => [t.id, Math.max(0, t.places - (taken[t.id] ?? 0))]));
}
/** Tickets sold per kind and in all (held ones left out). */
function soldCount(event, places) {
    const byKind = Object.fromEntries(event.tickets.map((t) => [t.id, count(places?.sold?.[t.id])]));
    return { byKind, total: Object.values(byKind).reduce((sum, n) => sum + n, 0), places: event.tickets.reduce((sum, t) => sum + t.places, 0) };
}
exports.TICKET_MESSAGES = Object.freeze({
    none: "Pick at least one ticket.",
    closed: "Tickets for this event aren't on sale right now.",
    unknown: "One of those tickets isn't offered any more. Refresh the page and try again.",
});
/**
 * What an order of tickets is: its lines and total before tax, or why it can't be made. `wanted` is ticket id → how
 * many; `left` is `placesLeft` read in the same transaction.
 */
function orderLines(event, wanted, left) {
    const asked = wanted && typeof wanted === "object" && !Array.isArray(wanted) ? wanted : {};
    const lines = [];
    for (const [ticketId, raw] of Object.entries(asked)) {
        const qty = Math.round(Number(raw));
        if (!Number.isFinite(qty) || qty <= 0)
            continue;
        const kind = event.tickets.find((t) => t.id === ticketId);
        if (!kind)
            return { problem: exports.TICKET_MESSAGES.unknown };
        if (qty > kind.maxPerOrder)
            return { problem: `You can buy up to ${kind.maxPerOrder} "${kind.name}" tickets at a time.` };
        const free = left[kind.id] ?? 0;
        if (qty > free)
            return { problem: free ? `Only ${free} "${kind.name}" ${free === 1 ? "ticket is" : "tickets are"} left.` : `"${kind.name}" tickets are sold out.` };
        lines.push({ ticketId: kind.id, name: kind.name, qty, priceMinor: kind.priceMinor });
    }
    if (!lines.length)
        return { problem: exports.TICKET_MESSAGES.none };
    // In the event's own order, whatever order the page sent them in.
    lines.sort((a, b) => event.tickets.findIndex((t) => t.id === a.ticketId) - event.tickets.findIndex((t) => t.id === b.ticketId));
    return { lines, totalMinor: lines.reduce((sum, l) => sum + l.qty * l.priceMinor, 0), tickets: lines.reduce((sum, l) => sum + l.qty, 0) };
}
/** An order's lines as the places record keeps them: ticket id → how many. */
function lineCounts(lines) {
    return Object.fromEntries(lines.map((l) => [l.ticketId, l.qty]));
}
/** The places record after an order's hold is added (or replaced). */
function withHold(places, orderId, lines, untilIso) {
    return { sold: { ...(places?.sold ?? {}) }, held: { ...(places?.held ?? {}), [orderId]: { until: untilIso, lines: lineCounts(lines) } } };
}
/** The places record after an order is paid: its hold becomes sold tickets. Safe when the hold already ran out. */
function withSold(places, orderId, lines) {
    const sold = { ...(places?.sold ?? {}) };
    for (const l of lines)
        sold[l.ticketId] = count(sold[l.ticketId]) + l.qty;
    const { [orderId]: _done, ...held } = places?.held ?? {};
    return { sold, held };
}
/** The places record after an unpaid order lets go of its hold, with every run-out hold cleared too. */
function withoutHold(places, orderId, nowMs) {
    const held = Object.fromEntries(Object.entries(places?.held ?? {}).filter(([id, hold]) => id !== orderId && Date.parse(hold?.until ?? "") > nowMs));
    return { sold: { ...(places?.sold ?? {}) }, held };
}
/** The places record after tickets are given back (a refund): that many fewer sold per kind, never below zero. */
function withReturned(places, counts) {
    const sold = { ...(places?.sold ?? {}) };
    for (const [kind, n] of Object.entries(counts))
        sold[kind] = Math.max(0, count(sold[kind]) - count(n));
    return { sold, held: { ...(places?.held ?? {}) } };
}
/**
 * What goes back to the buyer when some of an order's tickets are refunded: their prices plus the same share of the
 * tax. Giving back the last tickets returns everything still kept, so cents never go missing. `counts` is ticket id →
 * how many are refunded now; `ticketsLeft` is how many the order keeps afterwards.
 */
function refundMinorFor(order, counts, ticketsLeft) {
    const kept = Math.max(0, count(order.chargedMinor) - count(order.refundedMinor));
    if (ticketsLeft <= 0)
        return kept;
    const prices = order.lines.reduce((sum, l) => sum + Math.min(count(counts[l.ticketId]), l.qty) * l.priceMinor, 0);
    const total = count(order.totalMinor);
    const tax = total > 0 ? Math.round((count(order.taxMinor) * prices) / total) : 0;
    return Math.min(kept, prices + tax);
}
// A ticket's code, shown at the door: eight letters and digits with nothing that reads two ways ("K7QM-2XPA").
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** A new code from eight random numbers (0 to 255 each). */
function ticketCodeFrom(bytes) {
    let code = "";
    for (let i = 0; i < 8; i++)
        code += CODE_ALPHABET[(bytes[i] ?? 0) % CODE_ALPHABET.length];
    return `${code.slice(0, 4)}-${code.slice(4)}`;
}
/** A typed or scanned code in its saved form, or "" when it can't be one. */
function cleanTicketCode(raw) {
    const code = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length !== 8 || [...code].some((ch) => !CODE_ALPHABET.includes(ch)))
        return "";
    return `${code.slice(0, 4)}-${code.slice(4)}`;
}
/** "Sat, Dec 5, 7:00 PM" in the shop's own time zone, for emails and lists. */
function eventWhen(startIso, zone, locale = "en-CA") {
    const ms = Date.parse(startIso);
    if (!Number.isFinite(ms))
        return "";
    return new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", ...(zone ? { timeZone: zone } : {}) }).format(new Date(ms));
}
