// Stockroom › Invoices › Repeating: an invoice made on a schedule (a stockist billed every month, a subscription). The
// pattern is kept in the `recurringInvoices` list of the book it is filed under (book metadata, merged row by row by
// `id`, like invoices and quotes). When a date comes round, the owner's open admin makes a normal invoice from it
// (invoiceMake.ts `saveInvoiceChange`, so numbers, totals and stockist links follow the same rules) and, if asked,
// emails it from the shop's address. From then on it is an ordinary invoice: reminders, card links and Mark paid all
// work on it unchanged. Pure, apart from `sweepRepeating`, which is handed its saves and its sender.
//
// Like the automatic reminders (autoRemind.ts), this runs only while an owner has the admin open, on weekdays from 9
// to 6, so a stockist never gets an invoice at 3 a.m. An invoice for a date that passed while nobody looked is made at
// the next run, dated the day it was due. Each made invoice has an id built from the pattern and the date, so two
// devices running at once file it once; the email is stamped "sending" before it goes, so it goes once.
import { canSendNow } from "@stockroom/payment-reminders.js";
import { daysBetween, dueDateFromTerms } from "@stockroom/invoices.js";
import { fmt, fmtD, getBookCurrencyCode, normalizeCurrencyCode } from "@stockroom/money.js";

import type { StockBook, StockroomRecords } from "./stockroomData";
import { formFromInvoice, formPayload, invoiceEmail, nextNumber, saveInvoiceChange, storeIn, todayText, type InvoiceForm, type InvoiceSettings } from "./invoiceMake";

type Rec = Record<string, any>;
const text = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

export type Every = "week" | "month" | "quarter" | "year";
export const EVERY_CHOICES: Array<{ value: Every; label: string }> = [
  { value: "week", label: "Every week" }, { value: "month", label: "Every month" }, { value: "quarter", label: "Every 3 months" }, { value: "year", label: "Every year" },
];
const EVERY_WORD: Record<Every, string> = { week: "Weekly", month: "Monthly", quarter: "Every 3 months", year: "Yearly" };
export const everyWord = (e: unknown) => EVERY_WORD[(e as Every)] || "Monthly";
const isEvery = (e: unknown): e is Every => e === "week" || e === "month" || e === "quarter" || e === "year";

/** The schedule part of the editor; the rest is the invoice form (its `date` is the next invoice day). */
export type Schedule = { every: Every; autoEmail: boolean; endDate: string };
export const blankSchedule = (): Schedule => ({ every: "month", autoEmail: true, endDate: "" });

const dayParts = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); return m ? [+m[1], +m[2], +m[3]] as const : null; };
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * The day after `from` on the schedule. Months keep the anchor day (the 31st falls on the last day of a short month
 * and goes back to the 31st after), so a bill set up on the 31st never drifts to the 28th for good.
 */
export function nextDay(from: string, every: Every, anchorDay?: number): string {
  if (every === "week") return dueDateFromTerms(from, 7);
  const p = dayParts(from);
  if (!p) return "";
  const add = every === "month" ? 1 : every === "quarter" ? 3 : 12;
  const total = p[0] * 12 + (p[1] - 1) + add;
  const y = Math.floor(total / 12), m = (total % 12) + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return iso(y, m, Math.min(anchorDay || p[2], last));
}

export type RepeatRow = {
  id: string; ownerBookId: string; billedTo: string; person: boolean; email: string; every: Every; nextDate: string; endDate: string;
  total: number; code: string; status: "active" | "paused" | "ended"; autoEmail: boolean; dueDays: number;
  lastMade: { date: string; num: string } | null; madeCount: number; problem: string; pattern: Rec;
};

