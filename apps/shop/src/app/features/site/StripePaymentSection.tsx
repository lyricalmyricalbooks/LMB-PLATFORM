import type { ReactNode } from "react";
import { getCopy } from "./storeCopy";
import { regionProps, regionVisible } from "./storefrontRegions";

/** Payment fields must live outside the radio label: label activation and
 * preventDefault handlers interfere with Stripe's own interactive iframe. */
export function StripePaymentSection({ design, selected, configured, canRetry, busy, onSelect, onRetry, tabs = false, children }: {
  design: any;
  selected: boolean;
  configured: boolean;
  canRetry: boolean;
  busy: boolean;
  onSelect: () => void;
  onRetry: () => void;
  /** Checkout's order-slip look: payment choices sit side by side as tabs, the card badges move under them. */
  tabs?: boolean;
  children: ReactNode;
}) {
  const c = (key: string) => getCopy(design, key);
  const brands = c("coCardBrands").split(",").map(brand => brand.trim()).filter(Boolean).filter(brand => !/^(apple\s*pay|google\s*pay|link|paypal|amazon\s*pay|klarna)$/i.test(brand));
  const badges = regionVisible(design, "stripeBrands") && brands.length > 0 && (
    <div {...regionProps("stripeBrands")} className="fm-co-brands" aria-label={c("coCardsAria")}>
      {brands.map((brand, index) => <span key={index}>{brand}</span>)}
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
      {configured ? children : (
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
