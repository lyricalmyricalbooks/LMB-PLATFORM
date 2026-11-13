// Orders › All sales, in the combined admin only (shop + stockroom plan; docs/combined-admin.md step 3): every sale in
// one list, website orders beside the fairs, stockists, invoices and hand-entered sales the stockroom recorded, with a
// filter per channel. Website orders open on the Orders page; a stockroom sale opens its book in the stockroom, where
// sales are changed. The stockroom stays the master count, so its sales are asked of it (stockroomBridge.ts).
import { useEffect, useMemo, useState } from "react";
import { DataTable, EmptyState, ErrorState, LoadingState, PageActions, SecondaryButton, SectionCard, SelectField, StatusBadge, Tabs } from "./riso/components";
import { getOrdersCached } from "./ordersCache";
import { stockroomBridge, type StockroomSale } from "./stockroomBridge";
import { useShopWords } from "./shopWords";
import {
  FAIR_CHANNEL, PERIODS, channelCounts, channelId, fairDays, inChannel, mergeSales, saleTotals, salesCsv, salesCsvName, sinceFor, stockroomSaleRows, websiteSaleRows,
  type FairDay, type PeriodId, type SaleRow,
} from "./salesList";
import { channelWords, money } from "./StockroomBookPanel";
import { SHOP_CURRENCY } from "./moneySign";

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
  // Fair days side by side, on the fairs tab: which fairs earn their table fee.
  const fairs = useMemo(() => (active === channelId(FAIR_CHANNEL) ? fairDays(visible) : []), [visible, active]);

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
  const takingsText = (t: FairDay["takings"]) => (t.length ? t.map((x) => money(x.amount, x.cur)).join(" + ") : money(0, SHOP_CURRENCY));
  const fairColumns = [
    { key: "date", header: "Day", render: (d: FairDay) => <span style={{ whiteSpace: "nowrap" }}>{day(d.date)}</span> },
    { key: "fair", header: "Fair", lead: true, render: (d: FairDay) => d.fair || <span style={{ color: "var(--rp-text-muted)" }}>Not named</span> },
    { key: "sales", header: "Sales", numeric: true, render: (d: FairDay) => d.sales },
    { key: "copies", header: "Copies", numeric: true, render: (d: FairDay) => d.copies },
    { key: "takings", header: "Takings", numeric: true, render: (d: FairDay) => takingsText(d.takings) },
    { key: "best", header: "Best seller", render: (d: FairDay) => (d.best ? `${d.best.title} (${d.best.qty})` : "—") },
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
  const takings = totals.takings.length ? totals.takings.map((t) => money(t.amount, t.cur)).join(" + ") : money(0, SHOP_CURRENCY);

  return (
    <div className="rp-stack">
      <PageActions>
        <SecondaryButton onClick={download} disabled={!visible.length}>Download spreadsheet</SecondaryButton>
      </PageActions>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Tabs label="Channel" value={active || "all"} onChange={(v) => setChannel(v === "all" ? "" : v)}
          tabs={[{ id: "all", label: "All channels", count: rows.length }, ...channels]} />
        <SelectField label="Period" hideLabel value={period} onChange={(e) => setPeriod(e.target.value as PeriodId)}>
          {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </SelectField>
      </div>
      <div className="rp-tiles">
        <div className="rp-tile" data-tone="mint">
          <span className="rp-tile-label">{periodLabel}</span>
          <span className="rp-tile-value">{takings}</span>
          <span className="rp-tile-sub">{totals.sales.toLocaleString()} sale{totals.sales === 1 ? "" : "s"} · {w("books only, after discounts and refunds")}</span>
        </div>
        <div className="rp-tile">
          <span className="rp-tile-label">Copies sold</span>
          <span className="rp-tile-value">{totals.copies.toLocaleString()}</span>
        </div>
        <div className="rp-tile">
          <span className="rp-tile-label">Best channel</span>
          <span className="rp-tile-value">{channels[0]?.label || "–"}</span>
        </div>
      </div>
      {notes.map((n) => <p key={n} className="rp-hint" role="status">{n}</p>)}
      {fairs.length > 0 && (
        <SectionCard title="Fair days side by side" description="One line for each fair day in this period. Name the fair on the Till and it shows here.">
          <DataTable caption="Fair days" rowKey={(d) => d.key} rows={fairs} columns={fairColumns} stackOnPhone />
        </SectionCard>
      )}
      <DataTable caption="Every sale" rowKey={(r) => r.key} rows={visible.slice(0, shown)} columns={columns} stackOnPhone onRowClick={open}
        empty={<EmptyState title="No sales in this period" description="Website orders, fair sales, stockists and invoices all show here. Pick a longer period to see older ones." />} />
      {visible.length > shown && (
        <div><SecondaryButton onClick={() => setShown((n) => n + PAGE_SIZE)}>Show {Math.min(PAGE_SIZE, visible.length - shown)} more</SecondaryButton></div>
      )}
    </div>
  );
}
