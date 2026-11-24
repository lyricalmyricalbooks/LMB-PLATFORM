// Hours worked (Bookings plan 4, 4.2, Beta), under Team pay: every shift of the month, with Add hours, and Fix or
// Remove for each one. The team clocks in and out on their own desk (TeamDesk.tsx); a forgotten clock-out is flagged
// here for the owner to fix. All writes go through the server (bookingsAdmin ops saveShift and removeShift).
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Clock, Plus, Trash2 } from "lucide-react";
import { ActionMenu, DataTable, Dialog, GhostButton, PrimaryButton, SecondaryButton, SelectField, StatusBadge, TextField, useConfirm } from "./riso/components";
import { bookingsAdmin } from "./bookingsApi";
import { dayText, monthText } from "./bookingsView";
import { cleanShift, hoursText, MAX_BREAKS, type Shift } from "../../shared/timeClock";
import type { StaffMember } from "../../shared/bookingTimes";
import { breakMinutes, clockTime, momentOn, shiftPeople, shiftSpan, type ShiftRow } from "./shifts";

export function ShiftsPanel({ rows, staff, zone, month, today, onChanged }: {
  rows: ShiftRow[]; staff: StaffMember[]; zone: string; month: string; today: string; onChanged: () => void;
}) {
  const [editing, setEditing] = useState<ShiftRow | "new" | null>(null);
  const [ask, confirmNode] = useConfirm();
  const people = useMemo(() => shiftPeople(staff, rows), [staff, rows]);
  const list = useMemo(() => [...rows].sort((a, b) => b.in.localeCompare(a.in)), [rows]);
  const forgotten = rows.filter((r) => r.forgotten).length;
  const remove = async (r: ShiftRow) => {
    if (!await ask({ title: `Remove ${r.name}'s shift?`, message: `${dayText(r.day, "long")}, ${shiftSpan(r, zone)}. Their hours for the month go down by ${hoursText(r.minutes)}.`, confirmLabel: "Remove" })) return;
    try {
      await bookingsAdmin("removeShift", { id: r.id });
      toast.success("Shift removed");
      onChanged();
    } catch (e: any) { toast.error(e?.message || "That didn't go through. Try again."); }
  };
  const columns = [
    { key: "who", header: "Person", lead: true, render: (r: ShiftRow) => r.name },
    { key: "day", header: "Day", render: (r: ShiftRow) => dayText(r.day, "short") },
    { key: "span", header: "Time", render: (r: ShiftRow) => <>{shiftSpan(r, zone)}{r.forgotten && <> <StatusBadge tone="warning">Forgot to clock out?</StatusBadge></>}</> },
    { key: "breaks", header: "Breaks", numeric: true, render: (r: ShiftRow) => (breakMinutes(r) ? hoursText(breakMinutes(r)) : "None") },
    { key: "hours", header: "Hours", numeric: true, render: (r: ShiftRow) => (r.forgotten ? <span className="bkg-pay-pct">Not counted yet</span> : <strong>{hoursText(r.minutes)}</strong>) },
    { key: "more", header: "", render: (r: ShiftRow) => <ActionMenu label={`More for ${r.name}'s shift`} actions={[
      { label: r.forgotten ? "Add the finish time" : "Fix this shift", onSelect: () => setEditing(r) },
      { label: "Remove", tone: "danger" as const, onSelect: () => void remove(r) },
    ]} /> },
  ];
  return (
    <section className="bkg-shifts" aria-labelledby="bkg-shifts-title">
      <div className="bkg-pay-head">
        <div>
          <h3 id="bkg-shifts-title" className="bkg-shifts-title">Hours worked <StatusBadge tone="info" glyph={false}>Beta</StatusBadge></h3>
          <p className="bkg-figs-lead">Your team clocks in and out on their own sign-in. Add hours for anyone who forgot.</p>
        </div>
        <SecondaryButton icon={<Plus size={16} aria-hidden />} disabled={!people.length} onClick={() => setEditing("new")}>Add hours</SecondaryButton>
      </div>
      {forgotten > 0 && (
        <p className="bkg-pay-note"><span>{forgotten === 1 ? "One shift has" : `${forgotten} shifts have`} been open more than 16 hours, so it isn't counted yet. Add the finish time to count it.</span></p>
      )}
      {!people.length ? (
        <p className="bkg-questions-hint">Give each person their sign-in email in Team &amp; rooms, or add them under Settings › Team, and they can clock in.</p>
      ) : !list.length ? (
        <p className="bkg-shifts-empty"><Clock size={16} aria-hidden /> No hours in {monthText(month, "long")} yet.</p>
      ) : (
        <DataTable caption="Shifts this month" columns={columns} rows={list} rowKey={(r) => r.id} stackOnPhone />
      )}
      {editing && <ShiftDialog shift={editing === "new" ? null : editing} people={people} zone={zone} today={today} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />}
      {confirmNode}
    </section>
  );
}

