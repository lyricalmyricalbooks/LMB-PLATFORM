// Stockroom › Sales records, drawn by the admin itself (no frame): every sale the stockroom recorded, across items, with
// search, filters, totals and a drawer for one sale. The owner records a sale and voids one here (SaleWriter.tsx,
// rules in recordSale.ts); the reading rules are the stockroom's own (sales.ts).
import { useMemo, useState } from "react";
import { fmt, fmtD } from "@stockroom/money.js";

import { Drawer, DataTable, EmptyState, GhostButton, MetricCard, PrimaryButton, SearchField, SecondaryButton, SelectField, StatusBadge, TextField, Checkbox, type Column } from "../riso/components";
import { useShopWords } from "../shopWords";
import { RecordsGate } from "./RecordsGate";
import { RecordSaleDialog, SaveNoteLine, useStockroomSave, VoidSaleAction } from "./SaleWriter";
import { buildSalesRows, filterSales, NO_FILTER, salesTotals, type SaleRow, type SalesFilter } from "./sales";
import type { StockroomRecords } from "./stockroomData";
import "./stockroom.css";
import "./sales.css";

const PAGE = 50;
const money = (n: number | null, code: string) => (n == null ? "—" : fmt(n, code));
const moneyList = (by: Record<string, number>) => Object.entries(by).map(([code, n]) => fmt(n, code)).join(" · ") || "—";
const label = (r: SaleRow) => (r.kind === "consign" ? r.movement : r.num ? `Order ${r.num}` : "Sale");

