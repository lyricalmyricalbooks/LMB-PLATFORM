// "Save for later" in the shopping bag (Studio › Style › Cart drawer › Book rows › Save for later button,
// `cartDrawerShowSaveForLater`, off by default): the line leaves the bag and its book joins the wishlist.

/** The switch is on only when the owner turned it on (missing = today's bag, no button). */
export function saveForLaterOn(design: any): boolean {
  return design?.cartDrawerShowSaveForLater === true;
}

/**
 * Lines that can be saved for later: anything with a book id, except a gift card (its recipient,
 * message and amount live only on the bag line, and the wishlist keeps just the book).
 */
export function canSaveForLater(item: { id?: unknown; giftCard?: unknown } | null | undefined): boolean {
  return Boolean(item && typeof item.id === "string" && item.id && !item.giftCard);
}
