// Orders › All sales, in the combined admin only (shop + stockroom plan; docs/combined-admin.md step 3): every sale in
// one list, website orders beside the fairs, stockists, invoices and hand-entered sales the stockroom recorded, with a
// filter per channel. Website orders open on the Orders page; a stockroom sale opens its book in the stockroom, where
// sales are changed. The stockroom stays the master count, so its sales are asked of it (stockroomBridge.ts).
import { useEffect, useMemo, useState } from "react";
import { DataTable, EmptyState, ErrorState, FilterBar, LoadingState, MetricCard, SecondaryButton, SelectField, StatusBadge, Tabs } from "./riso/components";
import { getOrdersCached } from "./ordersCache";
import { stockroomBridge, type StockroomSale } from "./stockroomBridge";
import { useShopWords } from "./shopWords";
import {
  PERIODS, channelCounts, inChannel, mergeSales, saleTotals, salesCsv, salesCsvName, sinceFor, stockroomSaleRows, websiteSaleRows,
  type PeriodId, type SaleRow,
} from "./salesList";
import { channelWords, money } from "./StockroomBookPanel";

const PAGE_SIZE = 100;
const day = (key: string) => (key ? new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—");

type StockroomState = { sales: StockroomSale[]; partial: boolean } | "loading" | "failed" | "refused";

export function AllSales({ onOpenOrder }: { onOpenOrder: (id: string) => void }) {
  const w = useShopWords();
  const [period, setPeriod] = useState<PeriodId>("90");
  const [channel, setChannel] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);
  const [orders, setOrders] = useState<any[] | null | "failed">(null);
  const [stockroom, setStockroom] = useState<StockroomState>("loading");
  const [tries, setTries] = useState(0);
  const since = useMemo(() => sinceFor(period), [period]);

  useEffect(() => {
    let alive = true;
    getOrdersCached().then((o: any[]) => { if (alive) setOrders(o); }).catch(() => { if (alive) setOrders("failed"); });
    return () => { alive = false; };
  }, [tries]);
  useEffect(() => {
    let alive = true;
    setStockroom("loading");
    let again: number | undefined;
    const ask = (more: number) => stockroomBridge.askUntil<{ rows: StockroomSale[]; partial: boolean } | { refused: true }>({ what: "sales", since }).then((answer) => {
      if (!alive) return;
      if (!answer) setStockroom((s) => (typeof s === "object" ? s : "failed"));
      else if ("refused" in answer) setStockroom("refused");
      else {
        setStockroom({ sales: Array.isArray(answer.rows) ? answer.rows : [], partial: !!answer.partial });
        // Some books' records were still loading: ask again a little later, a few times.
        if (answer.partial && more > 0) again = window.setTimeout(() => { void ask(more - 1); }, 5_000);
      }
    });
    void ask(3);
    return () => { alive = false; window.clearTimeout(again); };
  }, [since, tries]);
  useEffect(() => { setShown(PAGE_SIZE); }, [period, channel]);

  const rows = useMemo(() => mergeSales(
    Array.isArray(orders) ? websiteSaleRows(orders, since) : [],
    typeof stockroom === "object" ? stockroomSaleRows(stockroom.sales) : [],
  ), [orders, stockroom, since]);
  const channels = useMemo(() => channelCounts(rows), [rows]);
  // A channel that has no sales in a shorter period falls back to every channel.
  const active = channel && channels.some((c) => c.id === channel) ? channel : "";
  const visible = useMemo(() => inChannel(rows, active), [rows, active]);
  const totals = useMemo(() => saleTotals(visible), [visible]);

  if (orders === null && stockroom === "loading") return <LoadingState label="Gathering every sale…" />;
  if (orders === "failed" && (stockroom === "failed" || stockroom === "refused")) {
    return <ErrorState title="Sales could not be loaded" description="Neither the website's orders nor the stockroom answered. Check the connection and try again." onRetry={() => setTries((n) => n + 1)} />;
  }

  const notes = [
    orders === "failed" && "The website's orders couldn't be loaded, so only the stockroom's sales show.",
    orders === null && "Still loading the website's orders…",
    stockroom === "loading" && "Still asking the stockroom for its sales…",
    stockroom === "failed" && "The stockroom didn't answer, so only website orders show. It may still be opening, or this device is offline.",
    stockroom === "refused" && w("The stockroom on this device is signed in as an author, so only website orders show."),
    typeof stockroom === "object" && stockroom.partial && w("Some books' records in the stockroom are still loading, so a few sales may be missing."),
  ].filter(Boolean) as string[];

  const open = (r: SaleRow) => {
    if (r.orderId) onOpenOrder(r.orderId);
    else if (r.bookId) stockroomBridge.openBook("history", r.bookId);
  };
  const columns = [
    { key: "date", header: "Date", render: (r: SaleRow) => <span style={{ whiteSpace: "nowrap" }}>{day(r.date)}</span> },
    { key: "what", header: w("What sold"), lead: true, render: (r: SaleRow) => (
      <button type="button" className="rp-link" onClick={() => open(r)}>{r.what}</button>
    ) },
    { key: "channel", header: "Channel", render: (r: SaleRow) => (
      <span style={{ whiteSpace: "nowrap" }}><StatusBadge tone={r.orderId ? "info" : "neutral"} glyph={false}>{channelWords(r.channel)}</StatusBadge>{r.refunded ? <> <StatusBadge tone="warning">Refunded</StatusBadge></> : null}</span>
    ) },
    { key: "who", header: "Who", render: (r: SaleRow) => r.who || "—" },
    { key: "qty", header: "Copies", numeric: true, render: (r: SaleRow) => r.qty },
    { key: "amount", header: "Takings", numeric: true, render: (r: SaleRow) => money(r.amount, r.cur) },
  ];
  const periodLabel = PERIODS.find((p) => p.id === period)?.label || "";
  const channelLabel = channels.find((c) => c.id === active)?.label || "Every channel";
  // The rows on screen, every one (not only the first hundred), as a spreadsheet for the books or an accountant.
  const download = () => {
    const url = URL.createObjectURL(new Blob([salesCsv(visible, { period: periodLabel, channel: channelLabel, words: w })], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = salesCsvName(active, period); a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const takings = totals.takings.length ? totals.takings.map((t) => money(t.amount, t.cur)).join(" + ") : money(0, "CAD");

  return (
    <div className="rp-stack">
      <div className="rp-kpi-grid">
        <MetricCard label="Sales" value={totals.sales.toLocaleString()} footer={periodLabel} />
        <MetricCard label="Copies sold" value={totals.copies.toLocaleString()} footer={channelLabel} />
        <MetricCard label="Takings" value={takings} footer={w("Books only, after discounts and refunds")} />
      </div>
      <Tabs label="Channel" value={active || "all"} onChange={(v) => setChannel(v === "all" ? "" : v)}
        tabs={[{ id: "all", label: "Every channel", count: rows.length }, ...channels]} />
      <FilterBar>
        <SelectField label="Period" hideLabel value={period} onChange={(e) => setPeriod(e.target.value as PeriodId)}>
          {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </SelectField>
        <SecondaryButton onClick={() => stockroomBridge.openPage("manual")}>Record a sale</SecondaryButton>
        <SecondaryButton onClick={download} disabled={!visible.length}>Download spreadsheet</SecondaryButton>
      </FilterBar>
      {notes.map((n) => <p key={n} className="rp-hint" role="status">{n}</p>)}
      <DataTable caption="Every sale" rowKey={(r) => r.key} rows={visible.slice(0, shown)} columns={columns} stackOnPhone onRowClick={open}
        empty={<EmptyState title="No sales in this period" description="Website orders, fair sales, stockists and invoices all show here. Pick a longer period to see older ones." />} />
      {visible.length > shown && (
        <div><SecondaryButton onClick={() => setShown((n) => n + PAGE_SIZE)}>Show {Math.min(PAGE_SIZE, visible.length - shown)} more</SecondaryButton></div>
      )}
    </div>
  );
}
