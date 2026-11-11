// Automatic reminders for late invoices: the old stockroom's sweepPaymentReminders / sendInvoiceReminder, moved into
// the admin. Like the old app, it runs in the owner's open admin (weekdays, 9 to 6), at most 5 emails a run and 20 a
// day, one reminder per invoice. Each try is stamped "sending" on the invoice BEFORE the email goes, so a second device
// running at the same time finds it already chased; the stamp then becomes "sent" or "failed".
import { canSendNow, describeReminderSweep, dueForReminder, reminderBlockReason, reminderSettings } from "@stockroom/payment-reminders.js";

import { reminderMail } from "./invoiceRemind";
import type { StockroomRecords } from "./stockroomData";

type Rec = Record<string, any>;
export const MAX_PER_RUN = 5;
export const MAX_PER_DAY = 20;

/** The invoices owed a reminder now, oldest debt first (old invoicesAwaitingReminder). Test items are skipped. */
export function awaitingReminder(records: StockroomRecords, settings: Rec, today: string): Array<{ bookId: string; inv: Rec }> {
  const cfg = reminderSettings(settings);
  const out: Array<{ bookId: string; inv: Rec }> = [];
  for (const book of records.books) {
    if (book.isTest) continue;
    for (const inv of dueForReminder(((records.states[book.id] as Rec | undefined)?.invoices as Rec[]) || [], { today, days: cfg.days, max: 0 })) out.push({ bookId: book.id, inv });
  }
  return out.sort((a, b) => String(a.inv.dueDate || "").localeCompare(String(b.inv.dueDate || "")));
}

const entryAt = (s: Rec, id: string, at: number) => {
  const inv = (s.invoices || []).find((i: Rec) => String(i.id) === id);
  return { inv, entry: inv && Array.isArray(inv.reminders) ? inv.reminders.find((r: Rec) => r && r.at === at && r.kind === "auto") : null };
};

/** Save step: stamp the try before sending. Refuses when the saved invoice no longer needs a reminder. */
export function stampSending(id: string, entry: { at: number; to: string }, days: number, today: string) {
  return (s: Rec) => {
    const inv = (s.invoices || []).find((i: Rec) => String(i.id) === id);
    if (!inv || reminderBlockReason(inv, { today, days, now: entry.at })) throw new Error("no longer due");
    (inv.reminders = Array.isArray(inv.reminders) ? inv.reminders : []).push({ at: entry.at, kind: "auto", to: entry.to, status: "sending", error: "" });
    return s;
  };
}

/** Save step: how the try ended. */
export function finishTry(id: string, at: number, status: "sent" | "failed", error = "") {
  return (s: Rec) => {
    const { entry } = entryAt(s, id, at);
    if (entry) { entry.status = status; entry.error = error.slice(0, 200); }
    return s;
  };
}

export type SweepDeps = {
  save: (bookId: string, step: (s: Rec) => Rec) => Promise<{ status: string }>;
  send: (mail: { to: string; subject: string; text: string }) => Promise<void>;
  now: () => Date;
  sentToday: () => number;
  countSent: (n: number) => void;
};

/** One run. Returns what to tell the owner, or null when nothing was tried. */
export async function sweepReminders(records: StockroomRecords, settings: Rec, today: string, deps: SweepDeps) {
  const cfg = reminderSettings(settings);
  if (!cfg.auto || !canSendNow(deps.now())) return null;
  const room = Math.min(MAX_PER_RUN, MAX_PER_DAY - deps.sentToday());
  if (room <= 0) return null;
  let sent = 0, failed = 0;
  for (const { bookId, inv } of awaitingReminder(records, settings, today).slice(0, room)) {
    const id = String(inv.id);
    const to = String(inv.storeEmail || "").trim();
    const at = deps.now().getTime();
    const stamped = await deps.save(bookId, stampSending(id, { at, to }, cfg.days, today)).catch(() => ({ status: "failed" }));
    if (stamped.status !== "saved") continue;
    const book = records.books.find((b) => b.id === bookId) as Rec | undefined;
    const mail = reminderMail(inv, settings, String(inv.currency || book?.currency || "CAD"));
    try {
      await deps.send({ to, subject: mail.subject, text: mail.text });
      sent++; deps.countSent(1);
      await deps.save(bookId, finishTry(id, at, "sent")).catch(() => undefined);
    } catch (e) {
      failed++;
      await deps.save(bookId, finishTry(id, at, "failed", e instanceof Error ? e.message : "send failed")).catch(() => undefined);
    }
  }
  return describeReminderSweep({ sent, failed });
}
