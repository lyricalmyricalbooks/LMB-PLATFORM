// The team desk (Bookings plan 4, 4.1, Beta): what a front desk or a service provider sees instead of the admin.
// A front desk sees every calendar, books for anyone, checks people in and cancels; a service provider sees only
// their own bookings and checks their own clients in. Every read and action goes through the server
// (teamDeskApi.ts › functions/bookings.js handleDesk), which holds each role to what it may do (DESK_OPS).
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, LogOut, Phone, RefreshCw } from "lucide-react";
import {
  ActionMenu, Dialog, EmptyState, ErrorState, GhostButton, PageHeader, PrimaryButton, SecondaryButton, SelectField, StatusBadge, TextArea, TextField, useConfirm,
} from "./riso/components";
import { adminApi } from "./api";
import { addDays, dayOf, visitName } from "../../shared/bookingTimes";
import { shopTimeZone } from "../../shared/shopTimeZone";
import type { Booking } from "./bookingsApi";
import { dayText, listTag, timeText } from "./bookingsView";
import { teamDeskData, type DeskAnswer } from "./teamDeskApi";
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
export function deskRows(list: readonly Booking[]): Booking[] {
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
              {rows.length === 0 ? (
                <EmptyState title={front ? "Nothing booked" : "No clients booked with you"} description={day === today ? "Enjoy the quiet. New bookings show here as they come in." : "Pick another day with the arrows."}
                  action={front && answer.services.length ? <SecondaryButton icon={<CalendarPlus size={16} aria-hidden />} onClick={() => setCreating(true)}>New booking</SecondaryButton> : undefined} />
              ) : (
                <ul className="tdesk-list">
                  {rows.map((b) => {
                    const tag = listTag(b);
                    const here = !!b.checkedInAt;
                    const started = Date.parse(b.start) <= Date.now();
                    return (
                      <li key={b.id} className="tdesk-row" data-here={here || undefined} data-noshow={b.noShow || undefined}>
                        <div className="tdesk-time">{timeText(b.start, ZONE)}<small>{b.minutes} min</small></div>
                        <div className="tdesk-who">
                          <strong>{b.customer.name}</strong>
                          <span>{visitName(b)}{front && b.staffName ? ` · with ${b.staffName}` : ""}</span>
                          {b.customer.phone && <a href={`tel:${b.customer.phone.replace(/[^\d+]/g, "")}`}><Phone size={13} aria-hidden /> {b.customer.phone}</a>}
                          {b.note && <p>{b.note}</p>}
                        </div>
                        <div className="tdesk-state">
                          {here ? <StatusBadge tone="success">Checked in</StatusBadge> : tag ? <StatusBadge tone={tag === "No-show" ? "danger" : "warning"}>{tag}</StatusBadge> : null}
                        </div>
                        <div className="tdesk-acts">
                          {b.status === "confirmed" && !b.noShow && (here
                            ? <GhostButton size="sm" disabled={!!busy} onClick={() => void act(b.id, "checkIn", { id: b.id, value: false }, "Check-in taken off")}>Undo</GhostButton>
                            : <PrimaryButton size="sm" icon={<CheckCircle2 size={15} aria-hidden />} disabled={!!busy} onClick={() => void act(b.id, "checkIn", { id: b.id }, `${b.customer.name} is checked in`)}>Check in</PrimaryButton>)}
                          {b.status === "confirmed" && (
                            <ActionMenu label={`More for ${b.customer.name}`} actions={[
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
      </main>
      {creating && answer && <DeskBookingDialog day={day} answer={answer} onClose={() => setCreating(false)} onDone={() => { setCreating(false); void load(day); }} />}
      {confirmNode}
    </div>
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
