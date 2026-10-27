import React from "react";
import { Check, MapPin, Package, Truck, ExternalLink } from "lucide-react";
import {
  addressIssues,
  addressKey,
  packingKey,
  physicalItems,
  isDigitalItem,
  queueOf,
  daysInTransit,
  isOverdueInTransit,
  packingInfo,
  preorderShipDate,
  blockingProblem,
  terminal,
} from "./fulfillment";
import { labelVoidable, labelRefunds, refundWords } from "./labelRefunds";
import { getTrackingUrl } from "../lib/tracking";
import { formatReleaseDate } from "../features/site/preorder";
import { addOnLines, bundlePartsText, giftCardLineText, isFreeGiftLine, isGiftCardLine, linePricing, cad } from "./orderLines";
import {
  Checkbox,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
} from "./riso/components";
import "./fulfillment.css";

type Props = {
  order: any;
  /** Catalog records by book id, for the current cover and shelf location. */
  books?: Record<string, any>;
  checked: Set<number>;
  busy: boolean;
  onCheck: (index: number) => void;
  onReview: () => void;
  onCorrect: () => void;
  onPack: () => void;
  /** Opens a label purchase elsewhere. Unused when `labelStep` is given. */
  onLabel?: () => void;
  /** Ship station: the parcel, rates and Buy label, drawn inside step 3 instead of the Buy label button. */
  labelStep?: React.ReactNode;
  onDispatch: () => void;
  onEditTracking?: () => void;
  onDeliveryStatus?: (status: "out_for_delivery" | "delivered") => void;
  onResendEmail?: () => void;
  onCheckAll?: (indices: number[]) => void;
  onPackingSlip?: () => void;
  onLocalAdvance: () => void;
  onRelease: () => void;
  /** Pre-ordered books arrived early: let an "Awaiting release" order be packed now. */
  onReleasePreorder?: () => void;
  /** Owner checked Shippo after an uncertain label purchase: unlock buying a new label. */
  onClearLabelLock?: () => void;
  /** The label is wrong (weight, address, service): void it and buy another before the parcel leaves. */
  onReplaceLabel?: () => void;
  /** A label bought in the inventory app won't be used: take its tracking off this order. */
  onClearAppLabel?: () => void;
};
export function FulfillmentWorkbench({
  order,
  checked,
  busy,
  onCheck,
  onReview,
  onCorrect,
  onPack,
  onLabel,
  onDispatch,
  onEditTracking,
  onDeliveryStatus,
  onResendEmail,
  onCheckAll,
  onPackingSlip,
  onLocalAdvance,
  onRelease,
  onReleasePreorder,
  onClearLabelLock,
  onReplaceLabel,
  onClearAppLabel,
  labelStep,
  books,
}: Props) {
  const queue = queueOf(order);
  const addr = order.customer?.address || {};
  const reviewed = order.operations?.addressReviewed === addressKey(order);
  const packed = order.operations?.packed === packingKey(order);
  const shipping = physicalItems(order).length > 0;
  const method = order.fulfillmentSelection?.method || "shipping";
  const active =
    ["Needs attention", "Ready to pack", "Ready to ship", "Ready for pickup", "Ready for local delivery"].includes(queue) &&
    !order.isTest;
  const hold = order.operations?.hold;
  const issues = active ? addressIssues(order) : [];
  const labelPending = order.operations?.labelPurchasePending;
  // A Shippo test-key label carries no parcel: shipping on it would email a dead tracking number.
  const testLabel = !!order.labelUrl && order.operations?.labelTest === true;
  const addressActive = active && method !== "pickup" && !reviewed && !hold;
  const packingActive = queue === "Ready to pack";
  const shippingActive = queue === "Ready to ship";
  const copies = physicalItems(order).reduce((n: number, i: any) => n + (Number(i.quantity) || 0), 0);
  const root = React.useRef<HTMLElement>(null);
  const goToStep = (key: string) => {
    const el = root.current?.querySelector<HTMLElement>(`.fw-step[data-step="${key}"]`);
    if (!el) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };
  return (
    <section
      ref={root}
      className="rp-card fw-workbench"
      aria-label="Fulfillment workspace"
    >
      <div className="rp-card-head">
        <h2 className="rp-card-title">Fulfillment</h2>
        <StatusBadge
          tone={
            queue === "Needs attention"
              ? "warning"
              : queue === "Completed"
                ? "success"
                : "neutral"
          }
        >
          {queue}
        </StatusBadge>
      </div>
      {shipping && method === "shipping" && order.paymentStatus === "paid" && !terminal(order) && (
        <ol className="fw-strip" aria-label="Steps">
          {([
            { key: "address", done: reviewed, now: addressActive, title: reviewed ? "Address checked" : "Check the address", sub: [addr.city, addr.state, addr.zip].filter(Boolean).join(" ") },
            { key: "pack", done: packed, now: packingActive, title: packed ? "Packed" : "Pack", sub: `${copies} book${copies === 1 ? "" : "s"}` },
            {
              key: "ship",
              done: ["In transit", "Completed"].includes(queue),
              now: shippingActive,
              title: ["In transit", "Completed"].includes(queue) ? "Shipped" : order.labelUrl ? "Hand over & ship" : "Label & ship",
              sub: ["In transit", "Completed"].includes(queue) ? order.trackingNumber || "Sent" : order.labelUrl ? "Label bought" : "Parcel and rate",
            },
          ]).map((step, i) => (
            <li key={i} className="fw-strip-step" data-state={step.done ? "done" : step.now ? "now" : "todo"} aria-current={step.now ? "step" : undefined}>
              {/* A tap on a step scrolls to it: on a phone the steps sit one under the other, far apart. */}
              <button type="button" className="fw-strip-go" aria-current={step.now ? "step" : undefined} onClick={() => goToStep(step.key)}>
                <span className="fw-strip-mark rp-mono" aria-hidden="true">{step.done ? "✓" : i + 1}</span>
                <span>
                  <span className="rp-label">Step {i + 1}{step.now ? " · now" : ""}</span>
                  <strong>{step.title}</strong>
                  {step.sub ? <span className="rp-hint">{step.sub}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {blockingProblem(order) && !(hold && active) && (
        <div className="fw-notice" role="alert">
          <div>
            <strong>What's blocking this</strong>
            <p>{blockingProblem(order)}</p>
          </div>
        </div>
      )}
      {hold && active && (
        <div className="fw-notice" role="status">
          <div>
            <strong>Order on hold</strong>
            <p>{hold}</p>
          </div>
          <SecondaryButton disabled={busy} onClick={onRelease}>
            Release hold
          </SecondaryButton>
        </div>
      )}
      {queue === "Awaiting release" && (
        <div className="fw-notice" role="status">
          <div>
            <strong>Pre-order — waiting for release</strong>
            <p>
              {preorderShipDate(order)
                ? `Ships from ${formatReleaseDate(preorderShipDate(order), "en-CA")}. It moves to Ready to pack on that day by itself.`
                : "The release date hasn't been announced. Setting it in Books › edit › Inventory updates this order; press Ready to ship now when the books arrive."}
            </p>
          </div>
          {onReleasePreorder && !order.isTest && (
            <SecondaryButton disabled={busy} onClick={onReleasePreorder}>
              Ready to ship now
            </SecondaryButton>
          )}
        </div>
      )}
      {queue === "Unpaid" && (
        <p className="fw-notice">
          Payment has not been confirmed. Fulfillment will unlock when payment
          clears.
        </p>
      )}
      {!shipping && order.items?.length > 0 && (
        <p className="fw-notice">
          Digital order — download access is handled automatically after
          payment. No parcel is required.
        </p>
      )}
      {order.status === "cancelled" && (
        <p className="fw-notice">This order is cancelled.</p>
      )}
      {shipping && onReplaceLabel && labelVoidable(order) && !shippingActive && (
        <div className="fw-notice" role="status">
          <div>
            <strong>Unused label</strong>
            <p>
              {terminal(order)
                ? `This order is cancelled or refunded, but label ${order.trackingNumber || ""} was never used. Void it to get the postage back from Shippo.`
                : `Label ${order.trackingNumber || ""} hasn't left the shop. If it won't be used, void it to get the postage back from Shippo.`}
            </p>
          </div>
          <SecondaryButton disabled={busy} onClick={onReplaceLabel}>
            Void label for a refund
          </SecondaryButton>
        </div>
      )}
      {labelRefunds(order).length > 0 && (
        <div className="fw-notice" role="status">
          <div>
            <strong>Shippo label refunds</strong>
            {labelRefunds(order).map((entry, index) => (
              <p key={`${entry.transactionId || entry.trackingNumber}-${index}`}>
                <StatusBadge tone={entry.state === "refunded" ? "success" : entry.state === "rejected" ? "danger" : "info"}>
                  {entry.state === "refunded" ? "Refunded" : entry.state === "rejected" ? "Rejected" : "Pending"}
                </StatusBadge>{" "}
                {refundWords(entry)}
              </p>
            ))}
          </div>
        </div>
      )}
      {shipping && method !== "pickup" && (
        <div className="fw-step" data-step="address" data-active={addressActive}>
          <div className="fw-step-heading">
            <span className="fw-step-icon" aria-hidden="true">
              {reviewed ? <Check size={18} /> : <MapPin size={18} />}
            </span>
            <div>
              <h3>Shipping address</h3>
              {reviewed && <span className="rp-hint">Reviewed</span>}
            </div>
            {active && reviewed && !order.labelUrl && !labelPending && (
              <SecondaryButton size="sm" onClick={onCorrect} disabled={busy}>
                Edit
              </SecondaryButton>
            )}
          </div>
          {!reviewed || !active ? (
            <address className="fw-address">
              <strong>{order.customer?.name}</strong>
              <span>{[addr.street, addr.unit].filter(Boolean).join(", ")}</span>
              <span>
                {addr.city}
                {addr.state ? `, ${addr.state}` : ""} {addr.zip}
              </span>
              <span>{addr.country}</span>
            </address>
          ) : (
            <details className="fw-address-details">
              <summary>
                {addr.city}, {addr.state} {addr.zip} · {addr.country}
              </summary>
              <address className="fw-address">
                <strong>{order.customer?.name}</strong>
                <span>{[addr.street, addr.unit].filter(Boolean).join(", ")}</span>
                <span>
                  {addr.city}, {addr.state} {addr.zip}
                </span>
                <span>{addr.country}</span>
              </address>
            </details>
          )}
          {addressActive && (
            <>
              {issues.length > 0 && (
                <ul className="fw-problems" role="alert">
                  {issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              )}
              <div className="fw-actions">
                {issues.length ? (
                  <PrimaryButton disabled={busy} onClick={onCorrect}>
                    Correct address
                  </PrimaryButton>
                ) : (
                  <PrimaryButton disabled={busy} onClick={onReview}>
                    Confirm address
                  </PrimaryButton>
                )}
                {!issues.length && (
                  <SecondaryButton disabled={busy} onClick={onCorrect}>
                    Edit address
                  </SecondaryButton>
                )}
              </div>
            </>
          )}
        </div>
      )}
      <div className="fw-step" data-step="pack" data-active={packingActive}>
        <div className="fw-step-heading">
          <span className="fw-step-icon" aria-hidden="true">
            {packed ? <Check size={18} /> : <Package size={18} />}
          </span>
          <div>
            <h3>{shipping ? "Books to pack" : "Order items"}</h3>
            <span className="rp-hint">
              {packed
                ? "All books packed"
                : (() => { const n = (order.items || []).reduce((sum: number, i: any) => sum + Number(i.quantity || 0), 0); return `${n} item${n === 1 ? "" : "s"}`; })()}
            </span>
          </div>
        </div>
        {packingActive && (onCheckAll || onPackingSlip) && (
          <div className="fw-actions">
            {onCheckAll && physicalItems(order).length > 1 && (
              <SecondaryButton
                disabled={busy}
                onClick={() =>
                  onCheckAll(
                    (order.items || [])
                      .map((item: any, index: number) => (isDigitalItem(item) ? -1 : index))
                      .filter((index: number) => index >= 0),
                  )
                }
              >
                Tick all {physicalItems(order).length} lines
              </SecondaryButton>
            )}
            {onPackingSlip && (
              <SecondaryButton disabled={busy} onClick={onPackingSlip}>
                Print packing slip
              </SecondaryButton>
            )}
          </div>
        )}
        <ul className="fw-items" aria-label="Order items">
          {(order.items || []).map((item: any, index: number) => (
            <li
              key={index}
              data-tick={packingActive && !isDigitalItem(item) && !busy ? "true" : undefined}
              // While packing, a tap anywhere on the line ticks it (the checkbox alone is a small target on a phone).
              onClick={(e) => {
                if (!packingActive || isDigitalItem(item) || busy) return;
                // Selecting a title to copy it (drag or double-click) is not a tick.
                if (e.detail > 1 || (typeof window !== "undefined" && window.getSelection?.()?.isCollapsed === false)) return;
                if ((e.target as HTMLElement).closest("input, label, button, a, summary")) return;
                onCheck(index);
              }}
            >
              {packingActive && !isDigitalItem(item) ? (
                <Checkbox
                  label=""
                  aria-label={`Packed ${item.quantity} × ${item.title}`}
                  checked={checked.has(index)}
                  disabled={busy}
                  onChange={() => onCheck(index)}
                />
              ) : packed && !isDigitalItem(item) ? (
                <Check
                  className="fw-item-check"
                  size={16}
                  aria-label="Packed"
                />
              ) : null}
              {(() => {
                const info = packingInfo(item, books?.[item.id]);
                return (
                  <>
                    {info.photo ? (
                      <img className="fw-item-cover" src={info.photo} alt="" width="48" height="64" loading="lazy" />
                    ) : (
                      <span className="fw-item-cover fw-item-cover-empty" aria-hidden="true" />
                    )}
                    <div className="fw-item-name">
                      <strong>{item.title}</strong>
                      <span className="rp-hint">
                        {[item.variantName, item.format, item.sku]
                          .filter(Boolean)
                          .join(" · ")}
                        {isDigitalItem(item) && !isGiftCardLine(item) ? " · Digital" : ""}
                        {item.preorder ? ` · Pre-order${item.releaseDate ? ` (releases ${formatReleaseDate(item.releaseDate, "en-CA")})` : ""}` : ""}
                      </span>
                      {isFreeGiftLine(item) && <span><StatusBadge tone="success">Free gift</StatusBadge></span>}
                      {isGiftCardLine(item) && <span className="rp-hint">{giftCardLineText(item, order)}</span>}
                      {bundlePartsText(item) && (
                        <span className="fw-item-extra">Box set — includes {bundlePartsText(item)}{Number(item.quantity) > 1 ? " in each set" : ""}</span>
                      )}
                      {addOnLines(item).length > 0 && (
                        <ul className="fw-item-addons" aria-label={`Extras for ${item.title}`}>
                          {addOnLines(item).map((line, n) => <li key={n}><strong>{line}</strong>{Number(item.quantity) > 1 ? ` (each of ${item.quantity} copies)` : ""}</li>)}
                        </ul>
                      )}
                      {info.shelf && !isDigitalItem(item) && (
                        <span className="fw-item-shelf">Shelf {info.shelf}</span>
                      )}
                    </div>
                  </>
                );
              })()}
              <span className="fw-quantity">
                × {item.quantity}
                {(() => {
                  const p = linePricing(item);
                  return (
                    <span className="rp-hint rp-mono" style={{ display: "block" }}>
                      {cad(p.unit)} each{p.base != null && p.addOns.length ? ` (${cad(p.base)} + ${p.addOns.map((a) => `${a.label} ${cad(a.price)}`).join(" + ")})` : ""}
                      <br />
                      {cad(p.total)}
                    </span>
                  );
                })()}
              </span>
            </li>
          ))}
        </ul>
        {!order.items?.length && (
          <p className="fw-problems" role="alert">
            This order has no items. Resolve the order data before fulfillment.
          </p>
        )}
        {packingActive && (
          <div className="fw-actions">
            <PrimaryButton
              disabled={busy || (physicalItems(order).length > 1 && checked.size !== physicalItems(order).length)}
              onClick={onPack}
            >
              Confirm packed
            </PrimaryButton>
            <span className="rp-hint">
              {physicalItems(order).length > 1
                ? `${checked.size} of ${physicalItems(order).length} lines checked`
                : "One line — confirm once it's in the box"}
            </span>
          </div>
        )}
      </div>
      {shipping && method !== "pickup" && (
        <div className="fw-step" data-step="ship" data-active={shippingActive}>
          <div className="fw-step-heading">
            <span className="fw-step-icon" aria-hidden="true">
              <Truck size={18} />
            </span>
            <div>
              <h3>Shipping & dispatch</h3>
              <span className="rp-hint">
                {queue === "In transit"
                  ? "Handed to carrier"
                  : queue === "Completed"
                    ? "Closed"
                    : order.labelUrl
                      ? "Label purchased · awaiting dispatch"
                      : shippingActive
                        ? "Now · parcel, label, then mark shipped"
                        : "After packing"}
              </span>
            </div>
          </div>
          {labelPending && active && !order.labelUrl ? (
            <>
              <p className="fw-problems" role="alert">
                A label purchase needs checking.{" "}
                <a
                  href="https://app.goshippo.com/orders"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open Shippo
                </a>{" "}
                before trying again.
                {order.operations?.shippoTransactionId && (
                  <> Shippo transaction: <span className="rp-mono">{order.operations.shippoTransactionId}</span> (search for it under Shippo › Labels).</>
                )}
              </p>
              {onClearLabelLock && (
                <div className="fw-actions">
                  <SecondaryButton disabled={busy} onClick={onClearLabelLock}>
                    I've checked Shippo — allow a new label
                  </SecondaryButton>
                </div>
              )}
            </>
          ) : (
            shippingActive && (
              <>
                {order.shippingMethod && (
                  <p className="fw-summary">
                    Customer chose: <strong>{order.shippingMethod}</strong>
                    {Number.isFinite(Number(order.shipping)) ? ` · paid CA$${Number(order.shipping).toFixed(2)}` : ""}
                  </p>
                )}
                {testLabel && (
                  <p className="fw-problems" role="alert"><StatusBadge tone="warning">TEST label</StatusBadge> Not a real postage label: it was bought with a Shippo test key, so it won't carry a parcel or track. Use <strong>Wrong label? Replace it</strong> and buy again with your live key before shipping.</p>
                )}
                {!order.labelUrl && order.trackingSource === "inventory-app" && order.trackingNumber && (
                  <p className="fw-summary" role="status">
                    <StatusBadge tone="info">Inventory app</StatusBadge> Label bought in the inventory app · {order.trackingCarrier || "Carrier"} · {order.trackingNumber}
                    {Number.isFinite(Number(order.operations?.externalLabel?.cost)) && order.operations?.externalLabel?.cost != null ? ` · CA$${Number(order.operations.externalLabel.cost).toFixed(2)}` : ""}.
                    {" "}Marking the parcel shipped there dispatches this order and emails the customer. Don't buy a second label here.
                    {onClearAppLabel && <>{" "}<button type="button" className="rp-link" style={{ background: "none", border: 0, padding: 0, cursor: "pointer", textDecoration: "underline", color: "inherit" }}
                      disabled={busy} onClick={onClearAppLabel}>Remove the inventory app label</button></>}
                  </p>
                )}
                <p className="fw-summary">
                  {order.labelUrl
                    ? `Label bought · ${order.trackingCarrier || "Carrier"} · ${order.trackingNumber || "Tracking pending"}. Print it, hand the parcel to the carrier, then mark it shipped — you can add or check the tracking link the customer's email uses.`
                    : labelStep
                      ? "Choose the parcel and a rate, buy the label and print it. Mark the parcel shipped when it leaves: that sends the customer's shipping email."
                      : "Buy a Shippo label, or enter the carrier, tracking number and tracking link yourself. The customer's shipping email uses them when you mark it shipped."}
                </p>
                <div className="fw-actions">
                  {order.labelUrl ? (
                    <>
                      <a
                        className="rp-btn rp-btn-secondary"
                        href={order.labelUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink size={14} aria-hidden="true" />
                        Print label
                      </a>
                      <PrimaryButton onClick={onDispatch} disabled={busy || testLabel}>
                        Parcel handed over — mark shipped
                      </PrimaryButton>
                      {onReplaceLabel && (
                        <SecondaryButton disabled={busy} onClick={onReplaceLabel}>
                          Wrong label? Replace it
                        </SecondaryButton>
                      )}
                    </>
                  ) : labelStep ? null : (
                    <>
                      <PrimaryButton disabled={busy} onClick={onLabel}>
                        Buy Shippo label
                      </PrimaryButton>
                      <SecondaryButton disabled={busy} onClick={onDispatch}>
                        Enter tracking &amp; mark shipped
                      </SecondaryButton>
                    </>
                  )}
                </div>
                {!order.labelUrl && labelStep}
              </>
            )
          )}
          {order.labelUrl && !shippingActive && (
            <div className="fw-actions">
              {" "}
              <a
                className="rp-btn rp-btn-secondary rp-btn-sm"
                href={order.labelUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={14} aria-hidden="true" />
                Reprint label
              </a>
            </div>
          )}
          {queue === "In transit" && (
            <>
              <p className="fw-summary">
                {order.trackingCarrier || "Carrier"} ·{" "}
                {order.trackingNumber || "No tracking recorded"}
                {order.fulfillmentStatus === "out_for_delivery" ? " · Out for delivery" : ""}
                {order.trackingNumber && (
                  <>
                    {" · "}
                    <a
                      href={getTrackingUrl(order.trackingCarrier || "", order.trackingNumber, order.trackingUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Customer's tracking link <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  </>
                )}
              </p>
              {isOverdueInTransit(order) && (
                <p className="fw-problems" role="alert">
                  In transit for {daysInTransit(order)} days. Check the carrier's tracking; if the parcel is lost,
                  open a claim with the carrier and contact the customer.
                </p>
              )}
              {!order.isTest && (onDeliveryStatus || onEditTracking) && (
                <div className="fw-actions">
                  {onDeliveryStatus && order.fulfillmentStatus !== "out_for_delivery" && (
                    <SecondaryButton disabled={busy} onClick={() => onDeliveryStatus("out_for_delivery")}>
                      Mark out for delivery
                    </SecondaryButton>
                  )}
                  {onDeliveryStatus && (
                    <PrimaryButton disabled={busy} onClick={() => onDeliveryStatus("delivered")}>
                      Mark delivered
                    </PrimaryButton>
                  )}
                  {onResendEmail && order.fulfillmentStatus !== "out_for_delivery" && order.trackingNumber && (
                    <SecondaryButton disabled={busy} onClick={onResendEmail}>
                      Resend shipping email
                    </SecondaryButton>
                  )}
                  {onEditTracking && (
                    <SecondaryButton disabled={busy} onClick={onEditTracking}>
                      {order.labelUrl ? "Edit tracking link or number" : "Edit tracking"}
                    </SecondaryButton>
                  )}
                </div>
              )}
              {order.labelUrl && (
                <p className="rp-hint">Shippo updates this parcel automatically; use these only if its tracking stalls.</p>
              )}
            </>
          )}
        </div>
      )}
      {shipping && method !== "shipping" && (
        <div className="fw-step" data-active={queue === "Ready for pickup" || queue === "Ready for local delivery"}>
          <div className="fw-step-heading">
            <span className="fw-step-icon" aria-hidden="true"><MapPin size={18} /></span>
            <div>
              <h3>{method === "pickup" ? "Customer pickup" : "Local delivery"}</h3>
              <span className="rp-hint">
                {order.fulfillment?.name || "Selected local service"}
                {order.fulfillment?.address ? ` · ${[order.fulfillment.address.street, order.fulfillment.address.unit, order.fulfillment.address.city, order.fulfillment.address.state, order.fulfillment.address.zip].filter(Boolean).join(", ")}` : ""}
              </span>
            </div>
          </div>
          {order.fulfillment?.instructions && <p className="fw-summary">{order.fulfillment.instructions}</p>}
          {queue === "Ready for pickup" || queue === "Ready for local delivery" || (method === "local_delivery" && order.fulfillmentStatus === "out_for_delivery") ? (
            <div className="fw-actions">
              <PrimaryButton disabled={busy} onClick={onLocalAdvance}>
                {method === "pickup"
                  ? order.fulfillmentStatus === "ready_for_pickup" ? "Confirm collected" : "Mark ready for pickup"
                  : order.fulfillmentStatus === "ready_for_delivery" ? "Start local delivery" : order.fulfillmentStatus === "out_for_delivery" ? "Confirm delivered" : "Mark ready for delivery"}
              </PrimaryButton>
            </div>
          ) : ["In transit", "Completed"].includes(queue) ? (
            <p className="fw-summary">{order.fulfillmentStatus === "collected" ? "Collected by customer" : order.fulfillmentStatus === "delivered" ? "Delivered" : order.fulfillmentStatus === "out_for_delivery" ? "Out for delivery" : "Local fulfillment complete"}</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
