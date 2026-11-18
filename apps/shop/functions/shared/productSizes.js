// GENERATED from src/shared/productSizes.ts by scripts/build-shared.mjs. Do not edit: change the .ts and run the script.
"use strict";
// Ready-made size lists (product types plan, change 6, 18 November 2026). A product type names one of these, and the
// editor offers it as the product's first option in the right order, so nobody types "XS, S, M, L, XL" by hand or puts
// "XL" before "S". The owner can still remove sizes they don't make, or add their own.
//
// Pure: the shop imports this file and the Functions run its generated copy (functions/shared/productSizes.js).
Object.defineProperty(exports, "__esModule", { value: true });
exports.SIZE_SETS = void 0;
exports.sizeSet = sizeSet;
exports.orderSizes = orderSizes;
const halves = (from, to) => {
    const out = [];
    for (let n = from; n <= to + 1e-9; n += 0.5)
        out.push(Number.isInteger(n) ? String(n) : `${Math.floor(n)}.5`);
    return out;
};
const range = (from, to, step = 1) => {
    const out = [];
    for (let n = from; n <= to; n += step)
        out.push(String(n));
    return out;
};
exports.SIZE_SETS = [
    { id: "letters", label: "Letter sizes (XS to 3XL)", option: "Size", values: ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"], common: ["XS", "S", "M", "L", "XL"] },
    { id: "numbers", label: "Number sizes (0 to 24)", option: "Size", values: range(0, 24, 2), common: ["2", "4", "6", "8", "10", "12", "14"] },
    { id: "waist", label: "Waist sizes (26 to 44)", option: "Waist", values: range(26, 44), common: ["28", "30", "32", "34", "36"] },
    { id: "kids", label: "Kids' ages (2 to 14)", option: "Age", values: ["2T", "3T", "4T", "5", "6", "7", "8", "10", "12", "14"] },
    { id: "baby", label: "Baby ages (newborn to 24 months)", option: "Age", values: ["Newborn", "0–3 months", "3–6 months", "6–12 months", "12–18 months", "18–24 months"] },
    { id: "shoes-na", label: "Shoe sizes, CA/US (5 to 13)", option: "Size", values: halves(5, 13), common: ["6", "7", "8", "9", "10", "11"] },
    { id: "shoes-eu", label: "Shoe sizes, EU (35 to 47)", option: "Size", values: range(35, 47), common: ["37", "38", "39", "40", "41", "42", "43"] },
    { id: "shoes-uk", label: "Shoe sizes, UK (3 to 12)", option: "Size", values: halves(3, 12), common: ["4", "5", "6", "7", "8", "9", "10"] },
    { id: "shoes-kids", label: "Kids' shoe sizes (4 to 13, then 1 to 6)", option: "Size", values: [...range(4, 13).map((n) => `${n}C`), ...range(1, 6).map((n) => `${n}Y`)] },
    { id: "widths", label: "Shoe widths", option: "Width", values: ["Narrow", "Regular", "Wide", "Extra wide"], common: ["Regular", "Wide"] },
    { id: "rings", label: "Ring sizes (4 to 12, half sizes)", option: "Ring size", values: halves(4, 12), common: ["5", "6", "7", "8", "9"] },
    { id: "chains", label: "Chain lengths (14 to 30 in)", option: "Chain length", values: ["14 in", "16 in", "18 in", "20 in", "22 in", "24 in", "30 in"], common: ["16 in", "18 in", "20 in"] },
    { id: "bracelets", label: "Bracelet sizes", option: "Size", values: ["XS (6 in)", "S (6.5 in)", "M (7 in)", "L (7.5 in)", "XL (8 in)"] },
    { id: "pair", label: "Pair or single", option: "Sold as", values: ["Pair", "Single"] },
    { id: "small-large", label: "Small, medium, large", option: "Size", values: ["S", "M", "L"] },
    { id: "hats", label: "Hat sizes", option: "Size", values: ["S/M", "L/XL", "One size"] },
    { id: "paper", label: "Paper sizes (A6 to A2)", option: "Size", values: ["A6", "A5", "A4", "A3", "A2"], common: ["A5", "A4", "A3"] },
    { id: "prints", label: "Print sizes (5×7 to 24×36 in)", option: "Size", values: ["5×7 in", "8×10 in", "11×14 in", "12×16 in", "16×20 in", "18×24 in", "24×36 in"], common: ["8×10 in", "11×14 in", "16×20 in"] },
    { id: "candle", label: "Candle sizes (4 to 16 oz)", option: "Size", values: ["4 oz", "8 oz", "12 oz", "16 oz"], common: ["8 oz", "12 oz"] },
    { id: "bottle", label: "Bottle sizes (5 to 250 ml)", option: "Size", values: ["5 ml", "10 ml", "30 ml", "50 ml", "100 ml", "250 ml"], common: ["30 ml", "50 ml", "100 ml"] },
    { id: "jar", label: "Jar sizes (50 to 500 g)", option: "Size", values: ["50 g", "100 g", "250 g", "500 g"] },
    { id: "bag", label: "Bag sizes (250 g to 1 kg)", option: "Size", values: ["100 g", "250 g", "340 g", "500 g", "1 kg"], common: ["250 g", "1 kg"] },
    { id: "pots", label: "Pot sizes (2 to 12 in)", option: "Pot size", values: ['2 in', '4 in', '6 in', '8 in', '10 in', '12 in'], common: ['4 in', '6 in'] },
    { id: "pets", label: "Pet sizes", option: "Size", values: ["XS", "S", "M", "L", "XL"] },
    { id: "phones", label: "Phone models", option: "Phone", values: ["iPhone 17", "iPhone 17 Pro", "iPhone 16", "iPhone 15", "Pixel 10", "Galaxy S26"] },
];
/** A size list by its id, or null. */
function sizeSet(id) {
    return exports.SIZE_SETS.find((set) => set.id === id) ?? null;
}
/**
 * Puts picked sizes in the list's own order (S before XL), with any size the owner typed themselves kept after, in the
 * order they typed it. Repeats (any case) are dropped.
 */
function orderSizes(setId, picked) {
    const set = sizeSet(setId);
    const seen = new Set();
    const clean = picked.map((v) => String(v ?? "").trim()).filter((v) => {
        const key = v.toLocaleLowerCase();
        if (!v || seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
    if (!set)
        return clean;
    const rank = (v) => set.values.findIndex((s) => s.toLocaleLowerCase() === v.toLocaleLowerCase());
    const known = clean.filter((v) => rank(v) >= 0).sort((a, b) => rank(a) - rank(b));
    return [...known, ...clean.filter((v) => rank(v) < 0)];
}