type BreakDraft = { start: string; end: string };

function ShiftDialog({ shift, people, zone, today, onClose, onSaved }: {
  shift: ShiftRow | null; people: { email: string; name: string; staffId: string }[]; zone: string; today: string;
  onClose: () => void; onSaved: () => void;
}) {
  const [email, setEmail] = useState(shift?.email || people[0]?.email || "");
  const [day, setDay] = useState(shift?.day || today);
  const [start, setStart] = useState(shift ? clockTime(shift.in, zone) : "09:00");
  const [end, setEnd] = useState(shift?.out ? clockTime(shift.out, zone) : shift ? "" : "17:00");
  const [breaks, setBreaks] = useState<BreakDraft[]>(shift ? shift.breaks.map((b) => ({ start: clockTime(b.start, zone), end: b.end ? clockTime(b.end, zone) : "" })) : []);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const person = people.find((p) => p.email === email);

  const save = async () => {
    const inIso = momentOn(day, start, zone);
    const outIso = end ? momentOn(day, end, zone, inIso) : null;
    const draft: Shift = {
      email, name: person?.name || email, ...(person?.staffId ? { staffId: person.staffId } : {}), day, in: inIso, out: outIso,
      breaks: breaks.filter((b) => b.start).map((b) => {
        const s = momentOn(day, b.start, zone, inIso);
        return { start: s, end: b.end ? momentOn(day, b.end, zone, s) : null };
      }),
    };
    // The same checks as the server, so a mistake shows at once in plain words.
    const made = cleanShift(draft);
    if ("error" in made) { setError(made.error); return; }
    setSaving(true); setError("");
    try {
      await bookingsAdmin("saveShift", { shift: { ...draft, ...(shift ? { id: shift.id } : {}) } });
      toast.success(shift ? "Shift saved" : "Hours added");
      onSaved();
    } catch (e: any) { setError(e?.message || "That didn't go through. Try again."); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onClose={onClose} title={shift ? `${shift.name}'s shift` : "Add hours"}
      description="Times are on your shop's clock. A finish time earlier than the start counts as the next morning."
      footer={<><SecondaryButton onClick={onClose}>Close</SecondaryButton><PrimaryButton busy={saving} onClick={() => void save()}>{shift ? "Save shift" : "Add hours"}</PrimaryButton></>}>
      <div className="bkg-shift-form">
        {!shift && (
          <SelectField label="Who" value={email} onChange={(e) => setEmail(e.target.value)}>
            {people.map((p) => <option key={p.email} value={p.email}>{p.name}</option>)}
          </SelectField>
        )}
        <TextField label="Day" type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} />
        <div className="bkg-shift-times">
          <TextField label="Started" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          <TextField label="Finished" type="time" value={end} hint={end ? undefined : "Blank while they're still on the clock."} onChange={(e) => setEnd(e.target.value)} />
        </div>
        {breaks.map((b, i) => (
          <div className="bkg-shift-times bkg-shift-break" key={i}>
            <TextField label={breaks.length > 1 ? `Break ${i + 1} from` : "Break from"} type="time" value={b.start} onChange={(e) => setBreaks(breaks.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
            <TextField label="To" type="time" value={b.end} onChange={(e) => setBreaks(breaks.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
            <GhostButton icon={<Trash2 size={16} aria-hidden />} aria-label="Remove this break" onClick={() => setBreaks(breaks.filter((_, j) => j !== i))} />
          </div>
        ))}
        {breaks.length < MAX_BREAKS && <GhostButton icon={<Plus size={16} aria-hidden />} onClick={() => setBreaks([...breaks, { start: "12:00", end: "12:30" }])}>Add a break</GhostButton>}
        {error && <p className="bkg-shift-error" role="alert">{error}</p>}
      </div>
    </Dialog>
  );
}
