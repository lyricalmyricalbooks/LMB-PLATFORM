// Stockroom › Stockists › Invoices › Remind and Promised to pay: ports of the old stockroom's chaseInvoiceNow /
// sendInvoiceReminder (the by-hand chase) and snoozeInvoiceFromView. The email is worded by the stockroom's own
// buildReminderEmail and sent by the shop's server (action "stockistNote"); each try is logged on the invoice's
// `reminders` exactly as the old app did, so the chase count and the "Chased" chip agree in both.
import { buildReminderEmail, daysLate, invoiceReminderState, reminderSettings } from "@stockroom/payment-reminders.js";
import { fmt, fmtD } from "@stockroom/money.js";

type Rec = Record<string, any>;

/** Why this invoice can't be chased by hand now, in the old app's words; null when it can. */
export function remindRefusal(inv: Rec): string | null {
  const num = inv.num || "This invoice";
  if (inv.status === "paid") return `${num} is already paid. Nothing to chase.`;
  if (inv.status === "cancelled") return `${num} was cancelled. Nothing to chase.`;
  if (inv.status !== "sent") return `${num} hasn't been sent yet. Send it before chasing it.`;
  if (!String(inv.storeEmail || "").trim()) return "No email address on this invoice. Add one to remind them.";
  return null;
}

/** The confirm line, as the old app asked it: how late, promised, already chased. */
export function remindQuestion(inv: Rec, today: string): string {
  const state = invoiceReminderState(inv);
  const late = daysLate(inv, today);
  return [
    late ? `${late} day${late === 1 ? "" : "s"} past due.` : "",
    !late && inv.dueDate && inv.dueDate > today ? `Not due until ${fmtD(inv.dueDate)}.` : "",
    state.snoozedUntil && today <= state.snoozedUntil ? `They promised to pay by ${fmtD(state.snoozedUntil)}.` : "",
    state.count ? `You have already reminded them ${state.count === 1 ? "once" : `${state.count} times`}.` : "",
    `Email ${String(inv.storeEmail).trim()} a reminder about ${inv.num}?`,
  ].filter(Boolean).join(" ");
}

/** The reminder email (no attachment: the admin sends words only). */
export function reminderMail(inv: Rec, settings: Rec, code: string) {
  return buildReminderEmail(inv, {
    settings: reminderSettings(settings), payLink: String(inv.paymentLink || inv.stripe?.url || ""),
    publisher: String(settings.name || ""), amountLabel: fmt(Number(inv.total) || 0, code), attached: false,
  });
}

const findInv = (s: Rec, id: string) => {
  const inv = (s.invoices || []).find((i: Rec) => String(i.id) === id);
  if (!inv) throw new Error("This invoice isn't in the records any more.");
  return inv;
};

/** Log one try (old entry shape: at, kind, to, status, error). */
export function logReminder(id: string, entry: { at: number; to: string; status: "sent" | "failed"; error?: string }) {
  return (s: Rec) => {
    const inv = findInv(s, id);
    (inv.reminders = Array.isArray(inv.reminders) ? inv.reminders : []).push({ at: entry.at, kind: "manual", to: entry.to, status: entry.status, error: entry.error || "" });
    return s;
  };
}

/** "They said they'd pay on the 15th": no reminder before then; an empty date starts chasing again. */
export function promiseUntil(id: string, date: string) {
  return (s: Rec) => {
    const value = date.trim();
    if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("That isn't a date.");
    findInv(s, id).remindAfter = value;
    return s;
  };
}
