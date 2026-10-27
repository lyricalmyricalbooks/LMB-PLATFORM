// Checkout's order summary (the "slip" beside the form, a tap-to-open bar on phones): the bag's lines, a free gift,
// the pre-order note, code boxes, the ledger (subtotal, discount, shipping, tax, gift cards), the free-shipping nudge,
// the total and the slip's extras. Display only: every amount is worked out in Checkout.tsx, and the charge itself is
// set on the server.
import React from "react";
import { m } from "motion/react";
import { Package } from "lucide-react";
import type { CartItem } from "../../CartContext";
import { regionProps } from "./storefrontRegions";
import { bundleComponents } from "./promotions";
import { componentsSummary } from "./orderLineNotes";
import { linePreorderNote, formatReleaseDate, type bagPreorder } from "./preorder";
import { designNumber } from "./designNumber";

type Copy = (key: string, vars?: Record<string, string | number>) => string;

export function CheckoutOrderSummary({ c, checkoutDesign, cart, booksMap, summaryOpen, setSummaryOpen, itemCount, slipDate, slipNumbers, formatPrice, freeGift, preorderShip, hasCodeBoxes, codeBoxes, itemsSubtotal, discountAmount, appliedDiscount, autoPick, getActiveShippingDetails, needsDeliveryChoice, isFreeShipping, shippingCost, finalShipping, taxCost, taxKnown, giftCardUse, freeShipNudge, cartTotal, finalTotal }: {
  c: Copy; checkoutDesign: any; cart: CartItem[]; booksMap: Map<string, any>;
  summaryOpen: boolean; setSummaryOpen: React.Dispatch<React.SetStateAction<boolean>>; itemCount: string; slipDate: string; slipNumbers: boolean;
  formatPrice: (priceInCAD: number) => string; freeGift: { title: string; photoUrl?: string; variantName?: string } | null | undefined;
  preorderShip: ReturnType<typeof bagPreorder>; hasCodeBoxes: boolean; codeBoxes: React.ReactNode;
  itemsSubtotal: number; discountAmount: number; appliedDiscount: any; autoPick: any; getActiveShippingDetails: () => { serviceName?: string } | null | undefined;
  needsDeliveryChoice: boolean; isFreeShipping: boolean; shippingCost: number; finalShipping: number; taxCost: number; taxKnown: boolean;
  giftCardUse: { code: string; last4: string; minor: number }[]; freeShipNudge: { gap: number; threshold: number } | null | undefined; cartTotal: number; finalTotal: number;
}) {
  return (
    <aside {...regionProps("checkoutSummary")} className="fm-co-aside min-w-0" data-open={summaryOpen ? "true" : "false"}>
      {/* Phones and tablets: a bar (covers, count, total) so the form comes first; tap to open the slip. */}
      <button type="button" onClick={() => setSummaryOpen(o => !o)} aria-expanded={summaryOpen} aria-controls="fm-co-slip"
        data-studio-target="style:checkout|copy:Checkout" data-studio-label="Phone order summary bar" className="fm-co-slipbar">
        <span className="fm-co-covers" aria-hidden="true">
          {cart.slice(0, 3).map(item => <img key={item.lineKey || `${item.id}-${item.variantId || "default"}`} src={item.photoUrl} alt="" loading="lazy" decoding="async" />)}
        </span>
        <span className="fm-co-slipbar-text">
          <span className="fm-co-slipbar-title">{c("coSummary")}</span>
          <span className="fm-co-mono fm-co-muted">{itemCount} · {c(summaryOpen ? "coHideSummary" : "coShowSummary")}</span>
        </span>
        <span className="fm-co-slipbar-total" translate="no">{formatPrice(finalTotal)}</span>
      </button>

      <div id="fm-co-slip" className="fm-co-slip">
        <div {...regionProps("checkoutSlipHead")} className="fm-co-slip-head">
          <h2 className="fm-co-slip-title">{c("coSummary")}</h2>
          <p className="fm-co-slip-meta fm-co-mono" style={{ margin: 0 }}>
            {itemCount}{(checkoutDesign.checkoutSlipShowDate ?? true) && <><br />{slipDate}</>}
          </p>
        </div>

        <div className="fm-co-lines" data-numbers={slipNumbers ? "on" : "off"}>
          {cart.map((item, index) => (
            <div key={item.lineKey || `${item.id}-${item.variantId || "default"}`} className="fm-co-line">
              {slipNumbers && <span className="fm-co-line-num fm-co-mono" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>}
              <img loading="lazy" decoding="async" src={item.photoUrl} alt="" className="fm-co-thumb" />
              <div className="min-w-0">
                <p className="fm-co-line-title">{item.title}</p>
                {item.variantName && <p className="fm-co-line-meta">{item.variantName}</p>}
                {(item.addOns || []).map(addOn => (
                  <p key={addOn.id} className="fm-co-line-meta">{c("cartAddOnLine", { label: addOn.label })}{addOn.text ? ` ${c("cartAddOnText", { text: addOn.text })}` : ""}</p>
                ))}
                {item.giftCardDetails?.recipientEmail && <p className="fm-co-line-meta">{c("coLineGiftCardFor", { recipient: item.giftCardDetails.recipientName || item.giftCardDetails.recipientEmail })}</p>}
                {(() => {
                  const parts = bundleComponents(booksMap.get(item.id)).map(part => ({ ...part, title: booksMap.get(part.id)?.title || "", variantName: part.variantId ? (booksMap.get(part.id)?.variants || []).find((v: any) => v.id === part.variantId)?.name : undefined }));
                  const items = componentsSummary(parts);
                  return items ? <p className="fm-co-line-meta">{c("coLineIncludes", { items })}</p> : null;
                })()}
                {linePreorderNote(item, c) && <p className="fm-co-line-meta">{linePreorderNote(item, c)}</p>}
                {!checkoutDesign.hideCheckoutLowStock && typeof item.stockLimit === "number" && item.stockLimit > 0 && item.stockLimit <= designNumber(checkoutDesign, "lowStockProductThreshold", 3) && (
                  <p className="fm-co-line-meta" style={{ color: "var(--warning, #b45309)" }}>{c("coOnlyLeft", { count: item.stockLimit })}</p>
                )}
                <p className="fm-co-line-qty fm-co-mono">{c("coLineQty", { count: item.quantity })}</p>
              </div>
              <span className="fm-co-line-price" translate="no">{formatPrice(item.price * item.quantity)}</span>
            </div>
          ))}
          {freeGift && (
            <div className="fm-co-line" data-studio-target="copy:Checkout" data-studio-label="Free gift line">
              {slipNumbers && <span className="fm-co-line-num fm-co-mono" aria-hidden="true">{String(cart.length + 1).padStart(2, "0")}</span>}
              {freeGift.photoUrl ? <img loading="lazy" decoding="async" src={freeGift.photoUrl} alt="" className="fm-co-thumb" /> : <span className="fm-co-thumb" aria-hidden="true" />}
              <div className="min-w-0">
                <p className="fm-co-line-title">{c("coFreeGiftLine", { title: freeGift.title })}</p>
                {freeGift.variantName && <p className="fm-co-line-meta">{freeGift.variantName}</p>}
              </div>
              <span className="fm-co-line-price" style={{ color: "var(--success)" }}>{c("coFreeGiftPrice")}</span>
            </div>
          )}
        </div>

        {preorderShip.count > 0 && (
          <p {...regionProps("checkoutPreorder")} role="note" className="fm-co-note" style={{ margin: 0, padding: "16px 24px 0" }}>
            {preorderShip.shipDate ? c("coPreorderNotice", { date: formatReleaseDate(preorderShip.shipDate) }) : c("coPreorderNoticeTba")}
          </p>
        )}

        {hasCodeBoxes && <div className="fm-co-codes fm-co-slip-codes-desktop">{codeBoxes}</div>}

        <dl className="fm-co-ledger">
          <dt>{c("summarySubtotal")}</dt><dd translate="no">{formatPrice(itemsSubtotal)}</dd>
          {discountAmount > 0 && <><dt style={{ color: "var(--success)" }}>{appliedDiscount ? c("summaryDiscount") : c("coAutoDiscountLabel", { title: autoPick?.discount?.title || c("summaryDiscount") })}</dt><dd style={{ color: "var(--success)" }} translate="no">-{formatPrice(discountAmount)}</dd></>}
          <dt>{c("summaryShipping")}{getActiveShippingDetails()?.serviceName ? ` · ${getActiveShippingDetails()?.serviceName}` : ""}</dt>
          <dd>{needsDeliveryChoice ? c("coShipChoose") : isFreeShipping || shippingCost === 0 ? c("coFree") : formatPrice(finalShipping)}</dd>
          <dt>{c("summaryTax")}</dt><dd>{taxCost > 0 || taxKnown ? formatPrice(taxCost) : c("coTaxLater")}</dd>
          {giftCardUse.filter(card => card.minor > 0).map(card => (
            <React.Fragment key={card.code}><dt>{c("coGiftCardSummary", { last4: card.last4 })}</dt><dd translate="no">-{formatPrice(card.minor / 100)}</dd></React.Fragment>
          ))}
        </dl>

        {freeShipNudge && (
          <div className="fm-co-slip-extra" data-studio-target="style:checkout|copy:Checkout" data-studio-label="Free-shipping nudge">
            <div>
              <p className="fm-co-mono">{c("coFreeShipGap", { amount: formatPrice(freeShipNudge.gap) })}</p>
              <div className="mt-2 h-1.5 overflow-hidden bg-slate-200" aria-hidden="true">
                <div className="h-full fm-accent-bg" style={{ width: `${Math.min(100, Math.max(4, (cartTotal / freeShipNudge.threshold) * 100))}%` }} />
              </div>
            </div>
          </div>
        )}

        <div className="fm-co-total">
          <span className="fm-co-total-label">{c("summaryTotal")}</span>
          <m.p key={finalTotal} initial={{ opacity: 0.5 }} animate={{ opacity: 1 }} className="fm-co-total-amount" translate="no">{formatPrice(finalTotal)}</m.p>
        </div>

        {checkoutDesign.showCheckoutReassurance && (
          <div className="fm-co-slip-extra">
            <div {...regionProps("checkoutReassurance")} className="fm-co-box flex items-start gap-3">
              <Package size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">{c("coPacked")}</p>
                <p className="fm-co-note mt-1">{c("coPackedNote")}</p>
              </div>
            </div>
          </div>
        )}

        {(checkoutDesign.checkoutSlipShowFooter ?? true) && c("coSlipFooter") && (
          <p {...regionProps("checkoutSlipFooter")} className="fm-co-slip-foot fm-co-mono" style={{ margin: 0 }}>{c("coSlipFooter")}</p>
        )}
      </div>
    </aside>
  );
}
