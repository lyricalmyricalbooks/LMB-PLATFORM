// Stockroom › Record a sale, drawn by the admin itself as the mockup shows it: one form card (book, copies, price,
// channel, date) and Save sale by the title. The rules and the save are the Sales records dialog's (useSaleForm in
// SaleWriter.tsx, recordSale.ts), so a sale recorded here is the same row the stockroom has always kept.
import { useState } from "react";

import { EmptyState, PageActions, PrimaryButton, SecondaryButton, SectionCard, SelectField, TextField } from "../riso/components";
import { useShopWords } from "../shopWords";
import type { NativePageProps } from "./nativePages";
import { RecordsGate } from "./RecordsGate";
import { SaleBookField, SaveNoteLine, useSaleForm, useStockroomSave } from "./SaleWriter";
import { SALE_CHANNELS } from "./recordSale";
import type { StockroomRecords } from "./stockroomData";
import "./stockroom.css";
import "./sales.css";

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
  return (
    <div className="rp-sr">
      <PageActions><PrimaryButton onClick={submit} busy={save.busy}>{save.busy ? "Saving…" : "Save sale"}</PrimaryButton></PageActions>
      <SaveNoteLine note={save.note} />
      <SectionCard title="Record a sale" description="For a sale made outside the till or the website.">
        <form className="rp-formrows" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <SaleBookField sale={sale} />
          <TextField label={w("Copies")} type="number" inputMode="numeric" min={1} step={1} value={form.qty} error={errors.qty} onChange={(e) => set({ qty: e.target.value })} />
          <TextField label="Price" type="number" inputMode="decimal" min={0} step="0.01" value={form.price} error={errors.price} onChange={(e) => set({ price: e.target.value })} />
          <SelectField label="Channel" value={form.chan} error={errors.chan} onChange={(e) => set({ chan: e.target.value })}>
            {SALE_CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </SelectField>
          <TextField label="Date" type="date" value={form.date} error={errors.date} onChange={(e) => set({ date: e.target.value })} />
          <button type="submit" hidden />
        </form>
      </SectionCard>
    </div>
  );
}

export function ManualPage({ onOpen }: NativePageProps) {
  return <RecordsGate what="your books">{(records) => <ManualSale records={records} onOpen={onOpen} />}</RecordsGate>;
}
