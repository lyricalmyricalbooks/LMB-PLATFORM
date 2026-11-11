// Tax centre › Year-end stock value: what the unsold copies are worth (cost and retail, at home and with stores), its
// spreadsheet, and the old stockroom's "Write down or dispose" form (stockValue.ts). A valuation is saved in the Tax
// centre only; a disposal is saved there first, then the copies leave the book's stock (WRITING.md).
import { useState } from "react";
import { downloadCsv } from "@stockroom/download.js";
import { fileStem } from "@stockroom/shop-profile.js";

import { DataTable, Dialog, EmptyState, MetricCard, PrimaryButton, SecondaryButton, SectionCard, SelectField, Tabs, TextField } from "../riso/components";
import { shopProfile } from "../../../lib/shopProfile";
import { describeResult, stockroomWriteApi } from "./stockroomWrite";
import { saveTaxCenter, type SaveNote } from "./saveTaxCenter";
import { adjustable, adjustmentPreview, buildAdjustment, stockValue, stockValueCsv, withAdjustment, withDisposal, type AdjustmentForm, type AdjustmentMode } from "./stockValue";

type Row = Record<string, any>;
const todayText = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const cad = (n: number) => `$${n.toFixed(2)}`;
const REASON = { valuation: "Obsolete edition or title", disposal: "Damaged or defective inventory" } as const;

