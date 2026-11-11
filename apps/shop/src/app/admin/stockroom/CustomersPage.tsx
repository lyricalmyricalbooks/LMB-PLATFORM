// Stockroom › Customers, drawn by the admin itself (no frame): the people who bought, one line each, with search, the
// stockroom's own filters and a drawer for one buyer's orders. Read-only. Grouping is the stockroom's (customers.ts).
import { useMemo, useState } from "react";
import { fmt, fmtD } from "@stockroom/money.js";

import { DataTable, Drawer, EmptyState, PageActions, SearchField, SecondaryButton, type Column } from "../riso/components";
import { saveTable } from "../xlsxWriter";
import { useShopWords } from "../shopWords";
import { buildCustomers, filterCustomers, NO_CUSTOMER_FILTER, spendLine, type Customer, type CustomerFilters } from "./customers";
import { RecordsGate } from "./RecordsGate";
import type { StockroomRecords } from "./stockroomData";
import "./stockroom.css";
import "./sales.css";

const PAGE = 50;
const csvCell = (v: unknown) => {
  let t = v == null ? "" : String(v);
  if (/^[=+\-@]/.test(t)) t = `'${t}`;
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const list = (set: Set<string>) => [...set].sort().join(", ") || "—";

function BuyerDetail({ buyer }: { buyer: Customer }) {
  const w = useShopWords();
  const lines = buyer.lines;
  return (
    <div className="rp-sr-detail">
      <dl className="rp-sr-facts">
        <div><dt>Email</dt><dd><a href={`mailto:${buyer.email}`}>{buyer.email}</a></dd></div>
        <div><dt>Orders</dt><dd>{buyer.orders}</dd></div>
        <div><dt>{w("Copies")} bought</dt><dd>{buyer.units || "—"}</dd></div>
        <div><dt>Total spent</dt><dd>{spendLine(buyer.spend)}</dd></div>
        <div><dt>First purchase</dt><dd>{fmtD(buyer.first)}</dd></div>
        <div><dt>Last purchase</dt><dd>{fmtD(buyer.last)}</dd></div>
        <div><dt>Bought through</dt><dd>{list(buyer.channels.size ? buyer.channels : buyer.sources)}</dd></div>
        <div><dt>{w("Books")}</dt><dd>{list(buyer.books)}</dd></div>
      </dl>
      <h3 className="rp-sr-sub">Orders</h3>
      <ul className="rp-sr-lines">
        {lines.map((l, i) => (
          <li key={`${l.num}-${i}`}>
            <span className="rp-sr-line-main"><strong>{l.num ? `Order ${l.num}` : l.source}</strong>{l.bookTitle ? ` · ${l.bookTitle}` : ""}</span>
            <span className="rp-sr-line-meta">{fmtD(l.date)}{l.qty ? ` · ${l.qty} ${l.qty === 1 ? w("copy") : w("copies")}` : ""}{l.channel ? ` · ${l.channel}` : ""}</span>
            <span className="rp-sr-line-amount">{l.currency && l.amount ? fmt(l.amount, l.currency) : "—"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CustomersList({ records }: { records: StockroomRecords }) {
  const w = useShopWords();
  const { customers, noEmail } = useMemo(() => buildCustomers(records), [records]);
  const [filter, setFilter] = useState<Required<CustomerFilters>>(NO_CUSTOMER_FILTER);
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<Customer | null>(null);
  const set = (patch: Partial<CustomerFilters>) => { setFilter((f) => ({ ...f, ...patch })); setLimit(PAGE); };
  const shown = useMemo(() => filterCustomers(customers, filter), [customers, filter]);
  const columns: Column<Customer>[] = [
    { key: "name", header: "Name", lead: true, render: (c) => <button type="button" className="rp-sr-open" onClick={() => setOpen(c)}>{c.name || c.email}</button> },
    { key: "orders", header: "Sales", numeric: true, render: (c) => c.orders },
    { key: "spent", header: "Spent", numeric: true, render: (c) => spendLine(c.spend) },
    { key: "last", header: "Last seen", render: (c) => fmtD(c.last) },
  ];
  const clear = () => { setFilter(NO_CUSTOMER_FILTER); setLimit(PAGE); };
  const download = () => {
    const head = ["Name", "Email", "Sales", "Spent", "Last seen"];
    const lines = shown.map((c) => [c.name, c.email, c.orders, spendLine(c.spend), c.last]);
    saveTable(`buyers-${new Date().toISOString().slice(0, 10)}`, [head, ...lines].map((l) => l.map(csvCell).join(",")).join("\n"), "csv", "Buyers");
  };
  return (
    <div className="rp-sr">
      {customers.length > 0 && <PageActions><SecondaryButton onClick={download}>Export CSV</SecondaryButton></PageActions>}
      {customers.length > PAGE && (
        <SearchField label="Search buyers" placeholder="Name or email" value={filter.search} onChange={(e) => set({ search: e.target.value })} />
      )}
      {!customers.length ? (
        <EmptyState inline icon="👥" title="No buyers with an email yet" description={w("Everyone who buys from you appears here once a sale is recorded with their email address.") + (noEmail ? ` ${noEmail} recorded ${noEmail === 1 ? "sale has" : "sales have"} no email.` : "")} />
      ) : shown.length ? (
        <>
          <DataTable caption="Buyers in person" columns={columns} rows={shown.slice(0, limit)} rowKey={(c) => c.email.toLowerCase()} stackOnPhone onRowClick={setOpen} />
          {shown.length > limit && <p className="rp-sr-more"><SecondaryButton onClick={() => setLimit((n) => n + PAGE)}>Show {Math.min(PAGE, shown.length - limit)} more</SecondaryButton> <span>Showing {limit} of {shown.length}</span></p>}
        </>
      ) : (
        <EmptyState icon="🔍" title="No buyers match" description={`You have ${customers.length} on record, but none match “${filter.search.trim()}”.`} action={<SecondaryButton onClick={clear}>Show every buyer</SecondaryButton>} />
      )}
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open ? open.name || open.email : "Customer"} description={open?.name ? open.email : undefined}>
        {open && <BuyerDetail buyer={open} />}
      </Drawer>
    </div>
  );
}

export function CustomersPage() {
  return <RecordsGate what="the customers">{(records) => <CustomersList records={records} />}</RecordsGate>;
}
