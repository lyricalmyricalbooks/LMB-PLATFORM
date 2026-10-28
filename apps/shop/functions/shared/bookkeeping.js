// GENERATED from src/shared/bookkeeping.ts by scripts/build-shared.mjs. Do not edit: change the .ts and run the script.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UNNAMED_TAX = void 0;
exports.dayOf = dayOf;
exports.countsForBooks = countsForBooks;
exports.bookkeepingOrderLines = bookkeepingOrderLines;
exports.dailyBookkeeping = dailyBookkeeping;
exports.bookkeepingPayouts = bookkeepingPayouts;
exports.taxNamesOf = taxNamesOf;
/** The name older orders' tax goes under (they were placed before taxes had names). */
exports.UNNAMED_TAX = "Sales tax";
const PAID = new Set(["paid", "refunded", "refund_pending"]);
const cents = (value) => Math.round((Number(value) || 0) * 100);
const whole = (value) => (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Math.round(Number(value)));
/** "YYYY-MM-DD" of a moment in a time zone ("" when it isn't a date). Accepts ISO text, "YYYY-MM-DD", seconds or ms. */
function dayOf(value, timeZone = "UTC") {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
        return value;
    const ms = typeof value === "number" ? (value < 1e12 ? value * 1000 : value) : typeof value === "string" ? Date.parse(value) : NaN;
    if (!Number.isFinite(ms))
        return "";
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms));
    const part = (type) => parts.find((p) => p.type === type)?.value || "";
    return `${part("year")}-${part("month")}-${part("day")}`;
}
/** Real money only: no test, sandbox or practice orders, and only orders that were paid. */
function countsForBooks(order) {
    return order.isTest !== true && order.sandboxPayment !== true && order.practice !== true && PAID.has(String(order.paymentStatus || ""));
}
function taxesOf(order) {
    const out = {};
    const lines = Array.isArray(order.taxLines) ? order.taxLines : null;
    if (lines) {
        for (const line of lines)
            if (line && line.name)
                out[line.name] = (out[line.name] || 0) + (whole(line.cents) || 0);
    }
    else if (cents(order.tax)) {
        out[exports.UNNAMED_TAX] = cents(order.tax);
    }
    return out;
}
/** Refunds of an order as [day, cents in the shop's currency]. */
function refundsOf(order, currency, timeZone) {
    const rate = Number(order.exchangeRate) > 0 ? Number(order.exchangeRate) : 1;
    const toShop = (minor, cur) => (String(cur || currency).toUpperCase() === currency ? minor : Math.round(minor / rate));
    const charged = String(order.checkoutCurrency || currency);
    const out = [];
    let recorded = 0;
    for (const r of Array.isArray(order.partialRefunds) ? order.partialRefunds : []) {
        if (!r || ["failed", "canceled"].includes(String(r.status || "")))
            continue;
        const minor = whole(r.amountMinor) || 0;
        recorded += minor;
        out.push([dayOf(r.createdAt, timeZone), toShop(minor, r.currency || charged)]);
    }
    // The rest of the refunded total (a full refund, or a partial one only the running total knows) on its own day.
    const full = order.paymentStatus === "refunded" || order.paymentStatus === "refund_pending";
    const fullMinor = full && order.refund ? cents(order.refund.amount) : 0;
    const fullCurrency = full && order.refund ? order.refund.currency || charged : charged;
    const totalMinor = Math.max(whole(order.refundedAmountMinor) || 0, fullMinor, recorded);
    const rest = totalMinor - recorded;
    if (rest > 0) {
        const when = order.refund?.createdAt || order.refundedAt || order.updatedAt;
        const cur = whole(order.refundedAmountMinor) ? charged : fullCurrency;
        out.push([dayOf(when, timeZone), toShop(rest, cur)]);
    }
    return out.filter(([day, amount]) => day && amount);
}
const giftCardsSold = (order) => (Array.isArray(order.items) ? order.items : [])
    .filter((item) => item && item.giftCard === true)
    .reduce((sum, item) => sum + cents((Number(item.price) || 0) * (Number(item.quantity) || 0)), 0);
