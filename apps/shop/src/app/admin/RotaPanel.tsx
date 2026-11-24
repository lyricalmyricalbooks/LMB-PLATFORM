// Bookings › Shifts & time off (plan 4, 4.3, Beta): time off asks to answer, and the week's rota. The team asks for
// time off and sees their shifts on their own desk (DeskPlans.tsx). An approved ask for someone on Team & rooms
// becomes their days off or blocked time on the server, so clients can't book them then. Planned shifts are a plan
// for the team only: who can be booked still follows Hours & rules and each person's own hours.
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { AlertTriangle, ChevronLeft, ChevronRight, Copy, Plus } from "lucide-react";
import { Dialog, EmptyState, ErrorState, GhostButton, LoadingState, PrimaryButton, SecondaryButton, SelectField, StatusBadge, TextArea, TextField, useConfirm } from "./riso/components";
import { bookingsAdmin } from "./bookingsApi";
import { addDays } from "../../shared/bookingTimes";
import { cleanRotaShift, rotaMinutes, timeOffWhen, MAX_NOTE, type RotaShift, type TimeOff } from "../../shared/teamRota";
import { hoursText } from "../../shared/timeClock";
import { weekStartOf, weekText } from "./bookingsView";
import { STATUS_WORDS } from "./DeskPlans";

type Person = { email: string; name: string; staffId: string };
type Planned = RotaShift & { id: string };
type Ask = TimeOff & { id: string; clashes?: number };
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const clock = (hhmm: string) => {
  const h = Number(hhmm.slice(0, 2));
  return `${h % 12 || 12}${hhmm.slice(3, 5) === "00" ? "" : `:${hhmm.slice(3, 5)}`}${h < 12 ? "am" : "pm"}`;
};

/** Each person's shifts and approved days off for each day of the week, for the rota grid. */
export function rotaGrid(people: readonly Person[], shifts: readonly Planned[], off: readonly TimeOff[], monday: string) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  return people.map((p) => ({
    person: p,
    minutes: shifts.filter((s) => s.email === p.email && days.includes(s.day)).reduce((n, s) => n + rotaMinutes(s), 0),
    cells: days.map((day) => ({
      day,
      shifts: shifts.filter((s) => s.email === p.email && s.day === day),
      off: off.find((t) => t.email === p.email && t.status === "approved" && t.from <= day && t.to >= day) || null,
    })),
  }));
}

