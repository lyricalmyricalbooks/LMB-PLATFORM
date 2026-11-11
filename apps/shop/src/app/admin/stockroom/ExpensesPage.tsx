// Stockroom › Expenses, drawn by the admin itself (read-only): every expense across the items and the Tax centre, with
// where its receipt stands. Receipt rules and the "paid back" totals are the stockroom's own (moneyReports.ts).
import { useMemo, useState } from "react";
import { fmt } from "@stockroom/money.js";

import { DataTable, EmptyState, MetricCard, Pagination, SearchField, SectionCard, SelectField, StatusBadge } from "../riso/components";
import { useShopWords } from "../shopWords";
import { RecordsGate } from "./RecordsGate";
import { expensesModel, type ExpenseLine } from "./moneyReports";
import { stockroomApi, type StockroomRecords } from "./stockroomData";
import "./stockroom.css";
import "./money.css";

const PAGE = 25;
const RECEIPT_WORD = { attached: "Receipt attached", missing: "No receipt", exempt: "Not needed", reference: "Reference on file" } as const;
const RECEIPT_TONE = { attached: "success", missing: "warning", exempt: "neutral", reference: "neutral" } as const;

export function ExpensesView({ records }: { records: StockroomRecords }) {
  const w = useShopWords();
  const model = useMemo(() => expensesModel(records), [records]);
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<"all" | "missing">("all");
  const [page, setPage] = useState(1);
  const q = query.trim().toLowerCase();
  const rows = model.lines.filter((l) => (show === "all" || l.receipt === "missing")
    && (!q || `${l.date} ${l.desc} ${l.cat} ${l.ref} ${l.itemTitle}`.toLowerCase().includes(q)));
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE));
  const at = Math.min(page, pageCount);
  if (!model.lines.length) return <EmptyState icon="🧾" title="No expenses logged yet" description={w("Costs for a book, a fair or the press itself show up here, with their receipts.")} />;
  return (
    <div className="rp-money">
      <div className="rp-grid-metrics">
        {model.totals.map((t) => <MetricCard key={t.code} label={`Spent in ${t.code}`} value={fmt(t.total, t.code)} footer={`${t.count} ${t.count === 1 ? "expense" : "expenses"}`} />)}
        <MetricCard label="Receipts attached" value={String(model.receipts.withReceipts)} footer={`${model.receipts.totalFiles} ${model.receipts.totalFiles === 1 ? "file" : "files"} kept`} />
        <MetricCard label="No receipt" value={String(model.missing)} tone={model.missing ? "warn" : undefined} footer={model.missing ? "The ones an accountant will ask for" : "All backed up"} />
      </div>
      {model.owed.length > 0 && (
        <SectionCard title={w("Authors paid back")} description="Costs a contributor fronted, and where repaying them stands." flush>
          <DataTable stackOnPhone caption="Repayments owed" rowKey={(o) => `${o.itemId}:${o.code}`} rows={model.owed}
            columns={[
              { key: "i", header: w("Book"), lead: true, render: (o) => o.itemTitle },
              { key: "s", header: "Status", render: (o) => <StatusBadge tone={o.status === "clear" ? "success" : "warning"}>{o.label}</StatusBadge> },
              { key: "a", header: "Still owed", numeric: true, render: (o) => fmt(o.amount, o.code) },
              { key: "d", header: "Detail", render: (o) => o.sub },
            ]} />
        </SectionCard>
      )}
      <SectionCard title="All expenses" flush>
        <div className="rp-money-pad">
          <div className="rp-filter-bar">
            <div className="rp-grow"><SearchField label="Search expenses" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} /></div>
            <SelectField label="Show" value={show} onChange={(e) => { setShow(e.target.value as "all" | "missing"); setPage(1); }}>
              <option value="all">Everything</option><option value="missing">Only those without a receipt</option>
            </SelectField>
          </div>
        </div>
        <DataTable stackOnPhone caption="Expenses" rowKey={(l: ExpenseLine) => l.key} rows={rows.slice((at - 1) * PAGE, at * PAGE)}
          empty={<EmptyState inline title="No expenses match" />}
          columns={[
            { key: "d", header: "Date", render: (l) => l.date || "-" },
            { key: "e", header: "Expense", lead: true, render: (l) => <>{l.desc || "(no description)"}<span className="rp-money-sub"> {l.scope === "item" ? l.itemTitle : "Press"}{l.cat ? ` · ${l.cat}` : ""}</span></> },
            { key: "a", header: "Amount", numeric: true, render: (l) => <>{fmt(l.amount, l.currency)}{l.baseAmount != null && l.currency !== "CAD" && <span className="rp-money-sub"> {fmt(l.baseAmount, "CAD")}</span>}</> },
            { key: "r", header: "Receipt", render: (l) => <StatusBadge tone={RECEIPT_TONE[l.receipt]}>{RECEIPT_WORD[l.receipt]}{l.receiptCount > 1 ? ` (${l.receiptCount})` : ""}</StatusBadge> },
            { key: "s", header: w("Paid back"), render: (l) => (l.status === "paid back" ? "Paid back" : l.status === "pending" ? "Pending" : l.status === "ours" ? "Ours" : "") },
          ]} />
        {rows.length > PAGE && <div className="rp-money-pad"><Pagination page={at} pageCount={pageCount} onPage={setPage} /></div>}
      </SectionCard>
    </div>
  );
}

export function ExpensesPage({ load = stockroomApi.load }: { load?: () => Promise<StockroomRecords>; onOpen?: unknown; isPage?: unknown }) {
  return <RecordsGate load={load} what="the expenses">{(records) => <ExpensesView records={records} />}</RecordsGate>;
}
