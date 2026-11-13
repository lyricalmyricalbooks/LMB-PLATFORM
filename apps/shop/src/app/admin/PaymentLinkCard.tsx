// Order page › Payment link (code plan 21.2): for an order made with Orders › New order to pay, where its link stands and
// the two ways to send it. Cancelling the order (the order's own Cancel) closes the link.
import "./fulfillment.css";
import { Copy, Mail } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { adminApi } from "./api";
import { linkState, paymentLinkUrl } from "./paymentLinks";
import { SecondaryButton, SectionCard, StatusBadge } from "./riso/components";

const STATE_WORDS = {
  open: { tone: "warning", text: "Waiting for payment" },
  expired: { tone: "danger", text: "Expired" },
  paid: { tone: "success", text: "Paid" },
  cancelled: { tone: "neutral", text: "Closed" },
} as const;

export function PaymentLinkCard({ order }: { order: any }) {
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const state = linkState(order);
  if (!state) return null;
  const url = paymentLinkUrl(order, window.location.origin, import.meta.env.BASE_URL || "/");
  const until = new Date(order.paymentLink.expiresAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast.success("Payment link copied"); }
    catch { toast.error("Could not copy the link"); }
  };
  const email = async () => {
    setSending(true);
    try {
      const res: any = await adminApi.sendPaymentLink(order.id || order.orderId);
      if (res?.error) toast.error(res.error);
      else { setSentTo(res?.to || "the customer"); toast.success(`Sent to ${res?.to || "the customer"}`); }
    } catch (e: any) { toast.error(e?.message || "Could not send the email"); }
    finally { setSending(false); }
  };
  return (
    <SectionCard title="Payment link" actions={<StatusBadge tone={STATE_WORDS[state].tone}>{STATE_WORDS[state].text}</StatusBadge>}>
      <p className="fw-summary">
        {state === "open" && `The customer pays from this link, by card, until ${until}. It opens their order with a Pay now button.`}
        {state === "expired" && `This link closed on ${until} without a payment. Make a new order to pay if they still want it.`}
        {state === "paid" && "The customer paid from their link. This is now an ordinary paid order."}
        {state === "cancelled" && "This order was cancelled, so its link no longer takes payment."}
      </p>
      {order.paymentLink.note && <p className="rp-hint">{`Your note to them: ${order.paymentLink.note}`}</p>}
      {state === "open" && sentTo && <p className="rp-hint">{`Emailed to ${sentTo}.`}</p>}
      {state === "open" && url && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <SecondaryButton size="sm" icon={<Copy size={14} aria-hidden />} onClick={copy}>Copy payment link</SecondaryButton>
          <SecondaryButton size="sm" icon={<Mail size={14} aria-hidden />} onClick={email} disabled={sending}>{sending ? "Sending…" : "Send by email"}</SecondaryButton>
        </div>
      )}
    </SectionCard>
  );
}
