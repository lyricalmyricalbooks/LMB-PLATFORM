import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { COUNTRIES } from "../features/site/shippingZones";
import { regionsFor } from "../features/site/postalRegion";
import { taxCollectionOn, uncoveredTaxRegions } from "../features/site/taxRate";
import {
  DataTable, DestructiveButton, EmptyState, PrimaryButton, SaveBar, SecondaryButton, SectionCard, SelectField, StatusBadge, TextArea, TextField, Toggle, useConfirm, type Column,
} from "./riso/components";
import { cleanBookName, cleanTaxRate, taxRateProblem, type TaxRate } from "./taxRatesEdit";
import { TAX_BOOK_NAMES, TAX_BOOK_NAME_MAX, suggestedTaxBookName } from "../../shared/taxBooks";
import { useSettingsDirty } from "./settingsDirty";
import { SettingsAnchor, jumpTo } from "./settingsLayout";
import { applyTaxPreset, suggestedTaxPresetId, TAX_PRESETS } from "./taxPresets";
import { useShopSells } from "./shopWords";
import { registrationWords, answerTaxRegistration, provincialPlaces, provincialQuestion, taxRegistration } from "./taxRegistration";
import { SHOP_COUNTRY, US_SHOP } from "./moneySign";
import { useShopWords } from "./shopWords";

const WORDS = registrationWords(SHOP_COUNTRY);

// Settings › Taxes. Edits settings.taxes.rates in place (same shape the server matches on);
// nothing is live until Save. settings.taxes.collect === false switches all tax off (server + checkout).
// Each rate's "name in your books" (bookName, plan 7.11) is what orders and the bookkeeping file call that tax.
const KIND_LABELS: Record<string, string> = { book: "Printed books", ebook: "E-books", clothing: "Clothing", shoes: "Shoes", jewelry: "Jewelry", art: "Art and prints", music: "Music", other: "Other items" };

