// GENERATED from src/shared/giftCardActions.ts by scripts/build-shared.mjs. Do not edit: change the .ts and run the script.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GIFT_CARD_BODIES = exports.giftCardOp = void 0;
// What the admin's gift card actions send (createStripeCheckoutSession `action: "giftCardAdmin"`, by `op`). The admin
// builds each body with these types and the Functions check it against the same schema before reading or writing a
// card. The schemas pin types and size only; the friendly checks (amount limits, email shape, real dates, a reason
// for every adjustment) stay in handleGiftCardAdmin and functions/giftCards.js.
const edge_1 = require("./edge");
const text = (max) => (0, edge_1.optional)((0, edge_1.string)({ max }));
/** A gift card's document id (its handler still checks the exact hash shape). */
const id = (0, edge_1.string)({ min: 1, max: 100, label: "a gift card" });
exports.giftCardOp = (0, edge_1.oneOf)(["issue", "setEnabled", "adjust", "setExpiry", "resend"]);
exports.GIFT_CARD_BODIES = {
    issue: (0, edge_1.object)({
        amountMinor: (0, edge_1.number)(),
        recipientEmail: text(320),
        recipientName: text(100),
        senderName: text(100),
        message: text(300),
        note: text(500),
        expiresOn: text(32),
        sendEmail: (0, edge_1.optional)((0, edge_1.boolean)()),
    }),
    setEnabled: (0, edge_1.object)({ id, enabled: (0, edge_1.boolean)() }),
    adjust: (0, edge_1.object)({ id, deltaMinor: (0, edge_1.number)(), reason: (0, edge_1.string)({ max: 300 }) }),
    setExpiry: (0, edge_1.object)({ id, expiresOn: (0, edge_1.string)({ max: 32 }), reason: text(300) }),
    resend: (0, edge_1.object)({ id, to: text(320) }),
};
