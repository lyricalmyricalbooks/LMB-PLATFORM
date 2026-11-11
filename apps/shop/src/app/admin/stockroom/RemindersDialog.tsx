// Stockroom › Invoices › Automatic reminders: switch the late-invoice reminders on (autoRemind.ts runs them), the days
// after the due date and the words. Saved in the shared invoice details, as the old stockroom kept them.
import { useState } from "react";
import { describeReminderArming, MAX_REMINDER_DAYS, MIN_REMINDER_DAYS, reminderSettings } from "@stockroom/payment-reminders.js";

import { Dialog, PrimaryButton, SecondaryButton, TextArea, TextField, Toggle } from "../riso/components";
import { awaitingReminder } from "./autoRemind";
import { INVOICE_SETTINGS_KEY, todayText } from "./invoiceMake";
import type { StockroomRecords } from "./stockroomData";
import { describeResult, stockroomWriteApi } from "./stockroomWrite";

type Rec = Record<string, any>;

/** Save step: the three reminder fields, everything else in the details kept. */
export function reminderChange(next: { auto: boolean; days: number; message: string }) {
  return (current: unknown) => ({ ...(current && typeof current === "object" && !Array.isArray(current) ? (current as Rec) : {}),
    remindAuto: next.auto, remindDays: String(next.days), remindMsg: next.message.trim() });
}

export function RemindersDialog({ records, onClose, onSaved }: { records: StockroomRecords; onClose: () => void; onSaved: (value: Rec, text: string) => void }) {
  const start = reminderSettings(records.invoiceSettings || {});
  const [auto, setAuto] = useState(start.auto);
  const [days, setDays] = useState(String(start.days));
  const [message, setMessage] = useState(start.message);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const n = Math.round(Number(days));
  const daysOk = Number.isFinite(n) && n >= MIN_REMINDER_DAYS && n <= MAX_REMINDER_DAYS;
  const arming = auto && !start.auto ? describeReminderArming({ count: awaitingReminder(records, { remindAuto: true, remindDays: String(n) }, todayText()).length, days: n }) : "";

  async function save() {
    if (!daysOk) { setProblem(`Pick between ${MIN_REMINDER_DAYS} and ${MAX_REMINDER_DAYS} days.`); return; }
    setBusy(true); setProblem("");
    try {
      const r = await stockroomWriteApi.updateSetting(INVOICE_SETTINGS_KEY, reminderChange({ auto, days: n, message }));
      if (r.status === "refused" || r.status === "failed") { setProblem(describeResult(r).text); setBusy(false); return; }
      onSaved((r.value as Rec) || {}, auto ? `Automatic reminders are on: one email ${n} day${n === 1 ? "" : "s"} after the due date.` : "Automatic reminders are off.");
    } catch (e) { setProblem(e instanceof Error ? e.message : "That didn't save."); setBusy(false); }
  }

  return (
    <Dialog open onClose={busy ? () => undefined : onClose} title="Automatic reminders" description="One polite email when an invoice is late. Weekdays, 9 to 6, while your admin is open."
      footer={<><SecondaryButton onClick={onClose} disabled={busy}>Cancel</SecondaryButton><PrimaryButton onClick={() => void save()} busy={busy}>Save</PrimaryButton></>}>
      <Toggle label="Send reminders by themselves" checked={auto} onChange={setAuto} />
      <TextField label="Days after the due date" type="number" min={MIN_REMINDER_DAYS} max={MAX_REMINDER_DAYS} value={days} onChange={(e) => setDays(e.target.value)} />
      <TextArea label="Your note" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
      {arming && <p className="rp-sr-save" data-tone="warning" role="status">{arming}</p>}
      {problem && <p className="rp-sr-save" data-tone="error" role="alert">{problem}</p>}
    </Dialog>
  );
}
