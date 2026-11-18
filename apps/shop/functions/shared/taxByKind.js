// GENERATED from src/shared/taxByKind.ts by scripts/build-shared.mjs. Do not edit: change the .ts and run the script.
"use strict";
// A tax rate for some kinds of product only (plan 12.2, 2 November 2026). A rate in Settings › Taxes may list `kinds`
// (clothing, shoes, jewelry…): it then applies only to those products, and a rate with no list applies to every other
// product. Within one place a kind's own rate wins over the place's general one; a rate for the province or state still
// wins over a country-wide rate, as before. The rule for a shop that doesn't use it: when no rate lists a kind, every
// order is taxed exactly as it was, one rate on the whole taxable amount (tested). Shared by checkout and the server.
Object.defineProperty(exports, "__esModule", { value: true });
exports.taxGroupKey = exports.TAX_GROUPS = void 0;
exports.productTaxGroup = productTaxGroup;
exports.chargesTax = chargesTax;
exports.untaxedValue = untaxedValue;
exports.ratesUseKinds = ratesUseKinds;
exports.ratesForKind = ratesForKind;
exports.taxPartsByKind = taxPartsByKind;
exports.discountedLineValues = discountedLineValues;
//
// Tax groups (product types plan, round 2, 18 November 2026): a product's type may put it in a tax group (children's
// clothing, groceries, books, digital items; `traits.taxGroup` in productTypes.ts). A rate may list the group as
// `group:<id>` in `kinds`, and then it wins over the kind's own rate and the general one in the same place. A shop with
// no group rate is taxed exactly as before.
const discountMath_1 = require("./discountMath");
const productTypes_1 = require("./productTypes");
/** The tax groups a rate can be limited to, with the words the Taxes page shows. */
exports.TAX_GROUPS = {
    "kids-clothing": "Children's clothing and shoes",
    grocery: "Groceries",
    books: "Books",
    digital: "Digital items",
};
/** The key a rate lists to cover a tax group: `group:kids-clothing`. */
const taxGroupKey = (group) => `group:${group}`;
exports.taxGroupKey = taxGroupKey;
/** The product's tax group key from its type (`group:grocery`), or "" when its type has none. */
function productTaxGroup(product) {
    const group = (0, productTypes_1.typeOfProduct)(product)?.traits?.taxGroup;
    return group ? (0, exports.taxGroupKey)(group) : "";
}
const listed = (rate) => (Array.isArray(rate?.kinds) ? rate.kinds.filter((k) => typeof k === "string" && k) : []);
/**
 * Books › edit › Charge sales tax (`chargeTax`). Off (`false`) leaves that product out of the tax, on the page and on the
 * server; on, or never set, taxes it as before.
 */
function chargesTax(product) {
    return product?.chargeTax !== false;
}
/** The value of `lines` (from `discountedLineValues`, by index in `all`, in the order's money) whose product is not taxed. */
function untaxedValue(lines, all, afterDiscount, taxed) {
    return lines.reduce((sum, line) => sum + (taxed(line) ? 0 : Math.max(0, afterDiscount[all.indexOf(line)] || 0)), 0);
}
/** True when any rate is limited to some kinds. */
function ratesUseKinds(rates) {
    return (rates || []).some((rate) => listed(rate).length > 0);
}
/**
 * The rates that may tax a product of `kind` (in tax group `group`), its own first: a rate listing the group, then a
 * rate listing the kind, then the rates with no list.
 */
function ratesForKind(rates, kind, group = "") {
    const grouped = group ? (rates || []).filter((rate) => listed(rate).includes(group)) : [];
    const own = (rates || []).filter((rate) => listed(rate).includes(kind));
    const general = (rates || []).filter((rate) => listed(rate).length === 0);
    return [...grouped, ...own, ...general];
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
    for (const line of lines) {
        const key = `${line.kind}|${line.group || ""}`;
        const seen = byKind.get(key) || { kind: line.kind, group: line.group || "", value: 0 };
        seen.value += Math.max(0, line.value);
        byKind.set(key, seen);
    }
    return [...byKind.values()].map(({ kind, group, value }) => {
        const rate = match(ratesForKind(rates, kind, group));
        return { rate, amount: amount * (value / total) * (Number(rate?.rate || 0) / 100) };
    });
}
const centsOf = (value) => Math.round(Number(value || 0) * 100);
/**
 * Each line's value after the order's discount, used as `taxPartsByKind`'s shares so each kind is taxed on what it
 * really costs. The discount comes off the lines it covers, by the rules `discountedPhysicalSubtotal`
 * (localFulfillment.ts) uses: a product or category discount only its products' lines (by value), buy-X-get-Y the
 * cheapest covered units, a free gift the gift line, any other discount every line by value. `categoriesOf` gives a
 * product's categories.
 */
function discountedLineValues(lines, discountAmount, discount, categoriesOf) {
    const values = lines.map((line) => Math.max(0, centsOf(line.price) * (Number(line.quantity) || 0)));
    const allCents = values.reduce((sum, value) => sum + value, 0);
    const discountCents = Math.max(0, Math.min(centsOf(discountAmount), allCents));
    const off = values.map(() => 0);
    if (discountCents && discount?.type === "gift") {
        const gift = lines.findIndex((line) => line.promoGift === true);
        if (gift >= 0)
            off[gift] = Math.min(values[gift], discountCents);
    }
    else if (discountCents) {
        const covers = (line) => discount?.appliesTo === "products"
            ? (discount.selectedProducts || []).includes(line.id)
            : discount?.appliesTo === "categories"
                ? (categoriesOf(line.id) || []).some((category) => (discount.selectedCategories || []).includes(category))
                : true;
        const eligible = lines.map((_line, index) => index).filter((index) => covers(lines[index]));
        if (discount?.type === "bogo") {
            const getQty = Number(discount.getQuantity) || 1;
            const setSize = (Number(discount.buyQuantity) || 1) + getQty;
            const units = eligible.flatMap((index) => Array.from({ length: Number(lines[index].quantity) || 0 }, () => ({ index, price: centsOf(lines[index].price) })));
            units.sort((a, b) => b.price - a.price);
            const count = Math.floor(units.length / setSize) * getQty;
            for (const unit of count ? units.slice(-count) : [])
                off[unit.index] += Math.round(unit.price * (0, discountMath_1.bogoPercent)(discount.getDiscountValue) / 100);
        }
        else {
            const coveredCents = eligible.reduce((sum, index) => sum + values[index], 0);
            if (coveredCents)
                for (const index of eligible)
                    off[index] = discountCents * values[index] / coveredCents;
        }
    }
    return values.map((value, index) => Math.max(0, value - off[index]) / 100);
}
