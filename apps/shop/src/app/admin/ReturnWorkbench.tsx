import { useState } from "react";
import toast from "react-hot-toast";
import { adminApi } from "./api";
import { isDigitalItem } from "./fulfillment";
import { RETURN_STEPS, chargedOf, formatMinor, parseMoneyToMinor, refundableMinor, returnStepLabel, returnStepsDone, returnedValueMinor } from "./orderLines";
import { SectionCard, TextArea, TextField, SelectField, PrimaryButton, SecondaryButton, GhostButton, ConfirmDialog } from "./riso/components";

type Row = { quantity: string; condition: string; restockQuantity?: string };
// An empty box means "not entered yet", never zero.
const whole = (text: string | undefined) => (text != null && /^\d+$/.test(text.trim()) ? Number(text) : null);

export function ReturnWorkbench({ order, onUpdated }: { order: any; onUpdated: () => Promise<void> }) {
  const saved = order.operations?.returnCase;
  const state = order.returnProgress?.state || "requested";
  const [instructions, setInstructions] = useState(saved?.instructions || "");
  const [inspection, setInspection] = useState<Record<number, Row>>({});
  const [busy, setBusy] = useState(false);
  const [confirmRefund, setConfirmRefund] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmCloseApproved, setConfirmCloseApproved] = useState(false);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const lines = (order.items || []).map((item: any, index: number) => ({ ...item, index })).filter((item: any) => !isDigitalItem({ ...item, format: item.format || item.variantName }));
  // After inspection: did every copy come back? Then the full order is refunded (as before); otherwise the returned books' value.
  const inspected: any[] = Array.isArray(saved?.inspection) ? saved.inspection : [];
  const everythingBack = inspected.length > 0 && inspected.every((row: any) => Number(row.quantity) === Number(row.ordered ?? order.items?.[row.index]?.quantity));
  const suggested = returnedValueMinor(order, Object.fromEntries(inspected.map((row: any) => [row.index, Number(row.quantity) || 0])));
  const currency = chargedOf(order).currency;
  const [amount, setAmount] = useState(() => (suggested / 100).toFixed(2));
  const amountMinor = parseMoneyToMinor(amount);
  const amountError = amountMinor == null || amountMinor <= 0 ? "Enter an amount like 12.50." : amountMinor > refundableMinor(order) ? `At most ${formatMinor(refundableMinor(order), currency)}.` : "";

  const run = async (action: string) => {
    setBusy(true);
    try {
      if (action === "refund") {
        await adminApi.refundOrder(order.id, everythingBack
          ? { reason: "Customer return", restock: true }
          : { reason: "Customer return (partial)", restock: true, amountMinor });
      }
      // Nothing to send back (e-book order, goodwill refund): close the request without a return.
      else if (action === "close") await adminApi.updateOrder(order.id, { customerRequest: { ...order.customerRequest, status: "handled", handledAt: new Date().toISOString() } });
      else await adminApi.manageReturn(order.id, action, {
        instructions,
        inspection: lines.map((item: any) => {
          const row = inspection[item.index] || { quantity: "", condition: "" };
          return { index: item.index, quantity: whole(row.quantity), condition: row.condition, ...(row.condition === "mixed" ? { restockQuantity: whole(row.restockQuantity) } : {}) };
        }),
      });
      toast.success(action === "refund" ? "Refund recorded; provider status determines completion." : action === "close" || action === "closed" ? "Request closed." : "Return updated.");
      await onUpdated();
    } catch (error: any) { toast.error(error.message || "Could not update return."); }
    finally { setBusy(false); }
  };
  const set = (index: number, patch: Partial<Row>) => setInspection(previous => ({ ...previous, [index]: { quantity: "", condition: "", ...(previous[index] as Row | undefined), ...patch } }));
  const lineOk = (item: any) => {
    const row = inspection[item.index];
    const qty = whole(row?.quantity);
    if (qty == null || qty > Number(item.quantity)) return false;
    if (qty === 0) return true;
    if (!["resellable", "damaged", "mixed"].includes(row?.condition || "")) return false;
    if (row?.condition !== "mixed") return true;
    const restock = whole(row.restockQuantity);
    return restock != null && restock <= qty;
  };
  const totalBack = lines.reduce((n: number, item: any) => n + (whole(inspection[item.index]?.quantity) || 0), 0);
  const completeInspection = lines.length > 0 && lines.every(lineOk) && totalBack > 0;
  const missing = lines.reduce((n: number, item: any) => n + Math.max(0, Number(item.quantity) - (whole(inspection[item.index]?.quantity) ?? Number(item.quantity))), 0);

  const stepsDone = returnStepsDone(state);
  return <SectionCard title="Customer return" description={returnStepLabel(state)}>
    <div className="rp-stack">
      {stepsDone >= 0 && <ol className="fw-return-steps" aria-label="Return progress">
        {RETURN_STEPS.map((name, i) => <li key={name} data-done={i < stepsDone || undefined} aria-current={i === stepsDone ? "step" : undefined}>
          <span className="fw-return-step-mark" aria-hidden>{i < stepsDone ? "✓" : i + 1}</span>{name}
          <span className="rp-sr-only">{i < stepsDone ? " (done)" : i === stepsDone ? " (current step)" : ""}</span>
        </li>)}
      </ol>}
      {order.customerRequest?.message && <div className="fw-notice" style={{ margin: 0 }}><div><span className="rp-label">Customer wrote</span><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{order.customerRequest.message}</p></div></div>}
      <p className="rp-hint">When every book comes back, the whole order is refunded (shipping, tax and digital items too). When only some come back, you refund what they're worth — you can change the amount. Only inspected, resellable printed copies go back to stock.</p>
      {state === "requested" && <>
        <TextArea label="Instructions for the customer, or why you are declining" hint="Include the return address, packing instructions, deadline and who pays postage. These appear on the secure order tracking page." maxLength={3000} value={instructions} onChange={event => setInstructions(event.target.value)} />
        {!lines.length && <p className="rp-hint">This order has no printed books to send back. Refund it from More order actions if you agree, then close the request.</p>}
        <div className="fw-actions" style={{ marginTop: 0 }}>
          <PrimaryButton disabled={busy || !instructions.trim() || !lines.length} onClick={() => run("approved")}>Approve and publish instructions</PrimaryButton>
          <SecondaryButton disabled={busy || !instructions.trim()} onClick={() => setConfirmDecline(true)}>Decline with explanation</SecondaryButton>
        </div>
        {!instructions.trim() && lines.length > 0 && <p className="rp-hint" style={{ margin: 0 }}>Write the instructions (or your reason for declining) first.</p>}
        <div><GhostButton size="sm" disabled={busy} onClick={() => setConfirmClose(true)}>Close request without a return</GhostButton></div>
      </>}
      {saved?.instructions && state !== "requested" && <p style={{ whiteSpace: "pre-wrap" }}>{saved.instructions}</p>}
      {state === "approved" && <PrimaryButton disabled={busy} onClick={() => run("received")}>Record parcel received</PrimaryButton>}
      {state === "received" && <>
        {lines.map((item: any) => <div key={item.index} className="rp-stack">
          <strong>{item.title}{item.variantName ? ` · ${item.variantName}` : ""} · {item.quantity} ordered</strong>
          <TextField label="Copies received" type="number" min={0} max={item.quantity} step={1} placeholder="Not entered" value={inspection[item.index]?.quantity ?? ""}
            error={whole(inspection[item.index]?.quantity) != null && Number(whole(inspection[item.index]?.quantity)) > Number(item.quantity) ? `At most ${item.quantity}.` : undefined}
            hint={whole(inspection[item.index]?.quantity) != null && Number(whole(inspection[item.index]?.quantity)) < Number(item.quantity) ? `${Number(item.quantity) - Number(whole(inspection[item.index]?.quantity))} not returned.` : undefined}
            onChange={event => set(item.index, { quantity: event.target.value })} />
          {whole(inspection[item.index]?.quantity) !== 0 && <SelectField label="Condition" value={inspection[item.index]?.condition || ""} onChange={event => set(item.index, { condition: event.target.value })}>
            <option value="">Choose condition</option><option value="resellable">Resellable — restock on refund</option><option value="damaged">Damaged — do not restock</option><option value="mixed">Mixed condition — select resellable count</option>
          </SelectField>}
          {inspection[item.index]?.condition === "mixed" && whole(inspection[item.index]?.quantity) !== 0 && <TextField label="Resellable copies to restock" type="number" min={0} max={item.quantity} step={1} placeholder="Not entered" value={inspection[item.index]?.restockQuantity ?? ""} onChange={event => set(item.index, { restockQuantity: event.target.value })} />}
        </div>)}
        {missing > 0 && completeInspection && <p className="rp-hint" role="status">{missing} cop{missing === 1 ? "y" : "ies"} not returned — this will be a partial return.</p>}
        <PrimaryButton disabled={busy || !completeInspection} onClick={() => run("inspected")}>Save inspection</PrimaryButton>
      </>}
      {inspected.length > 0 && <ul>{inspected.map((line: any) => <li key={line.index}>{order.items[line.index]?.title} · {line.quantity} of {line.ordered ?? order.items[line.index]?.quantity} back · {line.restockQuantity ?? (line.condition === "resellable" ? line.quantity : 0)} to restock on refund</li>)}</ul>}
      {state === "inspected" && (everythingBack
        ? <PrimaryButton disabled={busy} onClick={() => setConfirmRefund(true)}>Refund and restock eligible copies</PrimaryButton>
        : <>
          <TextField label={`Refund for the returned books (${currency})`} inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} error={amountError || undefined}
            hint={`Suggested from the returned books' prices: ${formatMinor(suggested, currency)}. Up to ${formatMinor(refundableMinor(order), currency)} can be refunded.`} />
          <PrimaryButton disabled={busy || !!amountError} onClick={() => setConfirmRefund(true)}>Refund returned books and restock eligible copies</PrimaryButton>
        </>)}
      {["approved", "received", "inspected"].includes(state) && <div><GhostButton size="sm" disabled={busy} onClick={() => setConfirmCloseApproved(true)}>Close return without a refund</GhostButton></div>}
      {state === "closed" && <p role="status">Closed without a refund. Nothing was restocked.</p>}
      {state === "refund_pending" && <p role="status">The provider is processing the refund. Inventory has already been handled; do not refund again.</p>}
      {state === "completed" && <p role="status">Refund completed. Returned inventory has been handled once.</p>}
    </div>
    <ConfirmDialog open={confirmRefund}
      title={everythingBack ? "Refund the full order?" : "Refund the returned books?"}
      message={everythingBack
        ? "The full payment will be refunded. Inspected resellable physical copies will be returned to inventory once; damaged copies will stay out of stock. For cash or e-Transfer, send the money back first: this action only records the manual refund."
        : `${formatMinor(amountMinor || 0, currency)} will be refunded and the order stays paid. Inspected resellable copies go back to stock once. For cash or e-Transfer, send the money back first: this only records it.`}
      confirmLabel={everythingBack ? "Refund full order" : "Refund returned books"} onCancel={() => setConfirmRefund(false)} onConfirm={() => { setConfirmRefund(false); run("refund"); }} />
    <ConfirmDialog open={confirmCloseApproved} title="Close this return without a refund?" confirmLabel="Close return"
      message="Use this when the parcel never arrived or you decided not to refund. The request leaves Needs attention and the customer is told it is closed. No money moves and nothing is restocked; you can still refund from More order actions later."
      onCancel={() => setConfirmCloseApproved(false)} onConfirm={() => { setConfirmCloseApproved(false); run("closed"); }} />
    <ConfirmDialog open={confirmDecline} title="Decline this return?" confirmLabel="Decline return"
      message="Your explanation is published on the customer's secure order tracking page and the request is closed. This can't be undone; no money moves and nothing is restocked."
      onCancel={() => setConfirmDecline(false)} onConfirm={() => { setConfirmDecline(false); run("rejected"); }} />
    <ConfirmDialog open={confirmClose} title="Close this request without a return?" confirmLabel="Close request"
      message="The customer's request is marked handled and can't be reopened. No money moves and nothing is restocked — refund from More order actions first if you agreed to one."
      onCancel={() => setConfirmClose(false)} onConfirm={() => { setConfirmClose(false); run("close"); }} />
  </SectionCard>;
}
