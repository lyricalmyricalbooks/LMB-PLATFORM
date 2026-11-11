import { useEffect, useRef, useState } from "react";
import { adminApi } from "../api";
import { friendlyError } from "../studio/friendlyError";
import { LoadingState, PrimaryButton, SecondaryButton, SectionCard, SelectField } from "../riso/components";
import { PROFILE_STARTERS } from "../shippingProfileStarters";
import { useShopSells } from "../shopWords";
import { kindStarterParcels } from "../kindShippingStarters";
import {
  shipFromLine, shipFromProblems, shippingStarterFor, starterProfile, starterSummary, type ShippingMarker, type ShippingStarter,
} from "../shippingStage";

const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);

// The starters this step offers, in the order Settings shows them. "copy" needs another profile, so it isn't here, and
// "blank" isn't either: picking it hid this list, with no way back short of reloading.
const CHOICES = PROFILE_STARTERS.filter(s => s.id !== "copy" && s.id !== "blank") as { id: ShippingStarter; label: string; desc: string }[];

/**
 * Get started's shipping step (plan 17.11): where orders ship from (step 1's address) on one line, and the shipping
 * starter for the press's country to confirm. Confirming makes one shipping profile (the Settings starter). A shop that
 * already has shipping and a full address has nothing to decide here, so the step records itself and the run moves on;
 * a re-run never makes a second profile. `settings` is settings/website as the Overview read it.
 */
export function ShippingStage({ settings, onDone, onOpen }: {
  settings: any;
  onDone: (shipping: ShippingMarker) => Promise<void>;
  onOpen?: (tab: string) => void;
}) {
  const sells = useShopSells();
  const location = settings?.location || {};
  const country = String(location.country || "");
  const suggested = shippingStarterFor(country);
  const [choice, setChoice] = useState<ShippingStarter>(suggested);
  const [profiles, setProfiles] = useState<any[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The profile made on an earlier press of the button whose step marker then failed to save: a retry only saves the
  // marker, so a flaky connection can't make a second "Standard shipping".
  const made = useRef(false);
  // Set once the step started passing itself (shipping already there), so it saves the marker once.
  const passing = useRef(false);

  const load = () => {
    setLoadError(false);
    adminApi.getShippingProfiles()
      .then(list => setProfiles(Array.isArray(list) ? list : []))
      .catch(() => setLoadError(true));
  };
  useEffect(load, []);

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

  const problems = shipFromProblems(location);
  const line = shipFromLine(location);
  const hasProfiles = !!profiles && profiles.length > 0;
  // Nothing to decide: the shop already ships and knows where from. The step records itself (a skip makes nothing).
  const passes = hasProfiles && problems.length === 0;
  useEffect(() => {
    if (!passes || passing.current) return;
    passing.current = true;
    void finish({ skipped: true });
  }, [passes]); // eslint-disable-line react-hooks/exhaustive-deps

  const title = "Shipping";
  if (loadError) {
    return (
      <SectionCard title={title} collapsible={false}>
        <p role="alert" className="rp-hint" style={{ margin: 0, color: "var(--rp-danger)" }}>Your shipping couldn't be read. Check your connection.</p>
        <SecondaryButton size="sm" style={{ marginTop: 12 }} onClick={load}>Try again</SecondaryButton>
      </SectionCard>
    );
  }
  if (profiles === null || (passes && !error)) return <SectionCard title={title} collapsible={false}><LoadingState label={passes ? "Your shipping is already set up…" : "Reading your shipping…"} /></SectionCard>;
  const summary = choice === "blank" ? [] : starterSummary(choice, sells);


  // Confirm: makes the starter's one profile, unless the shop already has shipping (then nothing new is made).
  const confirm = async () => {
    if (busy || problems.length) return;
    if (hasProfiles || choice === "blank") return finish({ skipped: true });
    setBusy(true); setError("");
    try {
      if (!made.current) {
        const profile = starterProfile(choice, newId, sells);
        if (profile) await adminApi.createShippingProfile(profile);
        made.current = true;
      }
      // A shop that sells something other than books also starts with box sizes for its parcels, only when it has none.
      const boxes = kindStarterParcels(sells);
      if (boxes.length && !((await adminApi.getParcelPresets()) || []).length) await adminApi.saveParcelPresets(boxes);
    } catch (e) {
      setError(friendlyError(e, "your shipping"));
      setBusy(false);
      return;
    }
    await finish({ starter: choice });
  };

  return (
    <SectionCard title={title} description="Shoppers see the delivery price before they pay. You can change any price later in Settings." collapsible={false}>
      <div style={{ display: "grid", gap: 16 }}>
        <div className="rp-run-fact" aria-label="Ships from">
          <span style={{ minWidth: 0 }}>
            <span className="rp-run-fact-label">Ships from</span>
            {problems.length
              ? <ul role="alert" className="rp-hint" style={{ margin: 0, paddingLeft: 18, color: "var(--rp-danger)" }}>
                  {problems.map(p => <li key={p}>{p}</li>)}
                </ul>
              : <span style={{ overflowWrap: "anywhere" }}>{line}</span>}
          </span>
          <SecondaryButton size="sm" onClick={() => onOpen?.("general")}>{problems.length ? "Add the address" : "Change"}</SecondaryButton>
        </div>

        {!hasProfiles && choice === "blank" && (
          <p className="rp-hint" style={{ margin: 0 }}>Shipping for {country || "your country"} starts empty. Add your zones and prices in Shipping.</p>
        )}
        {!hasProfiles && choice !== "blank" && (
          <div style={{ display: "grid", gap: 12 }}>
            <SelectField label="Starting shipping" value={choice} onChange={e => setChoice(e.target.value as ShippingStarter)}>
              {CHOICES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </SelectField>
            <ul className="rp-hint" aria-label="Starting prices" style={{ margin: 0, paddingLeft: 18 }}>
              {summary.map(z => <li key={z.zone}>{z.zone}: ${z.first} for the first one, ${z.extra} for each extra one</li>)}
            </ul>
          </div>
        )}
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
