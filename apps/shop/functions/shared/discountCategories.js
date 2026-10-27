// GENERATED from src/shared/discountCategories.ts by scripts/build-shared.mjs. Do not edit: change the .ts and run the script.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expandDiscountCategories = expandDiscountCategories;
exports.discountCategoryChoices = discountCategoryChoices;
// One copy for the shop and the server (functions/shared/discountCategories.js is generated from
// this file): a category discount covers the books the storefront shows in that category — its
// earlier names (aliases), its sub-categories, and every book for PUBLICATIONS. The server's
// result is authoritative; checkout uses this only to show the same saving.
const ALL_BOOKS = "PUBLICATIONS";
function normalizeCategories(cats) {
    return (Array.isArray(cats) ? cats : []).map((c, i) => (typeof c === "string"
        ? { id: `cat-${i}`, name: c, aliases: [] }
        : { ...(c || {}), id: (c && c.id) || `cat-${i}` }));
}
const namesOf = (cat) => [cat.name, ...(Array.isArray(cat.aliases) ? cat.aliases : [])].filter((n) => typeof n === "string" && n);
function parentFinder(cats) {
    const byId = new Map(cats.map(c => [c.id, c]));
    // A parent counts only when it exists and is itself top-level (breaks cycles, one level deep).
    const rawParent = (c) => (c.parentId && c.parentId !== c.id ? byId.get(c.parentId) || null : null);
    return (c) => { const p = rawParent(c); return p && !rawParent(p) ? p : null; };
}
function expandDiscountCategories(discount, shopCategories) {
    const d = discount;
    if (!d || d.appliesTo !== "categories")
        return discount;
    const selected = (Array.isArray(d.selectedCategories) ? d.selectedCategories : []).filter((n) => typeof n === "string");
    if (selected.includes(ALL_BOOKS))
        return { ...d, appliesTo: "all", selectedCategories: [] };
    const cats = normalizeCategories(shopCategories);
    const parentOf = parentFinder(cats);
    const names = new Set(selected);
    for (const cat of cats) {
        const own = namesOf(cat);
        if (!own.some(n => selected.includes(n)))
            continue;
        if (own.includes(ALL_BOOKS))
            return { ...d, appliesTo: "all", selectedCategories: [] };
        own.forEach(n => names.add(n));
        for (const child of cats)
            if (parentOf(child) === cat)
                namesOf(child).forEach(n => names.add(n));
    }
    return names.size === selected.length ? discount : { ...d, selectedCategories: [...names] };
}
/**
 * Admin › Discounts category picker: every shop category (each sub-category right after its parent),
 * then any name saved on the code that isn't a current category name — an old name of a renamed
 * category (still matches its books) or one that no longer exists, so the owner can untick it.
 */
function discountCategoryChoices(shopCategories, saved = []) {
    const cats = normalizeCategories(shopCategories).filter(c => typeof c.name === "string" && c.name);
    const parentOf = parentFinder(cats);
    const out = [];
    for (const cat of cats) {
        if (parentOf(cat))
            continue;
        out.push({ name: cat.name });
        for (const child of cats)
            if (parentOf(child) === cat)
                out.push({ name: child.name, parent: cat.name });
    }
    for (const name of saved || []) {
        if (!name || out.some(o => o.name === name))
            continue;
        const renamed = cats.find(c => namesOf(c).includes(name));
        out.push(renamed ? { name, renamedTo: renamed.name } : { name, missing: true });
    }
    return out;
}
