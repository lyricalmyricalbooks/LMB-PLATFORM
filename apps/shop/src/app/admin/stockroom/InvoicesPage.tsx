// Stockroom › Invoices (v3 mockups: its own menu item). The Invoices card (InvoiceDialogs.tsx) on a page of its own.
// A stockist's drawer opens it with that stockist (passed as `bookId`, the page's focus) to start a new invoice.
import { useState } from "react";
import type { NativePageProps } from "./nativePages";
import { InvoicesCard } from "./InvoiceDialogs";
import { RecordsGate } from "./RecordsGate";
import type { StockroomRecords } from "./stockroomData";
import "./money.css";
import "./stockroom.css";
import "./stockists.css";

export function InvoicesPage({ bookId, load }: Partial<NativePageProps> & { load?: () => Promise<StockroomRecords> }) {
  return <RecordsGate what="invoices" load={load}>{(records) => <InvoicesBoard initial={records} newFor={bookId ?? null} />}</RecordsGate>;
}

function InvoicesBoard({ initial, newFor: start }: { initial: StockroomRecords; newFor: string | null }) {
  const [records, setRecords] = useState(initial);
  const [newFor, setNewFor] = useState<string | null>(start);
  const saved = (bookId: string, state: Record<string, any>) => setRecords((r) => ({ ...r, states: { ...r.states, [bookId]: state } }));
  return (
    <div className="rp-sk">
      <InvoicesCard records={records} onBookSaved={saved} onSettingsSaved={(value) => setRecords((r) => ({ ...r, invoiceSettings: value }))}
        newFor={newFor} onNewDone={() => setNewFor(null)} />
    </div>
  );
}
