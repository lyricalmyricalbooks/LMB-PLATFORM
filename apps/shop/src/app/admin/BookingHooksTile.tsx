// Bookings › Hours & rules › Send bookings to other apps (plan 4, 5.8, Beta): web addresses from other tools (a
// spreadsheet, a mailing list, an automation service). Each new, moved or cancelled booking is posted there by the server,
// signed with the address's own key (op bookingHooks; functions/bookingHooks.js). Owner only.
import { useEffect, useState } from "react";
import { Copy, Link2, Send } from "lucide-react";
import toast from "react-hot-toast";
import { Checkbox, Dialog, GhostButton, IconButton, PrimaryButton, SecondaryButton, StatusBadge, TextField, Toggle, useConfirm } from "./riso/components";
import { bookingsAdmin } from "./bookingsApi";
import { copyText } from "./clipboard";

type HookEvent = "booking.created" | "booking.moved" | "booking.cancelled";
type Hook = { id: string; url: string; secret: string; events: HookEvent[]; on: boolean; paused: boolean; lastAt: string | null; lastStatus: number | null; problem: string };

export const HOOK_EVENT_NAMES: Record<HookEvent, string> = { "booking.created": "New bookings", "booking.moved": "Moved bookings", "booking.cancelled": "Cancelled bookings" };
const ALL_EVENTS = Object.keys(HOOK_EVENT_NAMES) as HookEvent[];
const MAX_HOOKS = 5;

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
/** The address without its secret-looking tail: the site and the start of the path. */
export function shortAddress(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 18 ? `${u.pathname.slice(0, 16)}…` : u.pathname;
    return `${u.hostname}${path === "/" ? "" : path}`;
  } catch { return url; }
}

function AddDialog({ onClose, onAdded }: { onClose: () => void; onAdded: (hooks: Hook[]) => void }) {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<HookEvent[]>(ALL_EVENTS);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");
  const shapeProblem = url.trim() && !/^https:\/\//i.test(url.trim()) ? "The address must start with https://." : "";
  const add = async () => {
    setSaving(true); setProblem("");
    try {
      const r = await bookingsAdmin<{ hooks: Hook[] }>("bookingHooks", { step: "add", url: url.trim(), events });
      toast.success("Address added. Send a test to check it works.");
      onAdded(r.hooks);
    } catch (e) {
      setProblem(e instanceof Error && e.message ? e.message : "The address couldn't be added. Try again.");
      setSaving(false);
    }
  };
  const flip = (e: HookEvent, on: boolean) => setEvents(on ? ALL_EVENTS.filter((x) => x === e || events.includes(x)) : events.filter((x) => x !== e));
  return (
    <Dialog open onClose={onClose} title="Send bookings to another app" description="In the other app, choose to receive data from a web address. Paste the address it gives you here."
      footer={<><GhostButton onClick={onClose}>Cancel</GhostButton><PrimaryButton onClick={() => void add()} disabled={!url.trim() || !!shapeProblem || !events.length || saving} busy={saving}>Add address</PrimaryButton></>}>
      <div className="rp-stack">
        <TextField label="Web address" type="url" inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://hooks.example.com/catch/…"
          value={url} onChange={(e) => { setUrl(e.target.value); setProblem(""); }} error={shapeProblem || problem || undefined} />
        <div className="bkg-hook-events" role="group" aria-labelledby="bkg-hook-events-label">
          <p id="bkg-hook-events-label" className="bkg-hook-events-label">What to send</p>
          {ALL_EVENTS.map((e) => <Checkbox key={e} label={HOOK_EVENT_NAMES[e]} checked={events.includes(e)} onChange={(x) => flip(e, x.target.checked)} />)}
          {!events.length && <p className="bkg-cal-note">Pick at least one.</p>}
        </div>
      </div>
    </Dialog>
  );
}

