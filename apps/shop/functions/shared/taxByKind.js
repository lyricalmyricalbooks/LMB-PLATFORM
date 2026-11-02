// GENERATED from src/shared/taxByKind.ts by scripts/build-shared.mjs. Do not edit: change the .ts and run the script.
"use strict";
// A tax rate for some kinds of product only (plan 12.2, 2 November 2026). A rate in Settings › Taxes may list `kinds`
// (clothing, shoes, jewelry…): it then applies only to those products, and a rate with no list applies to every other
// product. Within one place a kind's own rate wins over the place's general one; a rate for the province or state still
// wins over a country-wide rate, as before. The rule for a shop that doesn't use it: when no rate lists a kind, every
// order is taxed exactly as it was, one rate on the whole taxable amount (tested). Shared by checkout and the server.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ratesUseKinds = ratesUseKinds;
exports.ratesForKind = ratesForKind;
exports.taxPartsByKind = taxPartsByKind;
const listed = (rate) => (Array.isArray(rate?.kinds) ? rate.kinds.filter((k) => typeof k === "string" && k) : []);
/** True when any rate is limited to some kinds. */
function ratesUseKinds(rates) {
    return (rates || []).some((rate) => listed(rate).length > 0);
}
/** The rates that may tax a product of `kind`, its own first: a rate listing the kind, then the rates with no list. */
function ratesForKind(rates, kind) {
    const own = (rates || []).filter((rate) => listed(rate).includes(kind));
    const general = (rates || []).filter((rate) => listed(rate).length === 0);
    return [...own, ...general];
}
/**
 * The tax parts for `amount` (the taxable money after any discount) spread over `lines` by value. `match` picks the
 * rate for a place from a list of rates. With no kinds in use, or no value to spread, it is one part on the whole
 * amount, which is what a shop without kinds has always been charged.
 */
function taxPartsByKind(lines, amount, rates, match) {
    const total = lines.reduce((sum, line) => sum + Math.max(0, line.value), 0);
    if (!ratesUseKinds(rates) || !total || !(amount > 0)) {
        const rate = match(rates);
        return [{ rate, amount: amount * (Number(rate?.rate || 0) / 100) }];
    }
    const byKind = new Map();
    for (const line of lines)
        byKind.set(line.kind, (byKind.get(line.kind) || 0) + Math.max(0, line.value));
    return [...byKind].map(([kind, value]) => {
        const rate = match(ratesForKind(rates, kind));
        return { rate, amount: amount * (value / total) * (Number(rate?.rate || 0) / 100) };
    });
}