/** Every repeating invoice once, the next one due first. */
export function repeatList(records: StockroomRecords): RepeatRow[] {
  const out: RepeatRow[] = [];
  const seen = new Set<string>();
  for (const book of records.books) {
    for (const t of (((records.states[book.id] as Rec | undefined)?.recurringInvoices as Rec[] | undefined) || [])) {
      if (!t || seen.has(String(t.id))) continue;
      seen.add(String(t.id));
      const made = (Array.isArray(t.made) ? t.made : []) as Rec[];
      const last = made[made.length - 1];
      out.push({
        id: String(t.id), ownerBookId: book.id, billedTo: text(t.storeName) || "—", person: t.billTo === "person", email: text(t.storeEmail).trim(),
        every: isEvery(t.every) ? t.every : "month", nextDate: text(t.nextDate), endDate: text(t.endDate), total: Number(t.total) || 0,
        code: normalizeCurrencyCode(t.currencyCode || t.currency, getBookCurrencyCode(book)),
        status: t.status === "paused" ? "paused" : t.status === "ended" ? "ended" : "active", autoEmail: t.autoEmail !== false,
        dueDays: Number.isFinite(Number(t.dueDays)) ? Number(t.dueDays) : 30, lastMade: last ? { date: text(last.date), num: text(last.num) } : null,
        madeCount: made.length, problem: text(t.problem), pattern: t,
      });
    }
  }
  const rank = { active: 0, paused: 1, ended: 2 } as const;
  return out.sort((a, b) => rank[a.status] - rank[b.status] || a.nextDate.localeCompare(b.nextDate));
}

/** A new repeating invoice starts from the usual blank invoice; the date is the first invoice's day. */
export const newRepeatId = (now: number) => `rep-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** A pattern back in the editor: its next day in `date`, the gap to the due day kept. */
export function formFromRepeat(records: StockroomRecords, row: Pick<RepeatRow, "pattern" | "ownerBookId" | "nextDate" | "dueDays">): { form: InvoiceForm; schedule: Schedule } {
  const date = row.nextDate || todayText();
  const form = formFromInvoice(records, { ownerBookId: row.ownerBookId, inv: { ...row.pattern, num: "", date, dueDate: dueDateFromTerms(date, row.dueDays) } });
  return { form: { ...form, num: "", autoNum: "" }, schedule: { every: isEvery(row.pattern.every) ? row.pattern.every : "month", autoEmail: row.pattern.autoEmail !== false, endDate: text(row.pattern.endDate) } };
}

/** An invoice on file as the start of a repeating one (Invoices › an invoice › Repeat this): next on the same day next period. */
export function repeatFromInvoice(records: StockroomRecords, row: { inv: Rec; ownerBookId: string }, today: string = todayText()): { form: InvoiceForm; schedule: Schedule } {
  const f = formFromInvoice(records, row);
  const gap = daysBetween(text(row.inv.date), text(row.inv.dueDate));
  let date = nextDay(text(row.inv.date) || today, "month");
  while (date && date < today) date = nextDay(date, "month");
  return {
    form: { ...f, editingId: null, num: "", autoNum: "", date: date || today, dueDate: dueDateFromTerms(date || today, gap != null && gap >= 0 ? gap : 30), items: f.items.map((it) => ({ ...it, ledgerId: null })), status: "draft" },
    schedule: blankSchedule(),
  };
}

/** What stops the pattern being saved (on top of the invoice's own checks), or null. */
export function scheduleProblem(form: InvoiceForm, schedule: Schedule, today: string): string | null {
  if (!dayParts(form.date)) return "Pick the day of the next invoice.";
  if (!form.editingId && form.date < today) return "The first invoice can't be in the past. Pick today or a later day.";
  if (schedule.endDate && schedule.endDate < form.date) return "The last day is before the next invoice. Pick a later day, or leave it blank.";
  if (schedule.autoEmail && form.billTo === "person" && !form.person.email.trim()) return "Add their email address, or turn off emailing it.";
  return null;
}

/** Save the pattern. Editing keeps what it has made so far; the next invoice day is the form's date. */
export function saveRepeatChange(form: InvoiceForm, schedule: Schedule, ctx: { books: StockBook[]; id: string; now: number }) {
  return (state: Rec) => {
    const list: Rec[] = Array.isArray(state.recurringInvoices) ? state.recurringInvoices : (state.recurringInvoices = []);
    let store: Rec | null = null;
    if (form.billTo !== "person") {
      store = storeIn(state, form.stockist);
      if (!store) throw new Error(`${form.stockist} is no longer on this title's stockist list. Reload the page.`);
    }
    const p = formPayload({ ...form, num: "" }, store, "active", { books: ctx.books, id: form.editingId || ctx.id, now: ctx.now });
    const dueDays = Math.max(0, daysBetween(form.date, form.dueDate) ?? 30);
    delete p.num; delete p.date; delete p.dueDate;
    Object.assign(p, { kind: "recurring", every: schedule.every, autoEmail: schedule.autoEmail, endDate: schedule.endDate, nextDate: form.date,
      anchorDay: dayParts(form.date)?.[2] || 1, dueDays, problem: "" });
    if (form.editingId) {
      const at = list.findIndex((t) => t && String(t.id) === form.editingId);
      if (at < 0) throw new Error("This repeating invoice is no longer in the records (deleted on another device?). Reload the page.");
      const old = list[at];
      p.createdAt = old.createdAt || ctx.now;
      p.made = Array.isArray(old.made) ? old.made : [];
      p.status = old.status === "paused" ? "paused" : "active";
      list[at] = p;
    } else {
      if (list.some((t) => t && String(t.id) === p.id)) return state;
      p.made = [];
      list.push(p);
    }
    return state;
  };
}

