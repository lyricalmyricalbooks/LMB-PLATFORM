import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { COUNTRIES } from "../features/site/shippingZones";
import { regionsFor } from "../features/site/postalRegion";
import { taxCollectionOn, uncoveredTaxRegions } from "../features/site/taxRate";
import {
  DataTable, DestructiveButton, EmptyState, PrimaryButton, SaveBar, SecondaryButton, SectionCard, SelectField, StatusBadge, TextField, Toggle, useConfirm, type Column,
} from "./riso/components";
import { cleanTaxRate, taxRateProblem, type TaxRate } from "./taxRatesEdit";
import { useSettingsDirty } from "./settingsDirty";
import { SettingsAnchor, jumpTo } from "./settingsLayout";

// Settings › Taxes. Edits settings.taxes.rates in place (same shape the server matches on);
// nothing is live until Save. settings.taxes.collect === false switches all tax off (server + checkout).
export function TaxesSettings({ settings, setSettings, originalSettings, hasChanges, saveSection, savingSection }: any) {
  const [ask, confirmNode] = useConfirm();
  const [country, setCountry] = useState("Canada");
  const [region, setRegion] = useState("");
  const [rate, setRate] = useState("");
  const [tried, setTried] = useState(false);
  const rates: TaxRate[] = settings.taxes?.rates || [];
  const savedRates: TaxRate[] = originalSettings?.taxes?.rates || [];
  const collecting = taxCollectionOn(settings);
  const dirty = hasChanges("taxes");
  useSettingsDirty("taxes", dirty);

  const regionChoices = regionsFor(country);
  const problem = taxRateProblem({ country, region, rate }, rates);
  const gaps = useMemo(() => (collecting && rates.length ? uncoveredTaxRegions(rates) : []), [collecting, rates]);
  // Off keeps every rate saved, so switching back on restores them.
  const setCollecting = (on: boolean) => setSettings({ ...settings, taxes: { ...(settings.taxes || {}), rates, collect: on } });
  const setRates = (next: TaxRate[]) => setSettings({ ...settings, taxes: { ...(settings.taxes || {}), rates: next } });
  const savedKey = (r: TaxRate) => `${r.country}|${r.region}|${r.rate}`.toLowerCase();
  const saved = new Set(savedRates.map(savedKey));

  const add = () => {
    setTried(true);
    if (problem) return;
    setRates([...rates, cleanTaxRate({ country, region, rate })]);
    setRegion(""); setRate(""); setTried(false);
  };
  const remove = async (index: number) => {
    const r = rates[index];
    if (!(await ask({ title: "Remove this tax rate?", message: `${r.country}${r.region ? ` · ${r.region}` : " (whole country)"} at ${r.rate}% will stop applying once you save.`, confirmLabel: "Remove rate" }))) return;
    setRates(rates.filter((_, i) => i !== index));
  };

  const columns: Column<TaxRate & { index: number }>[] = [
    { key: "place", header: "Where", lead: true, render: (r) => <>{r.country}{r.region ? ` · ${r.region}` : <span className="rp-hint"> · whole country</span>}</> },
    { key: "rate", header: "Rate", numeric: true, render: (r) => <span className="rp-mono">{r.rate}%</span> },
    { key: "status", header: "Status", render: (r) => saved.has(savedKey(r)) ? <StatusBadge tone="success">Saved</StatusBadge> : <StatusBadge tone="warning">Not saved yet</StatusBadge> },
    { key: "actions", header: "Actions", render: (r) => <DestructiveButton size="sm" onClick={() => remove(r.index)} aria-label={`Remove tax rate for ${r.country} ${r.region}`}>Remove</DestructiveButton> },
  ];

  return (
    <div className="rp-stack">
      <SectionCard title="Tax collection" description="Off means no tax on any order. Rates stay saved.">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <Toggle label="Collect sales tax at checkout" checked={collecting} onChange={setCollecting} />
          {collecting
            ? <StatusBadge tone="success">Collecting tax</StatusBadge>
            : <StatusBadge tone="warning">Tax switched off</StatusBadge>}
        </div>
      </SectionCard>

      {gaps.length > 0 && (
        <SectionCard title="Places with no tax rate" description="These pay no tax yet.">
          <ul className="rp-list" style={{ margin: 0 }}>
            {gaps.map((g) => (
              <li key={g.country} style={{ padding: "8px 0" }}>
                <strong>{g.country}:</strong> <span className="rp-hint">{g.regions.join(", ")}</span>{" "}
                <SecondaryButton size="sm" onClick={() => {
                  setCountry(g.country); setRegion(regionsFor(g.country)?.find(([, n]) => n === g.regions[0])?.[1] || "");
                  // Take the owner to the form with the place filled in, ready for the rate.
                  requestAnimationFrame(() => { jumpTo("tax-add"); document.querySelector<HTMLInputElement>("[data-tax-rate]")?.focus({ preventScroll: true }); });
                }}>Add a rate for {g.regions[0]}</SecondaryButton>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <SectionCard title="Tax rates" description={collecting ? "Province beats country. Gift cards never taxed." : "Paused while collection is off."}>
        {rates.length === 0
          ? <EmptyState icon="%" title="No tax rates yet" description="No rate, no tax." />
          : <DataTable caption="Tax rates" rows={rates.map((r, index) => ({ ...r, index }))} rowKey={(r) => `${r.index}`} columns={columns} />}
      </SectionCard>


      <SettingsAnchor id="tax-add">
      <SectionCard title="Add a tax rate">
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", alignItems: "end" }}>
          <SelectField label="Country" value={country} onChange={(e) => { setCountry(e.target.value); setRegion(""); }}>
            {COUNTRIES.map((c) => <option key={c.code} value={c.name}>{c.name}</option>)}
          </SelectField>
          {regionChoices ? (
            <SelectField label="Province / state" value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="">Whole country</option>
              {regionChoices.map(([code, name]) => <option key={code} value={name}>{name}</option>)}
            </SelectField>
          ) : (
            <TextField label="Region (optional)" value={region} placeholder="Blank = whole country" onChange={(e) => setRegion(e.target.value)} />
          )}
          <TextField label="Rate (%)" inputMode="decimal" data-tax-rate value={rate} placeholder="13" error={tried && problem ? problem : undefined}
            onChange={(e) => setRate(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
          <div><PrimaryButton onClick={add}>Add rate</PrimaryButton></div>
        </div>
        <p className="rp-hint" style={{ margin: "12px 0 0" }}>Applies on save. Not tax advice.</p>
      </SectionCard>
      </SettingsAnchor>

      <SaveBar dirty={dirty} saving={savingSection === "taxes"} message="You have unsaved tax settings."
        onSave={async () => { if (await saveSection("taxes", { taxes: settings.taxes })) toast.success("Tax settings saved"); }}
        onDiscard={() => setSettings({ ...settings, taxes: JSON.parse(JSON.stringify(originalSettings?.taxes ?? { rates: [] })) })} />
      {confirmNode}
    </div>
  );
}
