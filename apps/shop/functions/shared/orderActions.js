// GENERATED from src/shared/orderActions.ts by scripts/build-shared.mjs. Do not edit: change the .ts and run the script.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refundOrderBody = exports.orderActionBody = exports.orderId = void 0;
// What the admin's money and order actions send to the server. The admin builds each body with these types and
// the Functions check every request against the same schema before touching an order (src/shared/edge.ts).
const edge_1 = require("./edge");
/** An order's document id, as every order action names it (never a path). */
exports.orderId = (0, edge_1.string)({ min: 1, max: 200, pattern: /^[^/]+$/, label: "an order number" });
/** cancelOrder, resolvePaymentMismatch and restockRefunded (createStripeCheckoutSession `action`). */
exports.orderActionBody = (0, edge_1.object)({ orderId: exports.orderId });
/**
 * refundOrder. Amount and restock rows keep their friendly checks in functions/partialRefund.js (above zero,
 * at most what is left, lines on the order); the schema only pins their types.
 */
exports.refundOrderBody = (0, edge_1.object)({
    orderId: exports.orderId,
    reason: (0, edge_1.optional)((0, edge_1.string)({ max: 2000 })),
    restock: (0, edge_1.optional)((0, edge_1.boolean)()),
    amountMinor: (0, edge_1.optional)((0, edge_1.nullable)((0, edge_1.number)({ int: true }))),
    restockLines: (0, edge_1.optional)((0, edge_1.nullable)((0, edge_1.array)((0, edge_1.object)({ index: (0, edge_1.number)({ int: true }), quantity: (0, edge_1.number)({ int: true }) }), { max: 100 }))),
});
