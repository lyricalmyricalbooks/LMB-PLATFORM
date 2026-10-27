/** Payment-method icons the footer can show. `design.footerBadges` (edited in Studio) overrides Settings › Payments. */
export const PAYMENT_BADGE_OPTIONS: { id: string; label: string }[] = [
  { id: "visa", label: "Visa" },
  { id: "mastercard", label: "Mastercard" },
  { id: "amex", label: "American Express" },
  { id: "paypal", label: "PayPal" },
  { id: "applepay", label: "Apple Pay" },
  { id: "googlepay", label: "Google Pay" },
  { id: "afterpay", label: "Afterpay" },
  { id: "klarna", label: "Klarna" },
];

/** Which icons to show: the design's own list when set, otherwise the store's Payments setting. */
export function resolveFooterBadges(design: any, settings: any): string[] {
  if (Array.isArray(design?.footerBadges)) return design.footerBadges;
  return Array.isArray(settings?.payments?.footerBadges) ? settings.payments.footerBadges : [];
}