function Facts({ items }: { items: Array<[string, React.ReactNode]> }) {
  return <dl className="rp-sr-facts">{items.filter(([, v]) => v !== "" && v != null && v !== false).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

function SaleDetail({ row }: { row: SaleRow }) {
  const w = useShopWords();
  const h = row.raw;
  const str = (v: unknown) => (v == null ? "" : String(v));
  const voidedOn = h.voidedAt ? fmtD(typeof h.voidedAt === "number" ? new Date(h.voidedAt).toISOString() : h.voidedAt) : "";
  return (
    <div className="rp-sr-detail">
      {row.voided && <p className="rp-sr-note" role="status"><StatusBadge glyph={false} tone="danger">Voided</StatusBadge> {voidedOn ? `Voided on ${voidedOn}. ` : ""}This sale is not counted in any total or stock figure.</p>}
      {row.pendingArtist && <p className="rp-sr-note" role="status"><StatusBadge glyph={false} tone="warning">Pending</StatusBadge> Entered by the artist and waiting to be settled.</p>}
      <Facts items={row.kind === "consign" ? [
        [w("Book"), row.bookTitle], ["What happened", row.movement], ["Date", fmtD(row.date)], [w("Copies"), row.qty], ["Notes", row.notes], [w("Copies") + " left after this", row.after],
      ] : [
        ["Order", row.num || "—"], [w("Book"), row.bookTitle], ["Channel", row.gift ? "Gift (no charge)" : row.channel], ["Date", fmtD(row.date)],
        [w("Copies"), row.qty], ["Price each", row.gift ? "" : money(row.unit, row.currency)], ["Total", row.gift ? "" : money(row.total, row.currency)],
        ["Recorded in", row.foreignCurrency ? `${row.currency}, not the ${row.bookCurrency} this ${w("book")} is priced in now` : ""],
        ["Payment", row.payment], ["Customer", str(h.shipName || h.customer)], ["Email", str(h.shipEmail || h.email)],
        ["Shipped", h.shipped ? (h.shippedDate ? `Yes, ${fmtD(h.shippedDate)}` : "Yes") : ""], ["Invoice", str(h.invoiceNum)], ["Website order", str(h.webOrderId)],
        ["Entered by", row.enteredBy], ["Notes", row.notes], [w("Copies") + " left after this sale", row.after],
      ]} />
    </div>
  );
}

export function SalesRecords({ records: loaded }: { records: StockroomRecords }) {
  const w = useShopWords();
  // What the page shows: the records as read, then each saved item's records as the save returned them.
  const [records, setRecords] = useState(loaded);
  const save = useStockroomSave((bookId, state) => setRecords((r) => ({ ...r, states: { ...r.states, [bookId]: state } })));
  const [recording, setRecording] = useState(false);
  const all = useMemo(() => buildSalesRows(records), [records]);
  const [filter, setFilter] = useState<SalesFilter>(NO_FILTER);
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<SaleRow | null>(null);
  const set = (patch: Partial<SalesFilter>) => { setFilter((f) => ({ ...f, ...patch })); setLimit(PAGE); };
  const { rows, inScope, described } = useMemo(() => filterSales(all, filter), [all, filter]);
  const totals = useMemo(() => salesTotals(rows), [rows]);
  const channels = useMemo(() => [...new Set(all.map((r) => r.channel))].sort(), [all]);
  const items = useMemo(() => records.books.filter((b) => all.some((r) => r.bookId === b.id)), [records, all]);

  const recordButton = records.books.length > 0 && <PrimaryButton onClick={() => { save.clear(); setRecording(true); }} disabled={save.busy}>Record a sale</PrimaryButton>;
  const dialog = <RecordSaleDialog open={recording} onClose={() => setRecording(false)} records={records} save={save} />;
  if (!all.length) return <>{dialog}<EmptyState icon="🧾" title="No sales recorded yet" description={w("Sales the stockroom records, at a book fair, from your website or by hand, appear here.")} action={recordButton || undefined} /></>;

  const filtered = filter.search.trim() || filter.channel || filter.bookId || filter.from || filter.to || filter.hideVoided;
  const columns: Column<SaleRow>[] = [
    { key: "order", header: "Sale", lead: true, render: (r) => <><button type="button" className="rp-sr-open" onClick={() => setOpen(r)}>{label(r)}</button>{r.voided && <> <StatusBadge glyph={false} tone="danger">Voided</StatusBadge></>}{r.pendingArtist && <> <StatusBadge glyph={false} tone="warning">Pending</StatusBadge></>}</> },
    { key: "book", header: w("Book"), render: (r) => r.bookTitle },
    { key: "channel", header: "Channel", render: (r) => r.channel },
    { key: "qty", header: w("Copies"), numeric: true, render: (r) => (r.kind === "consign" ? `${r.movement.startsWith("Sent") ? "-" : ""}${r.qty}` : `-${r.qty}`) },
    { key: "total", header: "Total", numeric: true, render: (r) => (r.gift ? "Gift" : money(r.total, r.currency)) },
    { key: "date", header: "Date", render: (r) => fmtD(r.date) },
  ];
  return (
    <div className="rp-sr">
      <div className="rp-sr-actions">{recordButton}<SaveNoteLine note={recording ? null : save.note} /></div>
      {dialog}
      <div className="rp-grid-metrics">
        <MetricCard label="Sales" value={totals.sales} footer={filtered ? "Matching your filters" : "All recorded"} />
        <MetricCard label={w("Copies sold")} value={totals.copies} footer={totals.gifts ? `Plus ${totals.gifts} given away` : undefined} />
        <MetricCard label="Money taken" value={<span className="rp-sr-money">{moneyList(totals.revenue)}</span>} footer="Each currency kept apart" />
        <MetricCard label="Voided" value={totals.voided} tone={totals.voided ? "warn" : undefined} footer="Not counted anywhere" />
      </div>

      <div className="rp-filter-bar">
        <SearchField className="rp-grow" label="Search sales" placeholder="Order number, channel, note or who entered it" value={filter.search} onChange={(e) => set({ search: e.target.value })} />
        <SelectField label="Channel" hideLabel value={filter.channel} onChange={(e) => set({ channel: e.target.value })}>
          <option value="">All channels</option>{channels.map((c) => <option key={c} value={c}>{c}</option>)}
        </SelectField>
        {items.length > 1 && (
          <SelectField label={w("Book")} hideLabel value={filter.bookId} onChange={(e) => set({ bookId: e.target.value })}>
            <option value="">{w("All books")}</option>{items.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
          </SelectField>
        )}
        <TextField label="From" type="date" value={filter.from} max={filter.to || undefined} onChange={(e) => set({ from: e.target.value })} />
        <TextField label="To" type="date" value={filter.to} min={filter.from || undefined} onChange={(e) => set({ to: e.target.value })} />
        <Checkbox label="Hide voided" checked={filter.hideVoided} onChange={(e) => set({ hideVoided: e.target.checked })} />
        {filtered && <GhostButton onClick={() => { setFilter(NO_FILTER); setLimit(PAGE); }}>Clear filters</GhostButton>}
      </div>
      <p className="rp-sr-status" role="status">{described.headline}. {described.active ? described.detail : ""}</p>

      {rows.length ? (
        <>
          <DataTable caption="Sales records" columns={columns} rows={rows.slice(0, limit)} rowKey={(r) => r.key} stackOnPhone onRowClick={setOpen}
            rowProps={(r) => (r.voided ? { className: "rp-sr-voided" } : undefined)} />
          {rows.length > limit && (
            <p className="rp-sr-more"><SecondaryButton onClick={() => setLimit((n) => n + PAGE)}>Show {Math.min(PAGE, rows.length - limit)} more</SecondaryButton> <span>Showing {limit} of {rows.length}</span></p>
          )}
        </>
      ) : (
        <EmptyState icon="🔍" title="No sales match" description={`${inScope ? `${inScope} in this view` : "Nothing in this view"}. ${described.active ? described.detail : "Widen the dates or clear the filters."}`}
          action={<SecondaryButton onClick={() => { setFilter(NO_FILTER); setLimit(PAGE); }}>Clear filters</SecondaryButton>} />
      )}

      <Drawer open={!!open} onClose={() => setOpen(null)} title={open ? label(open) : "Sale"} description={open ? `${open.bookTitle} · ${fmtD(open.date)}` : undefined}>
        {open && <SaleDetail row={open} />}
        {open && open.kind === "sale" && (
          <div className="rp-sr-void">
            <VoidSaleAction raw={open.raw} bookId={open.bookId} title={open.bookTitle} save={save} onDone={() => setOpen(null)} />
          </div>
        )}
      </Drawer>
    </div>
  );
}

export function SalesPage() {
  return <RecordsGate what="the sales records">{(records) => <SalesRecords records={records} />}</RecordsGate>;
}
