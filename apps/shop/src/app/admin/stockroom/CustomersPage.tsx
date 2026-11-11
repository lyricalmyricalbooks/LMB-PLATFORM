// Stockroom › Customers, drawn by the admin itself (no frame): the people who bought, one line each, with search, the
// stockroom's own filters and a drawer for one buyer's orders. Read-only. Grouping is the stockroom's (customers.ts).
import { useMemo, useState } from "react";
import { fmt, fmtD } from "@stockroom/money.js";
import { SEGMENT_CHANNEL_LABELS, SEGMENT_ORDER_LABELS } from "@stockroom/customer-segment.js";

import { DataTable, Drawer, EmptyState, GhostButton, MetricCard, SearchField, SecondaryButton, SelectField, StatusBadge, type Column } from "../riso/components";
import { useShopWords } from "../shopWords";
import { buildCustomers, customerSummary, filterCustomers, NO_CUSTOMER_FILTER, spendLine, type Customer, type CustomerFilters } from "./customers";
import { RecordsGate } from "./RecordsGate";
import type { StockroomRecords } from "./stockroomData";
import "./stockroom.css";
import "./sales.css";

const PAGE = 50;
const SPEND = ["25", "50", "100", "250"];
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
  const items = useMemo(() => records.books.filter((b) => customers.some((c) => c.bookIds.has(b.id))), [records, customers]);

  const filtered = Object.values(filter).some(Boolean);
  const repeat = customers.filter((c) => c.orders >= 2).length;
  const columns: Column<Customer>[] = [
    { key: "name", header: "Customer", lead: true, render: (c) => <button type="button" className="rp-sr-open" onClick={() => setOpen(c)}>{c.name || c.email}</button> },
    { key: "email", header: "Email", render: (c) => c.name ? c.email : "" },
    { key: "orders", header: "Orders", numeric: true, render: (c) => <>{c.orders}{c.orders >= 2 && <> <StatusBadge glyph={false} tone="success">Repeat</StatusBadge></>}</> },
    { key: "spent", header: "Spent", numeric: true, render: (c) => spendLine(c.spend) },
    { key: "last", header: "Last purchase", render: (c) => fmtD(c.last) },
  ];
  const clear = () => { setFilter(NO_CUSTOMER_FILTER); setLimit(PAGE); };
  return (
    <div className="rp-sr">
      <div className="rp-grid-metrics">
        <MetricCard label="Customers" value={customers.length} footer="With an email address" />
        <MetricCard label="Repeat buyers" value={repeat} footer="Two orders or more" />
        <MetricCard label="Sales without an email" value={noEmail} footer="Not listed here" />
      </div>
      <div className="rp-filter-bar">
        <SearchField className="rp-grow" label="Search customers" placeholder="Name or email" value={filter.search} onChange={(e) => set({ search: e.target.value })} />
        {items.length > 1 && (
          <SelectField label={w("Book")} hideLabel value={filter.bookId} onChange={(e) => set({ bookId: e.target.value })}>
            <option value="">{w("All books")}</option>{items.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
          </SelectField>
        )}
        <SelectField label="Channel" hideLabel value={filter.channel} onChange={(e) => set({ channel: e.target.value })}>
          <option value="">All channels</option>{Object.entries(SEGMENT_CHANNEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </SelectField>
        <SelectField label="Spent" hideLabel value={filter.spend} onChange={(e) => set({ spend: e.target.value })}>
          <option value="">Any amount</option>{SPEND.map((n) => <option key={n} value={n}>Over {n}</option>)}
        </SelectField>
        <SelectField label="Orders" hideLabel value={filter.orders} onChange={(e) => set({ orders: e.target.value })}>
          <option value="">Any number of orders</option>{Object.entries(SEGMENT_ORDER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </SelectField>
        {filtered && <GhostButton onClick={clear}>Clear filters</GhostButton>}
      </div>
      <p className="rp-sr-status" role="status">{customerSummary(customers.length, shown.length, noEmail)}</p>
      {!customers.length ? (
        <EmptyState inline icon="👥" title="No customers with an email yet" description={w("Everyone who buys from you appears here once a sale is recorded with their email address.") + (noEmail ? ` ${noEmail} recorded ${noEmail === 1 ? "sale has" : "sales have"} no email.` : "")} />
      ) : shown.length ? (
        <>
          <DataTable caption="Customers" columns={columns} rows={shown.slice(0, limit)} rowKey={(c) => c.email.toLowerCase()} stackOnPhone onRowClick={setOpen} />
          {shown.length > limit && <p className="rp-sr-more"><SecondaryButton onClick={() => setLimit((n) => n + PAGE)}>Show {Math.min(PAGE, shown.length - limit)} more</SecondaryButton> <span>Showing {limit} of {shown.length}</span></p>}
        </>
      ) : (
        <EmptyState icon="🔍" title="No customers match" description={`You have ${customers.length} on record, but none match these filters.`} action={<SecondaryButton onClick={clear}>Show all customers</SecondaryButton>} />
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
