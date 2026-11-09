/**
 * Whether a customer placed an order with the shop in French (the order's saved `locale`, from checkout). Their order
 * emails go in French (functions/emailFrench.js emailLanguage, same rule), so the admin shows a "French" tag to reply in kind.
 */
export const orderInFrench = (order: { locale?: unknown } | null | undefined): boolean => /^fr\b/i.test(String(order?.locale ?? ""));

export const FRENCH_ORDER_HINT = "This customer shopped in French, so their order emails go in French.";