export function StockValueCard({ books, states, taxCenter, fxRateCache, onTaxCenter, onState }: {
  books: Row[]; states: Record<string, Row>; taxCenter: Row | null; fxRateCache: Record<string, number>;
  onTaxCenter?: (tc: Row) => void; onState?: (bookId: string, state: Row) => void;
}) {
  const { items, totals } = stockValue(books, states, fxRateCache);
  const [mode, setMode] = useState<AdjustmentMode>("valuation");
  const [form, setForm] = useState<AdjustmentForm | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<SaveNote | null>(null);
  const expenses = (Array.isArray(taxCenter?.businessExpenses) ? taxCenter!.businessExpenses : []) as Row[];
  const choices = items.filter((i) => i.totalUnsold > 0);
  const item = form ? items.find((i) => i.id === form.bookId) : undefined;
  const set = (patch: Partial<AdjustmentForm>) => { setForm((f) => (f ? { ...f, ...patch } : f)); setError(""); };

  function start() {
    if (!choices.length) return;
    setMode("valuation"); setError("");
    setForm({ bookId: choices[0].id, qty: "1", nrv: "", date: todayText(), reason: REASON.valuation, evidence: "", notes: "" });
  }
  function download() {
    const name = shopProfile.name || "Your Press";
    downloadCsv(stockValueCsv(books, states, fxRateCache, expenses, name, todayText()), `${fileStem({}, { name })}_Inventory_Valuation_${todayText()}.csv`);
  }
  async function submit() {
    if (!form || !item || busy || !onTaxCenter) return;
    const built = buildAdjustment(item, mode, form, expenses, `iva_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
    if ("error" in built) { setError(built.error); return; }
    setBusy(true); setNote({ tone: "busy", text: "Saving…" });
    const r = await saveTaxCenter((tc) => withAdjustment(tc, built.record, mode), "Valuation recorded. Stock unchanged.");
    if (!r.ok || !r.taxCenter) { setNote(r.note); setBusy(false); return; }
    onTaxCenter(r.taxCenter);
    if (mode === "disposal") {
      const book = books.find((b) => b.id === item.id)!;
      const saved = await stockroomWriteApi.saveBookState(item.id, (st) => withDisposal(st as Row, book, built.record, form) as typeof st);
      if (saved.status === "saved" || saved.status === "unchanged") {
        onState?.(item.id, saved.state as Row);
        setNote({ tone: "ok", text: `${form.qty} ${form.qty === "1" ? "copy" : "copies"} written off and taken out of stock.` });
      } else setNote({ tone: "error", text: `The write-off is in the Tax centre, but the stock count didn't change: ${describeResult(saved).text}` });
    } else setNote(r.note);
    setBusy(false); setForm(null);
  }

  return (
    <SectionCard title="Year-end stock value" description="What your unsold copies are worth, at home and with stores."
      actions={<><SecondaryButton size="sm" onClick={download}>Download spreadsheet</SecondaryButton>{onTaxCenter && <SecondaryButton size="sm" disabled={!choices.length} onClick={start}>Write down or dispose</SecondaryButton>}</>}>
      <div className="rp-grid-metrics">
        <MetricCard label="Unsold copies" value={String(totals.totalUnsoldUnits)} footer={`${totals.totalStockOnHand} at home, ${totals.totalStockConsigned} with stores`} />
        <MetricCard label="Value at cost (CAD)" value={cad(totals.totalAssetValueCostCAD)} />
        <MetricCard label="Value at retail (CAD)" value={cad(totals.totalAssetValueRetailCAD)} footer={`Average margin ${totals.weightedAvgMarginPct.toFixed(1)}%`} />
      </div>
      <DataTable stackOnPhone caption="Stock value by title" rowKey={(i) => i.id} rows={items}
        empty={<EmptyState inline title="No titles yet" />}
        columns={[
          { key: "t", header: "Title", lead: true, render: (i) => i.title },
          { key: "h", header: "At home", numeric: true, render: (i) => i.stockOnHand },
          { key: "s", header: "With stores", numeric: true, render: (i) => i.stockConsigned },
          { key: "u", header: "Unit cost", numeric: true, render: (i) => `${i.unitCost.toFixed(2)} ${i.currency}` },
          { key: "c", header: "At cost (CAD)", numeric: true, render: (i) => cad(i.totalCostCAD) },
          { key: "r", header: "At retail (CAD)", numeric: true, render: (i) => cad(i.totalRetailCAD) },
        ]} />
      {note && <p className="rp-sr-save" data-tone={note.tone} role={note.tone === "error" ? "alert" : "status"}>{note.text}</p>}

      {form && item && (
        <Dialog open onClose={() => setForm(null)} title="Write down or dispose"
          footer={<><SecondaryButton onClick={() => setForm(null)}>Cancel</SecondaryButton><PrimaryButton busy={busy} onClick={() => void submit()}>{mode === "valuation" ? "Record valuation" : "Record disposal"}</PrimaryButton></>}>
          <Tabs label="Kind of adjustment" value={mode} onChange={(m) => { setMode(m); set({ reason: REASON[m] }); }}
            tabs={[{ id: "valuation", label: "Lower the value" }, { id: "disposal", label: "Copies are gone" }]} />
          <form className="rp-money-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <SelectField label="Title" value={form.bookId} onChange={(e) => set({ bookId: e.target.value, qty: "1" })}>
              {choices.map((i) => <option key={i.id} value={i.id}>{i.title} · {i.totalUnsold} unsold</option>)}
            </SelectField>
            <div className="rp-money-form-row">
              <TextField label="Copies" type="number" min={1} max={adjustable(item, mode)} step={1} value={form.qty} hint={`Up to ${adjustable(item, mode)}. Unit cost ${item.unitCost.toFixed(2)} ${item.currency}.`} onChange={(e) => set({ qty: e.target.value })} />
              <TextField label="Date" type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
            </div>
            {mode === "valuation" && <TextField label={`What one copy would sell for now (${item.currency})`} type="number" min={0} step="0.01" value={form.nrv} onChange={(e) => set({ nrv: e.target.value })} />}
            <TextField label="Reason" value={form.reason} onChange={(e) => set({ reason: e.target.value })} />
            <TextField label="Evidence" placeholder="e.g. Photos, remainder quote, printer's note" value={form.evidence} onChange={(e) => set({ evidence: e.target.value })} />
            <TextField label="Notes (optional)" value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
            <p className="rp-money-note">
              {mode === "valuation" ? "This year's tax adjustment" : "Cost taken off"}: {cad(adjustmentPreview(item, mode, form, expenses))} CAD.{" "}
              {mode === "valuation" ? `Stock stays at ${item.totalUnsold} unsold copies; this changes no money.` : `${form.qty || 0} of your own copies leave the stock for good.`}
            </p>
            {error && <p className="rp-sr-save" data-tone="error" role="alert">{error}</p>}
          </form>
        </Dialog>
      )}
    </SectionCard>
  );
}