export function RotaPanel({ today, onSettingsChanged }: { today: string; onSettingsChanged: () => void }) {
  const [monday, setMonday] = useState(weekStartOf(today));
  const [data, setData] = useState<{ shifts: Planned[]; timeOff: TimeOff[]; people: Person[] } | null>(null);
  const [asks, setAsks] = useState<Ask[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Planned | { email: string; day: string } | null>(null);
  const [answering, setAnswering] = useState<{ ask: Ask; yes: boolean } | null>(null);
  const [copying, setCopying] = useState(false);
  const [ask, confirmNode] = useConfirm();

  const load = useCallback(() => {
    setError("");
    return Promise.all([
      bookingsAdmin<{ shifts: Planned[]; timeOff: TimeOff[]; people: Person[] }>("rota", { from: monday, to: addDays(monday, 6) }).then(setData),
      bookingsAdmin<{ timeOff: Ask[] }>("timeOff").then((r) => setAsks(r.timeOff || [])),
    ]).catch((e) => setError(e?.message || "Couldn't load the rota."));
  }, [monday]);
  useEffect(() => { setData(null); void load(); }, [load]);

  const grid = useMemo(() => (data ? rotaGrid(data.people, data.shifts, data.timeOff, monday) : []), [data, monday]);
  const waiting = (asks || []).filter((a) => a.status === "waiting");
  const answered = (asks || []).filter((a) => a.status === "approved" || a.status === "declined").slice(0, 8);
  const weekMinutes = grid.reduce((n, r) => n + r.minutes, 0);

  const copyLastWeek = async () => {
    if (!await ask({ title: "Copy last week's shifts?", message: `Every shift from ${weekText(addDays(monday, -7))} goes onto the same days this week. Shifts already here stay, and none is added twice.`, confirmLabel: "Copy shifts" })) return;
    setCopying(true);
    try {
      const r = await bookingsAdmin<{ copied: number }>("copyRota", { from: addDays(monday, -7), to: monday });
      toast.success(r.copied ? `${r.copied} ${r.copied === 1 ? "shift" : "shifts"} copied` : "Nothing new to copy");
      await load();
    } catch (e: any) { toast.error(e?.message || "That didn't go through. Try again."); }
    finally { setCopying(false); }
  };

  return (
    <div className="bkg-rota">
      <section className="bkg-rota-asks" aria-labelledby="bkg-off-title">
        <h2 id="bkg-off-title" className="bkg-figs-title">Time off to answer <StatusBadge tone="info" glyph={false}>Beta</StatusBadge></h2>
        <p className="bkg-figs-lead">Your team asks from their own sign-in. Approving gives them the days off, so clients can't make bookings with them then.</p>
        {!asks ? null : waiting.length === 0 ? (
          <p className="bkg-shifts-empty">Nothing waiting. New asks come by email too.</p>
        ) : (
          <ul className="bkg-rota-asklist">
            {waiting.map((a) => (
              <li key={a.id} className="bkg-rota-ask">
                <div>
                  <strong>{a.name}</strong>
                  <span>{timeOffWhen(a)}{a.note ? ` · “${a.note}”` : ""}</span>
                  {!!a.clashes && <span className="bkg-rota-clash"><AlertTriangle size={15} aria-hidden /> {a.clashes === 1 ? "1 booking" : `${a.clashes} bookings`} with them then. Move {a.clashes === 1 ? "it" : "them"} to someone else after approving.</span>}
                  {!a.staffId && <span className="bkg-rota-note">Not on Team &amp; rooms, so approving doesn't change any booking times.</span>}
                </div>
                <div className="bkg-rota-askacts">
                  <SecondaryButton size="sm" onClick={() => setAnswering({ ask: a, yes: false })}>Decline</SecondaryButton>
                  <PrimaryButton size="sm" onClick={() => setAnswering({ ask: a, yes: true })}>Approve</PrimaryButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bkg-rota-week" aria-labelledby="bkg-rota-title">
        <div className="bkg-pay-head">
          <div>
            <h2 id="bkg-rota-title" className="bkg-figs-title">Planned shifts</h2>
            <p className="bkg-figs-lead">Who works when, for your team to see on their own sign-in. Booking times still follow each person's hours.</p>
          </div>
          <div className="bkg-pay-actions">
            <SecondaryButton icon={<Copy size={16} aria-hidden />} busy={copying} onClick={() => void copyLastWeek()}>Copy last week</SecondaryButton>
          </div>
        </div>
        <div className="tdesk-bar">
          <GhostButton icon={<ChevronLeft size={18} aria-hidden />} aria-label="Week before" onClick={() => setMonday(addDays(monday, -7))} />
          <h3 className="tdesk-day" aria-live="polite">{weekText(monday)}</h3>
          <GhostButton icon={<ChevronRight size={18} aria-hidden />} aria-label="Next week" onClick={() => setMonday(addDays(monday, 7))} />
          <span className="rp-grow" />
          {monday !== weekStartOf(today) && <SecondaryButton size="sm" onClick={() => setMonday(weekStartOf(today))}>This week</SecondaryButton>}
          {data && <span className="bkg-rota-total">{hoursText(weekMinutes)} planned</span>}
        </div>
        {error ? <ErrorState title="The rota couldn't be loaded" description={error} onRetry={() => void load()} />
          : !data ? <LoadingState label="Loading the week…" />
          : !data.people.length ? <EmptyState title="Nobody to plan yet" description="Give people on Team & rooms their sign-in email, or add someone as Front desk or Service provider under Settings › Team." />
          : (
            <div className="bkg-rota-grid" role="table" aria-label={`Planned shifts, ${weekText(monday)}`}>
              <div className="bkg-rota-row bkg-rota-headrow" role="row">
                <span role="columnheader">Person</span>
                {WEEKDAYS.map((w, i) => {
                  const day = addDays(monday, i);
                  return <span role="columnheader" key={w} data-today={day === today || undefined}>{w} {Number(day.slice(8))}</span>;
                })}
              </div>
              {grid.map((r) => (
                <div className="bkg-rota-row" role="row" key={r.person.email}>
                  <span role="rowheader" className="bkg-rota-who"><strong>{r.person.name}</strong><small>{r.minutes ? hoursText(r.minutes) : "No shifts"}</small></span>
                  {r.cells.map((c, i) => (
                    <span role="cell" className="bkg-rota-cell" key={c.day} data-today={c.day === today || undefined}>
                      <em className="bkg-rota-dayname">{WEEKDAYS[i]} {Number(c.day.slice(8))}</em>
                      {c.off && <span className="bkg-rota-off">{c.off.start ? `Off ${clock(c.off.start)}–${clock(c.off.end || "")}` : "Time off"}</span>}
                      {c.shifts.map((s) => (
                        <button type="button" key={s.id} className="bkg-rota-chip" onClick={() => setEditing(s)} aria-label={`${r.person.name}, ${clock(s.start)} to ${clock(s.end)}. Change`}>
                          {clock(s.start)}–{clock(s.end)}
                        </button>
                      ))}
                      <button type="button" className="bkg-rota-add" onClick={() => setEditing({ email: r.person.email, day: c.day })} aria-label={`Add a shift for ${r.person.name} on ${WEEKDAYS[i]}`}><Plus size={14} aria-hidden /></button>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          )}
      </section>

      {answered.length > 0 && (
        <section className="bkg-rota-past" aria-labelledby="bkg-past-off">
          <h3 id="bkg-past-off" className="bkg-shifts-title">Answered lately</h3>
          <ul className="tdesk-plan-list">
            {answered.map((a) => (
              <li key={a.id}><strong>{a.name} · {timeOffWhen(a)}</strong><span><StatusBadge tone={STATUS_WORDS[a.status].tone}>{STATUS_WORDS[a.status].label}</StatusBadge>{a.answer ? ` “${a.answer}”` : ""}</span></li>
            ))}
          </ul>
        </section>
      )}

      {editing && data && <RotaDialog shift={"id" in editing ? editing : null} start={"id" in editing ? null : editing} people={data.people} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
      {answering && <AnswerDialog ask={answering.ask} yes={answering.yes} onClose={() => setAnswering(null)} onDone={() => { setAnswering(null); void load(); onSettingsChanged(); }} />}
      {confirmNode}
    </div>
  );
}

function RotaDialog({ shift, start: blank, people, onClose, onSaved }: {
  shift: Planned | null; start: { email: string; day: string } | null; people: Person[]; onClose: () => void; onSaved: () => void;
}) {
  const [email, setEmail] = useState(shift?.email || blank?.email || people[0]?.email || "");
  const [day, setDay] = useState(shift?.day || blank?.day || "");
  const [start, setStart] = useState(shift?.start || "09:00");
  const [end, setEnd] = useState(shift?.end || "17:00");
  const [note, setNote] = useState(shift?.note || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const person = people.find((p) => p.email === email);
  const draft = { email, name: person?.name || email, ...(person?.staffId ? { staffId: person.staffId } : {}), day, start, end, note };
  const save = async () => {
    const made = cleanRotaShift(draft);
    if ("error" in made) { setError(made.error); return; }
    setSaving(true); setError("");
    try {
      await bookingsAdmin("saveRota", { shift: { ...draft, ...(shift ? { id: shift.id } : {}) } });
      toast.success(shift ? "Shift saved" : "Shift added");
      onSaved();
    } catch (e: any) { setError(e?.message || "That didn't go through. Try again."); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    if (!shift) return;
    setSaving(true);
    try {
      await bookingsAdmin("removeRota", { id: shift.id });
      toast.success("Shift removed");
      onSaved();
    } catch (e: any) { setError(e?.message || "That didn't go through. Try again."); setSaving(false); }
  };
  return (
    <Dialog open onClose={onClose} title={shift ? `${shift.name}'s shift` : "Add a shift"}
      footerStart={shift ? <GhostButton disabled={saving} onClick={() => void remove()}>Remove</GhostButton> : undefined}
      footer={<><SecondaryButton onClick={onClose}>Close</SecondaryButton><PrimaryButton busy={saving} onClick={() => void save()}>{shift ? "Save shift" : "Add shift"}</PrimaryButton></>}>
      <div className="bkg-shift-form">
        <SelectField label="Who" value={email} onChange={(e) => setEmail(e.target.value)}>
          {people.map((p) => <option key={p.email} value={p.email}>{p.name}</option>)}
        </SelectField>
        <TextField label="Day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        <div className="bkg-shift-times">
          <TextField label="Starts" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          <TextField label="Ends" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <TextField label="Note (optional)" placeholder="Opening, front desk, market stall" value={note} maxLength={MAX_NOTE} onChange={(e) => setNote(e.target.value)} />
        {error && <p className="bkg-shift-error" role="alert">{error}</p>}
      </div>
    </Dialog>
  );
}

function AnswerDialog({ ask, yes, onClose, onDone }: { ask: Ask; yes: boolean; onClose: () => void; onDone: () => void }) {
  const [answer, setAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const send = async () => {
    setSaving(true); setError("");
    try {
      await bookingsAdmin("answerTimeOff", { id: ask.id, yes, answer });
      toast.success(yes ? "Approved. They'll get an email." : "Declined. They'll get an email.");
      onDone();
    } catch (e: any) { setError(e?.message || "That didn't go through. Try again."); setSaving(false); }
  };
  return (
    <Dialog open onClose={onClose} title={yes ? `Approve ${ask.name}'s time off?` : `Decline ${ask.name}'s time off?`}
      description={`${timeOffWhen(ask)}. ${yes ? (ask.staffId ? (ask.start ? "That time is blocked for them on the calendar." : "Those days become their days off.") : "It's noted; no booking times change.") : "Nothing changes on the calendar."}`}
      footer={<><SecondaryButton onClick={onClose}>Close</SecondaryButton><PrimaryButton busy={saving} onClick={() => void send()}>{yes ? "Approve" : "Decline"}</PrimaryButton></>}>
      <div className="bkg-shift-form">
        {yes && !!ask.clashes && <p className="bkg-rota-clash"><AlertTriangle size={15} aria-hidden /> {ask.clashes === 1 ? "1 booking stays" : `${ask.clashes} bookings stay`} with them. Move {ask.clashes === 1 ? "it" : "them"} from the calendar afterwards.</p>}
        <TextArea label="A word for them (optional)" rows={2} maxLength={MAX_NOTE} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={yes ? "Enjoy it!" : "We're short that week. Could you take the week after?"} />
        {error && <p className="bkg-shift-error" role="alert">{error}</p>}
      </div>
    </Dialog>
  );
}
