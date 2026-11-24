// Bookings › Hours & rules › Other calendars (plan 4, 5.7, Beta): an Outlook, Apple or other calendar's private link.
// The server reads it every 15 minutes and clients can't book the times it shows busy, for the whole shop or one person
// (op otherCalendars in functions/bookings.js). Only busy or free is kept; the links never come back to the page.
import { useEffect, useState } from "react";
import { CalendarPlus, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { Dialog, GhostButton, PrimaryButton, SecondaryButton, SelectField, StatusBadge, TextField, useConfirm } from "./riso/components";
import { bookingsAdmin } from "./bookingsApi";
import { CALENDAR_KIND_NAMES, cleanFeedUrl, MAX_FEEDS, type CalendarKind } from "../../shared/calendarFeeds";
import type { StaffMember } from "../../shared/bookingTimes";

type Feed = { id: string; kind: CalendarKind; name: string; who: string; ok: boolean; problem: string; readAt: string | null; count: number };

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const HOW_TO: Array<{ kind: string; steps: string }> = [
  { kind: "Outlook", steps: "On the Outlook website, open Settings, then Calendar, then Shared calendars. Under Publish a calendar, pick the calendar and \"Can view when I'm busy\", press Publish and copy the ICS link." },
  { kind: "Apple Calendar", steps: "In Calendar on your iPhone, tap Calendars, then the info button next to the calendar. Turn on Public Calendar and tap Share Link." },
  { kind: "Google Calendar", steps: "On the Google Calendar website, open the calendar's Settings and sharing. Copy the private address in iCal format, near the bottom of the page." },
];

function AddDialog({ staff, onClose, onAdded }: { staff: StaffMember[]; onClose: () => void; onAdded: (feeds: Feed[]) => void }) {
  const [url, setUrl] = useState("");
  const [who, setWho] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");
  const clean = url.trim() ? cleanFeedUrl(url) : null;
  const linkProblem = clean && "problem" in clean ? clean.problem : "";
  const add = async () => {
    setSaving(true); setProblem("");
    try {
      const r = await bookingsAdmin<{ feeds: Feed[] }>("otherCalendars", { step: "add", url: url.trim(), who, name: name.trim() });
      toast.success("Calendar added. Its busy times are blocked now.");
      onAdded(r.feeds);
    } catch (e) {
      setProblem(e instanceof Error && e.message ? e.message : "The calendar couldn't be added. Try again.");
      setSaving(false);
    }
  };
  return (
    <Dialog open onClose={onClose} title="Add a calendar" description="Clients won't be able to take the times this calendar shows busy. Only busy or free is read, never what your events are."
      footer={<><GhostButton onClick={onClose}>Cancel</GhostButton><PrimaryButton onClick={() => void add()} disabled={!clean || !!linkProblem || saving} busy={saving}>{saving ? "Reading the calendar…" : "Add calendar"}</PrimaryButton></>}>
      <div className="rp-stack">
        <TextField label="Calendar link" type="url" inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://outlook.office365.com/owa/calendar/…/calendar.ics"
          value={url} onChange={(e) => { setUrl(e.target.value); setProblem(""); }} error={linkProblem || problem || undefined}
          hint={clean && "kind" in clean ? `${CALENDAR_KIND_NAMES[clean.kind]} link` : "Starts with https:// or webcal://"} />
        {staff.length > 0 && (
          <SelectField label="Whose time it blocks" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">The whole shop</option>
            {staff.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </SelectField>
        )}
        <TextField label="Name (optional)" maxLength={60} placeholder="Work calendar" value={name} onChange={(e) => setName(e.target.value)} />
        <details className="bkg-ocal-how" data-ocal-how>
          <summary>Where to find the link</summary>
          <dl>
            {HOW_TO.map((h) => <div key={h.kind}><dt>{h.kind}</dt><dd>{h.steps}</dd></div>)}
          </dl>
        </details>
      </div>
    </Dialog>
  );
}

export function OtherCalendarsTile({ staff }: { staff: StaffMember[] }) {
  const [feeds, setFeeds] = useState<Feed[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState("");
  const [ask, confirmNode] = useConfirm();
  const active = staff.filter((p) => p.active);
  useEffect(() => {
    let live = true;
    bookingsAdmin<{ feeds: Feed[] }>("otherCalendars", { step: "list" }).then((r) => live && setFeeds(r.feeds), () => live && setFailed(true));
    return () => { live = false; };
  }, []);
  const whoName = (id: string) => (!id ? "Whole shop" : staff.find((p) => p.id === id)?.name || "Someone who left");
  const refresh = async () => {
    setBusy("refresh");
    try {
      const r = await bookingsAdmin<{ feeds: Feed[] }>("otherCalendars", { step: "refresh" });
      setFeeds(r.feeds);
      toast.success("Calendars checked.");
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "The calendars couldn't be checked. Try again.");
    } finally { setBusy(""); }
  };
  const remove = async (f: Feed) => {
    if (!(await ask({ title: "Remove this calendar?", message: "Its busy times stop blocking bookings. To add it back you'll need its link again.", confirmLabel: "Remove" }))) return;
    setBusy(f.id);
    try {
      const r = await bookingsAdmin<{ feeds: Feed[] }>("otherCalendars", { step: "remove", id: f.id });
      setFeeds(r.feeds);
      toast.success("Calendar removed.");
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "The calendar couldn't be removed. Try again.");
    } finally { setBusy(""); }
  };
  const full = (feeds?.length || 0) >= MAX_FEEDS;
  return (
    <section className="bkg-tile" data-other-calendars>
      <h2 className="bkg-tile-title">Other calendars <StatusBadge tone="info" glyph={false}>Beta</StatusBadge></h2>
      <p className="bkg-cal-text">Keep using Outlook, Apple Calendar or another calendar. Clients can't take the times it shows busy. Changes show within 15 minutes.</p>
      {failed ? <p className="bkg-cal-note">Your calendars couldn't be loaded. Refresh the page to try again.</p>
        : !feeds ? <p className="bkg-cal-note">Loading…</p>
        : feeds.length > 0 && (
          <ul className="bkg-ocal-list" data-ocal-list>
            {feeds.map((f) => (
              <li key={f.id} className="bkg-ocal-row">
                <span className="bkg-ocal-name">
                  <strong>{f.name || CALENDAR_KIND_NAMES[f.kind] || "Calendar"}</strong>
                  <small>{f.name ? `${CALENDAR_KIND_NAMES[f.kind] || "Calendar"} · ` : ""}{whoName(f.who)}</small>
                  {f.ok
                    ? <small>{f.count} busy time{f.count === 1 ? "" : "s"} in the next 60 days{f.readAt ? ` · checked ${when(f.readAt)}` : ""}</small>
                    : <small className="bkg-ocal-problem" role="status">{f.problem || "The calendar couldn't be read."}</small>}
                </span>
                <GhostButton size="sm" onClick={() => void remove(f)} busy={busy === f.id} aria-label={`Remove ${f.name || CALENDAR_KIND_NAMES[f.kind] || "calendar"}`}>Remove</GhostButton>
              </li>
            ))}
          </ul>
        )}
      {feeds && (
        <div className="bkg-ocal-actions">
          <SecondaryButton onClick={() => setAdding(true)} disabled={full}><CalendarPlus size={16} aria-hidden /> Add a calendar</SecondaryButton>
          {feeds.length > 0 && <GhostButton size="sm" onClick={() => void refresh()} busy={busy === "refresh"}><RefreshCw size={14} aria-hidden /> Check now</GhostButton>}
        </div>
      )}
      {full && <p className="bkg-cal-note">You can add up to {MAX_FEEDS} calendars. Remove one to add another.</p>}
      {adding && <AddDialog staff={active} onClose={() => setAdding(false)} onAdded={(next) => { setFeeds(next); setAdding(false); }} />}
      {confirmNode}
    </section>
  );
}
