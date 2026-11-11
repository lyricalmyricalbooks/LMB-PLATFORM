// Stockroom › Sales records, drawn by the admin itself (no frame): every sale the stockroom recorded, across items, with
// search, filters, totals and a drawer for one sale. The owner records a sale and voids one here (SaleWriter.tsx,
// rules in recordSale.ts); the reading rules are the stockroom's own (sales.ts).
import { useMemo, useState } from "react";
import { fmt, fmtD } from "@stockroom/money.js";

import { Drawer, DataTable, EmptyState, PageActions, PrimaryButton, SearchField, SecondaryButton, StatusBadge, Tabs, type BadgeTone, type Column } from "../riso/components";
import { saveTable } from "../xlsxWriter";
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
/** Channel chips take a tile colour each, as in the mockup: website mint, fairs lilac, stockists sky, the rest apricot. */
const channelTone = (c: string): BadgeTone => {
  const k = c.toLowerCase();
  return k.includes("web") ? "success" : k.includes("fair") ? "primary" : k.includes("stockist") || k.includes("consign") ? "info" : "warning";
};
const csvCell = (v: unknown) => {
  let t = v == null ? "" : String(v);
  if (/^[=+\-@]/.test(t)) t = `'${t}`;
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
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

  const recordButton = records.books.length > 0 && <PrimaryButton onClick={() => { save.clear(); setRecording(true); }} disabled={save.busy}>Record a sale</PrimaryButton>;
  const dialog = <RecordSaleDialog open={recording} onClose={() => setRecording(false)} records={records} save={save} />;

  const filtered = filter.search.trim() || filter.channel || filter.bookId || filter.from || filter.to || filter.hideVoided;
  const clear = () => { setFilter(NO_FILTER); setLimit(PAGE); };
  // The channel that sold the most copies in this view (voided sales left out).
  const best = useMemo(() => {
    const by = new Map<string, number>();
    rows.forEach((r) => { if (r.kind === "sale" && !r.voided) by.set(r.channel, (by.get(r.channel) || 0) + r.qty); });
    return [...by.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "–";
  }, [rows]);
  const download = () => {
    const head = ["Date", "Order", w("Book"), "Channel", w("Copies"), "Total", "Currency", "Voided"];
    const lines = rows.map((r) => [r.date, r.num || "", r.bookTitle, r.channel, r.qty, r.gift ? 0 : r.total ?? "", r.currency, r.voided ? "yes" : ""]);
    saveTable(`sales-${new Date().toISOString().slice(0, 10)}`, [head, ...lines].map((l) => l.map(csvCell).join(",")).join("\n"), "csv", "Sales");
  };
  const columns: Column<SaleRow>[] = [
    { key: "date", header: "Date", lead: true, render: (r) => <button type="button" className="rp-sr-open rp-sr-date" onClick={() => setOpen(r)} aria-label={`${label(r)}, ${fmtD(r.date)}`}>{fmtD(r.date)}</button> },
    { key: "book", header: w("Book"), render: (r) => <>{r.bookTitle}{r.voided && <> <StatusBadge glyph={false} tone="danger">Voided</StatusBadge></>}{r.pendingArtist && <> <StatusBadge glyph={false} tone="warning">Pending</StatusBadge></>}</> },
    { key: "channel", header: "Channel", render: (r) => r.kind === "consign" ? r.movement : <StatusBadge glyph={false} tone={channelTone(r.channel)}>{r.gift ? "Gift" : r.channel}</StatusBadge> },
    { key: "qty", header: w("Copies"), numeric: true, render: (r) => `× ${r.qty}` },
    { key: "total", header: "Total", numeric: true, render: (r) => <strong>{r.gift ? "Gift" : money(r.total, r.currency)}</strong> },
  ];
  return (
    <div className="rp-sr">
      <PageActions>
        <SecondaryButton onClick={download} disabled={!rows.length}>Download CSV</SecondaryButton>
        {recordButton}
      </PageActions>
      <SaveNoteLine note={recording ? null : save.note} />
      {dialog}
      {channels.length > 1 && (
        <Tabs label="Channel" value={filter.channel || "all"} onChange={(id) => set({ channel: id === "all" ? "" : id })}
          tabs={[{ id: "all", label: "All channels" }, ...channels.map((c) => ({ id: c, label: c }))]} />
      )}
      <div className="rp-tiles">
        <div className="rp-tile" data-tone="mint">
          <span className="rp-tile-label">Money taken</span>
          <span className="rp-tile-value">{moneyList(totals.revenue)}</span>
          <span className="rp-tile-sub">{totals.sales} sales{totals.voided ? ` · ${totals.voided} voided, not counted` : ""}</span>
        </div>
        <div className="rp-tile">
          <span className="rp-tile-label">{w("Copies sold")}</span>
          <span className="rp-tile-value">{totals.copies}</span>
          {totals.gifts ? <span className="rp-tile-sub">Plus {totals.gifts} given away</span> : null}
        </div>
        <div className="rp-tile">
          <span className="rp-tile-label">Best channel</span>
          <span className="rp-tile-value">{best}</span>
        </div>
      </div>
      {all.length > PAGE && (
        <SearchField label="Search sales" placeholder={w("Order number, book, note or who entered it")} value={filter.search} onChange={(e) => set({ search: e.target.value })} />
      )}

      {rows.length ? (
        <>
          <DataTable caption="Sales records" columns={columns} rows={rows.slice(0, limit)} rowKey={(r) => r.key} stackOnPhone onRowClick={setOpen}
            rowProps={(r) => (r.voided ? { className: "rp-sr-voided" } : undefined)} />
          {rows.length > limit && (
            <p className="rp-sr-more"><SecondaryButton onClick={() => setLimit((n) => n + PAGE)}>Show {Math.min(PAGE, rows.length - limit)} more</SecondaryButton> <span>Showing {limit} of {rows.length}</span></p>
          )}
        </>
      ) : !all.length ? (
        <EmptyState inline icon="🧾" title="No sales recorded yet" description={w("Sales the stockroom records, at a book fair, from your website or by hand, appear here.")} />
      ) : (
        <EmptyState icon="🔍" title="No sales match" description={`${inScope ? `${inScope} in this view` : "Nothing in this view"}. ${described.active ? described.detail : ""}`}
          action={filtered ? <SecondaryButton onClick={clear}>Show every sale</SecondaryButton> : undefined} />
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
