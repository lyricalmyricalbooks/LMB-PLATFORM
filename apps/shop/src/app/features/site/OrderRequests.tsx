import { orderAccessHeaders } from "../../lib/orderAccessClient";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { functionFetch } from "../../lib/functionsBase";
import { getCopy } from "./storeCopy";
import { regionProps } from "./storefrontRegions";

const SHIPPED = ["shipped", "out_for_delivery", "delivered", "completed", "picked_up", "collected"];

/**
 * Which request the shopper may make for this order (mirrors functions/customerRequests.js).
 * Only cancelling, and only before the parcel ships: the shop doesn't take returns (owner's
 * decision, October 2026).
 */
export function requestOptions(order: any): { cancel: boolean } {
  if (!order) return { cancel: false };
  const status = String(order.status || "").toLowerCase();
  const payment = String(order.paymentStatus || "").toLowerCase();
  if (status === "cancelled" || status === "refunded" || payment.startsWith("refund")) return { cancel: false };
  const fulfillment = String(order.fulfillmentStatus || "").toLowerCase();
  const shipped = SHIPPED.includes(fulfillment) || SHIPPED.includes(status);
  return { cancel: !shipped };
}

/**
 * "Ask to cancel" on the order-tracking page (until the order ships). Sends a request the shop
 * answers by email; it never cancels, refunds or restocks anything by itself.
 */
export function OrderRequestBox({ design, order, access, onUpdated }: {
  design: any; order: any; access: { email?: string; key?: string }; onUpdated: (order: any) => void;
}) {
  const [type, setType] = useState<"" | "cancel">("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const options = requestOptions(order);
  const open = order?.customerRequest?.status === "open";
  const progress = order?.returnProgress;
  if (progress) return <section {...regionProps("trackingRequests")} className="fm-track-card p-6 sm:p-8 space-y-4">
    <p className="fm-track-mono">{getCopy(design, "trackReturnHeading")}</p>
    <p role="status">{getCopy(design, `trackReturn_${progress.state}`)}</p>
    {progress.instructions && <p className="whitespace-pre-wrap text-sm leading-6">{progress.instructions}</p>}
    <ol className="list-none p-0 space-y-2">
      {["approved", "received", "inspected"].filter(step => progress[`${step}At`]).map(step => <li key={step}>{getCopy(design, `trackReturn_${step}`)} · {new Date(progress[`${step}At`]).toLocaleDateString()}</li>)}
    </ol>
  </section>;
  if (!open && !options.cancel) return null;

  const send = async () => {
    if (!type || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await functionFetch("createStripeCheckoutSession", {
        method: "POST",
        headers: await orderAccessHeaders(order.id || order.orderId, access.key),
        body: JSON.stringify({ action: "orderRequest", orderId: order.id || order.orderId, email: access.email || order.customer?.email || "", key: access.key || "", type, message }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(getCopy(design, body.error === "already_shipped" ? "trackReqErrShipped" : body.error === "too_many" ? "trackErrTooMany" : "trackReqError"));
        return;
      }
      setType("");
      setMessage("");
      if (body.order) onUpdated(body.order);
    } catch {
      setError(getCopy(design, "trackReqError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section {...regionProps("trackingRequests")} className="fm-track-card p-6 sm:p-8 space-y-4">
      <p className="fm-track-mono">{getCopy(design, "trackReqHeading")}</p>
      {open ? (
        <p role="status" className="text-sm leading-6">{getCopy(design, order.customerRequest.type === "cancel" ? "trackReqOpenCancel" : "trackReqOpenReturn")}</p>
      ) : !type ? (
        <div className="flex flex-wrap gap-3">
          <button type="button" className="fm-track-btn fm-track-btn-ghost" onClick={() => setType("cancel")}>{getCopy(design, "trackReqCancel")}</button>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block space-y-2">
            <span className="fm-track-mono block">{getCopy(design, "trackReqMessageLabel")}</span>
            <textarea className="fm-track-input py-3" rows={3} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="fm-track-btn" onClick={send} disabled={busy}>
              {busy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} {getCopy(design, "trackReqSendCancel")}
            </button>
            <button type="button" className="fm-track-btn fm-track-btn-ghost" onClick={() => { setType(""); setError(""); }} disabled={busy}>{getCopy(design, "trackReqBack")}</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm fm-danger-text">{error}</p>}
    </section>
  );
}

/** "Your data": ask for a copy, or for deletion. The shop confirms by email before acting. */
export function PrivacyRequestBox({ design }: { design: any }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"" | "busy" | "sent" | "error">("");
  const send = async (type: "export" | "delete") => {
    if (!email.trim() || state === "busy") return;
    setState("busy");
    try {
      const response = await functionFetch("createStripeCheckoutSession", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "privacyRequest", email: email.trim(), type }),
      });
      setState(response.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  };
  return (
    <section {...regionProps("trackingPrivacy")} className="max-w-xl mx-auto mt-12 fm-track-card p-6 sm:p-8 space-y-4">
      <p className="fm-track-mono">{getCopy(design, "trackPrivacyHeading")}</p>
      <p className="text-sm leading-6 fm-muted">{getCopy(design, "trackPrivacyText")}</p>
      {state === "sent" ? (
        <p role="status" className="text-sm leading-6">{getCopy(design, "trackPrivacySent")}</p>
      ) : (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); send("export"); }}>
          <label className="block space-y-2">
            <span className="fm-track-mono block">{getCopy(design, "trackPrivacyEmail")}</span>
            <input type="email" required autoComplete="email" className="fm-track-input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-3">
            <button type="submit" className="fm-track-btn fm-track-btn-ghost" disabled={state === "busy"}>{getCopy(design, "trackPrivacyExport")}</button>
            <button type="button" className="fm-track-btn fm-track-btn-ghost" disabled={state === "busy"} onClick={(e) => { if ((e.currentTarget.form as HTMLFormElement)?.reportValidity()) send("delete"); }}>{getCopy(design, "trackPrivacyDelete")}</button>
          </div>
          {state === "error" && <p role="alert" className="text-sm fm-danger-text">{getCopy(design, "trackPrivacyError")}</p>}
        </form>
      )}
    </section>
  );
}
