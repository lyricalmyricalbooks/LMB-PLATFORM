// The team desk (Bookings plan 4, 4.1, Beta): what a front desk or a service provider sees instead of the admin.
// A front desk sees every calendar, books for anyone, checks people in and cancels; a service provider sees only
// their own bookings and checks their own clients in. Every read and action goes through the server
// (teamDeskApi.ts › functions/bookings.js handleDesk), which holds each role to what it may do (DESK_OPS).
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Banknote, CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, Coffee, CreditCard, LogIn, LogOut, Mail, NotebookPen, Phone, QrCode, RefreshCw, Timer } from "lucide-react";
import {
  ActionMenu, Dialog, EmptyState, ErrorState, GhostButton, PageHeader, PrimaryButton, SecondaryButton, SelectField, StatusBadge, TextArea, TextField, useConfirm,
} from "./riso/components";
import { adminApi } from "./api";
import { addDays, balanceDue, dayOf, restPayable, visitName } from "../../shared/bookingTimes";
import { shopTimeZone } from "../../shared/shopTimeZone";
import type { Booking } from "./bookingsApi";
import { dayText, listTag, moneyText, timeText } from "./bookingsView";
import { teamDeskData, type DeskAnswer, type DeskBooking, type DeskClock } from "./teamDeskApi";
import { qrPicture } from "./stockroom/qrCodesStore";
import { hoursText, type ClockStep } from "../../shared/timeClock";
import { DeskPlans } from "./DeskPlans";
import "./bookings.css";

const ZONE = shopTimeZone();
const ROLE_NAME = { frontDesk: "Front desk", provider: "Service provider" } as const;

/** "Today", "Tomorrow", "Yesterday" or "Thursday 20 November". */
function dayName(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === addDays(today, 1)) return "Tomorrow";
  if (day === addDays(today, -1)) return "Yesterday";
  return dayText(day, "long");
}

/** The people on the day's list: not cancelled, earliest first. */
export function deskRows<T extends Booking>(list: readonly T[]): T[] {
  return list.filter((b) => b.status !== "cancelled").sort((a, b) => a.start.localeCompare(b.start) || a.customer.name.localeCompare(b.customer.name));
}

/** The day's three counts for the strip at the top. */
export function deskCounts(rows: readonly Booking[], nowMs: number): { booked: number; here: number; toCome: number } {
  let here = 0, toCome = 0;
  for (const b of rows) {
    if (b.checkedInAt) here++;
    else if (!b.noShow && Date.parse(b.end) > nowMs && b.status === "confirmed") toCome++;
  }
  return { booked: rows.length, here, toCome };
}

/**
 * Who is next (plan 4, 4.6 My day): the first booking still to come or under way that nobody has checked in or marked
 * as a no-show. Null when the day is done.
 */
export function nextUp<T extends Booking>(rows: readonly T[], nowMs: number): T | null {
  return rows.find((b) => b.status === "confirmed" && !b.checkedInAt && !b.noShow && Date.parse(b.end) > nowMs) || null;
}

/** A note's day as "12 Nov". */
const noteDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: "UTC", day: "numeric", month: "short" });

