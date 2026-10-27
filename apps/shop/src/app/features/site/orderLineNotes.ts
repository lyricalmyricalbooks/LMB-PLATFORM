// The small lines shown under an ordered book in Order tracking and the account's order view:
// gift-card recipient, free gift, paid extras (with inscription wording) and box-set contents.
// Every word comes from Text & labels (Order tracking: track*, Customer account: account*).
type Copy = (key: string, vars?: Record<string, string | number>) => string;

/** "2 × Title (Hardcover), 1 × Other" for a box-set line's components (per one set). */
export function componentsSummary(components: any[]): string {
  return (Array.isArray(components) ? components : [])
    .filter((part) => part && (part.title || part.id))
    .map((part) => `${Math.max(1, Number(part.quantity) || 1)} × ${part.title || part.id}${part.variantName ? ` (${part.variantName})` : ""}`)
    .join(", ");
}

export function orderLineNotes(item: any, copy: Copy, scope: "track" | "account"): string[] {
  if (!item) return [];
  const notes: string[] = [];
  if (item.giftCard === true) {
    const details = item.giftCardDetails || {};
    const recipient = String(details.recipientEmail || details.recipientName || "").trim();
    notes.push(recipient ? copy(`${scope}GiftCardFor`, { recipient }) : copy(`${scope}GiftCardSelf`));
  }
  if (item.promoGift === true) notes.push(copy(`${scope}FreeGift`));
  for (const addOn of Array.isArray(item.addOns) ? item.addOns : []) {
    if (!addOn || !addOn.label) continue;
    const label = copy(`${scope}AddOn`, { label: String(addOn.label) });
    notes.push(addOn.text ? `${label} ${copy(`${scope}AddOnText`, { text: String(addOn.text) })}` : label);
  }
  const items = componentsSummary(item.components);
  if (items) notes.push(copy(`${scope}BoxSetIncludes`, { items }));
  return notes;
}
