// Checkout's payment step: the total, the payment choices (the card form comes in as `stripeOption`, wired in
// Checkout.tsx), code boxes, hold and error notices, the policy tick box and the Pay button. Display only: the charge,
// its amount and every payment check stay in Checkout.tsx and on the server.
import type React from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { regionProps } from "./storefrontRegions";
import type { HoldWarning } from "./holdLimits";
import { SectionHead } from "./CheckoutFields";

type Copy = (key: string, vars?: Record<string, string | number>) => string;

export function CheckoutPaymentStep({ c, mark, checkoutDesign, needsDeliveryChoice, formatPrice, finalTotal, payTabs, stripeOption, hasStripe, hasPaypal, isCompleting, selectedPaymentMethod, setSelectedPaymentMethod, enabledManualMethods, hasCodeBoxes, codeBoxes, holdIssues, notice, noticeRef, catalogState, termsRequired, termsAccepted, setTermsAccepted, termsError, policyLinks, payDisabled, paymentLabel, payLabel, payTotal, checkoutPolicies }: {
  c: Copy; mark: (key: string) => string | null; checkoutDesign: any; needsDeliveryChoice: boolean;
  formatPrice: (priceInCAD: number) => string; finalTotal: number; payTabs: boolean; stripeOption: React.ReactNode;
  hasStripe: boolean; hasPaypal: boolean; isCompleting: boolean; selectedPaymentMethod: string; setSelectedPaymentMethod: (method: string) => void;
  enabledManualMethods: any[]; hasCodeBoxes: boolean; codeBoxes: React.ReactNode; holdIssues: HoldWarning[];
  notice: null | { tone: "error" | "info"; text: string }; noticeRef: React.RefObject<HTMLDivElement | null>;
  catalogState: "loading" | "ready" | "failed"; termsRequired: boolean; termsAccepted: boolean; setTermsAccepted: (accepted: boolean) => void;
  termsError: boolean; policyLinks: React.ReactNode; payDisabled: boolean; paymentLabel: string; payLabel: string; payTotal: string; checkoutPolicies: string[];
}) {
  return (
    <section className="fm-co-section">
      <SectionHead marker={mark("pay")} title={c("coPayment")} />
      {c("coPaymentNote") && <p className="fm-co-note">{c("coPaymentNote")}</p>}
      {!checkoutDesign.hideCheckoutPaymentTotal && <div data-studio-target="copy:Checkout|style:checkout" data-studio-label="Payment total" className="fm-co-mono flex items-baseline justify-between gap-4" aria-live="polite"><span className="fm-co-muted">{c("summaryTotal")}</span><strong className="font-normal" translate="no">{needsDeliveryChoice ? c("coPaymentTotalPending") : formatPrice(finalTotal)}</strong></div>}
      <div className="fm-co-pay" data-pay-tabs={payTabs ? "tabs" : "list"}>
        {stripeOption}
        {hasPaypal && (
          <label className="fm-co-pay-tab fm-co-mono" data-studio-target="copy:Checkout" data-studio-label="PayPal option">
            <input type="radio" name="payment-method" disabled={isCompleting} checked={selectedPaymentMethod === "paypal"} onChange={() => setSelectedPaymentMethod("paypal")} />
            <span>{c("coPaypalOption")}</span>
          </label>
        )}
        {enabledManualMethods.map((method: any) => (
          <label key={method.id} className="fm-co-pay-tab fm-co-mono">
            <input type="radio" name="payment-method" disabled={isCompleting} checked={selectedPaymentMethod === `manual_${method.id}`} onChange={() => setSelectedPaymentMethod(`manual_${method.id}`)} />
            <span>{method.name}</span>
          </label>
        ))}
        {!hasStripe && !hasPaypal && enabledManualMethods.length === 0 && (
          <div className="fm-co-empty fm-co-pay-body flex items-start gap-3">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-600" />
            {c("coNoPayment")}
          </div>
        )}
      </div>
      {hasCodeBoxes && <div className="fm-co-codes fm-co-pay-codes">{codeBoxes}</div>}

      {holdIssues.length > 0 && (
        <div {...regionProps("checkoutHoldWarning")} role="status" className="space-y-2 border px-4 py-3 text-sm" style={{ borderColor: "var(--warning, #b45309)", color: "var(--warning, #b45309)" }}>
          {holdIssues.map(issue => (
            <p key={issue.kind === "perBook" ? issue.id : "units"}><span aria-hidden="true">⚠ </span>{issue.kind === "perBook"
              ? c("coHoldWarning", { count: issue.count, title: issue.title, limit: issue.limit })
              : c("coHoldWarningUnits", { count: issue.count, limit: issue.limit })}</p>
          ))}
        </div>
      )}
      {notice && (
        <div ref={noticeRef} role={notice.tone === "error" ? "alert" : "status"} className="border px-4 py-3 text-sm"
          style={{ borderColor: notice.tone === "error" ? "var(--danger, #b4271a)" : "var(--muted, #94a3b8)", color: notice.tone === "error" ? "var(--danger, #b4271a)" : "inherit", background: notice.tone === "error" ? "rgba(var(--danger-rgb, 232, 64, 42), .08)" : "transparent" }}>
          <span aria-hidden="true">{notice.tone === "error" ? "✕ " : "ℹ "}</span>{notice.text}
        </div>
      )}
      {catalogState === "failed" && !notice && (
        <p role="alert" className="text-sm" style={{ color: "var(--danger, #b4271a)" }}>{c("coCatalogFailed")}</p>
      )}
      {termsRequired && (
        <div data-studio-target="copy:Checkout|style:checkout" data-studio-label="Policy tick box" className="text-sm leading-6">
          <label htmlFor="checkout-terms" className="flex items-start gap-2.5">
            <input id="checkout-terms" type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)}
              aria-invalid={termsError || undefined} aria-describedby={termsError ? "checkout-terms-error" : undefined}
              className="mt-1 h-4 w-4 shrink-0 accent-[color:var(--accent)]" />
            <span>{c("coTermsAgree")}{" "}{policyLinks}</span>
          </label>
          {termsError && <p id="checkout-terms-error" className="mt-1 text-xs" style={{ color: "var(--danger, #b4271a)" }}>{c("coErrTerms")}</p>}
        </div>
      )}
      <button type="submit" disabled={payDisabled} aria-label={isCompleting ? undefined : paymentLabel}
        className={`fm-co-paybtn fm-co-paybtn-main${isCompleting ? " fm-co-paybtn-busy" : ""}`}>
        {isCompleting
          ? <><Loader2 size={20} className="animate-spin" aria-hidden="true" /> {c("coProcessing")}</>
          : <><span>{payLabel}</span>{payTotal && <span translate="no">{payTotal}</span>}</>}
      </button>
      {c("coGuarantee") && (
        <p {...regionProps("checkoutPromise")} className="fm-co-note text-center">{c("coGuarantee")}</p>
      )}
      <div className="flex flex-col gap-2">
        {c("coPrivacyNote") && <p className="fm-co-fine fm-co-mono" data-studio-target="copy:Checkout" data-studio-label="Payment privacy note">{c("coPrivacyNote")}</p>}
        {!termsRequired && !checkoutDesign.hideCheckoutPolicyLinks && checkoutPolicies.length > 0 && (
          // Card networks and PayPal expect the refund/terms policies to be visible where shoppers pay.
          <p data-studio-target="copy:Checkout|style:checkout" data-studio-label="Checkout policy links" className="fm-co-fine fm-co-mono">
            {c("coPolicyAgree")}{" "}{policyLinks}
          </p>
        )}
      </div>
    </section>
  );
}
