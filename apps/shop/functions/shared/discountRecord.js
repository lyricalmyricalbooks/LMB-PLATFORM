// GENERATED from src/shared/discountRecord.ts by scripts/build-shared.mjs. Do not edit: change the .ts and run the script.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.discountUpdate = exports.discountRecord = void 0;
// The stored shape of a `discounts/{id}` document, one copy for the shop and the server (src/shared/CLAUDE.md).
// `adminApi.saveDiscount` and `updateDiscount` check what they write against it, so a wrong-typed field (text
// where a number belongs, an unknown type) is refused on the Discounts screen instead of reaching checkout.
// Shapes only: business rules (a percentage at most 100, tiers in order) stay in `admin/discountValidation.ts`,
// and the server re-checks every rule when a shopper uses a code. Older records can miss fields or carry
// `active` instead of `isActive`, so readers keep their own fallbacks.
const edge_1 = require("./edge");
const DISCOUNT_TYPES = ["percentage", "fixed", "freeship", "bogo", "tiered", "gift"];
/** A number, or the text the form typed for it (tiers keep what was typed). */
const numberOrText = {
    parse: (value, path) => (typeof value === "string" ? value : (0, edge_1.number)().parse(value, path)),
};
// Older tiers can miss `type` (read as percentage).
const tier = (0, edge_1.object)({ minSpend: numberOrText, value: numberOrText, type: (0, edge_1.optional)((0, edge_1.oneOf)(["percentage", "fixed"])) });
const count = (0, edge_1.nullable)((0, edge_1.number)({ min: 0 }));
const fields = {
    code: (0, edge_1.string)(),
    type: (0, edge_1.oneOf)(DISCOUNT_TYPES),
    value: (0, edge_1.number)(),
    isActive: (0, edge_1.boolean)(),
    startDate: (0, edge_1.nullable)((0, edge_1.string)()),
    expiryDate: (0, edge_1.nullable)((0, edge_1.string)()),
    minOrderAmount: count,
    minQuantity: count,
    maxDiscountAmount: count,
    usageLimit: count,
    usageCount: (0, edge_1.number)({ min: 0 }),
    onePerCustomer: (0, edge_1.boolean)(),
    // "catalog" is an older name for "all" that checkout still reads.
    appliesTo: (0, edge_1.oneOf)(["all", "catalog", "categories", "products"]),
    selectedCategories: (0, edge_1.array)((0, edge_1.string)()),
    selectedProducts: (0, edge_1.array)((0, edge_1.string)()),
    allowedEmailDomains: (0, edge_1.string)(),
    allowedCustomerEmails: (0, edge_1.string)(),
    description: (0, edge_1.string)(),
    buyQuantity: count,
    getQuantity: count,
    getDiscountValue: (0, edge_1.nullable)((0, edge_1.number)()),
    tiers: (0, edge_1.nullable)((0, edge_1.array)(tier)),
    method: (0, edge_1.oneOf)(["code", "automatic"]),
    title: (0, edge_1.string)(),
    giftBookId: (0, edge_1.nullable)((0, edge_1.string)()),
    giftVariantId: (0, edge_1.nullable)((0, edge_1.string)()),
    createdAt: (0, edge_1.string)(),
    updatedAt: (0, edge_1.string)(),
};
/** A whole `discounts/{id}` document, as `adminApi.saveDiscount` creates it. */
exports.discountRecord = (0, edge_1.object)(fields);
/** The fields an edit writes: any of the record's, each in the record's shape. Other keys pass untouched. */
exports.discountUpdate = (0, edge_1.object)(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, (0, edge_1.optional)(v)])));
