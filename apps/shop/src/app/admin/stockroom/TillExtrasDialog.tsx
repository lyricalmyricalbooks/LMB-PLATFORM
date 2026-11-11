// Till › Till-only items: add, change or remove the items sold only at the till (tillExtras.ts). Each save goes through
// updateSetting("catalog"), one at a time, the result always shown.
import { useState } from "react";

import { Dialog, GhostButton, PrimaryButton, SecondaryButton, SelectField, TextField } from "../riso/components";
import { blankExtra, extraProblem, withExtra, withoutExtra, type ExtraForm } from "./tillExtras";
import { tillOnlyItems, type StockBook } from "./stockroomData";
import { describeResult, stockroomWriteApi } from "./stockroomWrite";
import { EXPENSE_CURRENCIES } from "./taxExpense";
import { bookCurrencyCode } from "@stockroom/currency-migration.js";
import { money } from "./till";

export function TillExtrasDialog({ open, onClose, extras, onSaved, currency }: {
  open: boolean; onClose: () => void; extras: StockBook[]; onSaved: (extras: StockBook[]) => void; currency: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<ExtraForm | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<ExtraForm>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const currencies = [...new Set([currency, ...EXPENSE_CURRENCIES])];

  async function save(mutate: (c: unknown) => unknown, done: string) {
    setBusy(true); setNote("Saving…");
    try {
      const r = await stockroomWriteApi.updateSetting("catalog", mutate);
      if (r.status === "saved" || r.status === "unchanged") { onSaved(tillOnlyItems(r.value)); setForm(null); setEditing(null); setNote(done); }
      else setNote(describeResult(r).text);
    } catch (error) { setNote(error instanceof Error ? error.message : "That didn't save. Nothing was changed."); }
    finally { setBusy(false); }
  }

  const submit = () => {
    if (!form) return;
    const problem = extraProblem(form);
    if (problem) { setNote(problem); return; }
    void save(withExtra(form, editing || undefined), `Saved: ${form.title.trim()}.`);
  };

  return (
    <Dialog open={open} onClose={() => { setForm(null); setNote(""); onClose(); }} title="Till-only items" description="Sold at the till only. No stock count, kept out of your money pages.">
      {!form && (
        <>
          {extras.length === 0
            ? <p className="rp-till-none">None yet. A zine or a friend's title you sell at the table goes here.</p>
            : <ul className="rp-till-extras">
              {extras.map((e) => (
                <li key={e.id}>
                  <span><strong>{e.title}</strong> · {money(Number(e.listPrice) || 0, bookCurrencyCode(e))}{Number(e.sold) > 0 ? ` · ${Number(e.sold)} sold` : ""}</span>
                  <GhostButton size="sm" onClick={() => { setEditing(e.id); setNote(""); setForm({ title: e.title || "", author: String(e.author || ""), price: String(e.listPrice ?? ""), currency: bookCurrencyCode(e) }); }}>Change</GhostButton>
                </li>
              ))}
            </ul>}
          <PrimaryButton onClick={() => { setEditing(null); setNote(""); setForm(blankExtra(currency)); }}>Add an item</PrimaryButton>
        </>
      )}
      {form && (
        <form className="rp-money-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <TextField label="Name" value={form.title} onChange={(e) => set({ title: e.target.value })} />
          <TextField label="By (optional)" value={form.author} onChange={(e) => set({ author: e.target.value })} />
          <div className="rp-money-form-row">
            <TextField label="Price" type="number" inputMode="decimal" min={0} step="0.01" value={form.price} onChange={(e) => set({ price: e.target.value })} />
            <SelectField label="Currency" value={form.currency} onChange={(e) => set({ currency: e.target.value })}>
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </SelectField>
          </div>
          <div className="rp-money-actions">
            <PrimaryButton type="submit" busy={busy}>{editing ? "Save changes" : "Add to the till"}</PrimaryButton>
            <SecondaryButton type="button" onClick={() => { setForm(null); setNote(""); }}>Cancel</SecondaryButton>
            {editing && <GhostButton type="button" disabled={busy} onClick={() => void save(withoutExtra(editing), "Removed from the till.")}>Remove</GhostButton>}
          </div>
        </form>
      )}
      {note && <p className="rp-sr-save" role="status">{note}</p>}
    </Dialog>
  );
}