export function TaxesSettings({ settings, setSettings, originalSettings, hasChanges, saveSection, savingSection }: any) {
  const w = useShopWords();
  const [ask, confirmNode] = useConfirm();
  const [country, setCountry] = useState(US_SHOP ? "United States" : "Canada");
  const [region, setRegion] = useState("");
  const [rate, setRate] = useState("");
  const [bookName, setBookName] = useState("");
  const [kind, setKind] = useState("");
  const [tried, setTried] = useState(false);
  const sells = useShopSells();
  const [presetId, setPresetId] = useState(suggestedTaxPresetId(sells));
  const preset = TAX_PRESETS.find((p) => p.id === presetId) || TAX_PRESETS[0];
  const rates: TaxRate[] = settings.taxes?.rates || [];
  const savedRates: TaxRate[] = originalSettings?.taxes?.rates || [];
  const collecting = taxCollectionOn(settings);
  const dirty = hasChanges("taxes");
  useSettingsDirty("taxes", dirty);

  const regionChoices = regionsFor(country);
  const problem = taxRateProblem({ country, region, rate, kind }, rates);
  const gaps = useMemo(() => (collecting && rates.length ? uncoveredTaxRegions(rates, SHOP_COUNTRY) : []), [collecting, rates]);
  // Off keeps every rate saved, so switching back on restores them.
  const setCollecting = (on: boolean) => setSettings({ ...settings, taxes: { ...(settings.taxes || {}), rates, collect: on } });
  const setDuties = (patch: Record<string, unknown>) => setSettings({ ...settings, taxes: { ...(settings.taxes || {}), duties: { ...(settings.taxes?.duties || {}), ...patch } } });
  const setRates = (next: TaxRate[]) => setSettings({ ...settings, taxes: { ...(settings.taxes || {}), rates: next } });
  const savedKey = (r: TaxRate) => `${r.country}|${r.region}|${r.rate}|${r.bookName || ""}|${(r.kinds || []).join(",")}`.toLowerCase();
  const saved = new Set(savedRates.map(savedKey));

  const add = () => {
    setTried(true);
    if (problem) return;
    setRates([...rates, cleanTaxRate({ country, region, rate, kind, bookName: bookName || suggestedTaxBookName({ country, region, rate }) })]);
    setRegion(""); setRate(""); setBookName(""); setKind(""); setTried(false);
  };
  // A preset fills only the places with no rate yet, in the draft: nothing applies until Save.
  const registration = taxRegistration(settings);
  const usePreset = async () => {
    if (registration === "no" && !(await ask(WORDS.unregisteredPreset))) return;
    const places = provincialPlaces(preset);
    if (places.length && !(await ask(provincialQuestion(places)))) return;
    const result = applyTaxPreset(rates, preset);
    if (!result.added) { toast(`Every place in ${preset.country} already has a rate. Nothing changed.`); return; }
    setRates(result.rates);
    toast.success(`Added ${result.added} rate${result.added === 1 ? "" : "s"}${result.kept ? `; kept your ${result.kept} existing one${result.kept === 1 ? "" : "s"}` : ""}. Review, then save.`);
  };
  const rename = (index: number, name: string) => setRates(rates.map((r, i) => {
    if (i !== index) return r;
    const { bookName: _old, ...rest } = r;
    return name ? { ...rest, bookName: name } : rest;
  }));
  const remove = async (index: number) => {
    const r = rates[index];
    if (!(await ask({ title: "Remove this tax rate?", message: `${r.country}${r.region ? ` · ${r.region}` : " (whole country)"} at ${r.rate}% will stop applying once you save.`, confirmLabel: "Remove rate" }))) return;
    setRates(rates.filter((_, i) => i !== index));
  };

  const columns: Column<TaxRate & { index: number }>[] = [
    { key: "place", header: "Where", lead: true, render: (r) => <>{r.country}{r.region ? ` · ${r.region}` : <span className="rp-hint"> · whole country</span>}</> },
    { key: "kinds", header: "Applies to", render: (r) => (r.kinds?.length ? KIND_LABELS[r.kinds[0]] || r.kinds[0] : <span className="rp-hint">Everything else</span>) },
    { key: "rate", header: "Rate", numeric: true, render: (r) => <span className="rp-mono">{r.rate}%</span> },
    { key: "book", header: "In your books", render: (r) => (
      <TextField label={`Name in your books for ${r.country}${r.region ? ` ${r.region}` : ""}`} hideLabel list="tax-book-names" maxLength={TAX_BOOK_NAME_MAX}
        value={r.bookName ?? ""} placeholder={suggestedTaxBookName(r)}
        onChange={(e) => rename(r.index, e.target.value)} onBlur={(e) => rename(r.index, cleanBookName(e.target.value))} />
    ) },
    { key: "status", header: "Status", render: (r) => saved.has(savedKey(r)) ? <StatusBadge tone="success">Saved</StatusBadge> : <StatusBadge tone="warning">Not saved yet</StatusBadge> },
    { key: "actions", header: "Actions", render: (r) => <DestructiveButton size="sm" onClick={() => remove(r.index)} aria-label={`Remove tax rate for ${r.country} ${r.region}`}>Remove</DestructiveButton> },
  ];

  return (
    <div className="rp-stack">
      <SectionCard title={WORDS.title} description={WORDS.hint}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <SecondaryButton aria-pressed={registration === "no"} onClick={() => setSettings({ ...settings, taxes: answerTaxRegistration(settings.taxes, false) })}>{WORDS.no}</SecondaryButton>
          <SecondaryButton aria-pressed={registration === "yes"} onClick={() => setSettings({ ...settings, taxes: answerTaxRegistration(settings.taxes, true) })}>{WORDS.yes}</SecondaryButton>
        </div>
        {registration !== "unanswered" && <p className="rp-hint" style={{ margin: "12px 0 0" }}>{registration === "no" ? WORDS.savedNo : WORDS.savedYes}</p>}
      </SectionCard>

      <SectionCard title="Tax collection" description="Off means no tax on any order. Rates stay saved.">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <Toggle label="Collect sales tax at checkout" checked={collecting} onChange={setCollecting} />
          {collecting
            ? <StatusBadge tone="success">Collecting tax</StatusBadge>
            : <StatusBadge tone="warning">Tax switched off</StatusBadge>}
        </div>
      </SectionCard>

      <SectionCard title="Duties on parcels abroad" description="A checkout note so buyers abroad aren't surprised.">
        <div style={{ display: "grid", gap: 12 }}>
          <p className="rp-hint" style={{ margin: 0 }}>Buyers outside your country can owe duties and import tax when the parcel arrives. You don't collect or pay these; the note just tells them.</p>
          <Toggle label="Warn buyers abroad about duties and import tax" checked={settings.taxes?.duties?.on === true} onChange={(on: boolean) => setDuties({ on })} />
          {settings.taxes?.duties?.on === true && (
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", alignItems: "start" }}>
              <TextField label="Your country" value={settings.taxes?.duties?.home ?? (US_SHOP ? "United States" : "Canada")} onChange={(e) => setDuties({ home: e.target.value })} hint="Parcels staying here show no note." />
              <TextField label="Estimate to show (percent, optional)" inputMode="decimal" value={String(settings.taxes?.duties?.estimateRate ?? "")} onChange={(e) => setDuties({ estimateRate: e.target.value.replace(/[^0-9.]/g, "").slice(0, 5) })} hint="Leave empty to show the note without a number." />
            </div>
          )}
          {settings.taxes?.duties?.on === true && (
            <TextArea label="Estimates for particular countries (optional)" rows={3} value={settings.taxes?.duties?.countryRates ?? ""} onChange={(e) => setDuties({ countryRates: e.target.value.slice(0, 1000) })} placeholder={"Germany 19\nUnited States 10"} hint="One country per line with a percent. Other countries use the estimate above." />
          )}
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

      <SectionCard title="Tax rates" description={collecting ? `${US_SHOP ? "State" : "Province"} beats country. Gift cards never taxed.` : "Paused while collection is off."}>
        <datalist id="tax-book-names">{TAX_BOOK_NAMES.map((name) => <option key={name} value={name} />)}</datalist>
        {rates.length === 0
          ? <EmptyState icon="%" title="No tax rates yet" description="No rate, no tax." />
          : <>
            <DataTable caption="Tax rates" rows={rates.map((r, index) => ({ ...r, index }))} rowKey={(r) => `${r.index}`} columns={columns} />
            <p className="rp-hint" style={{ margin: "12px 0 0" }}>{w("\"In your books\" is what your bookkeeper calls each tax. Orders and the bookkeeping file split tax by it.")}</p>
          </>}
      </SectionCard>


      {!US_SHOP && <SettingsAnchor id="tax-presets">
      <SectionCard title="Start from a preset" description="Fills places with no rate yet. Your rates stay as they are.">
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", alignItems: "end" }}>
          <SelectField label="Preset" value={presetId} onChange={(e) => setPresetId(e.target.value)}>
            {TAX_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </SelectField>
          <div><SecondaryButton onClick={usePreset}>Fill in missing rates</SecondaryButton></div>
        </div>
        <p className="rp-hint" style={{ margin: "12px 0 0" }}>{preset.description} Rates as of October 2026.</p>
      </SectionCard>
      </SettingsAnchor>}

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
          <SelectField label="Applies to" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">{w("Everything (all products)")}</option>
            {Object.entries(KIND_LABELS).map(([id, name]) => <option key={id} value={id}>{name} only</option>)}
          </SelectField>
          <TextField label="Rate (%)" inputMode="decimal" data-tax-rate value={rate} placeholder="13" error={tried && problem ? problem : undefined}
            onChange={(e) => setRate(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
          <TextField label={w("Name in your books")} list="tax-book-names" maxLength={TAX_BOOK_NAME_MAX} value={bookName}
            placeholder={suggestedTaxBookName({ country, region, rate })} onChange={(e) => setBookName(e.target.value)} />
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
