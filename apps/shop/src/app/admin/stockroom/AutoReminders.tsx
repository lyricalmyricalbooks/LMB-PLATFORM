// Runs the automatic invoice jobs quietly in the owner's open admin, once an hour at most: repeating invoices
// (recurringInvoices.ts), reminders (autoRemind.ts) and bills coming due (bills.ts), and hands each result to the shell
// as its own alert. Combined admin only; a team member's read is refused and nothing runs.
import { useEffect } from "react";

import type { AdminAlert } from "../adminAlerts";
import { sweepReminders } from "./autoRemind";
import { billsAlert } from "./bills";
import { closeStaleCardLinks, recordCardPayments, strayPaymentLine } from "./invoiceCardPay";
import { cleanInvoiceSettings, todayText } from "./invoiceMake";
import { shopProfile } from "../../../lib/shopProfile";
import { describeRepeatRun, sweepRepeating } from "./recurringInvoices";
import { stockistReceiptApi } from "./stockistReceipt";
import { stockroomApi } from "./stockroomData";
import { stockroomWriteApi } from "./stockroomWrite";

const RUN_KEY = "lm:auto-reminders-run";
const DAY_KEY = "lm:auto-reminders-day";
const HOUR = 60 * 60 * 1000;
const read = (k: string) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };

function sentToday(today: string) {
  const [day, n] = read(DAY_KEY).split("|");
  return day === today ? Number(n) || 0 : 0;
}

/** One run if the last was over an hour ago. Returns an alert, or null. */
export async function runAutoReminders(now = new Date(), also?: (a: AdminAlert) => void): Promise<AdminAlert | null> {
  if (now.getTime() - (Number(read(RUN_KEY)) || 0) < HOUR) return null;
  write(RUN_KEY, String(now.getTime()));
  const records = await stockroomApi.load();
  const today = todayText(now);
  // First mark what was paid by card since the last look, so nobody is chased for an invoice they already paid, and
  // close the links of invoices that changed, were deleted or were paid another way.
  const save = async (bookId: string, change: (s: Record<string, any>) => Record<string, any>) => {
    const r = await stockroomWriteApi.saveBookState(bookId, change as never);
    return r.status === "saved" || r.status === "unchanged" ? { ok: true, state: r.state as Record<string, any> } : { ok: false };
  };
  const onSaved = (bookId: string, state: Record<string, any>) => { records.states[bookId] = state as never; };
  await recordCardPayments(records, { save, onSaved });
  const strays = await closeStaleCardLinks(records, { save, onSaved, now: () => now.getTime() });
  if (strays.length) also?.({ id: "card-link-stray", tone: "danger", title: strays.length === 1 ? "A card payment came in on an old invoice link" : `${strays.length} card payments came in on old invoice links`, detail: strays.map(strayPaymentLine).join(" "), orderIds: [], key: `${today}-${strays.map((s) => s.num).join(",")}`, action: "invoices" });
  // Repeating invoices whose day has come: made (and emailed when asked) before the reminders look at what is owed.
  const repeats = await sweepRepeating(records, cleanInvoiceSettings(records.invoiceSettings, shopProfile.name || ""), today, {
    save: (bookId, step) => stockroomWriteApi.saveBookState(bookId, step as never),
    send: async (m) => { await stockistReceiptApi.sendNote(m); },
    now: () => new Date(),
  });
  if (repeats) {
    if (repeats.emailed) write(DAY_KEY, `${today}|${sentToday(today) + repeats.emailed}`);
    const r = describeRepeatRun(repeats);
    also?.({ id: "repeat-invoices", tone: r.tone, title: r.title, detail: r.detail, orderIds: [], key: `${today}-${r.title}-${r.detail}`, action: "invoices" });
  }
  // Supplier bills due in the next few days or already late.
  const bills = billsAlert((records.taxCenter as Record<string, any> | null) ?? null, today);
  if (bills) also?.({ id: bills.id, tone: bills.late ? "danger" : "warning", title: bills.title, detail: bills.detail, orderIds: [], key: bills.key, action: "bills" });
  const said = await sweepReminders(records, records.invoiceSettings || {}, today, {
    save: (bookId, step) => stockroomWriteApi.saveBookState(bookId, step as never),
    send: async (m) => { await stockistReceiptApi.sendNote(m); },
    now: () => new Date(),
    sentToday: () => sentToday(today),
    countSent: (n) => write(DAY_KEY, `${today}|${sentToday(today) + n}`),
  });
  return said ? { id: "auto-reminders", tone: "warning", title: said.title, detail: said.detail, orderIds: [], key: `${today}-${said.title}`, action: "invoices" } : null;
}

export function AutoReminders({ onAlert }: { onAlert: (a: AdminAlert) => void }) {
  useEffect(() => {
    let alive = true;
    const go = () => { if (document.visibilityState === "visible") runAutoReminders(new Date(), (a) => { if (alive) onAlert(a); }).then((a) => { if (alive && a) onAlert(a); }, () => undefined); };
    const first = window.setTimeout(go, 20_000);
    const every = window.setInterval(go, HOUR);
    return () => { alive = false; window.clearTimeout(first); window.clearInterval(every); };
  }, []);
  return null;
}
