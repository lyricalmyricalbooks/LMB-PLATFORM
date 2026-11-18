// GENERATED from src/shared/shippingLimits.ts by scripts/build-shared.mjs. Do not edit: change the .ts and run the script.
"use strict";
// Shipping limits by product type (product types plan, round 2, 18 November 2026). Two of a type's traits change how a
// bag may travel (`traits` in productTypes.ts):
// - `groundOnly` (perfume, home scents, makeup, drinks, small electronics): carriers won't fly liquids, aerosols or
//   batteries, so live carrier services that go by air are left out of the choices, at checkout and when the label is
//   bought. The shop's own profile rates are the owner's to name, so they stay.
// - `perishable` (baked goods, plants): the bag can't go by post at all, only pickup or local delivery.
// One rule for the shop and the server (the server's copy is functions/shared/shippingLimits.js).
Object.defineProperty(exports, "__esModule", { value: true });
exports.NO_LIMITS = void 0;
exports.shipLimits = shipLimits;
exports.airService = airService;
exports.carrierRatesFor = carrierRatesFor;
exports.profileRatesFor = profileRatesFor;
const productTypes_1 = require("./productTypes");
exports.NO_LIMITS = { groundOnly: false, perishable: false };
/** What the products travelling in one parcel allow, from each product's type. */
function shipLimits(products) {
    const traits = (products || []).map((product) => (0, productTypes_1.typeOfProduct)(product)?.traits || {});
    return { groundOnly: traits.some((t) => t.groundOnly === true), perishable: traits.some((t) => t.perishable === true) };
}
// Carrier service names that go by air: Canada Post Priority and Xpresspost, USPS Priority (Mail Express too), UPS
// Next Day/2nd Day Air, FedEx Express/Overnight/2Day, DHL Express. Ground services (Regular and Expedited Parcel,
// Ground Advantage, UPS Ground, 3 Day Select, FedEx Ground/Home Delivery) don't match.
const AIR = /\b(air|xpresspost|priority|overnight|express|next[\s-]?day|2[\s-]?day|2nd[\s-]?day|second[\s-]?day|same[\s-]?day)\b/i;
/** True for a carrier service that flies the parcel ("Canada Post Xpresspost", "UPS Next Day Air"). */
function airService(name) {
    return AIR.test(String(name || ""));
}
/** The live carrier rates a bag may use: none for a perishable bag, no air services for a ground-only one. */
function carrierRatesFor(rates, limits) {
    if (limits.perishable)
        return [];
    return limits.groundOnly ? rates.filter((rate) => !airService(rate.name)) : [...rates];
}
/** The shop's own profile rates a bag may use: none for a perishable bag, all of them otherwise. */
function profileRatesFor(rates, limits) {
    return limits.perishable ? [] : [...rates];
}