export function BookingHooksTile() {
  const [hooks, setHooks] = useState<Hook[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState("");
  const [shown, setShown] = useState("");
  const [ask, confirmNode] = useConfirm();
  useEffect(() => {
    let live = true;
    bookingsAdmin<{ hooks: Hook[] }>("bookingHooks", { step: "list" }).then((r) => live && setHooks(r.hooks), () => live && setFailed(true));
    return () => { live = false; };
  }, []);
  const run = async (key: string, body: Record<string, unknown>, done?: (r: { hooks: Hook[]; ok?: boolean; problem?: string }) => void) => {
    setBusy(key);
    try {
      const r = await bookingsAdmin<{ hooks: Hook[]; ok?: boolean; problem?: string }>("bookingHooks", body);
      setHooks(r.hooks);
      done?.(r);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "That didn't work. Try again.");
    } finally { setBusy(""); }
  };
  const remove = async (h: Hook) => {
    if (!(await ask({ title: "Remove this address?", message: "Bookings stop going to it. Anything still waiting to be sent there is dropped.", confirmLabel: "Remove" }))) return;
    await run(`rm-${h.id}`, { step: "remove", id: h.id }, () => toast.success("Address removed."));
  };
  const full = (hooks?.length || 0) >= MAX_HOOKS;
  return (
    <section className="bkg-tile" data-booking-hooks>
      <h2 className="bkg-tile-title">Send bookings to other apps <StatusBadge tone="info" glyph={false}>Beta</StatusBadge></h2>
      <p className="bkg-cal-text">Each new, moved or cancelled booking goes to another app by itself, such as a spreadsheet, a mailing list or an automation service.</p>
      {failed ? <p className="bkg-cal-note">Your addresses couldn't be loaded. Refresh the page to try again.</p>
        : !hooks ? <p className="bkg-cal-note">Loading…</p>
        : hooks.length > 0 && (
          <ul className="bkg-ocal-list" data-hook-list>
            {hooks.map((h) => (
              <li key={h.id} className="bkg-hook-row">
                <div className="bkg-hook-head">
                  <span className="bkg-ocal-name">
                    <strong className="bkg-hook-url"><Link2 size={14} aria-hidden /> {shortAddress(h.url)}</strong>
                    <small>{h.events.map((e) => HOOK_EVENT_NAMES[e]).join(", ")}</small>
                    {h.paused ? <small className="bkg-ocal-problem" role="status">Paused after many failed tries. {h.problem} Switch it back on once it's fixed.</small>
                      : h.problem ? <small className="bkg-ocal-problem" role="status">{h.problem} It will be tried again.</small>
                      : <small>{h.lastAt ? `Last sent ${when(h.lastAt)}` : "Nothing sent yet"}</small>}
                  </span>
                  <Toggle label={h.on ? "On" : "Off"} checked={h.on} onChange={(on) => void run(`sw-${h.id}`, { step: "switch", id: h.id, on })} />
                </div>
                {shown === h.id && (
                  <div className="bkg-link" data-hook-secret>
                    <code>{h.secret}</code>
                    <IconButton label="Copy check code" onClick={() => void copyText(h.secret, "Check code")}><Copy size={16} aria-hidden /></IconButton>
                  </div>
                )}
                <div className="bkg-hook-actions">
                  <GhostButton size="sm" onClick={() => void run(`t-${h.id}`, { step: "test", id: h.id }, (r) => (r.ok ? toast.success("Test sent. Check the other app for it.") : toast.error(r.problem || "The test didn't arrive.")))} busy={busy === `t-${h.id}`} disabled={!h.on}><Send size={14} aria-hidden /> Send a test</GhostButton>
                  <GhostButton size="sm" onClick={() => setShown(shown === h.id ? "" : h.id)} aria-expanded={shown === h.id}>{shown === h.id ? "Hide check code" : "Check code"}</GhostButton>
                  <GhostButton size="sm" onClick={() => void remove(h)} busy={busy === `rm-${h.id}`}>Remove</GhostButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      {hooks && (
        <div className="bkg-ocal-actions">
          <SecondaryButton onClick={() => setAdding(true)} disabled={full}><Link2 size={16} aria-hidden /> Add an address</SecondaryButton>
        </div>
      )}
      {hooks && hooks.length > 0 && <p className="bkg-cal-note">The check code lets the other app check a booking really came from your shop. Most apps don't need it.</p>}
      {full && <p className="bkg-cal-note">You can add up to {MAX_HOOKS} addresses. Remove one to add another.</p>}
      {adding && <AddDialog onClose={() => setAdding(false)} onAdded={(next) => { setHooks(next); setAdding(false); }} />}
      {confirmNode}
    </section>
  );
}
