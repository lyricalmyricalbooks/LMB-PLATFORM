import { useState } from "react";
import type { BringMarker } from "../bringShop";
import { bookable, type BookingsFacts } from "../servicesSetup";
import { friendlyError } from "../studio/friendlyError";
import { LoadingState, PrimaryButton, SecondaryButton, SectionCard } from "../riso/components";
import { useShopWords } from "../shopWords";

/**
 * Get started, step 2 for a services shop (services plan, phase 1): what clients can book. Calendar holds the services
 * themselves, so this step sends the owner there and, once one is saved, lists them and moves on. It records itself where
 * the products step does (`bring`), always as `skipped`: nothing came over from another shop, so Your move so far
 * (moveProgress.ts) stays away.
 * `bookings` is undefined while Home is still reading, and null when Bookings couldn't be read.
 */
export function ServicesStage({ bookings, onDone, onOpen }: {
  bookings?: BookingsFacts | null;
  onDone: (marker: BringMarker) => Promise<void>;
  onOpen?: (tab: string) => void;
}) {
  const w = useShopWords();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const finish = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try { await onDone({ at: new Date().toISOString(), skipped: true }); }
    catch (e) { setError(friendlyError(e, "your shop")); setBusy(false); }
  };

  if (bookings === undefined) {
    return <SectionCard title="Your services" collapsible={false}><LoadingState label="Opening your calendar…" /></SectionCard>;
  }
  const ready = bookable(bookings);
  return (
    <SectionCard title="Your services" description={w("Add what clients can book: a name, how long it takes and a price. You can add more any time.")} collapsible={false}>
      {ready.length > 0 && (
        <ul data-services-ready aria-label="Your services so far" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {ready.slice(0, 5).map(s => (
            <li key={s.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 14px", background: "var(--rp-primary-tint)", borderRadius: "var(--rp-radius, 0)" }}>
              <strong>{s.name}</strong>
              <span className="rp-mono">{s.minutes} min</span>
            </li>
          ))}
          {ready.length > 5 && <li className="rp-hint">and {ready.length - 5} more</li>}
        </ul>
      )}
      {error && <p role="alert" className="rp-hint" style={{ margin: "12px 0 0", color: "var(--rp-danger)" }}>{error}</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: ready.length ? 16 : 4 }}>
        {ready.length > 0
          ? <>
            <PrimaryButton disabled={busy} onClick={() => finish()}>{busy ? "Saving…" : "Continue"}</PrimaryButton>
            <SecondaryButton disabled={busy} onClick={() => onOpen?.("bookings")}>Add another in Calendar</SecondaryButton>
          </>
          : <>
            <PrimaryButton disabled={busy} onClick={() => onOpen?.("bookings")}>Add your first service</PrimaryButton>
            <SecondaryButton disabled={busy} onClick={() => finish()}>{busy ? "Saving…" : "I'll add them later"}</SecondaryButton>
          </>}
      </div>
    </SectionCard>
  );
}