const findPattern = (state: Rec, id: string) => {
  const t = ((state.recurringInvoices as Rec[]) || []).find((x) => x && String(x.id) === id);
  if (!t) throw new Error("This repeating invoice is no longer in the records. Reload the page.");
  return t;
};

/** Pause or start again. Starting again after a long pause moves the next day up to today, so no backlog is billed. */
export function pauseRepeatChange(id: string, paused: boolean, today: string, now: number) {
  return (state: Rec) => {
    const t = findPattern(state, id);
    if (t.status === "ended" && !paused) throw new Error("This repeating invoice has ended. Set a new last day to start it again.");
    t.status = paused ? "paused" : "active";
    if (!paused && text(t.nextDate) < today) t.nextDate = today;
    t.updatedAt = now;
    return state;
  };
}

/** Delete the pattern. Invoices it already made stay on file. */
export function deleteRepeatChange(id: string) {
  return (state: Rec) => {
    const t = findPattern(state, id);
    state.recurringInvoices = ((state.recurringInvoices as Rec[]) || []).filter((x) => x !== t);
    return state;
  };
}

/** The id an invoice made for this pattern and day gets: the same on every device, so it is filed once. */
export const madeInvoiceId = (patternId: string, date: string) => `inv-${patternId}-${date}`;

/** Patterns with an invoice due today or earlier. */
export function dueRepeats(records: StockroomRecords, today: string): RepeatRow[] {
  return repeatList(records).filter((r) => r.status === "active" && r.nextDate && r.nextDate <= today && (!r.endDate || r.nextDate <= r.endDate));
}

/**
 * Save step: make the invoice for the pattern's next day (as a draft, so it is only "owed" once it has really gone
 * out) and move the pattern on. Does nothing when another device already moved it past `date`.
 */
export function makeRepeatInvoiceChange(records: StockroomRecords, row: Pick<RepeatRow, "id" | "ownerBookId" | "pattern">, ctx: { date: string; num: string; now: number }) {
  return (state: Rec) => {
    const t = findPattern(state, row.id);
    if (text(t.nextDate) !== ctx.date || t.status !== "active") return state;
    const invId = madeInvoiceId(row.id, ctx.date);
    const already = ((state.invoices as Rec[]) || []).some((i) => i && String(i.id) === invId);
    if (!already) {
      const dueDays = Number.isFinite(Number(t.dueDays)) ? Number(t.dueDays) : 30;
      const form = formFromInvoice(records, { ownerBookId: row.ownerBookId, inv: { ...t, num: ctx.num, date: ctx.date, dueDate: dueDateFromTerms(ctx.date, dueDays), status: "draft" } });
      saveInvoiceChange({ ...form, editingId: null }, "draft", { books: records.books, id: invId, now: ctx.now })(state);
      const inv = ((state.invoices as Rec[]) || []).find((i) => i && String(i.id) === invId);
      if (inv) inv.repeat = { id: row.id, date: ctx.date };
      (t.made = Array.isArray(t.made) ? t.made : []).push({ date: ctx.date, invoiceId: invId, num: ctx.num, at: ctx.now });
    }
    const next = nextDay(ctx.date, isEvery(t.every) ? t.every : "month", Number(t.anchorDay) || undefined);
    t.nextDate = next;
    if (t.endDate && next > t.endDate) t.status = "ended";
    t.problem = "";
    t.updatedAt = ctx.now;
    return state;
  };
}

