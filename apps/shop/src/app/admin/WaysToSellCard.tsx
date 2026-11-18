// Settings › General › Ways to sell (beta): one switch for each way the platform has turned on for this shop (events,
// classes, digital goods, donations, memberships, rentals; shared/waysToSell.ts). Saved as `firstWeek/start` › `ways`.
// A shop the platform has turned nothing on for sees no section at all, so nobody meets a switch that does nothing.
// Switching a way off keeps everything made with it.
import { useEffect, useId, useState } from "react";
import toast from "react-hot-toast";
import { adminApi } from "./api";
import { WAYS, waysIn, type Way, type WayId } from "../../shared/waysToSell";
import { useWaysAllowed } from "./waysApi";
import { eventsAdmin } from "./eventsApi";
import { givingAdmin } from "./givingApi";
import { rentalsAdmin } from "./rentalsApi";
import { membersAdmin } from "./membersApi";
import { bookingsData } from "./bookingsApi";
import { FormSection } from "./riso/FormKit";
import { StatusBadge } from "./riso/components";

/** Sent when the owner switches a way on or off; `detail` is the ids now on. */
export const WAYS_CHANGED_EVENT = "lm-ways-changed";

/** The ways to show: the ones the platform turned on, in the ways' own order. */
export function waysShown(allowed: readonly string[]): Way[] {
  return WAYS.filter((way) => allowed.includes(way.id));
}

/** What the toast says after a switch. */
export function waySavedWords(way: Way, on: boolean): string {
  return on ? `${way.label} is on.` : `${way.label} is off. Everything you made with it is kept.`;
}

/** The line under a way: its own, with a nudge when the owner asked for it at sign-up and hasn't switched it on. */
export function wayLine(way: Way, asked: boolean, on: boolean): string {
  return asked && !on ? `${way.line} You asked for this when you signed up.` : way.line;
}

function WayRow({ way, on, asked, busy, onChange }: { way: Way; on: boolean; asked: boolean; busy: boolean; onChange: (on: boolean) => void }) {
  const id = useId();
  return (
    <div className="rp-fk-toggle">
      <span className="rp-fk-toggle-text">
        <span className="rp-fk-toggle-label" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <span id={id}>{way.label}</span>
          <StatusBadge tone="info" glyph={false}>Beta</StatusBadge>
        </span>
        <span className="rp-fk-hint">{wayLine(way, asked, on)}</span>
      </span>
      <button type="button" role="switch" aria-checked={on} aria-labelledby={id} disabled={busy} className="rp-fk-switch" onClick={() => onChange(!on)} />
    </div>
  );
}

export function WaysToSellCard() {
  const allowed = useWaysAllowed();
  const [chosen, setChosen] = useState<WayId[] | null>(null);
  const [asked, setAsked] = useState<string[]>([]);
  const [busy, setBusy] = useState<WayId | null>(null);
  useEffect(() => {
    let live = true;
    Promise.resolve().then(() => adminApi.getFirstWeek()).then((doc) => { if (live) { setAsked(Array.isArray(doc?.alsoSells) ? doc.alsoSells : []); setChosen(waysIn(doc?.ways)); } }).catch(() => { if (live) setChosen([]); });
    return () => { live = false; };
  }, []);
  const shown = waysShown(allowed);
  if (!shown.length || chosen === null) return null;
  const set = async (way: Way, on: boolean) => {
    setBusy(way.id);
    try {
      await adminApi.updateFirstWeek({ ways: { [way.id]: on } });
      const next = WAYS.map((w) => w.id).filter((id) => (id === way.id ? on : chosen.includes(id)));
      setChosen(next);
      window.dispatchEvent(new CustomEvent(WAYS_CHANGED_EVENT, { detail: next }));
      // The website's Events links follow the switch (the server works out whether there is anything to link to).
      if (way.id === "events") void eventsAdmin("hint").catch(() => {});
      // The same for the website's Classes links (classes run on the booking engine, functions/bookings.js).
      if (way.id === "classes") void bookingsData.admin("hint", {}).catch(() => {});
      // And the website's Support links (functions/giving.js).
      if (way.id === "giving") void givingAdmin("hint").catch(() => {});
      // And the website's Membership links (functions/memberships.js).
      if (way.id === "memberships") void membersAdmin("hint").catch(() => {});
      if (way.id === "rentals") void rentalsAdmin("hint").catch(() => {});
      toast.success(waySavedWords(way, on));
    } catch {
      toast.error("Couldn't save that. Check your connection and try again.");
    } finally { setBusy(null); }
  };
  return (
    <FormSection title="Ways to sell" description="More things your shop can sell. These are new, so each is marked Beta.">
      {shown.map((way) => <WayRow key={way.id} way={way} on={chosen.includes(way.id)} asked={asked.includes(way.id)} busy={busy === way.id} onChange={(on) => { void set(way, on); }} />)}
    </FormSection>
  );
}
