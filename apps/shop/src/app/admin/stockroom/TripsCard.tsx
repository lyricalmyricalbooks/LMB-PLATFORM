// Tax centre › Trips and events: the period's trips with their spend, and the old stockroom's trip tools: create a trip,
// open one (its details, spend by category, expenses and budget), edit or rename it, delete it, download its spreadsheet.
import { useState } from "react";
import { downloadCsv } from "@stockroom/download.js";

import { ConfirmDialog, DataTable, Dialog, EmptyState, GhostButton, PrimaryButton, SecondaryButton, SectionCard, TextArea, TextField } from "../riso/components";
import { saveTaxCenter, type SaveNote } from "./saveTaxCenter";
import { deleteTrip, findTrip, saveTrip, tripCsv, tripExpenseCount, tripProblem, tripToForm, type TripForm } from "./taxTrips";

type Row = Record<string, any>;
export type TripRow = { name: string; total: number; count: number; minDate?: string; maxDate?: string; deductible?: number; items?: Row[]; categories?: Record<string, number> };
const todayText = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export function TripsCard({ trips, taxCenter, money, baseCurrency, onSaved }: {
  trips: TripRow[]; taxCenter: Row | null; money: (n: number) => string; baseCurrency: string; onSaved?: (taxCenter: Row) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ name: string | null; form: TripForm } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [note, setNote] = useState<SaveNote | null>(null);
  const [busy, setBusy] = useState(false);
  const budgets = (taxCenter?.tripBudgets || {}) as Record<string, number>;
  const anyBudget = trips.some((t) => budgets[t.name] > 0);
  const shown = open ? trips.find((t) => t.name === open) : null;
  const problem = editing ? tripProblem(taxCenter, editing.name, editing.form) : "";

  async function run(mutate: (tc: Row | null) => Row, done: string) {
    if (busy || !onSaved) return;
    setBusy(true); setNote({ tone: "busy", text: "Saving…" });
    const r = await saveTaxCenter(mutate, done);
    if (r.ok && r.taxCenter) onSaved(r.taxCenter);
    setNote(r.note); setBusy(false);
  }
  function submit() {
    if (!editing || problem) return;
    const { name, form } = editing;
    setEditing(null);
    const moved = name && name !== form.name.trim() ? tripExpenseCount(taxCenter, name) : 0;
    const id = Date.now();
    void run((tc) => saveTrip(tc, name, form, todayText(), id).taxCenter,
      name ? `Trip updated${moved ? `, ${moved} ${moved === 1 ? "expense" : "expenses"} moved` : ""}.` : `Trip "${form.name.trim()}" created. Pick it when you log an expense.`);
  }
  const setForm = (patch: Partial<TripForm>) => setEditing((e) => (e ? { ...e, form: { ...e.form, ...patch } } : e));
  const rec = shown ? findTrip(taxCenter, shown.name) : null;

  return (
    <SectionCard title="Trips and events" flush
      actions={onSaved ? <SecondaryButton size="sm" onClick={() => setEditing({ name: null, form: tripToForm(taxCenter, null) })}>New trip</SecondaryButton> : undefined}>
      <DataTable stackOnPhone caption="Trips" rowKey={(t) => t.name} rows={trips}
        empty={<EmptyState inline title="No trips in this period" />}
        columns={[
          { key: "t", header: "Trip", lead: true, render: (t) => <GhostButton size="sm" onClick={() => setOpen(t.name)}>{t.name}</GhostButton> },
          { key: "d", header: "Dates", render: (t) => (t.minDate && t.maxDate ? (t.minDate === t.maxDate ? t.minDate : `${t.minDate} to ${t.maxDate}`) : "-") },
          { key: "n", header: "Expenses", numeric: true, render: (t) => t.count },
          { key: "s", header: "Spent", numeric: true, render: (t) => money(t.total) },
          ...(anyBudget ? [{ key: "b", header: "Budget", numeric: true, render: (t: TripRow) => (budgets[t.name] > 0 ? money(budgets[t.name]) : "-") }] : []),
          { key: "x", header: "Deductible", numeric: true, render: (t) => money(t.deductible ?? t.total) },
        ]} />
      {note && <p className="rp-sr-save rp-money-pad" data-tone={note.tone} role={note.tone === "error" ? "alert" : "status"}>{note.text}</p>}

      {shown && (
        <Dialog open onClose={() => setOpen(null)} title={shown.name} size="lg"
          description={[rec?.destination, rec?.startDate || rec?.endDate ? [rec?.startDate, rec?.endDate].filter(Boolean).join(" to ") : "", rec?.purpose].filter(Boolean).join(" · ") || undefined}
          footerStart={onSaved ? <GhostButton onClick={() => { setOpen(null); setDeleting(shown.name); }}>Delete trip</GhostButton> : undefined}
          footer={<>
            <SecondaryButton onClick={() => { const f = tripCsv(shown.name, shown.items || [], baseCurrency); downloadCsv(f.text, f.name); }}>Download spreadsheet</SecondaryButton>
            {onSaved && <PrimaryButton onClick={() => { setOpen(null); setEditing({ name: shown.name, form: tripToForm(taxCenter, shown.name) }); }}>Edit trip</PrimaryButton>}
          </>}>
          <p>{shown.count} {shown.count === 1 ? "expense" : "expenses"}, {money(shown.total)} spent{budgets[shown.name] > 0 ? ` of a ${money(budgets[shown.name])} budget` : ""}.</p>
          {rec?.notes && <p className="rp-money-note">{rec.notes}</p>}
          <DataTable stackOnPhone caption="Spent by category" rowKey={(c) => c[0]} rows={Object.entries(shown.categories || {})}
            columns={[{ key: "c", header: "Category", lead: true, render: (c) => c[0] }, { key: "a", header: "Spent", numeric: true, render: (c) => money(c[1]) }]} />
          <DataTable stackOnPhone caption="Expenses" rowKey={(e) => String(e.id)} rows={[...(shown.items || [])].sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))}
            empty={<EmptyState inline title="No expenses on this trip yet" description="Pick this trip when you log an expense." />}
            columns={[
              { key: "d", header: "Date", render: (e) => e.date || "-" },
              { key: "w", header: "What", lead: true, render: (e) => e.desc },
              { key: "c", header: "Category", render: (e) => e.cat },
              { key: "o", header: "Paid", numeric: true, render: (e) => `${Number(e.origAmount || 0).toFixed(2)} ${e.origCurrency || ""}` },
              { key: "b", header: baseCurrency, numeric: true, render: (e) => money(Number(e.baseAmount) || 0) },
            ]} />
        </Dialog>
      )}

      {editing && (
        <Dialog open onClose={() => setEditing(null)} title={editing.name ? "Edit trip" : "New trip"}
          footer={<><SecondaryButton onClick={() => setEditing(null)}>Cancel</SecondaryButton><PrimaryButton disabled={!!problem} onClick={submit}>{editing.name ? "Save changes" : "Create trip"}</PrimaryButton></>}>
          <form className="rp-money-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <TextField label="Name" placeholder="e.g. Spring craft fair" value={editing.form.name} error={editing.form.name.trim() ? problem || undefined : undefined} onChange={(e) => setForm({ name: e.target.value })} />
            <TextField label="Where (optional)" value={editing.form.destination} onChange={(e) => setForm({ destination: e.target.value })} />
            <div className="rp-money-form-row">
              <TextField label="From (optional)" type="date" value={editing.form.startDate} onChange={(e) => setForm({ startDate: e.target.value })} />
              <TextField label="To (optional)" type="date" value={editing.form.endDate} onChange={(e) => setForm({ endDate: e.target.value })} />
            </div>
            <TextField label="Why (optional)" placeholder="e.g. Selling at the fair, meeting printers" value={editing.form.purpose} onChange={(e) => setForm({ purpose: e.target.value })} />
            <TextField label={`Budget in ${baseCurrency} (optional)`} type="number" inputMode="decimal" min={0} step="0.01" value={editing.form.budget} onChange={(e) => setForm({ budget: e.target.value })} />
            <TextArea label="Notes (optional)" rows={3} value={editing.form.notes} onChange={(e) => setForm({ notes: e.target.value })} />
          </form>
        </Dialog>
      )}

      <ConfirmDialog open={deleting != null} title="Delete this trip?" confirmLabel="Delete trip"
        message={deleting ? (tripExpenseCount(taxCenter, deleting) ? `"${deleting}" goes. Its ${tripExpenseCount(taxCenter, deleting)} expenses stay in your ledger without a trip.` : `"${deleting}" goes.`) : ""}
        onCancel={() => setDeleting(null)}
        onConfirm={() => { const name = deleting!; setDeleting(null); void run((tc) => deleteTrip(tc, name), `Trip "${name}" deleted.`); }} />
    </SectionCard>
  );
}
