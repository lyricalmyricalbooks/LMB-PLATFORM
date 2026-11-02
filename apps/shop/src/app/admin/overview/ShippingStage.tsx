import { useEffect, useState } from "react";
import { adminApi } from "../api";
import { friendlyError } from "../studio/friendlyError";
import { LoadingState, PrimaryButton, SecondaryButton, SectionCard, SelectField } from "../riso/components";
import { PROFILE_STARTERS } from "../shippingProfileStarters";
import {
  shipFromLine, shipFromProblems, shippingStarterFor, starterProfile, starterSummary, type ShippingMarker, type ShippingStarter,
} from "../shippingStage";

const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);

// The starters this step offers, in the order Settings shows them. "copy" needs another profile, so it isn't here.
const CHOICES = PROFILE_STARTERS.filter(s => s.id !== "copy") as { id: ShippingStarter; label: string; desc: string }[];

/**
 * Get started, step 6 (plan 17.11): the ship-from address from step 1, the shipping starter for the press's country to
 * confirm, and the web address. Confirming makes one shipping profile (the Settings starter); a shop that already has a
 * profile gets nothing new, so a re-run changes nothing. `settings` is settings/website as the Overview read it.
 */
export function ShippingStage({ settings, onDone, onOpen }: {
  settings: any;
  onDone: (shipping: ShippingMarker) => Promise<void>;
  onOpen?: (tab: string) => void;
}) {
  const location = settings?.location || {};
  const country = String(location.country || "");
  const suggested = shippingStarterFor(country);
  const [choice, setChoice] = useState<ShippingStarter>(suggested);
  const [profiles, setProfiles] = useState<any[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoadError(false);
    adminApi.getShippingProfiles()
      .then(list => setProfiles(Array.isArray(list) ? list : []))
      .catch(() => setLoadError(true));
  };
  useEffect(load, []);

  const title = "Get started · Step 6 of 8: shipping and your address";
  if (loadError) {
    return (
      <SectionCard title={title} collapsible={false}>
        <p role="alert" className="rp-hint" style={{ margin: 0, color: "var(--rp-danger)" }}>Your shipping couldn't be read. Check your connection.</p>
        <SecondaryButton size="sm" style={{ marginTop: 12 }} onClick={load}>Try again</SecondaryButton>
      </SectionCard>
    );
  }
  if (profiles === null) return <SectionCard title={title} collapsible={false}><LoadingState label="Reading your shipping…" /></SectionCard>;

  const problems = shipFromProblems(location);
  const line = shipFromLine(location);
  const hasProfiles = profiles.length > 0;
  const summary = choice === "blank" ? [] : starterSummary(choice);

  const finish = async (marker: Omit<ShippingMarker, "at">) => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await onDone({ at: new Date().toISOString(), ...marker });
    } catch (e) {
      setError(friendlyError(e, "your shipping"));
      setBusy(false);
    }
  };

  // Confirm: makes the starter's one profile, unless the shop already has shipping (then nothing new is made).
  const confirm = async () => {
    if (busy || problems.length) return;
    if (hasProfiles || choice === "blank") return finish({ skipped: true });
    setBusy(true); setError("");
    try {
      const profile = starterProfile(choice, newId);
      if (profile) await adminApi.createShippingProfile(profile);
    } catch (e) {
      setError(friendlyError(e, "your shipping"));
      setBusy(false);
      return;
    }
    await finish({ starter: choice });
  };

  return (
    <SectionCard title={title} description="Shoppers see the delivery price before they pay. Every price can be changed later in Settings." collapsible={false}>
      <div style={{ display: "grid", gap: 18 }}>
        <section aria-label="Ships from">
          <h3 className="rp-card-title" style={{ fontSize: "var(--rp-text-base)", margin: "0 0 6px" }}>Your orders ship from</h3>
          {problems.length
            ? <ul role="alert" className="rp-hint" style={{ margin: 0, paddingLeft: 18, color: "var(--rp-danger)" }}>
                {problems.map(p => <li key={p}>{p}</li>)}
              </ul>
            : <p style={{ margin: 0 }}>{line}</p>}
          <SecondaryButton size="sm" style={{ marginTop: 8 }} onClick={() => onOpen?.("general")}>Change the address</SecondaryButton>
        </section>

        <section aria-label="Web address">
          <h3 className="rp-card-title" style={{ fontSize: "var(--rp-text-base)", margin: "0 0 6px" }}>Your web address</h3>
          <p className="rp-hint" style={{ margin: 0 }}>Your shop already has a free address. You can connect a name you own later, from the same page.</p>
          <SecondaryButton size="sm" style={{ marginTop: 8 }} onClick={() => onOpen?.("general")}>Change web address</SecondaryButton>
        </section>

        <section aria-label="Shipping">
          <h3 className="rp-card-title" style={{ fontSize: "var(--rp-text-base)", margin: "0 0 6px" }}>Shipping</h3>
          {hasProfiles && <p className="rp-hint" style={{ margin: 0 }}>Your shop already has shipping, so nothing new is added.</p>}
          {!hasProfiles && choice === "blank" && (
            <p className="rp-hint" style={{ margin: 0 }}>Shipping for {country || "your country"} starts empty. Add your zones and prices in Shipping.</p>
          )}
          {!hasProfiles && choice !== "blank" && (
            <div style={{ display: "grid", gap: 12 }}>
              <SelectField label="Starting shipping" value={choice} onChange={e => setChoice(e.target.value as ShippingStarter)}>
                {CHOICES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </SelectField>
              <ul className="rp-hint" aria-label="Starting prices" style={{ margin: 0, paddingLeft: 18 }}>
                {summary.map(z => <li key={z.zone}>{z.zone}: ${z.first} for the first book, ${z.extra} for each extra one</li>)}
              </ul>
            </div>
          )}
        </section>
      </div>

      {error && <p role="alert" className="rp-hint" style={{ margin: "14px 0 0", color: "var(--rp-danger)" }}>{error}</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
        {hasProfiles
          ? <PrimaryButton disabled={busy} onClick={() => finish({ skipped: true })}>{busy ? "Saving…" : "Continue"}</PrimaryButton>
          : <PrimaryButton disabled={busy || problems.length > 0} onClick={confirm}>{busy ? "Saving…" : choice === "blank" ? "Continue" : "Set up this shipping"}</PrimaryButton>}
        {!hasProfiles && choice !== "blank" && <SecondaryButton disabled={busy} onClick={() => finish({ skipped: true })}>Set up shipping later</SecondaryButton>}
        {!hasProfiles && choice === "blank" && <SecondaryButton disabled={busy} onClick={() => onOpen?.("shipping")}>Open Shipping</SecondaryButton>}
      </div>
    </SectionCard>
  );
}
