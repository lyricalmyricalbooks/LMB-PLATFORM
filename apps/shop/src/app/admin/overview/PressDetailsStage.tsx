import { useState } from "react";
import { adminApi } from "../api";
import { COUNTRIES } from "../../features/site/shippingZones";
import { pressDetailsFrom, pressDetailsPatch, pressDetailsProblems, type PressDetails, type PressDetailsField } from "../pressDetails";
import { friendlyError } from "../studio/friendlyError";
import { LoadingState, PrimaryButton, SecondaryButton, SectionCard, SelectField, TextField } from "../riso/components";

/**
 * Get started, step 1 of 2 (plan 17.2): the press's own details, asked once before Choose your look. Shows at the top of
 * the Overview for a new shop. `settings` is settings/website as the Overview read it: undefined while it loads, null
 * when it couldn't be read. `onDone` gets the time once the details are saved; the parent records it on `firstWeek`.
 */
export function PressDetailsStage({ settings, onDone, onRetrySettings }: {
  settings: any;
  onDone: (at: string) => Promise<void>;
  onRetrySettings?: () => void;
}) {
  const [form, setForm] = useState<PressDetails | null>(null);
  const [errors, setErrors] = useState<Partial<Record<PressDetailsField, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (settings === undefined) {
    return <SectionCard title="Get started" collapsible={false}><LoadingState label="Loading your details…" /></SectionCard>;
  }
  if (settings === null) {
    return (
      <SectionCard title="Get started" collapsible={false}>
        <p role="alert" className="rp-hint" style={{ margin: 0, color: "var(--rp-danger)" }}>Your details couldn't be read. Check your connection.</p>
        {onRetrySettings && <SecondaryButton size="sm" style={{ marginTop: 12 }} onClick={onRetrySettings}>Try again</SecondaryButton>}
      </SectionCard>
    );
  }

  const current = form || pressDetailsFrom(settings);
  const set = (field: PressDetailsField, value: string) => {
    setForm({ ...current, [field]: value });
    if (errors[field]) setErrors({ ...errors, [field]: undefined });
  };

  const save = async () => {
    if (busy) return;
    const problems = pressDetailsProblems(current);
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setBusy(true); setError("");
    try {
      // Settings first, then the marker: if the save fails the step is still open, and running it again is safe.
      await adminApi.updateSettings(pressDetailsPatch(settings, current));
      await onDone(new Date().toISOString());
    } catch (e) {
      setError(friendlyError(e, "your details"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard title="Get started · Step 1 of 2: your press" description="These go on receipts, labels and your contact page. You can change them later in Settings." collapsible={false}>
      <div style={{ display: "grid", gap: 14 }}>
        <TextField label="Press name" value={current.name} maxLength={100} error={errors.name} placeholder="Moth Press"
          onChange={(e) => set("name", e.target.value)} />
        <TextField label="Contact email" type="email" value={current.email} error={errors.email} placeholder="hello@yourpress.example"
          autoComplete="email" onChange={(e) => set("email", e.target.value)} />
        <TextField label="Street address" value={current.street} error={errors.street} placeholder="12 Queen Street"
          autoComplete="address-line1" hint="Your orders ship from here." onChange={(e) => set("street", e.target.value)} />
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <TextField label="City" value={current.city} error={errors.city} autoComplete="address-level2" onChange={(e) => set("city", e.target.value)} />
          <TextField label="State / province" value={current.state} autoComplete="address-level1" onChange={(e) => set("state", e.target.value)} />
          <TextField label="Postal code" value={current.zip} error={errors.zip} autoComplete="postal-code" onChange={(e) => set("zip", e.target.value)} />
          <SelectField label="Country" value={current.country} error={errors.country} onChange={(e) => set("country", e.target.value)}>
            {COUNTRIES.map((c) => <option key={c.code} value={c.name}>{c.name}</option>)}
          </SelectField>
        </div>
      </div>
      {error && <p role="alert" className="rp-hint" style={{ margin: "12px 0 0", color: "var(--rp-danger)" }}>{error}</p>}
      <div style={{ marginTop: 16 }}>
        <PrimaryButton disabled={busy} onClick={save}>{busy ? "Saving…" : "Save and continue"}</PrimaryButton>
      </div>
    </SectionCard>
  );
}
