// Stockroom › Expenses, drawn by the admin itself (read-only): every expense across the items and the Tax centre, with
// where its receipt stands. Receipt rules and the "paid back" totals are the stockroom's own (moneyReports.ts).
import { useMemo, useState } from "react";
import { fmt } from "@stockroom/money.js";

import { DataTable, EmptyState, Pagination, SearchField, StatusBadge } from "../riso/components";
import { useShopWords } from "../shopWords";
import { RecordsGate } from "./RecordsGate";
import { useRatedRecords } from "./taxRates";
import { expensesModel, type ExpenseLine } from "./moneyReports";
import { stockroomApi, type StockroomRecords } from "./stockroomData";
import "./stockroom.css";
import "./money.css";

const PAGE = 25;
const RECEIPT_WORD = { attached: "Receipt", missing: "No receipt", exempt: "Not needed", reference: "Reference on file" } as const;
const RECEIPT_TONE = { attached: "success", missing: "warning", exempt: "neutral", reference: "neutral" } as const;

export function ExpensesView({ records }: { records: StockroomRecords }) {
  const w = useShopWords();
  const model = useMemo(() => expensesModel(records), [records]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const q = query.trim().toLowerCase();
  const rows = model.lines.filter((l) => !q || `${l.date} ${l.desc} ${l.cat} ${l.ref} ${l.itemTitle}`.toLowerCase().includes(q));
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE));
  const at = Math.min(page, pageCount);
  const owed = model.owed.filter((o) => o.status !== "clear");
  return (
    <div className="rp-money">
      {model.lines.length > PAGE && (
        <SearchField label="Search expenses" placeholder={w("What, book, category or date")} value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
      )}
      <div className="rp-card rp-money-list">
        <DataTable stackOnPhone caption="Expenses" rowKey={(l: ExpenseLine) => l.key} rows={rows.slice((at - 1) * PAGE, at * PAGE)}
          empty={model.lines.length ? <EmptyState inline title="No expenses match" /> : <EmptyState inline icon="🧾" title="No expenses logged yet" description={w("Costs for a book, a fair or the press itself show up here, with their receipts.")} />}
          columns={[
            { key: "e", header: "What", lead: true, render: (l) => <>{l.desc || "(no description)"}<div className="rp-hint">{[l.date, l.cat].filter(Boolean).join(" · ")}</div></> },
            { key: "w", header: "For", render: (l) => (l.scope === "item" ? l.itemTitle : "The press") },
            { key: "a", header: "Amount", numeric: true, render: (l) => fmt(l.amount, l.currency) },
            { key: "r", header: "", render: (l) => <StatusBadge glyph={false} tone={RECEIPT_TONE[l.receipt]}>{RECEIPT_WORD[l.receipt]}{l.receiptCount > 1 ? ` (${l.receiptCount})` : ""}</StatusBadge> },
          ]} />
        {rows.length > PAGE && <div className="rp-money-pad"><Pagination page={at} pageCount={pageCount} onPage={setPage} /></div>}
      </div>
      {owed.length > 0 && (
        <p className="rp-sr-status" role="status">
          {w("Still to pay back to authors")}: {owed.map((o) => `${fmt(o.amount, o.code)} (${o.itemTitle})`).join(", ")}.
        </p>
      )}
    </div>
  );
}

export function ExpensesPage({ load = stockroomApi.load }: { load?: () => Promise<StockroomRecords>; onOpen?: unknown; isPage?: unknown }) {
  return <RecordsGate load={load} what="the expenses">{(records) => <ExpensesLive initial={records} />}</RecordsGate>;
}

function ExpensesLive({ initial }: { initial: StockroomRecords }) {
  const [records] = useRatedRecords(initial);
  return <ExpensesView records={records} />;
}
