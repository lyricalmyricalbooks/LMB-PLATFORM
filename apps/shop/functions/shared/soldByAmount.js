// GENERATED from src/shared/soldByAmount.ts by scripts/build-shared.mjs. Do not edit: change the .ts and run the script.
"use strict";
// Sold by the metre or the gram (product types plan, round 2). One rule for the shop and the server.
//
// A product sold by amount keeps `amount: { unit, step, min }` on its record. The shopper buys whole steps (10 cm of
// fabric, 10 g of beads): the bag's quantity counts steps, the product's price is the price of one step and its stock
// counts steps too, so pricing, stock, Stripe and every refund keep working on whole numbers with no cent rounding.
// Shoppers and owners only ever see the amount ("1.5 m", "250 g") and the price per metre or per 100 g.
// Yarn is sold by the skein, an ordinary count, so it needs nothing here.
Object.defineProperty(exports, "__esModule", { value: true });
exports.AMOUNT_UNITS = void 0;
exports.soldAmount = soldAmount;
exports.minSteps = minSteps;
exports.formatAmount = formatAmount;
exports.amountText = amountText;
exports.stepText = stepText;
exports.pricePerUnit = pricePerUnit;
exports.stepPrice = stepPrice;
exports.perLabel = perLabel;
exports.stockText = stockText;
exports.amountLine = amountLine;
exports.lineAmountText = lineAmountText;
exports.startingAmount = startingAmount;
/** The steps an owner can pick for each unit, and the amount the price is shown for. */
exports.AMOUNT_UNITS = {
    m: { name: "By the metre", steps: [0.1, 0.25, 0.5, 1], per: 1, perLabel: "m" },
    g: { name: "By weight", steps: [1, 5, 10, 25, 50, 100], per: 100, perLabel: "100 g" },
};
const round = (n, places = 3) => Math.round(n * 10 ** places) / 10 ** places;
/** The product's amount settings, or null when it is sold one at a time (or the saved settings make no sense). */
function soldAmount(product) {
    const raw = product?.amount;
    if (!raw || typeof raw !== "object")
        return null;
    const unit = raw.unit === "m" || raw.unit === "g" ? raw.unit : null;
    if (!unit)
        return null;
    const step = Number(raw.step);
    if (!exports.AMOUNT_UNITS[unit].steps.includes(step))
        return null;
    const min = Number(raw.min);
    return { unit, step, min: Number.isFinite(min) && min > step ? round(min) : step };
}
/** Whole steps needed to reach the smallest amount a shopper may buy (at least 1, at most 99). */
function minSteps(amount) {
    if (!amount)
        return 1;
    return Math.min(99, Math.max(1, Math.ceil(round(amount.min / amount.step, 6))));
}
/** "1.5 m", "250 g", "1.2 kg", "10 cm" (a length under a metre reads in centimetres). */
function formatAmount(unit, value) {
    const v = round(value);
    const trim = (n) => String(round(n, 2));
    if (unit === "m")
        return v < 1 ? `${trim(v * 100)} cm` : `${trim(v)} m`;
    return v >= 1000 ? `${trim(v / 1000)} kg` : `${trim(v)} g`;
}
/** The amount a number of steps comes to, written out ("1.5 m"). Empty for products sold one at a time. */
function amountText(product, steps) {
    const amount = soldAmount(product);
    if (!amount)
        return "";
    return formatAmount(amount.unit, (Math.max(0, Math.floor(Number(steps) || 0))) * amount.step);
}
/** One step written out: "10 cm", "10 g". */
function stepText(amount) {
    return formatAmount(amount.unit, amount.step);
}
/** What a step price comes to per metre or per 100 g (the price shoppers compare). */
function pricePerUnit(amount, stepPrice) {
    return Math.round(((Number(stepPrice) || 0) * exports.AMOUNT_UNITS[amount.unit].per) / amount.step * 100) / 100;
}
/** The step price for a price per metre or per 100 g, rounded to the cent (what the shop charges per step). */
function stepPrice(amount, perUnit) {
    return Math.round(((Number(perUnit) || 0) * amount.step) / exports.AMOUNT_UNITS[amount.unit].per * 100) / 100;
}
/** "$18.00 / m" style suffix: "m" or "100 g". */
function perLabel(amount) {
    return exports.AMOUNT_UNITS[amount.unit].perLabel;
}
/** The amount a whole line or a stock count is written as; the stockroom and the editor show stock this way. */
function stockText(product, steps) {
    return soldAmount(product) ? amountText(product, steps) : String(steps);
}
/**
 * The server's check for one order line: the amount it records, or a reason to refuse the line. A line under the
 * smallest amount is refused rather than raised, so the shopper never pays for more than the bag showed.
 */
function amountLine(product, steps) {
    const amount = soldAmount(product);
    if (!amount)
        return { ok: true };
    const need = minSteps(amount);
    if (steps < need)
        return { ok: false, message: `Choose at least ${formatAmount(amount.unit, need * amount.step)} of "${product?.title || "this item"}".` };
    return { ok: true, amount: { unit: amount.unit, step: amount.step, value: round(steps * amount.step) } };
}
/** An order or bag line's amount ("1.5 m"), from the record the server keeps on the line; empty for counted lines. */
function lineAmountText(line) {
    const a = line?.amount;
    if (!a || (a.unit !== "m" && a.unit !== "g"))
        return "";
    const value = Number.isFinite(Number(a.value)) ? Number(a.value) : (Number(a.step) || 0) * (Number(line?.quantity) || 0);
    return formatAmount(a.unit, value);
}
/** A new product of a type sold by the metre or the gram starts with these (the owner can change or turn them off). */
function startingAmount(soldBy) {
    if (soldBy === "metre")
        return { unit: "m", step: 0.1, min: 0.5 };
    if (soldBy === "gram")
        return { unit: "g", step: 10, min: 50 };
    return null;
}