/** "in 25 min", "in 1 hr 10 min", "now" (started already) for the next client card. */
export function startsIn(startIso: string, nowMs: number): string {
  const min = Math.round((Date.parse(startIso) - nowMs) / 60_000);
  if (min <= 0) return "now";
  if (min < 60) return `in ${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return `in ${h} hr${m ? ` ${m} min` : ""}`;
}

/**
 * What is left to take at the visit (plan 4, 4.6): by card from the pay link or QR code when it is enough for a card
 * payment, and marked paid at the shop when the visit is paid there (cash or the shop's own machine). Null when nothing.
 */
export function payAtVisit(b: Booking): { dueMinor: number; byCard: boolean; atShop: boolean } | null {
  if (b.status !== "confirmed" || b.paid) return null;
  const dueMinor = balanceDue(b);
  const atShop = b.payment === "atShop" || (b.payment === "deposit" && !!b.depositPaid);
  const byCard = restPayable(b);
  if (dueMinor <= 0 || (!atShop && !byCard)) return null;
  return { dueMinor, byCard, atShop };
}

/**
 * Clock in and out (plan 4, 4.2, Beta): where the person stands and the one or two buttons that move them on. Their
 * hours go to the owner's Team pay; a mistake is fixed there by the owner.
 */
function ClockCard({ clock, busy, onStep }: { clock: DeskClock; busy: boolean; onStep: (step: ClockStep) => void }) {
  const at = (iso: string) => timeText(iso, ZONE);
  return (
    <section className="tdesk-clock" data-state={clock.state} aria-label="Time clock">
      <span className="tdesk-clock-icon" aria-hidden>{clock.state === "break" ? <Coffee size={20} /> : <Timer size={20} />}</span>
      <div className="tdesk-clock-words">
        <strong>{clock.state === "off" ? "You're not clocked in" : clock.state === "break" ? `On a break since ${at(clock.since)}` : `On the clock since ${at(clock.shiftIn)}`}</strong>
        <span>{clock.state === "off" ? "Clock in when you start, so your hours reach the owner." : `${hoursText(clock.minutes)} worked so far`} <StatusBadge tone="info" glyph={false}>Beta</StatusBadge></span>
      </div>
      <div className="tdesk-clock-acts">
        {clock.state === "off" && <PrimaryButton icon={<LogIn size={16} aria-hidden />} busy={busy} onClick={() => onStep("in")}>Clock in</PrimaryButton>}
        {clock.state === "working" && <>
          <SecondaryButton icon={<Coffee size={16} aria-hidden />} disabled={busy} onClick={() => onStep("break")}>Start a break</SecondaryButton>
          <PrimaryButton icon={<LogOut size={16} aria-hidden />} busy={busy} onClick={() => onStep("out")}>Clock out</PrimaryButton>
        </>}
        {clock.state === "break" && <>
          <PrimaryButton icon={<Timer size={16} aria-hidden />} busy={busy} onClick={() => onStep("back")}>End break</PrimaryButton>
          <SecondaryButton icon={<LogOut size={16} aria-hidden />} disabled={busy} onClick={() => onStep("out")}>Clock out</SecondaryButton>
        </>}
      </div>
    </section>
  );
}

const STEP_DONE: Record<ClockStep, string> = { in: "You're clocked in", break: "Enjoy your break", back: "Welcome back", out: "You're clocked out" };

export function TeamDesk({ email, role, appearance }: { email: string; role: "frontDesk" | "provider"; appearance: "light" | "dark" }) {
  const today = dayOf(Date.now(), ZONE);
  const [day, setDay] = useState(today);
  const [answer, setAnswer] = useState<DeskAnswer | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [creating, setCreating] = useState(false);
  const [ask, confirmNode] = useConfirm();

  const load = useCallback((which: string) => {
    setError("");
    return teamDeskData.day(which).then((a) => { setAnswer(a); }, (e) => setError(e?.message || "Couldn't load the day."));
  }, []);
  useEffect(() => { setAnswer(null); void load(day); }, [day, load]);
  // Keep the list fresh while it is open: someone books online, or a colleague checks a client in.
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(day); }, 60_000);
    return () => window.clearInterval(timer);
  }, [day, load]);

  const rows = useMemo(() => deskRows(answer?.bookings || []), [answer]);
  const counts = deskCounts(rows, Date.now());
  const front = role === "frontDesk";
  const next = day === today ? nextUp(rows, Date.now()) : null;
  const [paying, setPaying] = useState<DeskBooking | null>(null);
  const [noting, setNoting] = useState<DeskBooking | null>(null);

  const act = async (key: string, op: string, body: Record<string, unknown>, done: string) => {
    setBusy(key);
    try {
      await teamDeskData.act(op, body);
      toast.success(done);
      await load(day);
    } catch (e: any) {
      toast.error(e?.message || "That didn't go through. Try again.");
    } finally { setBusy(""); }
  };
  const clockStepNow = async (step: ClockStep) => {
    if (step === "out" && answer?.clock && !await ask({ title: "Clock out?", message: `You've worked ${hoursText(answer.clock.minutes)} on this shift. If you clock out by mistake, ask the owner to fix it.`, confirmLabel: "Clock out" })) return;
    setBusy("clock");
    try {
      const r = await teamDeskData.act("clock", { step });
      setAnswer((a) => (a ? { ...a, clock: r.clock } : a));
      toast.success(STEP_DONE[step]);
    } catch (e: any) {
      toast.error(e?.message || "That didn't go through. Try again.");
      void load(day);
    } finally { setBusy(""); }
  };
  const cancel = async (b: Booking) => {
    if (!await ask({ title: `Cancel ${b.customer.name}'s booking?`, message: "They get an email saying it's cancelled. Anything they paid by card goes back to them.", confirmLabel: "Cancel booking" })) return;
    await act(b.id, "cancel", { id: b.id, refund: true }, "Booking cancelled");
  };

  const title = front ? "Front desk" : answer?.me ? `${answer.me.name}'s day` : "My day";
  return (
    <div className="rp" data-rp-appearance={appearance}>
      <main className="rp-main tdesk" data-team-desk={role}>
        <PageHeader
          title={title}
          description={`Signed in as ${email} · ${ROLE_NAME[role]}`}
          actions={<>
            {front && <PrimaryButton icon={<CalendarPlus size={16} aria-hidden />} disabled={!answer?.services.length} onClick={() => setCreating(true)}>New booking</PrimaryButton>}
            <SecondaryButton icon={<LogOut size={16} aria-hidden />} onClick={() => { void adminApi.logout(); }}>Log out</SecondaryButton>
          </>}
        />
        {answer?.clock && <ClockCard clock={answer.clock} busy={busy === "clock"} onStep={(step) => void clockStepNow(step)} />}
        <div className="tdesk-bar">
          <GhostButton icon={<ChevronLeft size={18} aria-hidden />} aria-label="Day before" onClick={() => setDay(addDays(day, -1))} />
          <h2 className="tdesk-day" aria-live="polite">{dayName(day, today)}{day !== today && <small>{dayText(day, "long")}</small>}</h2>
          <GhostButton icon={<ChevronRight size={18} aria-hidden />} aria-label="Next day" onClick={() => setDay(addDays(day, 1))} />
          <span className="rp-grow" />
          {day !== today && <SecondaryButton size="sm" onClick={() => setDay(today)}>Today</SecondaryButton>}
          <GhostButton size="sm" icon={<RefreshCw size={15} aria-hidden />} onClick={() => void load(day)}>Refresh</GhostButton>
        </div>

        {error ? <ErrorState title="Couldn't load the day" description={error} onRetry={() => void load(day)} />
          : !answer ? <div className="bkg-skeleton" aria-hidden />
          : role === "provider" && !answer.me ? (
            <EmptyState title="You're not on the team list yet" description={`Ask the owner to add ${email} to your entry in Bookings › Team & rooms. Your bookings show here once they have.`} />
          ) : (
            <>
              <div className="tdesk-counts" role="group" aria-label="This day">
                <div><span>{counts.booked}</span>{counts.booked === 1 ? "booking" : "bookings"}</div>
                <div><span>{counts.here}</span>checked in</div>
                <div><span>{counts.toCome}</span>still to come</div>
              </div>
              {next && <NextCard b={next} front={front} busy={!!busy} onCheckIn={() => void act(next.id, "checkIn", { id: next.id }, `${next.customer.name} is checked in`)} />}
              {rows.length === 0 ? (
                <EmptyState title={front ? "Nothing booked" : "No clients booked with you"} description={day === today ? "Enjoy the quiet. New bookings show here as they come in." : "Pick another day with the arrows."}
                  action={front && answer.services.length ? <SecondaryButton icon={<CalendarPlus size={16} aria-hidden />} onClick={() => setCreating(true)}>New booking</SecondaryButton> : undefined} />
              ) : (
                <ul className="tdesk-list">
                  {rows.map((b) => {
                    const tag = listTag(b);
                    const here = !!b.checkedInAt;
                    const started = Date.parse(b.start) <= Date.now();
                    const pay = payAtVisit(b);
                    return (
                      <li key={b.id} className="tdesk-row" data-here={here || undefined} data-noshow={b.noShow || undefined}>
                        <div className="tdesk-time">{timeText(b.start, ZONE)}<small>{b.minutes} min</small></div>
                        <div className="tdesk-who">
                          <strong>{b.customer.name}</strong>
                          <span>{visitName(b)}{front && b.staffName ? ` · with ${b.staffName}` : ""}</span>
                          {b.customer.phone && <a href={`tel:${b.customer.phone.replace(/[^\d+]/g, "")}`}><Phone size={13} aria-hidden /> {b.customer.phone}</a>}
                          {b.note && <p>{b.note}</p>}
                          {b.visitNote ? <p className="tdesk-note"><NotebookPen size={13} aria-hidden /> <span><b>Your note:</b> {b.visitNote}</span></p>
                            : b.lastVisit && <p className="tdesk-note"><NotebookPen size={13} aria-hidden /> <span><b>Last time ({noteDay(b.lastVisit.day)}):</b> {b.lastVisit.note}</span></p>}
                          {pay && <p className="tdesk-due"><CreditCard size={13} aria-hidden /> {moneyText(pay.dueMinor, b.currency)} to pay</p>}
                        </div>
                        <div className="tdesk-state">
                          {here ? <StatusBadge tone="success">Checked in</StatusBadge> : tag ? <StatusBadge tone={tag === "No-show" ? "danger" : "warning"}>{tag}</StatusBadge> : null}
                        </div>
                        <div className="tdesk-acts">
                          {b.status === "confirmed" && !b.noShow && (here
                            ? <GhostButton size="sm" disabled={!!busy} onClick={() => void act(b.id, "checkIn", { id: b.id, value: false }, "Check-in taken off")}>Undo</GhostButton>
                            : <PrimaryButton size="sm" icon={<CheckCircle2 size={15} aria-hidden />} disabled={!!busy} onClick={() => void act(b.id, "checkIn", { id: b.id }, `${b.customer.name} is checked in`)}>Check in</PrimaryButton>)}
                          {pay && here && <SecondaryButton size="sm" icon={<CreditCard size={15} aria-hidden />} disabled={!!busy} onClick={() => setPaying(b)}>Take payment</SecondaryButton>}
                          {b.status === "confirmed" && (
                            <ActionMenu label={`More for ${b.customer.name}`} actions={[
                              ...(pay && !here ? [{ label: "Take payment", onSelect: () => setPaying(b) }] : []),
                              { label: b.visitNote ? "Change your note" : "Add a visit note", onSelect: () => setNoting(b) },
                              ...(started && !here ? [{ label: b.noShow ? "They came after all" : "Didn't turn up", onSelect: () => void act(b.id, "noShow", { id: b.id, value: !b.noShow }, b.noShow ? "No-show taken off" : "Marked as a no-show") }] : []),
                              ...(front ? [{ label: "Cancel booking", tone: "danger" as const, onSelect: () => void cancel(b) }] : []),
                            ]} />
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        {answer && (answer.rota || answer.timeOff) && <DeskPlans rota={answer.rota || []} timeOff={answer.timeOff || []} today={today} onChanged={() => void load(day)} />}
      </main>
      {paying && <DeskPayDialog b={paying} onClose={() => setPaying(null)} onPaid={() => { setPaying(null); void load(day); }} />}
      {noting && <DeskNoteDialog b={noting} onClose={() => setNoting(null)} onSaved={() => { setNoting(null); void load(day); }} />}
      {creating && answer && <DeskBookingDialog day={day} answer={answer} onClose={() => setCreating(false)} onDone={() => { setCreating(false); void load(day); }} />}
      {confirmNode}
    </div>
  );
}

/** The next client (plan 4, 4.6 My day): who, when, last time's note, and the one tap that checks them in. */
function NextCard({ b, front, busy, onCheckIn }: { b: DeskBooking; front: boolean; busy: boolean; onCheckIn: () => void }) {
  const when = startsIn(b.start, Date.now());
  return (
    <section className="tdesk-next" aria-labelledby="tdesk-next-title">
      <div className="tdesk-next-head">
        <span className="tdesk-next-label" id="tdesk-next-title">Next client</span>
        <span className="tdesk-next-when">{timeText(b.start, ZONE)} · {when === "now" ? "now" : when}</span>
      </div>
      <strong className="tdesk-next-name">{b.customer.name}</strong>
      <span className="tdesk-next-what">{visitName(b)} · {b.minutes} min{front && b.staffName ? ` · with ${b.staffName}` : ""}</span>
      {b.lastVisit && <p className="tdesk-note"><NotebookPen size={14} aria-hidden /> <span><b>Last time ({noteDay(b.lastVisit.day)}):</b> {b.lastVisit.note}</span></p>}
      {b.note && <p className="tdesk-next-msg">“{b.note}”</p>}
      <div className="tdesk-next-acts">
        <PrimaryButton icon={<CheckCircle2 size={16} aria-hidden />} disabled={busy} onClick={onCheckIn}>Check in</PrimaryButton>
        {b.customer.phone && <SecondaryButton icon={<Phone size={16} aria-hidden />} onClick={() => { window.location.href = `tel:${b.customer.phone!.replace(/[^\d+]/g, "")}`; }}>Call</SecondaryButton>}
      </div>
    </section>
  );
}

/**
 * Take payment at the visit (plan 4, 4.6): a QR code the client scans to pay by card, the same link by email, or marked
 * paid at the shop for cash or the shop's own card machine. The server checks the booking is theirs and still owes it.
 */
function DeskPayDialog({ b, onClose, onPaid }: { b: DeskBooking; onClose: () => void; onPaid: () => void }) {
  const pay = payAtVisit(b);
  const [busy, setBusy] = useState("");
  const [qr, setQr] = useState("");
  const due = moneyText(pay?.dueMinor || 0, b.currency);
  const first = b.customer.name.split(" ")[0] || "They";
  const run = async (what: "qr" | "send" | "paid") => {
    setBusy(what);
    try {
      if (what === "paid") {
        await teamDeskData.act("paidAtShop", { id: b.id });
        toast.success(`${due} marked paid`);
        onPaid();
        return;
      }
      const r = await teamDeskData.act("payLink", { id: b.id, send: what === "send" });
      if (what === "send") toast.success(`Pay link sent to ${b.customer.email}`);
      else setQr(await qrPicture(r.url, 8));
    } catch (e: any) {
      toast.error(e?.message || "That didn't go through. Try again.");
    } finally { setBusy(""); }
  };
  return (
    <Dialog open onClose={onClose} title={`Take ${due}`} description={`${visitName(b)} · ${b.customer.name}`}
      footer={<SecondaryButton onClick={onClose}>{qr ? "Done" : "Close"}</SecondaryButton>}>
      {qr ? (
        <div className="bkg-qr">
          <img src={qr} alt={`QR code to pay ${due}`} width={264} height={264} />
          <p>{first} points their phone camera at the code and pays by card. It shows as paid once it goes through.</p>
        </div>
      ) : (
        <div className="tdesk-pay">
          {pay?.byCard && <>
            <button type="button" className="tdesk-pay-way" disabled={!!busy} onClick={() => void run("qr")}>
              <QrCode size={22} aria-hidden /><span><strong>Show a QR code</strong><small>They scan it and pay by card on their phone.</small></span>
            </button>
            {b.customer.email && <button type="button" className="tdesk-pay-way" disabled={!!busy} onClick={() => void run("send")}>
              <Mail size={22} aria-hidden /><span><strong>Email the pay link</strong><small>To {b.customer.email}, to pay now or later.</small></span>
            </button>}
          </>}
          {pay?.atShop && (
            <button type="button" className="tdesk-pay-way" disabled={!!busy} onClick={() => void run("paid")}>
              <Banknote size={22} aria-hidden /><span><strong>Paid at the shop</strong><small>Cash, or your own card machine.</small></span>
            </button>
          )}
          {busy && <p className="rp-hint" role="status">Working on it…</p>}
        </div>
      )}
    </Dialog>
  );
}

/** A short note on this visit (plan 4, 4.6): the formula, what was done, what to try next time. Kept on the client card. */
function DeskNoteDialog({ b, onClose, onSaved }: { b: DeskBooking; onClose: () => void; onSaved: () => void }) {
  const [note, setNote] = useState(b.visitNote || "");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");
  const save = async () => {
    setSaving(true); setProblem("");
    try {
      await teamDeskData.act("visitNote", { id: b.id, note: note.trim() });
      toast.success(note.trim() ? "Note saved" : "Note taken off");
      onSaved();
    } catch (e: any) {
      setProblem(e?.message || "The note couldn't be saved. Try again.");
    } finally { setSaving(false); }
  };
  return (
    <Dialog open onClose={onClose} title={`Note on ${b.customer.name}'s visit`} description="It goes on their client card, and shows here next time they come in."
      footer={<>
        <SecondaryButton onClick={onClose}>Close</SecondaryButton>
        <PrimaryButton busy={saving} onClick={() => void save()}>Save note</PrimaryButton>
      </>}>
      <div className="bkg-form">
        {b.lastVisit && <p className="tdesk-note"><NotebookPen size={14} aria-hidden /> <span><b>Last time ({noteDay(b.lastVisit.day)}):</b> {b.lastVisit.note}</span></p>}
        <TextArea label="What you did" rows={5} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)}
          hint="The formula, products, or what to try next time. Only your team sees it." />
        {problem && <p className="bkg-error" role="alert">{problem}</p>}
      </div>
    </Dialog>
  );
}

/** A front desk books someone in: service, person, day, a free time, then who. */
function DeskBookingDialog({ day: firstDay, answer, onClose, onDone }: { day: string; answer: DeskAnswer; onClose: () => void; onDone: () => void }) {
  const [serviceId, setServiceId] = useState(answer.services[0]?.id || "");
  const [staffId, setStaffId] = useState("");
  const [day, setDay] = useState(firstDay);
  const [times, setTimes] = useState<string[] | null>(null);
  const [start, setStart] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!serviceId || !day) return;
    let live = true;
    setTimes(null); setStart("");
    teamDeskData.act("times", { serviceId, day, ...(staffId ? { staffId } : {}) })
      .then((r) => { if (live) setTimes(r.times || []); }, (e) => { if (live) { setTimes([]); setProblem(e?.message || "Couldn't find free times."); } });
    return () => { live = false; };
  }, [serviceId, staffId, day]);
  const save = async () => {
    setProblem("");
    if (!start) return setProblem("Pick a time.");
    if (!name.trim()) return setProblem("Add the client's name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setProblem("Add the client's email address.");
    setSaving(true);
    try {
      await teamDeskData.act("create", { serviceId, start, name: name.trim(), email: email.trim(), phone: phone.trim(), note: note.trim(), ...(staffId ? { staffId } : {}) });
      toast.success(`${name.trim()} is booked`);
      onDone();
    } catch (e: any) {
      setProblem(e?.message || "Couldn't book that time. Pick another.");
    } finally { setSaving(false); }
  };
  return (
    <Dialog open onClose={onClose} title="New booking" description="They get the usual confirmation email."
      footer={<>
        <SecondaryButton onClick={onClose}>Close</SecondaryButton>
        <PrimaryButton busy={saving} onClick={() => void save()}>Make the booking</PrimaryButton>
      </>}>
      <div className="bkg-form">
        <SelectField label="Service" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
          {answer.services.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.minutes} min</option>)}
        </SelectField>
        {answer.staff.length > 1 && (
          <SelectField label="With" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            <option value="">Anyone free</option>
            {answer.staff.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </SelectField>
        )}
        <TextField label="Day" type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
        <SelectField label="Time" value={start} disabled={!times?.length} onChange={(e) => setStart(e.target.value)}
          hint={times === null ? "Finding free times…" : times.length ? undefined : "No free times that day. Try another day or person."}>
          <option value="">{times === null ? "…" : "Pick a time"}</option>
          {(times || []).map((t) => <option key={t} value={t}>{timeText(t, ZONE)}</option>)}
        </SelectField>
        <TextField label="Client's name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        <TextField label="Phone (optional)" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />
        <TextArea label="Note (optional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        {problem && <p className="bkg-error" role="alert">{problem}</p>}
      </div>
    </Dialog>
  );
}
