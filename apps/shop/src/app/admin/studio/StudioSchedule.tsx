// Theme actions › Schedule publishing (Studio 3.5): publish the draft or a saved theme at a set time, or run a
// campaign (a look from … until …, then the shop switches back). Entries are admin-only `themeSchedule` documents the
// server scheduler runs every 15 minutes (functions/themeSchedule.js); times are Toronto time.
import { useEffect, useState } from "react";
import { Dialog, PrimaryButton, SecondaryButton, StatusBadge } from "../riso/components";
import { designSize } from "./studioChecks";
import { friendlyError } from "./friendlyError";
import {
  formatToronto, isoToTorontoLocal, NOTE_WORDS, scheduleProblems, schedulerHealth, STATUS_WORDS, torontoLocalToIso,
  type ScheduleEntry, type ScheduleKind,
} from "./themeSchedule";
import type { SavedTheme } from "./savedThemes";

export type ScheduleApi = {
  list: () => Promise<ScheduleEntry[]>;
  add: (entry: { kind: ScheduleKind; name: string; startAt: string; endAt?: string | null; design: any }) => Promise<unknown>;
  cancel: (id: string) => Promise<void>;
  endNow: (id: string) => Promise<void>;
  status: () => Promise<{ lastRunAt?: string } | null>;
};
type Props = {
  open: boolean;
  onClose: () => void;
  draft: any;
  savedThemes: SavedTheme[];
  /** Pre-select a saved theme (Themes › ··· › Schedule…). */
  initialThemeId?: string | null;
  api: ScheduleApi;
  askConfirm: (opts: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
  say: (kind: "ok" | "err", text: string) => void;
};

const denied = (err: any) => err?.code === "permission-denied" || /insufficient permissions/i.test(String(err?.message || err));
const inAnHour = () => isoToTorontoLocal(new Date(Math.ceil((Date.now() + 3_600_000) / 900_000) * 900_000).toISOString());

export function StudioSchedule(p: Props) {
  const [entries, setEntries] = useState<ScheduleEntry[] | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [source, setSource] = useState<string>("draft");
  const [kind, setKind] = useState<ScheduleKind>("publish");
  const [start, setStart] = useState(inAnHour());
  const [end, setEnd] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  // The list couldn't be read (not a rules problem): show that with Retry, never "Nothing scheduled."
  const [loadFailed, setLoadFailed] = useState(false);

  const load = async () => {
    try {
      const [list, status] = await Promise.all([p.api.list(), p.api.status().catch(() => null)]);
      setEntries(list); setLastRunAt(status?.lastRunAt || null); setUnavailable(false); setLoadFailed(false);
    } catch (err) { setEntries([]); if (denied(err)) setUnavailable(true); else setLoadFailed(true); }
  };
  useEffect(() => {
    if (!p.open) return;
    setSource(p.initialThemeId && p.savedThemes.some(t => t.id === p.initialThemeId) ? `theme:${p.initialThemeId}` : "draft");
    // A fresh default time each time the dialog opens (not the time Studio was opened).
    setStart(inAnHour()); setEnd("");
    setTried(false); void load();
  }, [p.open]); // eslint-disable-line react-hooks/exhaustive-deps

  const theme = source.startsWith("theme:") ? p.savedThemes.find(t => `theme:${t.id}` === source) : null;
  const design = theme ? theme.design : p.draft;
  const defaultName = theme ? theme.name : "Draft";
  const startAt = torontoLocalToIso(start), endAt = kind === "campaign" ? torontoLocalToIso(end) : null;
  const problems = [
    ...scheduleProblems({ kind, startAt, endAt, startLocal: start, endLocal: kind === "campaign" ? end : undefined }, entries || []),
    // A campaign keeps the design it replaces too, so the stored entry holds two designs.
    ...(designSize(design).bytes * (kind === "campaign" ? 2 : 1) > 900_000 ? ["This design is too large to schedule. Remove unused sections first."] : []),
  ];

  const submit = async () => {
    setTried(true);
    if (problems.length || !startAt) return;
    setBusy(true);
    try {
      await p.api.add({ kind, name: name.trim() || defaultName, startAt, endAt, design });
      p.say("ok", kind === "campaign" ? `Campaign scheduled: ${formatToronto(startAt)} to ${formatToronto(endAt)}.` : `Scheduled to go live ${formatToronto(startAt)}.`);
      setName(""); setTried(false); await load();
    } catch (err) {
      if (denied(err)) setUnavailable(true);
      else p.say("err", "Couldn't save the schedule. Check your connection and try again.");
    } finally { setBusy(false); }
  };
  const cancel = async (e: ScheduleEntry) => {
    if (!(await p.askConfirm({ title: `Cancel “${e.name}”?`, message: "It won't go live. Nothing on the shop changes.", confirmLabel: "Cancel schedule" }))) return;
    try { await p.api.cancel(e.id); p.say("ok", "Schedule cancelled."); await load(); }
    catch (err: any) { p.say("err", friendlyError(err, "cancel the schedule")); await load(); }
  };
  const endNow = async (e: ScheduleEntry) => {
    if (!(await p.askConfirm({ title: `End “${e.name}” now?`, message: "The shop switches back to the design it replaced at the scheduler's next check (within 15 minutes).", confirmLabel: "End campaign" }))) return;
    try { await p.api.endNow(e.id); p.say("ok", "The campaign will end within 15 minutes."); await load(); }
    catch { p.say("err", "Couldn't end the campaign. Try again."); }
  };

  const health = schedulerHealth(lastRunAt);
  const active = (entries || []).filter(e => e.status === "scheduled" || e.status === "live").sort((a, b) => a.startAt.localeCompare(b.startAt));
  const past = (entries || []).filter(e => e.status !== "scheduled" && e.status !== "live").slice(0, 8);
  const row = (e: ScheduleEntry) => (
    <li key={e.id} className="studio-schedule-row" data-schedule-id={e.id}>
      <div>
        <span className="studio-schedule-title"><strong>{e.name}</strong>
          <StatusBadge tone={e.status === "live" ? "success" : e.status === "scheduled" ? "info" : "neutral"}>{STATUS_WORDS[e.status] || e.status}</StatusBadge></span>
        <small>{e.kind === "campaign" ? `Campaign · ${formatToronto(e.startAt)} → ${formatToronto(e.endAt)}` : `Publish · ${formatToronto(e.startAt)}`}</small>
        {e.note && NOTE_WORDS[e.note] && <small>{NOTE_WORDS[e.note]}</small>}
      </div>
      {e.status === "scheduled" && <SecondaryButton size="sm" onClick={() => cancel(e)}>Cancel</SecondaryButton>}
      {e.status === "live" && e.kind === "campaign" && <SecondaryButton size="sm" onClick={() => endNow(e)}>End now</SecondaryButton>}
    </li>
  );

  return (
    <Dialog open={p.open} onClose={p.onClose} size="lg" title="Schedule publishing"
      description="Publish a design at a set time, or run a campaign that switches back by itself. Times are Toronto time.">
      <div className="studio-schedule" data-studio-panel="schedule">
        {unavailable ? (
          <p className="studio-share-note" role="status">Scheduling needs the updated Firestore rules (<code>themeSchedule</code>) and Cloud Functions. Deploy them, then try again.</p>
        ) : <>
          <p className={`studio-schedule-health is-${health.state}`} role="status" data-scheduler-health={health.state}>{health.text}</p>
          <section className="studio-schedule-form">
            <h3>New</h3>
            <label className="studio-scheme-field">What
              <select value={source} onChange={e => setSource(e.target.value)}>
                <option value="draft">Your draft, as it is now</option>
                {p.savedThemes.map(t => <option key={t.id} value={`theme:${t.id}`}>My theme: {t.name}</option>)}
              </select>
            </label>
            <fieldset className="studio-schedule-kind">
              <legend>How</legend>
              <label><input type="radio" name="schedule-kind" checked={kind === "publish"} onChange={() => setKind("publish")} /> Publish at a time (it stays live)</label>
              <label><input type="radio" name="schedule-kind" checked={kind === "campaign"} onChange={() => { setKind("campaign"); if (!end && startAt) setEnd(isoToTorontoLocal(new Date(Date.parse(startAt) + 7 * 86_400_000).toISOString())); }} /> Campaign: from a time until a time, then switch back</label>
            </fieldset>
            <div className="studio-schedule-times">
              <label className="studio-scheme-field">{kind === "campaign" ? "Starts" : "Goes live"}
                <input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} />
              </label>
              {kind === "campaign" && <label className="studio-scheme-field">Ends
                <input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} />
              </label>}
            </div>
            <label className="studio-scheme-field">Name (for you)
              <input value={name} placeholder={defaultName} onChange={e => setName(e.target.value)} />
            </label>
            {tried && problems.length > 0 && <ul className="studio-schedule-problems" role="alert">{problems.map(x => <li key={x}>{x}</li>)}</ul>}
            <p className="studio-hint">It saves a copy of the design as it is now; later edits aren't included. {kind === "campaign" ? "When it ends, the shop goes back to the design that was live before it — unless you publish something else meanwhile, which is kept." : ""}</p>
            <PrimaryButton size="sm" disabled={busy} onClick={submit}>{busy ? "Saving…" : kind === "campaign" ? "Schedule campaign" : "Schedule publish"}</PrimaryButton>
          </section>
          <section>
            <h3>Coming up and running</h3>
            {entries === null ? <p className="studio-empty">Loading…</p> : loadFailed ? <p className="studio-empty" role="alert">Couldn't load scheduled designs. <SecondaryButton size="sm" onClick={() => { setEntries(null); void load(); }}>Retry</SecondaryButton></p> : active.length ? <ul className="studio-schedule-list">{active.map(row)}</ul> : <p className="studio-empty">Nothing scheduled.</p>}
          </section>
          {past.length > 0 && <section><h3>Earlier</h3><ul className="studio-schedule-list">{past.map(row)}</ul></section>}
        </>}
      </div>
    </Dialog>
  );
}
