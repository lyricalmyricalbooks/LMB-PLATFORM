import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { orderAccessHeaders } from "../../lib/orderAccessClient";
import { functionFetch } from "../../lib/functionsBase";
import { getCopy } from "./storeCopy";
import { regionProps } from "./storefrontRegions";
import { isGiftCardProduct } from "./promotions";

const LEFT = ["shipped", "out_for_delivery", "delivered", "completed", "picked_up", "collected", "cancelled", "refunded"];

/**
 * Whether the shopper can add items to this order from its tracking page (mirrors functions/paymentLinks.js
 * handleCustomerAddOn): a paid order (items taken off is fine) that hasn't left or ended, and isn't itself added items.
 */
export function canAddToOrder(order: any): boolean {
  if (!order || order.shipsWith || order.isTest) return false;
  if (!["paid", "partially_refunded"].includes(String(order.paymentStatus || ""))) return false;
  const status = String(order.status || "").toLowerCase();
  return !LEFT.includes(String(order.fulfillmentStatus || "").toLowerCase()) && !LEFT.includes(status);
}

/** Products a shopper can add: published, priced, not a gift card or a coming-soon book. */
export function addableBooks(books: any[]): any[] {
  return (books || []).filter(b => b?.id && b.status !== "draft" && b.comingSoon !== true && !isGiftCardProduct(b))
    .sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
}

/**
 * Order page › Add something to this order (code plan 24.6). The shopper picks a product; the server makes a second
 * order at the shop's prices that ships in the same parcel with no extra shipping, and the page opens it to pay.
 */
export function AddToOrderBox({ design, order, access, books }: {
  design: any; order: any; access: { email?: string; key?: string }; books: any[];
}) {
  const list = useMemo(() => addableBooks(books), [books]);
  const [open, setOpen] = useState(false);
  const [bookId, setBookId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!canAddToOrder(order) || !list.length) return null;
  const book = list.find(b => b.id === bookId);
  const variants = Array.isArray(book?.variants) ? book.variants : [];
  const copies = Number(quantity);
  const ready = !!book && (!variants.length || !!variantId) && Number.isInteger(copies) && copies >= 1 && copies <= 20;

  const add = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      const id = order.id || order.orderId;
      const response = await functionFetch("createStripeCheckoutSession", {
        method: "POST",
        headers: await orderAccessHeaders(id, access.key),
        body: JSON.stringify({ action: "addToOrder", orderId: id, email: access.email || "", key: access.key || "", lines: [{ id: bookId, variantId: variantId || null, quantity: copies }] }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.orderId || !body.trackingKey) {
        setError(getCopy(design, body.error === "too_many_open" ? "trackAddTooMany" : body.error === "too_many" ? "trackErrTooMany" : typeof body.error === "string" && body.error.length > 20 ? "trackAddUnavailable" : "trackAddError"));
        return;
      }
      // The new order's own page, where the shopper pays for just these items.
      window.location.assign(`${import.meta.env.BASE_URL || "/"}track?orderId=${encodeURIComponent(body.orderId)}&key=${encodeURIComponent(body.trackingKey)}`);
    } catch {
      setError(getCopy(design, "trackAddError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section {...regionProps("trackingAddItems")} className="fm-track-card p-6 sm:p-8 space-y-4">
      <p className="fm-track-mono">{getCopy(design, "trackAddTitle")}</p>
      <p className="text-sm leading-6">{getCopy(design, "trackAddText")}</p>
      {!open ? (
        <button type="button" className="fm-track-btn fm-track-btn-ghost" onClick={() => setOpen(true)}>{getCopy(design, "trackAddOpen")}</button>
      ) : (
        <div className="space-y-3">
          <label className="block space-y-2">
            <span className="fm-track-mono block">{getCopy(design, "trackAddProduct")}</span>
            <select className="fm-track-input" value={bookId} onChange={e => { setBookId(e.target.value); setVariantId(""); }}>
              <option value="">{getCopy(design, "trackAddChoose")}</option>
              {list.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
            </select>
          </label>
          {variants.length > 0 && (
            <label className="block space-y-2">
              <span className="fm-track-mono block">{getCopy(design, "trackAddEdition")}</span>
              <select className="fm-track-input" value={variantId} onChange={e => setVariantId(e.target.value)}>
                <option value="">{getCopy(design, "trackAddChoose")}</option>
                {variants.map((v: any) => <option key={v.id} value={v.id}>{v.name || v.id}</option>)}
              </select>
            </label>
          )}
          <label className="block space-y-2">
            <span className="fm-track-mono block">{getCopy(design, "trackAddQuantity")}</span>
            <input className="fm-track-input" type="number" inputMode="numeric" min={1} max={20} step={1} value={quantity} onChange={e => setQuantity(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="fm-track-btn" onClick={add} disabled={!ready || busy}>
              {busy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} {getCopy(design, "trackAddButton")}
            </button>
            <button type="button" className="fm-track-btn fm-track-btn-ghost" onClick={() => { setOpen(false); setError(""); }} disabled={busy}>{getCopy(design, "trackReqBack")}</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm fm-danger-text">{error}</p>}
    </section>
  );
}
