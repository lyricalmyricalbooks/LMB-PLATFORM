// Shifts and time off on the team desk (Bookings plan 4, 4.3, Beta): the person's planned shifts for the next two
// weeks and their time off asks, with Ask for time off and Withdraw. The owner answers in Bookings › Shifts & time off.
import { useState } from "react";
import toast from "react-hot-toast";
import { CalendarOff, Plus } from "lucide-react";
import { Dialog, GhostButton, PrimaryButton, SecondaryButton, StatusBadge, TextArea, TextField, Toggle } from "./riso/components";
import { cleanTimeOff, rotaMinutes, timeOffWhen, MAX_NOTE, type RotaShift, type TimeOff } from "../../shared/teamRota";
import { hoursText } from "../../shared/timeClock";
import { dayText } from "./bookingsView";
import { teamDeskData } from "./teamDeskApi";

const clock = (hhmm: string) => {
  const h = Number(hhmm.slice(0, 2));
  return `${h % 12 || 12}:${hhmm.slice(3, 5)} ${h < 12 ? "AM" : "PM"}`;
};
export const STATUS_WORDS: Record<TimeOff["status"], { label: string; tone: "warning" | "success" | "danger" | "neutral" }> = {
  waiting: { label: "Waiting for an answer", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  declined: { label: "Declined", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

export function DeskPlans({ rota, timeOff, today, onChanged }: {
  rota: (RotaShift & { id: string })[]; timeOff: (TimeOff & { id: string })[]; today: string; onChanged: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState("");
  const withdraw = async (id: string) => {
    setBusy(id);
    try {
      await teamDeskData.act("withdrawTimeOff", { id });
      toast.success("Request withdrawn");
      onChanged();
    } catch (e: any) { toast.error(e?.message || "That didn't go through. Try again."); }
    finally { setBusy(""); }
  };
  const shown = timeOff.filter((t) => t.status !== "withdrawn");
  return (
    <div className="tdesk-plans">
      <section className="tdesk-plan" aria-labelledby="tdesk-rota">
        <h2 id="tdesk-rota" className="tdesk-plan-title">Your shifts <StatusBadge tone="info" glyph={false}>Beta</StatusBadge></h2>
        {rota.length ? (
          <ul className="tdesk-plan-list">
            {rota.map((s) => (
              <li key={s.id}>
                <strong>{s.day === today ? "Today" : dayText(s.day, "long")}</strong>
                <span>{clock(s.start)} to {clock(s.end)} · {hoursText(rotaMinutes(s))}{s.note ? ` · ${s.note}` : ""}</span>
              </li>
            ))}
          </ul>
        ) : <p className="tdesk-plan-empty">No shifts planned for the next two weeks yet.</p>}
      </section>
      <section className="tdesk-plan" aria-labelledby="tdesk-off">
        <div className="tdesk-plan-head">
          <h2 id="tdesk-off" className="tdesk-plan-title">Time off</h2>
          <SecondaryButton size="sm" icon={<Plus size={15} aria-hidden />} onClick={() => setAsking(true)}>Ask for time off</SecondaryButton>
        </div>
        {shown.length ? (
          <ul className="tdesk-plan-list">
            {shown.map((t) => (
              <li key={t.id}>
                <strong>{timeOffWhen(t)}</strong>
                <span><StatusBadge tone={STATUS_WORDS[t.status].tone}>{STATUS_WORDS[t.status].label}</StatusBadge>{t.answer ? ` “${t.answer}”` : ""}</span>
                {t.status === "waiting" && <GhostButton size="sm" disabled={!!busy} onClick={() => void withdraw(t.id)}>Withdraw</GhostButton>}
              </li>
            ))}
          </ul>
        ) : <p className="tdesk-plan-empty"><CalendarOff size={16} aria-hidden /> Ask here, and you'll get an email when the owner answers.</p>}
      </section>
      {asking && <TimeOffDialog today={today} onClose={() => setAsking(false)} onDone={() => { setAsking(false); onChanged(); }} />}
    </div>
  );
}

function TimeOffDialog({ today, onClose, onDone }: { today: string; onClose: () => void; onDone: () => void }) {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [part, setPart] = useState(false);
  const [start, setStart] = useState("13:00");
  const [end, setEnd] = useState("17:00");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const send = async () => {
    const ask = { from, to: part ? from : to, ...(part ? { start, end } : {}), note };
    // The same checks as the server, in plain words before sending.
    const made = cleanTimeOff({ ...ask, email: "you@example.com" }, today);
    if ("error" in made) { setError(made.error); return; }
    setSaving(true); setError("");
    try {
      await teamDeskData.act("askTimeOff", { ask });
      toast.success("Sent to the owner");
      onDone();
    } catch (e: any) { setError(e?.message || "That didn't go through. Try again."); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open onClose={onClose} title="Ask for time off" description="The owner gets an email, and you'll get one with their answer."
      footer={<><SecondaryButton onClick={onClose}>Close</SecondaryButton><PrimaryButton busy={saving} onClick={() => void send()}>Send request</PrimaryButton></>}>
      <div className="bkg-shift-form">
        <div className="bkg-shift-times">
          <TextField label={part ? "Day" : "First day off"} type="date" value={from} min={today} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} />
          {!part && <TextField label="Last day off" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />}
        </div>
        <Toggle label="Only part of the day" checked={part} onChange={setPart} />
        {part && (
          <div className="bkg-shift-times">
            <TextField label="From" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            <TextField label="To" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        )}
        <TextArea label="Note for the owner (optional)" value={note} maxLength={MAX_NOTE} rows={2} onChange={(e) => setNote(e.target.value)} />
        {error && <p className="bkg-shift-error" role="alert">{error}</p>}
      </div>
    </Dialog>
  );
}
