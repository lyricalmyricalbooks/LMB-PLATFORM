import { HOME_CARRIER } from "./moneySign";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { adminApi } from "./api";
import { CARRIERS } from "../lib/tracking";
import { Dialog, PrimaryButton, SecondaryButton, SelectField, TextField } from "./riso/components";
import { partShipmentProblem, shippableLines } from "./partShipments";

/**
 * Orders › order › Send part now (code plan 24.5): choose how many of each item go in this parcel, enter its carrier
 * and tracking number, and send. The customer gets a "part of your order is on its way" email; the order stays open
 * for the rest, which goes with the normal Mark shipped.
 */
export function PartShipmentDialog({ open, order, onClose, onDone, emailOn }: {
  open: boolean; order: any; onClose: () => void; onDone: () => void; emailOn: boolean | null;
}) {
  const lines = open && order ? shippableLines(order).filter((l) => l.left > 0) : [];
  const [picks, setPicks] = useState<Record<number, string>>({});
  const [carrier, setCarrier] = useState(HOME_CARRIER);
  const [otherCarrier, setOtherCarrier] = useState("");
  const [number, setNumber] = useState("");
  const [link, setLink] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPicks({}); setCarrier(HOME_CARRIER); setOtherCarrier(""); setNumber(""); setLink("");
  }, [open]);

  const counts = Object.fromEntries(Object.entries(picks).map(([k, v]) => [k, v.trim() === "" ? 0 : Number(v)]));
  const problem = order ? partShipmentProblem(order, counts) : "";
  const carrierName = carrier === "Other" ? otherCarrier.trim() : carrier;
  const ready = !problem && !!carrierName && !!number.trim();

  const send = async () => {
    if (!ready || saving) return;
    setSaving(true);
    try {
      await adminApi.fulfillmentAction(order.id, "ship_part", { picks: counts, trackingCarrier: carrierName, trackingNumber: number.trim(), trackingUrl: link.trim() });
      toast.success(emailOn === false ? "Part shipped (the shipping email is switched off)" : `Part shipped — tracking emailed to ${order?.customer?.email || "the customer"}`);
      onDone();
    } catch (err: any) {
      toast.error(err?.message || "Couldn't record the part shipment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} size="md" title="Send part of this order now"
      description="Choose what goes in this parcel. The rest stays on the order, and you mark it shipped when it leaves."
      footer={<>
        <SecondaryButton onClick={onClose} disabled={saving}>Cancel</SecondaryButton>
        <PrimaryButton onClick={send} disabled={!ready || saving}>{saving ? "Saving…" : "Send this part"}</PrimaryButton>
      </>}>
      <div className="rp-stack">
        <fieldset className="rp-stack" style={{ gap: 8, border: 0, padding: 0, margin: 0 }}>
          <legend><strong>In this parcel</strong></legend>
          {lines.map((l) => (
            <TextField key={l.line} type="number" inputMode="numeric" min={0} max={l.left} step={1}
              label={l.title}
              hint={l.sent ? `${l.left} of ${l.ordered} left to send (${l.sent} already sent)` : `${l.left} ordered`}
              value={picks[l.line] ?? ""} placeholder="0"
              onChange={(e) => setPicks((p) => ({ ...p, [l.line]: e.target.value }))} />
          ))}
        </fieldset>
        <SelectField label="Carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)}>
          {[...CARRIERS, "Other"].map((c) => <option key={c} value={c}>{c}</option>)}
        </SelectField>
        {carrier === "Other" && <TextField label="Carrier name" value={otherCarrier} onChange={(e) => setOtherCarrier(e.target.value)} />}
        <TextField label="Tracking number" value={number} onChange={(e) => setNumber(e.target.value)} autoComplete="off" />
        <TextField label="Tracking link (optional)" hint="Leave blank to use the carrier's own tracking page." value={link}
          onChange={(e) => setLink(e.target.value)} placeholder="https://" inputMode="url" />
        {problem && !/^Choose at least one/.test(problem) && <p className="rp-hint" role="alert" style={{ margin: 0 }}>{problem}</p>}
      </div>
    </Dialog>
  );
}
