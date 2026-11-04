import type { ReactNode } from "react";
import { americanexpress, mastercard, visa } from "../../components/brand/paymentMarks";
import { getCopy } from "./storeCopy";
import { regionProps, regionVisible } from "./storefrontRegions";

/** Payment fields must live outside the radio label: label activation and
 * preventDefault handlers interfere with Stripe's own interactive iframe. */
// The card brands the shop names in Text & labels › Checkout › Card brand badges, drawn as each network's real mark
// (shared/brand-logos, in the checkout's muted text colour) when we have it; any other word stays a word.
const CARD_MARKS: Record<string, { id: string; logo: { viewBox: string; body: string; name: string } }> = {
  visa: { id: "visa", logo: visa }, mc: { id: "mastercard", logo: mastercard }, mastercard: { id: "mastercard", logo: mastercard },
  amex: { id: "americanexpress", logo: americanexpress }, "american express": { id: "americanexpress", logo: americanexpress },
};
export function cardMark(word: string) {
  return CARD_MARKS[word.trim().toLowerCase().replace(/\s+/g, " ")] || null;
}
function cardMarkIcon(word: string) {
  const mark = cardMark(word);
  return mark && (
    <svg viewBox={mark.logo.viewBox} fill="currentColor" role="img" aria-label={mark.logo.name} focusable="false"
      data-brand={mark.id} dangerouslySetInnerHTML={{ __html: mark.logo.body }} />
  );
}

export function StripePaymentSection({ design, selected, configured, canRetry, busy, onSelect, onRetry, tabs = false, hosted = false, children }: {
  design: any;
  selected: boolean;
  configured: boolean;
  canRetry: boolean;
  busy: boolean;
  onSelect: () => void;
  onRetry: () => void;
  /** Checkout's order-slip look: payment choices sit side by side as tabs, the card badges move under them. */
  tabs?: boolean;
  /** Square shops (plan 2.2b): the card is entered on Square's own page, so a note stands where the card form would. */
  hosted?: boolean;
  children: ReactNode;
}) {
  const c = (key: string) => getCopy(design, key);
  const brands = c("coCardBrands").split(",").map(brand => brand.trim()).filter(Boolean).filter(brand => !/^(apple\s*pay|google\s*pay|link|paypal|amazon\s*pay|klarna)$/i.test(brand));
  const badges = regionVisible(design, "stripeBrands") && brands.length > 0 && (
    <div {...regionProps("stripeBrands")} className="fm-co-brands" aria-label={c("coCardsAria")}>
      {brands.map((brand, index) => <span key={index} data-brand-mark={cardMark(brand) ? true : undefined}>{cardMarkIcon(brand) ?? brand}</span>)}
    </div>
  );
  const header = (
    <div {...regionProps("stripePaymentHeader")} className="fm-co-pay-tab">
      <label className="fm-co-mono">
        <input type="radio" name="payment-method" checked={selected} onChange={onSelect} disabled={busy} />
        <span>{c("coCard")}</span>
      </label>
      {!tabs && badges}
    </div>
  );
  const body = selected && (
    <>
      {tabs && badges}
      {hosted ? (
        <p {...regionProps("squarePaymentNote")} className="fm-co-note">{c("coSquareNote")}</p>
      ) : configured ? children : (
        <p {...regionProps("stripePaymentRecovery")} role="alert" className="fm-co-note">{c("coStripeConfigError")}</p>
      )}
      {canRetry && (
        <div {...regionProps("stripePaymentRecovery")} className="mt-4 flex flex-col gap-4">
          <p className="fm-co-note">{c("coStripeRetryNote")}</p>
          <button type="button" disabled={busy} onClick={onRetry} className="fm-co-btn-outline fm-co-mono w-full">
            {c("coStripeRetry")}
          </button>
        </div>
      )}
    </>
  );
  // Tabs: the Card tab sits in the row of payment tabs and the panel (a real box, so its Studio padding,
  // background and border still draw) opens full width under the row.
  if (tabs) {
    return (
      <>
        {header}
        {selected && <div {...regionProps("stripePaymentPanel")} className="fm-co-pay-body">{body}</div>}
      </>
    );
  }
  return (
    <div {...regionProps("stripePaymentPanel")}>
      {header}
      {selected && <div className="fm-co-pay-body">{body}</div>}
    </div>
  );
}
