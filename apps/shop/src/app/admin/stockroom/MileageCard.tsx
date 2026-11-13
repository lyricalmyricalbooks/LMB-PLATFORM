// Bookkeeping › Expenses › Drives: log business drives and turn them into a deduction at a rate the owner sets
// (Canada's CRA or the US IRS rate to start from, labelled with their year). Rules in mileage.ts.
import { useMemo, useState } from "react";
import { downloadCsv } from "@stockroom/download.js";

import { ConfirmDialog, DataTable, Dialog, EmptyState, GhostButton, PrimaryButton, SecondaryButton, SectionCard } from "../riso/components";
import { FormChoice, FormField, FormRow, FormToggle } from "../riso/FormKit";
import { saveTaxCenter, type SaveNote } from "./saveTaxCenter";
import {
  distanceText, driveProblem, drivesCsv, driveToForm, driveTotal, mileageOf, mileageYear, presetsFor, rateText, ratesProblem,
  removeDrive, saveDrive, saveMileage, UNIT_WORD, withPreset, type DriveForm, type Mileage, type MileageRate, type PricedDrive, type Unit,
} from "./mileage";

type Row = Record<string, any>;
const todayText = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const UNITS: { value: Unit; label: string }[] = [{ value: "km", label: "Kilometres" }, { value: "mi", label: "Miles" }];
type RateDraft = { id: string; from: string; unit: Unit; rate: string; tierAfter: string; tierRate: string; label: string };
const toDraft = (r: MileageRate): RateDraft => ({ id: r.id, from: r.from, unit: r.unit, rate: String(r.rate), tierAfter: r.tierAfter ? String(r.tierAfter) : "", tierRate: r.tierRate ? String(r.tierRate) : "", label: r.label });
const fromDraft = (unit: Unit, rows: RateDraft[]): Mileage => ({
  unit,
  rates: rows.map((r) => ({
    id: r.id, from: r.from, unit: r.unit, rate: parseFloat(r.rate) || 0, label: r.label,
    ...(r.tierAfter.trim() || r.tierRate.trim() ? { tierAfter: parseFloat(r.tierAfter) || 0, tierRate: parseFloat(r.tierRate) || 0 } : {}),
  })),
});

