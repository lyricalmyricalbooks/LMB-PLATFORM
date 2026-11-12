// Stockroom › Stockists: Add a stockist, or Edit a stockist's details and terms (withStore in stockistMoves.ts), saved
// through the stockroom writer. A shop that holds several titles keeps one record per title, so an edit is saved to each.
// v4 mockup 1h: its own page (Stockist · Your share · Settling up), with what you keep of a sale in a mint rail.
import { useState } from "react";
import { fmt } from "@stockroom/money.js";
import { bookCurrencyCode } from "@stockroom/currency-migration.js";

import { PageHead } from "../riso/components";
import { FormChoice, FormField, FormPage, FormRow, FormSection, StatusBar, SummaryRail, formStatus } from "../riso/FormKit";
import { useShopWords } from "../shopWords";
import { storeFormOf, withStore, type StoreForm } from "./stockistMoves";
import { describeResult, stockroomWriteApi } from "./stockroomWrite";

type Row = Record<string, any>;
const KEEP_CHOICES = ["50", "60", "70"];
const SETTLE_CHOICES = ["Monthly", "Quarterly", "On request"];

export function StockistDetailsDialog({ shop, store, bookIds, books, onClose, onBookSaved, onDone }: {
  /** The shop being edited; left out to add one. */
  shop?: string; store?: Row | null; bookIds?: string[]; books: Row[];
  onClose: () => void; onBookSaved: (bookId: string, state: Row) => void; onDone: (note: string) => void;
}) {
  const w = useShopWords();
  const adding = shop === undefined;
  const [form, setForm] = useState<StoreForm>(() => storeFormOf(store));
  const [startText] = useState(() => JSON.stringify(storeFormOf(store)));
  const [bookId, setBookId] = useState(String(books[0]?.id ?? ""));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const set = (k: keyof StoreForm, v: string) => { setProblem(""); setForm((f) => ({ ...f, [k]: v })); };

  async function save() {
    if (busy) return;
    setBusy(true); setProblem("");
    const targets = adding ? [bookId] : bookIds || [];
    let note = "";
    try {
      for (const id of targets) {
        const r = await stockroomWriteApi.saveBookState(id, withStore(adding ? null : shop!, form));
        const d = describeResult(r);
        if (r.status !== "saved" && r.status !== "unchanged") { setProblem(d.text); setBusy(false); return; }
        note = d.text;
        onBookSaved(id, r.state as Row);
      }
      onDone(adding ? `${form.name.trim()} added. ${note}` : `Details saved. ${note}`);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Nothing was saved. Try again.");
      setBusy(false);
    }
  }

  const rate = Number(form.rate);
  const rateOk = form.rate.trim() !== "" && rate >= 0 && rate <= 100;
  const missing = [!form.name.trim(), adding && !bookId, !rateOk].filter(Boolean).length;
  const status = formStatus({ missing, create: adding, verb: "add", dirty: JSON.stringify(form) !== startText });
  // The rail works one sale through: the title they'll stock (or the first one), at its list price.
  const sample = books.find((b) => b.id === (adding ? bookId : bookIds?.[0])) || books[0];
  const price = Math.max(0, Number(sample?.listPrice) || 0) || 20;
  const code = sample ? bookCurrencyCode(sample) : "CAD";
  const theirs = rateOk ? Math.round(price * rate) / 100 : 0;
  const keep = Math.round((price - theirs) * 100) / 100;
  const keepPct = rateOk ? String(100 - rate) : "";
  const field = (k: keyof StoreForm, label: string, opts: { type?: string; required?: boolean; hint?: string } = {}) => (
    <FormField label={label} required={opts.required} empty={opts.required && !form[k].trim()} hint={opts.hint}>
      {(a) => <input {...a} type={opts.type || "text"} value={form[k]} onChange={(e) => set(k, e.target.value)} />}
    </FormField>
  );

  return (
    <>
      <PageHead title={adding ? "Add a stockist" : shop!} description="Stockist and terms" back={{ label: "Stockists", onClick: onClose }} />
      <form onSubmit={(e) => { e.preventDefault(); if (!missing) void save(); }}>
        <FormPage rail={
          <SummaryRail tone="mint" title={`On a ${fmt(price, code)} sale`} value={fmt(keep, code)}
            sub={`you keep · ${fmt(theirs, code)} to the stockist`}
            rows={[{ label: "Your share", value: rateOk ? `${keepPct}%` : "—" }, { label: "Settle", value: form.terms.trim() || "—" }]} />
        }>
          <FormSection title="Stockist" description="Who holds your copies.">
            {adding && (
              <FormField label={w("First title they'll stock")} required empty={!bookId}>
                {(a) => <select {...a} value={bookId} onChange={(e) => setBookId(e.target.value)}>
                  {books.map((b) => <option key={b.id} value={b.id}>{b.title || b.id}</option>)}
                </select>}
              </FormField>
            )}
            <FormRow>{field("name", "Name", { required: true })}{field("contact", "Contact person")}</FormRow>
            <FormRow>{field("email", "Contact email", { type: "email" })}{field("phone", "Phone", { type: "tel" })}</FormRow>
            {field("address", "Street address")}
            <FormRow>{field("city", "Town or city")}{field("region", "Province or state")}</FormRow>
            <FormRow>{field("postal", "Postal code")}{field("country", "Country")}</FormRow>
            {field("website", "Website")}
          </FormSection>

          <FormSection title="Your share" description="What you keep of each sale.">
            <FormChoice label="You keep" value={KEEP_CHOICES.includes(keepPct) ? keepPct : ""} onChange={(v) => set("rate", String(100 - Number(v)))}
              options={KEEP_CHOICES.map((k) => ({ value: k, label: `${k}%` }))} />
            <FormField label="Their commission" suffix="%" required empty={!rateOk} hint={rateOk ? undefined : "Between 0 and 100."}>
              {(a) => <input {...a} type="number" inputMode="decimal" min={0} max={100} value={form.rate} onChange={(e) => set("rate", e.target.value)} />}
            </FormField>
          </FormSection>

          <FormSection title="Settling up" description="How often you reconcile.">
            <FormChoice label="Settle" value={SETTLE_CHOICES.find((c) => c === form.terms.trim()) || ""} onChange={(v) => set("terms", v)}
              options={SETTLE_CHOICES.map((c) => ({ value: c, label: c }))} />
            {field("terms", "Payment terms", { hint: "Or type your own, e.g. Net 30." })}
            <FormField label="Notes">{(a) => <textarea {...a} rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />}</FormField>
          </FormSection>
        </FormPage>
        {problem && <p className="rp-sk-notice" data-tone="error" role="alert">{problem}</p>}
        <StatusBar status={status} primaryLabel={adding ? "Add stockist" : "Save terms"} busy={busy} blocked={missing > 0}
          onBlocked={() => setProblem("Fill in the highlighted fields.")} onPrimary={() => void save()}
          onCancel={onClose} cancelLabel={adding ? "Cancel" : "Discard"} />
      </form>
    </>
  );
}
