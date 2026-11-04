import type { ReactNode } from "react";
import { afterpay, americanexpress, applepay, googlepay, klarna, mastercard, paypal, visa } from "../../components/brand/paymentMarks";

// ──────────────────────────────
// Payment-method icons: the footer's bottom bar and the book page's optional row (PdpPaymentIcons).
// Each one is the card or wallet company's own mark (shared/brand-logos, never redrawn), shown in one colour so it
// follows the shop's Studio text colour like the rest of the footer.
// ──────────────────────────────
// From their own small file, so the shop's first load carries only these eight marks, not every partner logo.
const ICON_BRAND = { visa, mastercard, amex: americanexpress, paypal, applepay, googlepay, afterpay, klarna };

function mark(id: string, logo: { viewBox: string; body: string }): ReactNode {
  return (
    <svg className="h-5 w-5" viewBox={logo.viewBox} fill="currentColor" xmlns="http://www.w3.org/2000/svg" data-brand={id}
      focusable="false" dangerouslySetInnerHTML={{ __html: logo.body }} />
  );
}

export const PAYMENT_ICONS: Record<string, ReactNode> = Object.fromEntries(
  Object.entries(ICON_BRAND).map(([id, logo]) => [id, mark(id, logo)]),
);