export function MileageCard({ taxCenter, year, money, baseCurrency, stockists = [], onSaved }: {
  taxCenter: Row | null; year: string; money: (n: number) => string; baseCurrency: string; stockists?: string[]; onSaved?: (taxCenter: Row) => void;
}) {
  const [editing, setEditing] = useState<{ id: string | null; form: DriveForm } | null>(null);
  const [rates, setRates] = useState<{ unit: Unit; rows: RateDraft[] } | null>(null);
  const [removing, setRemoving] = useState<PricedDrive | null>(null);
  const [note, setNote] = useState<SaveNote | null>(null);
  const [busy, setBusy] = useState(false);
  const settings = useMemo(() => mileageOf(taxCenter, baseCurrency), [taxCenter, baseCurrency]);
  const y = useMemo(() => mileageYear(taxCenter, year, baseCurrency), [taxCenter, year, baseCurrency]);
  const trips = useMemo(() => (Array.isArray(taxCenter?.trips) ? taxCenter!.trips.map((t: Row) => String(t.name || "")).filter(Boolean) : []) as string[], [taxCenter]);
  const unitWord = UNIT_WORD[settings.unit];
  const problem = editing ? driveProblem(editing.form) : "";
  const rateDraft = rates ? fromDraft(rates.unit, rates.rows) : null;
  const rateIssue = rateDraft ? ratesProblem(rateDraft) : "";
  const current = settings.rates.length ? settings.rates[settings.rates.length - 1] : null;

  async function run(mutate: (tc: Row | null) => Row, done: string) {
    if (busy || !onSaved) return;
    setBusy(true); setNote({ tone: "busy", text: "Saving…" });
    const r = await saveTaxCenter(mutate, done);
    if (r.ok && r.taxCenter) onSaved(r.taxCenter);
    setNote(r.note); setBusy(false);
  }
  function submitDrive() {
    if (!editing || problem) return;
    const { id, form } = editing;
    setEditing(null);
    const newId = `drive-${Date.now()}`;
    void run((tc) => saveDrive(tc, id, form, settings.unit, newId, todayText()), id ? "Drive updated." : "Drive logged.");
  }
  function submitRates() {
    if (!rateDraft || rateIssue) return;
    setRates(null);
    void run((tc) => saveMileage(tc, rateDraft), "Rates saved. Every drive is worked out again.");
  }
  const setForm = (patch: Partial<DriveForm>) => setEditing((e) => (e ? { ...e, form: { ...e.form, ...patch } } : e));
  const setRow = (i: number, patch: Partial<RateDraft>) => setRates((r) => (r ? { ...r, rows: r.rows.map((row, at) => (at === i ? { ...row, ...patch } : row)) } : r));
  const addPreset = (id: string) => setRates((r) => {
    if (!r) return r;
    const next = withPreset(fromDraft(r.unit, r.rows), id);
    return { unit: next.unit, rows: next.rates.map(toDraft) };
  });
  const formTotal = editing ? driveTotal({ distance: parseFloat(editing.form.distance) || 0, roundTrip: editing.form.roundTrip }) : 0;

  return (
    <SectionCard title="Drives" flush
      description={current ? `Rate: ${rateText(current, baseCurrency)}${current.label ? ` (${current.label})` : ""}.` : "Set a rate to turn your drives into a deduction."}
      actions={onSaved ? <>
        <SecondaryButton size="sm" onClick={() => setRates({ unit: settings.unit, rows: settings.rates.map(toDraft) })}>Rates</SecondaryButton>
        <SecondaryButton size="sm" onClick={() => setEditing({ id: null, form: driveToForm(taxCenter, null, todayText()) })}>Log a drive</SecondaryButton>
      </> : undefined}>
      <div className="rp-tiles rp-money-pad">
        <div className="rp-tile" data-tone="sky">
          <span className="rp-tile-label">Driven in {year}</span>
          <span className="rp-tile-value">{distanceText(y.distance, y.unit)}</span>
          <span className="rp-tile-sub">{y.drives.length} {y.drives.length === 1 ? "drive" : "drives"}</span>
        </div>
        <div className="rp-tile" data-tone="mint">
          <span className="rp-tile-label">Deduction for {year}</span>
          <span className="rp-tile-value">{money(y.deduction)}</span>
          <span className="rp-tile-sub">{y.noRate ? `${y.noRate} ${y.noRate === 1 ? "drive has" : "drives have"} no rate yet` : "At the rate of each drive's day"}</span>
        </div>
      </div>
      <DataTable stackOnPhone caption={`Drives in ${year}`} rowKey={(d) => String(d.id)} rows={[...y.drives].reverse()}
        empty={<EmptyState inline title={`No drives in ${year}`} description="Log trips to fairs, printers, the post office and stockists." />}
        columns={[
          { key: "d", header: "Date", render: (d) => d.date },
          { key: "r", header: "Route", lead: true, render: (d) => <>{d.from ? `${d.from} to ${d.to}` : d.to}{d.roundTrip && <span className="rp-money-sub"> and back</span>}</> },
          { key: "w", header: "Why", render: (d) => [d.purpose, d.trip, d.stockist].filter(Boolean).join(" · ") || "-" },
          { key: "k", header: "Distance", numeric: true, render: (d) => distanceText(d.total, d.unit) },
          { key: "x", header: "Deduction", numeric: true, render: (d) => (d.rate ? money(d.deduction) : "No rate") },
          ...(onSaved ? [{ key: "a", header: "", render: (d: PricedDrive) => <GhostButton size="sm" onClick={() => setEditing({ id: String(d.id), form: driveToForm(taxCenter, String(d.id), todayText()) })}>Edit</GhostButton> }] : []),
        ]} />
      <div className="rp-money-pad">
        <SecondaryButton size="sm" disabled={!y.drives.length} onClick={() => { const f = drivesCsv(y.drives, year, baseCurrency); downloadCsv(f.text, f.name); }}>Download drive log</SecondaryButton>
      </div>
      {note && <p className="rp-sr-save rp-money-pad" data-tone={note.tone} role={note.tone === "error" ? "alert" : "status"}>{note.text}</p>}

      {editing && (
        <Dialog open onClose={() => setEditing(null)} title={editing.id ? "Edit drive" : "Log a drive"}
          footerStart={editing.id ? <GhostButton onClick={() => { const d = y.drives.find((x) => String(x.id) === editing.id) || null; setEditing(null); setRemoving(d); }}>Remove</GhostButton> : undefined}
          footer={<><SecondaryButton onClick={() => setEditing(null)}>Cancel</SecondaryButton><PrimaryButton disabled={!!problem || busy} onClick={submitDrive}>{editing.id ? "Save changes" : "Log drive"}</PrimaryButton></>}>
          <form className="rp-money-form" onSubmit={(e) => { e.preventDefault(); submitDrive(); }}>
            <FormField label="Date" required empty={!editing.form.date}>
              {(p) => <input {...p} className="rp-input" type="date" value={editing.form.date} onChange={(e) => setForm({ date: e.target.value })} />}
            </FormField>
            <FormRow>
              <FormField label="From">{(p) => <input {...p} className="rp-input" placeholder="e.g. The studio" value={editing.form.from} onChange={(e) => setForm({ from: e.target.value })} />}</FormField>
              <FormField label="To" required empty={!editing.form.to.trim()}>{(p) => <input {...p} className="rp-input" placeholder="e.g. Printer on Queen St" value={editing.form.to} onChange={(e) => setForm({ to: e.target.value })} />}</FormField>
            </FormRow>
            <FormField label="Why" hint="What the drive was for.">{(p) => <input {...p} className="rp-input" placeholder="e.g. Picking up the print run" value={editing.form.purpose} onChange={(e) => setForm({ purpose: e.target.value })} />}</FormField>
            <FormField label="Distance one way" required empty={!editing.form.distance} suffix={unitWord.short}
              hint={editing.form.roundTrip && formTotal > 0 ? `${distanceText(formTotal, settings.unit)} there and back.` : undefined}>
              {(p) => <input {...p} className="rp-input" type="number" inputMode="decimal" min={0} step="0.1" value={editing.form.distance} onChange={(e) => setForm({ distance: e.target.value })} />}
            </FormField>
            <FormToggle label="Round trip" hint="Counts the distance twice." checked={editing.form.roundTrip} onChange={(v) => setForm({ roundTrip: v })} />
            {(trips.length > 0 || editing.form.trip) && (
              <FormField label="Trip or event">
                {(p) => <select {...p} className="rp-select" value={editing.form.trip} onChange={(e) => setForm({ trip: e.target.value })}>
                  <option value="">None</option>
                  {[...new Set([...trips, editing.form.trip].filter(Boolean))].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>}
              </FormField>
            )}
            {(stockists.length > 0 || editing.form.stockist) && (
              <FormField label="Stockist visit">
                {(p) => <select {...p} className="rp-select" value={editing.form.stockist} onChange={(e) => setForm({ stockist: e.target.value })}>
                  <option value="">None</option>
                  {[...new Set([...stockists, editing.form.stockist].filter(Boolean))].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>}
              </FormField>
            )}
            {problem && editing.form.to.trim() && editing.form.distance && <p className="rp-sr-save" data-tone="error" role="alert">{problem}</p>}
          </form>
        </Dialog>
      )}

      {rates && (
        <Dialog open size="lg" onClose={() => setRates(null)} title="Mileage rates"
          description="Each rate holds from its start day until the next one. Add next year's rate when it comes out; older drives keep theirs."
          footer={<><SecondaryButton onClick={() => setRates(null)}>Cancel</SecondaryButton><PrimaryButton disabled={!!rateIssue || busy} onClick={submitRates}>Save rates</PrimaryButton></>}>
          <div className="rp-money-form">
            <FormChoice label="Show distances in" options={UNITS} value={rates.unit} onChange={(unit) => setRates((r) => (r ? { ...r, unit } : r))} />
            <div className="rp-mileage-presets">
              {presetsFor(baseCurrency).map((p) => <SecondaryButton key={p.id} size="sm" onClick={() => addPreset(p.id)}>Add {p.label} rates</SecondaryButton>)}
              <GhostButton size="sm" onClick={() => setRates((r) => (r ? { ...r, rows: [...r.rows, { id: `rate-${Date.now()}`, from: `${new Date().getFullYear()}-01-01`, unit: r.unit, rate: "", tierAfter: "", tierRate: "", label: "" }] } : r))}>Add your own rate</GhostButton>
            </div>
            {!rates.rows.length && <EmptyState inline title="No rates yet" description="Start from an official rate above, or add your own." />}
            {rates.rows.map((r, i) => (
              <fieldset key={r.id} className="rp-mileage-rate">
                <legend>{r.label || `Rate from ${r.from || "…"}`}</legend>
                <FormRow>
                  <FormField label="Name">{(p) => <input {...p} className="rp-input" placeholder="e.g. Canada 2027" value={r.label} onChange={(e) => setRow(i, { label: e.target.value })} />}</FormField>
                  <FormField label="Starts on" required empty={!r.from}>{(p) => <input {...p} className="rp-input" type="date" value={r.from} onChange={(e) => setRow(i, { from: e.target.value })} />}</FormField>
                </FormRow>
                <FormRow>
                  <FormField label={`Amount per ${UNIT_WORD[r.unit].one}`} required empty={!r.rate} suffix={baseCurrency}>
                    {(p) => <input {...p} className="rp-input" type="number" inputMode="decimal" min={0} step="0.001" value={r.rate} onChange={(e) => setRow(i, { rate: e.target.value })} />}
                  </FormField>
                  <FormChoice label="Per" options={[{ value: "km", label: "km" }, { value: "mi", label: "mile" }]} value={r.unit} onChange={(unit) => setRow(i, { unit })} />
                </FormRow>
                <FormRow>
                  <FormField label="Lower rate after" hint="Optional, per year." suffix={UNIT_WORD[r.unit].short}>
                    {(p) => <input {...p} className="rp-input" type="number" inputMode="decimal" min={0} value={r.tierAfter} onChange={(e) => setRow(i, { tierAfter: e.target.value })} />}
                  </FormField>
                  <FormField label="Lower rate" suffix={baseCurrency}>
                    {(p) => <input {...p} className="rp-input" type="number" inputMode="decimal" min={0} step="0.001" value={r.tierRate} onChange={(e) => setRow(i, { tierRate: e.target.value })} />}
                  </FormField>
                </FormRow>
                <GhostButton size="sm" onClick={() => setRates((cur) => (cur ? { ...cur, rows: cur.rows.filter((_, at) => at !== i) } : cur))}>Remove this rate</GhostButton>
              </fieldset>
            ))}
            {rateIssue && rates.rows.length > 0 && <p className="rp-sr-save" data-tone="error" role="alert">{rateIssue}</p>}
          </div>
        </Dialog>
      )}

      <ConfirmDialog open={removing != null} title="Remove this drive?" confirmLabel="Remove drive"
        message={removing ? `The drive to ${removing.to} on ${removing.date} comes off your log and your deduction.` : ""}
        onCancel={() => setRemoving(null)}
        onConfirm={() => { const id = String(removing!.id); setRemoving(null); void run((tc) => removeDrive(tc, id), "Drive removed."); }} />
    </SectionCard>
  );
}
