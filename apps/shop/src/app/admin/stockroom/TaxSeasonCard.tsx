// Tax centre › Tax-season export: the old stockroom's file for the bookkeeper (taxSeason.ts), with its one setting,
// "Tax on in-person sales" (a rate, its name in the books and whether prices include it), saved in the Tax centre's
// settings (`settings.inPersonTax`) the way the old app saved it.
import { useState } from "react";
import { downloadCsv } from "@stockroom/download.js";
import { inPersonTaxOf, suggestedTaxBookName, TAX_BOOK_NAMES } from "@stockroom/bookkeeping-days.js";

import { Checkbox, PrimaryButton, SecondaryButton, SectionCard, TextField } from "../riso/components";
import { shopProfile } from "../../../lib/shopProfile";
import { saveTaxCenter, type SaveNote } from "./saveTaxCenter";
import { taxSeasonExport, type TaxSeasonInput } from "./taxSeason";

type Row = Record<string, any>;
const todayText = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** The Tax centre with the in-person tax setting saved (or taken off when the rate is blank). */
export function withInPersonTax(tc: Row | null, form: { rate: string; bookName: string; included: boolean }): Row {
  const cur: Row = tc && typeof tc === "object" ? tc : {};
  const { inPersonTax: _old, ...settings } = (cur.settings || {}) as Row;
  const rate = form.rate.trim();
  if (rate === "") return { ...cur, settings };
  return { ...cur, settings: { ...settings, inPersonTax: { rate, bookName: form.bookName.replace(/\s+/g, " ").trim().slice(0, 40), included: form.included } } };
}

export function inPersonTaxHint(form: { rate: string; bookName: string; included: boolean }): string {
  const tax = inPersonTaxOf(form);
  if (form.rate.trim() === "") return "No rate: in-person sales are shown as sales before tax.";
  return tax ? `In-person sales show ${tax.name} at ${tax.rate}%, ${tax.included ? "taken out of" : "added to"} the prices.` : "Enter the rate as a number from 0 to 100, e.g. 13.";
}

export function TaxSeasonCard({ input, year, onSaved }: { input: TaxSeasonInput; year: string; onSaved?: (taxCenter: Row) => void }) {
  const saved = (input.taxCenter?.settings?.inPersonTax || {}) as Row;
  const [form, setForm] = useState({ rate: String(saved.rate ?? ""), bookName: String(saved.bookName || ""), included: saved.included !== false });
  const [note, setNote] = useState<SaveNote | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof form>) => { setForm((f) => ({ ...f, ...patch })); setNote(null); };
  const bad = form.rate.trim() !== "" && !inPersonTaxOf(form);

  async function save() {
    if (busy || bad || !onSaved) return;
    setBusy(true); setNote({ tone: "busy", text: "Saving…" });
    const r = await saveTaxCenter((tc) => withInPersonTax(tc, form), "Tax on in-person sales saved.");
    if (r.ok && r.taxCenter) onSaved(r.taxCenter);
    setNote(r.note); setBusy(false);
  }

  function download() {
    const file = taxSeasonExport(input, year, { pressName: shopProfile.name || "Your Press", today: todayText() });
    downloadCsv(file.text, file.name);
    const warn = [
      file.waiting ? `${file.waiting} ${file.waiting === 1 ? "expense is" : "expenses are"} still waiting for an exchange rate, so the totals are not final.` : "",
      file.unconverted.length ? `No exchange rate for ${file.unconverted.map((u) => `${u.title} (${u.cur})`).join(", ")}: shown unconverted.` : "",
    ].filter(Boolean).join(" ");
    setNote(warn ? { tone: "warn", text: `Downloaded. ${warn}` } : { tone: "ok", text: "Downloaded." });
  }

  return (
    <SectionCard title="Tax-season file" description={`Everything for your bookkeeper for ${year === "all" ? "all years" : year}: sales by book, fair and in-person sales by day, every expense and payout.`}>
      <div className="rp-money-form">
        {onSaved && (
          <>
            <div className="rp-money-form-row">
              <TextField label="Tax on in-person sales (%)" inputMode="decimal" placeholder="e.g. 13" value={form.rate} error={bad ? "Enter a number from 0 to 100." : undefined} onChange={(e) => set({ rate: e.target.value })} />
              <TextField label="Its name in your accounts" list="rp-money-tax-names" placeholder={form.rate.trim() === "" ? "GST, HST ON, PST BC…" : suggestedTaxBookName({ country: "Canada", rate: form.rate })} value={form.bookName} onChange={(e) => set({ bookName: e.target.value })} />
              <datalist id="rp-money-tax-names">{TAX_BOOK_NAMES.map((n) => <option key={n} value={n} />)}</datalist>
            </div>
            <Checkbox label="My prices already include it" checked={form.included} onChange={(e) => set({ included: e.target.checked })} />
            <p className="rp-money-note">{inPersonTaxHint(form)}</p>
          </>
        )}
        <div className="rp-money-actions">
          {onSaved && <SecondaryButton busy={busy} disabled={bad} onClick={() => void save()}>Save tax setting</SecondaryButton>}
          <PrimaryButton onClick={download}>Download tax-season file</PrimaryButton>
          {note && <p className="rp-sr-save" data-tone={note.tone} role={note.tone === "error" ? "alert" : "status"}>{note.text}</p>}
        </div>
      </div>
    </SectionCard>
  );
}
