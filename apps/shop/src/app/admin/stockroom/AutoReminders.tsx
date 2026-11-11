// Runs the automatic invoice reminders (autoRemind.ts) quietly in the owner's open admin, once an hour at most, and
// hands what happened to the shell as an alert. Combined admin only; a team member's read is refused and nothing runs.
import { useEffect } from "react";

import type { AdminAlert } from "../adminAlerts";
import { sweepReminders } from "./autoRemind";
import { todayText } from "./invoiceMake";
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
export async function runAutoReminders(now = new Date()): Promise<AdminAlert | null> {
  if (now.getTime() - (Number(read(RUN_KEY)) || 0) < HOUR) return null;
  write(RUN_KEY, String(now.getTime()));
  const records = await stockroomApi.load();
  const today = todayText(now);
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
    const go = () => { if (document.visibilityState === "visible") runAutoReminders().then((a) => { if (alive && a) onAlert(a); }, () => undefined); };
    const first = window.setTimeout(go, 20_000);
    const every = window.setInterval(go, HOUR);
    return () => { alive = false; window.clearTimeout(first); window.clearInterval(every); };
  }, []);
  return null;
}