/** Save step: note why a pattern couldn't make its invoice (a stockist removed, say), for the Repeating list. */
export function noteRepeatProblem(id: string, problem: string, now: number) {
  return (state: Rec) => {
    const t = findPattern(state, id);
    t.problem = problem.slice(0, 200); t.updatedAt = now;
    return state;
  };
}

/** Save step: stamp the email before it goes. Refuses when the invoice was sent or emailed already. */
export function stampRepeatEmail(invoiceId: string, at: number, to: string) {
  return (state: Rec) => {
    const inv = ((state.invoices as Rec[]) || []).find((i) => i && String(i.id) === invoiceId);
    if (!inv || inv.status !== "draft" || inv.repeat?.emailAt) throw new Error("already sent");
    inv.repeat = { ...(inv.repeat || {}), emailAt: at, emailTo: to, email: "sending" };
    return state;
  };
}

/** Save step: how the email ended. Sent: the invoice is now owed (and chased when late, like any other). */
export function finishRepeatEmail(invoiceId: string, at: number, ok: boolean, error = "") {
  return (state: Rec) => {
    const inv = ((state.invoices as Rec[]) || []).find((i) => i && String(i.id) === invoiceId);
    if (!inv || inv.repeat?.emailAt !== at) return state;
    inv.repeat.email = ok ? "sent" : "failed";
    if (!ok) inv.repeat.error = error.slice(0, 200);
    if (ok && inv.status === "draft") { inv.status = "sent"; inv.updatedAt = at; }
    return state;
  };
}

export type RepeatDeps = {
  save: (bookId: string, step: (s: Rec) => Rec) => Promise<{ status: string; state?: unknown }>;
  send: (mail: { to: string; subject: string; text: string }) => Promise<void>;
  now: () => Date;
};
export type RepeatResult = { made: number; emailed: number; drafts: string[]; failed: string[]; problems: string[] };
export const MAX_REPEATS_PER_RUN = 12;

/**
 * One run: make every invoice that has come due (up to 12), email the ones set to go out, and say what happened.
 * Returns null when nothing was due. `records` is kept up to date as it goes, so numbers never repeat.
 */
