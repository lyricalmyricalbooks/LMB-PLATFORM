// Order page › Pay now (code plan 21.3): an order the shop made for this customer, paid on the shop's own card page
// (Stripe or Square). The server prices it from the agreed prices; nothing here decides an amount.
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { functionFetch } from "../../lib/functionsBase";
import { orderAccessHeaders } from "../../lib/orderAccessClient";
import { useCurrency } from "../../CurrencyContext";
import { getCopy } from "./storeCopy";
import { regionProps } from "./storefrontRegions";
import { payLinkState, payLinkUntil } from "./payLinkState";
import { shopCurrency } from "../../../lib/shopProfile";

export function PaymentLinkPay({ order, design, accessKey, hidePay = false }: { order: any; design: any; accessKey?: string; hidePay?: boolean }) {
  const { currency } = useCurrency();
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState("");
  const state = payLinkState(order);
  if (!state) return null;
  const orderId = order.id || order.orderId;
  const pay = async () => {
    if (opening) return;
    setOpening(true);
    setFailed("");
    try {
      // Back to this order page after paying or going back (never the bag's checkout page, which would empty the bag).
      const returnUrl = `${window.location.origin}${import.meta.env.BASE_URL}track?orderId=${encodeURIComponent(orderId)}`;
      const response = await functionFetch("createStripeCheckoutSession", {
        method: "POST",
        headers: await orderAccessHeaders(orderId, accessKey),
        body: JSON.stringify({ orderId, currency: String(currency || shopCurrency()).toLowerCase(), returnUrl, embedded: false }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.url) {
        // The server's own words when it refused (expired, changed, shop paused); otherwise the shop's.
        setFailed(typeof data.error === "string" && data.code ? data.error : getCopy(design, "trackPayError"));
        setOpening(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setFailed(getCopy(design, "trackPayError"));
      setOpening(false);
    }
  };
  return (
    <div {...regionProps("trackingStatusBanner")} role="status" className="fm-track-notice" data-tone={state === "pay" ? "warning" : "danger"}
      data-studio-target="copy:Order tracking" data-studio-label="Payment link">
      <div>
        <p>{getCopy(design, state === "pay" ? "trackPayText" : "trackPayExpired")}</p>
        {order.paymentLink.note && <p style={{ marginTop: 8 }}>{order.paymentLink.note}</p>}
        {state === "pay" && <p style={{ marginTop: 8 }}>{getCopy(design, "trackPayUntil", { date: payLinkUntil(order) })}</p>}
        {failed && <p role="alert" style={{ marginTop: 8 }}><strong>{failed}</strong></p>}
      </div>
      {state === "pay" && !hidePay && (
        <button type="button" onClick={pay} disabled={opening} className="fm-track-btn">
          {opening && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} {getCopy(design, opening ? "trackPayOpening" : "trackPayNow")}
        </button>
      )}
    </div>
  );
}