/** Sheet 2: each sale and refund in the month, oldest first. */
function bookkeepingOrderLines(orders, options) {
    const currency = String(options.currency || "CAD").toUpperCase();
    const timeZone = options.timeZone || "UTC";
    const inMonth = (day) => day.slice(0, 7) === options.month;
    const out = [];
    for (const order of orders) {
        if (!countsForBooks(order))
            continue;
        const orderId = String(order.orderId || order.id || "");
        const payoutId = order.payoutId ? String(order.payoutId) : null;
        const payoutDate = order.payoutDate != null && order.payoutDate !== "" ? dayOf(order.payoutDate, timeZone) || null : null;
        const paidDay = dayOf(order.paidAt || order.createdAt, timeZone);
        if (paidDay && inMonth(paidDay)) {
            const soldCards = giftCardsSold(order);
            const totalCents = cents(order.total);
            const feeCents = whole(order.fee);
            const net = whole(order.net);
            out.push({
                date: paidDay, orderId, kind: "Sale",
                salesCents: cents(order.subtotal) - soldCards,
                shippingCents: cents(order.shipping),
                discountsCents: cents(order.discount),
                giftCardsSoldCents: soldCards,
                giftCardsUsedCents: cents(order.giftCardAmount),
                refundsCents: 0,
                taxes: taxesOf(order),
                totalCents, feeCents,
                netCents: net ?? totalCents - (feeCents || 0),
                payoutId, payoutDate, currency,
            });
        }
        for (const [day, amount] of refundsOf(order, currency, timeZone)) {
            if (!inMonth(day))
                continue;
            out.push({
                date: day, orderId, kind: "Refund",
                salesCents: 0, shippingCents: 0, discountsCents: 0, giftCardsSoldCents: 0, giftCardsUsedCents: 0,
                refundsCents: amount, taxes: {}, totalCents: 0, feeCents: null, netCents: -amount,
                payoutId: null, payoutDate: null, currency,
            });
        }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.orderId.localeCompare(b.orderId) || a.kind.localeCompare(b.kind));
}
/** Sheet 1: one line per day of the month that had a sale or refund, oldest first. */
function dailyBookkeeping(orders, options) {
    const days = new Map();
    for (const line of bookkeepingOrderLines(orders, options)) {
        const day = days.get(line.date) || {
            date: line.date, salesCents: 0, shippingCents: 0, discountsCents: 0, giftCardsSoldCents: 0, giftCardsUsedCents: 0,
            refundsCents: 0, taxes: {}, feesCents: 0, netCents: 0, currency: line.currency,
        };
        day.salesCents += line.salesCents;
        day.shippingCents += line.shippingCents;
        day.discountsCents += line.discountsCents;
        day.giftCardsSoldCents += line.giftCardsSoldCents;
        day.giftCardsUsedCents += line.giftCardsUsedCents;
        day.refundsCents += line.refundsCents;
        for (const [name, amount] of Object.entries(line.taxes))
            day.taxes[name] = (day.taxes[name] || 0) + amount;
        day.feesCents += line.feeCents || 0;
        day.netCents += line.netCents;
        days.set(line.date, day);
    }
    return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}
/** Sheet 3: each payout dated in the month, with the total, fees and net of the orders it paid out. */
function bookkeepingPayouts(orders, options) {
    const currency = String(options.currency || "CAD").toUpperCase();
    const timeZone = options.timeZone || "UTC";
    const payouts = new Map();
    for (const order of orders) {
        if (!countsForBooks(order) || !order.payoutId)
            continue;
        const date = order.payoutDate != null && order.payoutDate !== "" ? dayOf(order.payoutDate, timeZone) : "";
        if (date.slice(0, 7) !== options.month)
            continue;
        const id = String(order.payoutId);
        const payout = payouts.get(id) || { payoutId: id, date, orders: 0, totalCents: 0, feesCents: 0, netCents: 0, currency };
        const totalCents = cents(order.total);
        const feeCents = whole(order.fee) || 0;
        payout.orders += 1;
        payout.totalCents += totalCents;
        payout.feesCents += feeCents;
        payout.netCents += whole(order.net) ?? totalCents - feeCents;
        payouts.set(id, payout);
    }
    return [...payouts.values()].sort((a, b) => a.date.localeCompare(b.date) || a.payoutId.localeCompare(b.payoutId));
}
/** Every tax name used in these lines, A to Z (the sheets' tax columns). */
function taxNamesOf(lines) {
    return [...new Set(lines.flatMap((line) => Object.keys(line.taxes)))].sort((a, b) => a.localeCompare(b));
}