export async function sweepRepeating(records: StockroomRecords, settings: InvoiceSettings, today: string, deps: RepeatDeps): Promise<RepeatResult | null> {
  if (!canSendNow(deps.now())) return null;
  const out: RepeatResult = { made: 0, emailed: 0, drafts: [], failed: [], problems: [] };
  let budget = MAX_REPEATS_PER_RUN;
  for (let due = dueRepeats(records, today); due.length && budget > 0; due = dueRepeats(records, today)) {
    const row = due[0];
    budget--;
    const date = row.nextDate;
    const year = Number(date.slice(0, 4)) || deps.now().getFullYear();
    const num = nextNumber(records, row.ownerBookId, (row.pattern.bookIds as string[] | undefined)?.length ? row.pattern.bookIds : [row.ownerBookId], settings.name, year);
    let made: { status: string; state?: unknown; message?: string };
    try { made = await deps.save(row.ownerBookId, makeRepeatInvoiceChange(records, row, { date, num, now: deps.now().getTime() })); }
    catch (e) { made = { status: "failed", message: e instanceof Error ? e.message : "" }; }
    if (made.status !== "saved" && made.status !== "unchanged") {
      const why = made.message || "It couldn't be saved.";
      out.problems.push(`${row.billedTo}: ${why}`);
      await deps.save(row.ownerBookId, noteRepeatProblem(row.id, why, deps.now().getTime())).catch(() => undefined);
      // Leave this pattern for the next run and stop: the same problem would repeat for every later date.
      break;
    }
    records.states[row.ownerBookId] = made.state as never;
    const invId = madeInvoiceId(row.id, date);
    const inv = (((made.state as Rec)?.invoices as Rec[]) || []).find((i) => i && String(i.id) === invId);
    if (!inv || inv.repeat?.date !== date) continue; // another device made it; it emails it too
    out.made++;
    if (!row.autoEmail) { out.drafts.push(text(inv.num)); continue; }
    const to = text(inv.storeEmail).trim();
    if (!to) { out.drafts.push(text(inv.num)); continue; }
    const at = deps.now().getTime();
    const stamped = await deps.save(row.ownerBookId, stampRepeatEmail(invId, at, to)).catch(() => ({ status: "failed" as const }));
    if (stamped.status !== "saved") continue;
    records.states[row.ownerBookId] = (stamped as { state?: unknown }).state as never;
    const mail = invoiceEmail(inv, settings, normalizeCurrencyCode(inv.currencyCode || inv.currency, "CAD"));
    let ok = true, error = "";
    try { await deps.send({ to, subject: mail.subject, text: mail.body }); } catch (e) { ok = false; error = e instanceof Error ? e.message : "send failed"; }
    const done = await deps.save(row.ownerBookId, finishRepeatEmail(invId, at, ok, error)).catch(() => null);
    if (done && (done.status === "saved" || done.status === "unchanged")) records.states[row.ownerBookId] = done.state as never;
    if (ok) out.emailed++; else out.failed.push(text(inv.num));
  }
  return out.made || out.problems.length ? out : null;
}

/** What to tell the owner after a run, in plain words. */
export function describeRepeatRun(r: RepeatResult): { title: string; detail: string; tone: "warning" | "info" } {
  const title = r.problems.length && !r.made ? "A repeating invoice couldn't be made"
    : `${r.made === 1 ? "1 repeating invoice was" : `${r.made} repeating invoices were`} made`;
  const detail = [
    r.emailed ? `${r.emailed} emailed.` : "",
    r.drafts.length ? `Waiting for you to send: ${r.drafts.join(", ")}.` : "",
    r.failed.length ? `The email didn't go for ${r.failed.join(", ")}; they wait as drafts.` : "",
    ...r.problems,
  ].filter(Boolean).join(" ");
  return { title, detail, tone: r.problems.length || r.failed.length || r.drafts.length ? "warning" : "info" };
}

/** Upcoming invoices from the patterns, for the money forecast (moneyDue.ts): each date from today to `until`. */
export function upcomingRepeats(records: StockroomRecords, today: string, until: string): Array<{ patternId: string; date: string; dueDate: string; total: number; code: string; who: string }> {
  const out: Array<{ patternId: string; date: string; dueDate: string; total: number; code: string; who: string }> = [];
  for (const r of repeatList(records)) {
    if (r.status !== "active") continue;
    let date = r.nextDate < today ? today : r.nextDate;
    for (let i = 0; date && date <= until && i < 400; i++) {
      if (r.endDate && date > r.endDate) break;
      out.push({ patternId: r.id, date, dueDate: dueDateFromTerms(date, r.dueDays), total: r.total, code: r.code, who: r.billedTo });
      date = nextDay(date, r.every, Number(r.pattern.anchorDay) || undefined);
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** "Monthly · next 1 Dec" for a row. */
export const repeatLine = (r: RepeatRow) => r.status === "ended" ? `${everyWord(r.every)} · ended` : r.status === "paused" ? `${everyWord(r.every)} · paused`
  : `${everyWord(r.every)} · next ${r.nextDate ? fmtD(r.nextDate) : "—"}`;
export const repeatAmount = (r: RepeatRow) => fmt(r.total, r.code);
