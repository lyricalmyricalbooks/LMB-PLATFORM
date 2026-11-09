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

// Style › Footer & social links › Payment icons in the card companies' own colours: each mark in its company's colour
// on a small white card (the company's own badge colour where it has one), the way the card networks show them.
export const PAYMENT_ICONS_COLOUR: Record<string, ReactNode> = Object.fromEntries(
  Object.entries(ICON_BRAND).map(([id, logo]) => [id, (
    <span key={id} className="fm-pay-chip inline-flex items-center justify-center rounded-[4px] px-1.5 py-0.5" data-brand={id}
      style={{ background: logo.background || "var(--fm-pay-chip, #ffffff)", border: "1px solid var(--fm-pay-chip-border, #e4e4e4)" }}>
      <svg viewBox={"full" in logo ? logo.full.viewBox : logo.viewBox} width="28" height="18" fill={"full" in logo ? undefined : logo.color || undefined}
        xmlns="http://www.w3.org/2000/svg" focusable="false" dangerouslySetInnerHTML={{ __html: "full" in logo ? logo.full.body : logo.body }} />
    </span>
  )]),
);

/** The icon for one payment method: the shop's one colour, or the companies' own colours. */
export function paymentIcon(id: string, design: any): ReactNode {
  return (design?.paymentIconsFullColour === true ? PAYMENT_ICONS_COLOUR : PAYMENT_ICONS)[id];
}
