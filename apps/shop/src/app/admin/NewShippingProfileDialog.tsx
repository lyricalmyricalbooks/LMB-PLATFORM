import { useEffect, useState } from "react";
import { Dialog, PrimaryButton, SecondaryButton, SelectField, TextField } from "./riso/components";
import { PROFILE_STARTERS, buildNewProfile, newProfileProblems, profileSummary, starterPrices, type ProfileStarterId, type QuickZonePrice } from "./shippingProfileStarters";

const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);

/** Settings › Shipping › Profiles › Create profile: name, a starting point and its prices, in one step. */
export function NewShippingProfileDialog({ open, onClose, profiles, onCreate }: {
  open: boolean; onClose: () => void; profiles: any[];
  /** Saves the profile; resolves once it exists (the dialog stays open on failure). */
  onCreate: (draft: ReturnType<typeof buildNewProfile>) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [starter, setStarter] = useState<ProfileStarterId>("world");
  const [prices, setPrices] = useState<QuickZonePrice[]>(() => starterPrices("world"));
  const [copyId, setCopyId] = useState("");
  const [freeOver, setFreeOver] = useState("");
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);

  // Every opening starts fresh.
  useEffect(() => {
    if (!open) return;
    setName(""); setStarter("world"); setPrices(starterPrices("world")); setCopyId(profiles[0]?.id || ""); setFreeOver(""); setTried(false);
  }, [open]);

  const pick = (id: ProfileStarterId) => {
    setStarter(id);
    setPrices(starterPrices(id));
    if (id === "copy" && !copyId) setCopyId(profiles[0]?.id || "");
  };
  const setPrice = (key: string, field: "first" | "extra" | "days", value: string) =>
    setPrices((rows) => rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)));

  const copyFrom = starter === "copy" ? profiles.find((p) => p.id === copyId) : undefined;
  const input = { name, starter, prices, copyFrom, freeShippingOver: starter === "copy" && freeOver === "" ? undefined : freeOver };
  const problems = newProfileProblems(input, profiles.map((p) => p.name));

  const create = async () => {
    setTried(true);
    if (problems.length || saving) return;
    setSaving(true);
    try {
      if (await onCreate(buildNewProfile(input, newId))) onClose();
    } finally {
      setSaving(false);
    }
  };

  const grid = { display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", alignItems: "end" } as const;
  return (
    <Dialog open={open} onClose={onClose} size="lg" title="New shipping profile"
      footer={<>
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton onClick={create} busy={saving} disabled={saving}>{saving ? "Creating…" : "Create profile"}</PrimaryButton>
      </>}>
      <div className="rp-stack">
        <TextField label="Profile name" value={name} placeholder="e.g. Heavy books, Prints in a tube…" data-autofocus
          error={tried && !name.trim() ? "Give the profile a name." : undefined}
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") create(); }} />

        <div>
          <span className="rp-label" id="np-start" style={{ display: "block", marginBottom: 4 }}>Start from</span>
          {/* The Masthead's underlined words (Overview dates), one per starting point. */}
          <div role="radiogroup" aria-labelledby="np-start" className="rp-wb-seg" style={{ flexWrap: "wrap" }}>
            {PROFILE_STARTERS.filter((s) => s.id !== "copy" || profiles.length > 0).map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={starter === s.id}
                title={s.desc} onClick={() => pick(s.id)}>{s.label}</button>
            ))}
          </div>
        </div>

        {prices.length > 0 && (
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="rp-label" style={{ marginBottom: 8 }}>Prices</legend>
            <ul className="rp-list" style={{ margin: 0, border: "1px solid var(--rp-border)" }} aria-label="Prices by zone">
              {prices.map((p) => (
                <li key={p.key} style={{ padding: "10px 12px" }}>
                  <strong style={{ display: "block", marginBottom: 6 }}>{p.zone}</strong>
                  <div style={grid}>
                    <TextField label="First book ($)" type="number" min={0} step="0.01" inputMode="decimal" value={p.first}
                      onChange={(e) => setPrice(p.key, "first", e.target.value)} />
                    <TextField label="Each extra book ($)" type="number" min={0} step="0.01" inputMode="decimal" value={p.extra}
                      onChange={(e) => setPrice(p.key, "extra", e.target.value)} />
                    <TextField label="Transit days (optional)" value={p.days} placeholder="e.g. 3-7"
                      onChange={(e) => setPrice(p.key, "days", e.target.value)} />
                  </div>
                </li>
              ))}
            </ul>
          </fieldset>
        )}

        {starter === "copy" && (
          <SelectField label="Profile to copy" value={copyId} onChange={(e) => setCopyId(e.target.value)}
            hint={copyFrom ? profileSummary(copyFrom) : undefined}>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name || "Untitled profile"}</option>)}
          </SelectField>
        )}

        {starter !== "blank" && (
          <TextField label="Free shipping over ($, optional)" type="number" min={0} step="0.01" inputMode="decimal" value={freeOver}
            placeholder={starter === "copy" && copyFrom?.freeShippingOver ? `Same as the copy: ${Number(copyFrom.freeShippingOver).toFixed(2)}` : "e.g. 75.00"}
            onChange={(e) => setFreeOver(e.target.value)} />
        )}

        {tried && problems.length > 0 && (
          <ul role="alert" className="rp-error-text" style={{ margin: 0, paddingLeft: 18 }}>
            {problems.map((msg) => <li key={msg}>{msg}</li>)}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
