// GENERATED from src/shared/productOptions.ts by scripts/build-shared.mjs. Do not edit: change the .ts and run the script.
"use strict";
// Products beyond books (plan 10.2, 10.20, 28 October 2026): a product's kind and its options (size, colour, material).
//
// The rule: a books shop works exactly as before. A product with no `kind` is a printed book, and a product with no
// `options` keeps today's one list of editions (each `variants[]` entry with its own name). Only a product saved with
// `options` gets option buttons, and then each variant carries its picks (`variants[].options`, { Size: "M" }) and its
// `name` is the picks joined ("M / Black"). Everything that already works per variant (price, stock holds, the bag,
// orders, emails, the stockroom link) keeps reading `variants[].id` and `variants[].name`, so it needs no change.
//
// Pure: the shop imports this file and the Functions run its generated copy (functions/shared/productOptions.js).
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_VARIANTS = exports.MAX_OPTIONS = exports.PRODUCT_KINDS = void 0;
exports.productKind = productKind;
exports.isBookKind = isBookKind;
exports.productOptions = productOptions;
exports.variantPicks = variantPicks;
exports.usesOptionPicker = usesOptionPicker;
exports.variantLabel = variantLabel;
exports.optionCombinations = optionCombinations;
exports.optionProblems = optionProblems;
exports.variantsForOptions = variantsForOptions;
exports.findVariant = findVariant;
exports.picksPossible = picksPossible;
exports.valueAvailable = valueAvailable;
/** What a product is. A product saved before kinds existed is a printed book. */
exports.PRODUCT_KINDS = ["book", "ebook", "clothing", "shoes", "jewelry", "art", "music", "other"];
/** At most three options per product (size, colour, material), as most shop systems allow. */
exports.MAX_OPTIONS = 3;
/** At most this many combinations per product, so the editor and the product page stay usable. */
exports.MAX_VARIANTS = 100;
/** Longest option name or value kept. */
const MAX_WORD = 40;
/** The product's kind: its own when it is one of PRODUCT_KINDS, else a printed book. */
function productKind(product) {
    const kind = typeof product?.kind === "string" ? product.kind.trim().toLowerCase() : "";
    return exports.PRODUCT_KINDS.includes(kind) ? kind : "book";
}
/** True for the kinds that are books (printed or e-book): only these show the book fields. */
function isBookKind(kind) {
    return kind === "book" || kind === "ebook";
}
const word = (value) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, MAX_WORD) : "");
const sameWord = (a, b) => a.toLocaleLowerCase() === b.toLocaleLowerCase();
/**
 * The product's options, tidied: names and values trimmed, blanks and repeats (any case) dropped, at most
 * MAX_OPTIONS options, an option with no values dropped. A product with none gets [] (today's editions list).
 */
function productOptions(product) {
    const raw = Array.isArray(product?.options) ? product.options : [];
    const out = [];
    for (const option of raw) {
        const name = word(option?.name);
        if (!name || out.some((o) => sameWord(o.name, name)))
            continue;
        const values = [];
        for (const v of Array.isArray(option?.values) ? option.values : []) {
            const value = word(v);
            if (value && !values.some((x) => sameWord(x, value)))
                values.push(value);
        }
        if (values.length)
            out.push({ name, values });
        if (out.length === exports.MAX_OPTIONS)
            break;
    }
    return out;
}
/** The variant's picks in the product's option order, or null when it doesn't carry one known value per option. */
function variantPicks(variant, options) {
    if (!variant || !options.length || !variant.options || typeof variant.options !== "object")
        return null;
    const picks = {};
    for (const option of options) {
        const own = word(variant.options[option.name]);
        const value = option.values.find((v) => sameWord(v, own));
        if (!value)
            return null;
        picks[option.name] = value;
    }
    return picks;
}
/**
 * True when the product page shows option buttons: the product has options and every variant carries a pick for
 * each of them. Anything else (a book with editions, a half-saved product) keeps today's editions list.
 */
function usesOptionPicker(product) {
    const options = productOptions(product);
    const variants = Array.isArray(product?.variants) ? product.variants : [];
    return options.length > 0 && variants.length > 0 && variants.every((v) => variantPicks(v, options) !== null);
}
/** The variant's name from its picks, in option order: "M / Black". */
function variantLabel(options, picks) {
    return options.map((o) => picks[o.name]).filter(Boolean).join(" / ");
}
/** Every combination of the options' values, first option slowest ("S / Black", "S / White", "M / Black", ...). */
function optionCombinations(options) {
    let out = [{}];
    for (const option of options) {
        const next = [];
        for (const picks of out)
            for (const value of option.values)
                next.push({ ...picks, [option.name]: value });
        out = next;
    }
    return options.length ? out : [];
}
/** Plain-words problems with a set of options, empty when it can be saved. */
function optionProblems(options) {
    const problems = [];
    if (options.length > exports.MAX_OPTIONS)
        problems.push(`A product can have at most ${exports.MAX_OPTIONS} options.`);
    for (const option of options)
        if (!option.values.length)
            problems.push(`Add at least one choice to ${option.name || "the option"}.`);
    const count = options.reduce((n, o) => n * Math.max(1, o.values.length), options.length ? 1 : 0);
    if (count > exports.MAX_VARIANTS)
        problems.push(`That makes ${count} combinations; a product can have at most ${exports.MAX_VARIANTS}.`);
    return problems;
}
/**
 * The variants for a set of options: one per combination, in combination order. A combination that already had a
 * variant keeps it (its id, price, stock, SKU, photo), with its name brought up to date. `fresh(picks)` makes the
 * fields of a new one (id included). `removed` lists the variants whose combination is gone, so the editor can say so
 * before saving (their stock leaves the product).
 */
function variantsForOptions(options, existing, fresh) {
    const combos = optionCombinations(options);
    const used = new Set();
    const variants = combos.map((picks) => {
        const match = (existing || []).find((v) => !used.has(v) && sameCombo(variantPicks(v, options), picks));
        if (match)
            used.add(match);
        const base = match || fresh(picks);
        return { ...base, options: picks, name: variantLabel(options, picks) };
    });
    return { variants, removed: (existing || []).filter((v) => !used.has(v)) };
}
const sameCombo = (a, b) => !!a && Object.keys(b).every((k) => a[k] === b[k]);
/** The variant matching every pick, or null while a pick is missing or no variant has that combination. */
function findVariant(product, picks) {
    const options = productOptions(product);
    if (!options.length || options.some((o) => !picks[o.name]))
        return null;
    return (product.variants || []).find((v) => sameCombo(variantPicks(v, options), picks)) || null;
}
/** True when some variant agrees with every pick made so far (picks for options it doesn't have are ignored). */
function picksPossible(product, picks) {
    const options = productOptions(product);
    return (product.variants || []).some((v) => {
        const own = variantPicks(v, options);
        return !!own && options.every((o) => !picks[o.name] || own[o.name] === picks[o.name]);
    });
}
/**
 * Whether choosing `value` for `optionName` (with the shopper's other picks so far) can still lead to a variant
 * `canBuy` accepts. The product page crosses out the values that can't, so a sold-out size reads as sold out.
 */
function valueAvailable(product, picks, optionName, value, canBuy) {
    const options = productOptions(product);
    return (product.variants || []).some((v) => {
        const own = variantPicks(v, options);
        if (!own || own[optionName] !== value)
            return false;
        return options.every((o) => o.name === optionName || !picks[o.name] || own[o.name] === picks[o.name]) && canBuy(v);
    });
}
