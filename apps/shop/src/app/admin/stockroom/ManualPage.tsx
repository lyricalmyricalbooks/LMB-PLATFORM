// Stockroom › Record a sale, drawn by the admin itself as the v4 mockup (1d) shows it: the form kit's sections, the
// total in a rail and Record sale in the status bar. The rules and the save are the Sales records dialog's (useSaleForm in
// SaleWriter.tsx, recordSale.ts), so a sale recorded here is the same row the stockroom has always kept.
import { useState } from "react";

import { fmt } from "@stockroom/money.js";
import { bookCurrencyCode } from "@stockroom/currency-migration.js";
import { EmptyState, SecondaryButton } from "../riso/components";
import { FormChoice, FormField, FormPage, FormRow, FormSection, StatusBar, SummaryRail, formStatus } from "../riso/FormKit";
import { useShopWords } from "../shopWords";
import type { NativePageProps } from "./nativePages";
import { RecordsGate } from "./RecordsGate";
import { SaveNoteLine, useSaleForm, useStockroomSave } from "./SaleWriter";
import { SALE_CHANNELS, blankSale } from "./recordSale";
import type { StockroomRecords } from "./stockroomData";
import "./stockroom.css";
import "./sales.css";
import { SHOP_CURRENCY } from "../moneySign";

export function ManualSale({ records: loaded, onOpen }: { records: StockroomRecords; onOpen?: NativePageProps["onOpen"] }) {
  const w = useShopWords();
  const [records, setRecords] = useState(loaded);
  const save = useStockroomSave((bookId, state) => setRecords((r) => ({ ...r, states: { ...r.states, [bookId]: state } })));
  const sale = useSaleForm(records, save);
  const { form, set, errors } = sale;
  const submit = async () => { if (await sale.submit()) sale.reset(); };

  if (!records.books.length) {
    return <EmptyState icon="🧾" title={w("No books in the stockroom yet")} description={w("Add a book first, then record its sales here.")}
      action={onOpen ? <SecondaryButton onClick={() => onOpen("dashboard")}>{w("Open Stock and sales")}</SecondaryButton> : undefined} />;
  }
  const book = records.books.find((b) => b.id === form.bookId);
  const code = book ? bookCurrencyCode(book) : SHOP_CURRENCY;
  const qty = Number(form.qty) || 0;
  const total = Math.round(qty * (Number(form.price) || 0) * 100) / 100;
  const onHand = book ? sale.onHand(book.id) : null;
  const missing = [!form.bookId, !form.qty.trim(), !form.price.trim()].filter(Boolean).length;
  const dirty = JSON.stringify(form) !== JSON.stringify({ ...blankSale(records.books), date: form.date });
  const channel = SALE_CHANNELS.find((c) => c.value === form.chan)?.label || form.chan;
  // v4 mockup 1d: Where it sold · What was sold · Note, the total in a mint rail, one status bar.
  return (
    <div className="rp-sr">
      <form onSubmit={(e) => { e.preventDefault(); if (!missing) void submit(); }}>
        <FormPage rail={
          <SummaryRail tone="mint" title="Total" value={fmt(total, code)} sub={`${qty} ${w(qty === 1 ? "copy" : "copies")} · ${channel}`}
            rows={[...(book && onHand != null ? [{ label: `${book.title} in stock`, value: `${onHand} → ${Math.max(0, onHand - qty)}` }] : []), { label: "Channel", value: channel }]}
            note="Stock drops as soon as you save." />
        }>
          <FormSection title="Where it sold" description="Sets the channel on your sales records.">
            <FormChoice label="Channel" value={form.chan} onChange={(v) => set({ chan: v })} options={SALE_CHANNELS.map((c) => ({ value: c.value, label: c.label }))} />
            {errors.chan && <p className="rp-fk-hint" data-error="" role="alert">{errors.chan}</p>}
            <FormRow>
              <FormField label="Date" error={errors.date}>{(a) => <input {...a} type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />}</FormField>
              <FormField label="Order number" error={errors.num} hint="Optional.">{(a) => <input {...a} value={form.num} onChange={(e) => set({ num: e.target.value })} />}</FormField>
            </FormRow>
          </FormSection>
          <FormSection title="What was sold" description="The price starts from the list price. Change it for a discount.">
            <FormField label={w("Book")} required empty={!form.bookId} error={errors.bookId}>
              {(a) => <select {...a} value={form.bookId} onChange={(e) => sale.pickBook(e.target.value)}>
                <option value="">{w("Choose a book")}</option>
                {records.books.map((b) => <option key={b.id} value={b.id}>{b.title}{sale.onHand(b.id) != null ? ` (${sale.onHand(b.id)} on hand)` : ""}</option>)}
              </select>}
            </FormField>
            <FormRow>
              <FormField label={w("Copies")} required empty={!form.qty.trim()} error={errors.qty}>
                {(a) => <input {...a} type="number" inputMode="numeric" min={1} step={1} value={form.qty} onChange={(e) => set({ qty: e.target.value })} />}
              </FormField>
              <FormField label="Price each" required empty={!form.price.trim()} error={errors.price} prefix={code}>
                {(a) => <input {...a} type="number" inputMode="decimal" min={0} step="0.01" value={form.price} onChange={(e) => set({ price: e.target.value })} />}
              </FormField>
            </FormRow>
          </FormSection>
          <FormSection title="Note" description="Anything to remember about this sale.">
            <FormField label="Note" error={errors.notes} hint="Optional, e.g. Saturday Market, stall 14.">
              {(a) => <textarea {...a} rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />}
            </FormField>
          </FormSection>
        </FormPage>
        <SaveNoteLine note={save.note} />
        <StatusBar status={formStatus({ missing, create: true, verb: "record", dirty })} primaryLabel="Record sale" busy={save.busy}
          blocked={missing > 0} onBlocked={() => void sale.submit()} onPrimary={() => void submit()}
          onCancel={dirty ? () => sale.reset() : undefined} cancelLabel="Clear" />
      </form>
    </div>
  );
}

export function ManualPage({ onOpen }: NativePageProps) {
  return <RecordsGate what="your books">{(records) => <ManualSale records={records} onOpen={onOpen} />}</RecordsGate>;
}
