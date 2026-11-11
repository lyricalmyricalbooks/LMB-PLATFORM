// Stockroom › Stock and sales, drawn by the admin itself (no frame): each item's copies on hand, what sold where, and where
// the rest are. Read-only. Every figure is worked out by the stockroom's own rules (stock.ts); this file only draws it.
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { Column, DataTable, EmptyState, ErrorState, FilterBar, GhostButton, LoadingState, MetricCard, SearchField, SectionCard, StatusBadge, type BadgeTone } from "../riso/components";
import { useShopSells, useShopWords } from "../shopWords";
import { isRefusal, stockroomApi, type StockroomRecords } from "./stockroomData";
import "./stock.css";
import { WebsiteOrdersCard } from "./WebsiteOrders";
import { PlacesCard } from "./PlacesCard";
import { EditDetailsButton } from "./EditDetailsButton";
import { AuthorCopiesCard } from "./AuthorCopiesCard";
import { AuthorMoneyCard } from "./AuthorMoneyCard";
import { hasPublisherTools } from "../../../shared/shopSells";
import { catalogueStock, money, searchItems, totalsOf, type ChannelRow, type ItemStock, type StockLevel, type StoreRow } from "./stock";

const LEVEL: Record<StockLevel, { tone: BadgeTone; word: string }> = {
  soldout: { tone: "danger", word: "Sold out" },
  low: { tone: "warning", word: "Running low" },
  watch: { tone: "info", word: "Getting low" },
  ok: { tone: "success", word: "In stock" },
};
const LevelBadge = ({ level }: { level: StockLevel }) => <StatusBadge tone={LEVEL[level].tone}>{LEVEL[level].word}</StatusBadge>;
const count = (n: number) => n.toLocaleString("en-US");

function RevenueLine({ totals }: { totals: ReturnType<typeof totalsOf> }) {
  if (!totals.revenue.length) return <>—</>;
  // One line per currency, never added across currencies.
  return <span className="rp-stock-rev">{totals.revenue.map((r) => <span key={r.code}>{money(r.amount, r.currency)}</span>)}</span>;
}

/** One item: its shelf, where every copy is, sales by channel and each store. */
export function StockDetail({ item, onBack, places, edit }: { item: ItemStock; onBack?: () => void; places?: React.ReactNode; edit?: React.ReactNode }) {
  const w = useShopWords();
  const channels: Column<ChannelRow>[] = [
    { key: "chan", header: "Channel", lead: true, render: (r) => r.chan || "Other" },
    { key: "txns", header: "Orders", numeric: true, render: (r) => count(r.txns) },
    { key: "units", header: w("Copies"), numeric: true, render: (r) => count(r.units) },
    { key: "rev", header: "Revenue", numeric: true, render: (r) => money(r.revenue, item.currency) },
  ];
  const stores: Column<StoreRow>[] = [
    { key: "name", header: "Store", lead: true, render: (r) => r.name },
    { key: "sent", header: "Sent", numeric: true, render: (r) => count(r.sent) },
    { key: "sold", header: "Sold", numeric: true, render: (r) => count(r.sold) },
    { key: "ret", header: "Returned", numeric: true, render: (r) => count(r.returned) },
    { key: "out", header: "Still there", numeric: true, render: (r) => count(r.outstanding) },
  ];
  const where: Array<[string, number]> = [
    [w("Printed"), item.printed], ["On hand", item.onHand], ["Sold directly", item.directSold], ["Sold through stores", item.consignSold],
    ["Out at stores", item.onConsignment], ["Given away", item.gratuities], ["Written off", item.writtenOff],
  ];
  return (
    <div className="rp-stock" data-item={item.id}>
      {onBack && <div><GhostButton onClick={onBack}>← All {w("books")}</GhostButton></div>}
      <div className="rp-stock-head">
        <h2 className="rp-stock-name">{item.title}</h2>
        {item.author && <span className="rp-stock-by">{item.author}</span>}
        <LevelBadge level={item.level} />
        {edit}
      </div>
      <div className="rp-stock-metrics">
        <MetricCard label="On hand" value={count(item.onHand)} footer={item.hasPrintRun ? `of ${count(item.printed)} ${w("printed")}` : w("No print run set")} tone={item.level === "soldout" ? "danger" : item.level === "low" ? "warn" : undefined} />
        <MetricCard label="Sold" value={count(item.sold)} footer={item.gratuities ? `${count(item.gratuities)} given away` : undefined} />
        <MetricCard label="Out at stores" value={count(item.onConsignment)} />
        <MetricCard label="Revenue" value={money(item.revenue, item.currency)} />
      </div>
      <p className="rp-stock-note">{item.threshold > 0 ? `Marked as running low at ${count(item.threshold)} or fewer.` : "No low-stock level set for this item."}{item.authorHeld > 0 ? ` ${count(item.authorHeld)} held by the ${w("author")}, ${count(item.publisherOnHand)} with you.` : ""}</p>
      {item.hasPrintRun && item.unaccounted !== 0 && (
        <p className="rp-stock-warn" role="status">{count(Math.abs(item.unaccounted))} {w("copies")} can't be explained by the records ({item.unaccounted > 0 ? "missing" : "extra"}). The {w("print run")} may have been changed after sales began.</p>
      )}
      <SectionCard title={w("Where every copy is")} flush>
        <dl className="rp-stock-where">
          {where.map(([label, n]) => <div key={label}><dt>{label}</dt><dd>{count(n)}</dd></div>)}
        </dl>
      </SectionCard>
      {places}
      <SectionCard title="Sold by channel" flush>
        <DataTable columns={channels} rows={item.channels} rowKey={(r) => r.chan} caption={`${item.title}: sales by channel`} stackOnPhone
          empty={<EmptyState inline icon="🛒" title="Nothing sold yet" description="Sales show up here by channel as they are recorded." />} />
      </SectionCard>
      <SectionCard title={w("Stores and consignment")} flush>
        <DataTable columns={stores} rows={item.stores} rowKey={(r) => r.id} caption={`${item.title}: copies at stores`} stackOnPhone
          empty={<EmptyState inline icon="🏬" title={w("No copies out at stores")} description="Shipments to stores show up here." />} />
      </SectionCard>
    </div>
  );
}

/** The whole catalogue: totals, a title search and one row per item, sold-out and low first. */
export function StockList({ records, onPick, initialQuery = "" }: { records: StockroomRecords; onPick: (id: string) => void; initialQuery?: string }) {
  const w = useShopWords();
  const [query, setQuery] = useState(initialQuery);
  const items = useMemo(() => catalogueStock(records), [records]);
  const totals = useMemo(() => totalsOf(items), [items]);
  const shown = useMemo(() => searchItems(items, query), [items, query]);
  const columns: Column<ItemStock>[] = [
    { key: "title", header: w("Book"), lead: true, render: (r) => <button type="button" className="rp-stock-open" onClick={() => onPick(r.id)} aria-label={`Open ${r.title}`}>{r.title}</button> },
    { key: "printed", header: w("Printed"), numeric: true, render: (r) => (r.hasPrintRun ? count(r.printed) : "—") },
    { key: "onhand", header: "On hand", numeric: true, render: (r) => count(r.onHand) },
    { key: "sold", header: "Sold", numeric: true, render: (r) => count(r.sold) },
    { key: "stores", header: "At stores", numeric: true, render: (r) => count(r.onConsignment) },
    { key: "off", header: "Written off", numeric: true, render: (r) => count(r.writtenOff) },
    { key: "rev", header: "Revenue", numeric: true, render: (r) => money(r.revenue, r.currency) },
    { key: "status", header: "Stock", render: (r) => <LevelBadge level={r.level} /> },
  ];
  return (
    <div className="rp-stock">
      <div className="rp-stock-metrics">
        <MetricCard label="On hand" value={count(totals.onHand)} footer={`${count(totals.items)} ${totals.items === 1 ? w("book") : w("books")}`} />
        <MetricCard label="Sold" value={count(totals.sold)} />
        <MetricCard label="Out at stores" value={count(totals.atStores)} />
        <MetricCard label="Need restocking" value={count(totals.needAttention)} tone={totals.needAttention ? "warn" : undefined} footer="Sold out or running low" />
        <MetricCard label="Revenue" value={<RevenueLine totals={totals} />} />
      </div>
      <FilterBar>
        <SearchField label={w("Search books by title or author")} placeholder={w("Search by title or author")} value={query} onChange={(e) => setQuery(e.target.value)} />
      </FilterBar>
      <DataTable columns={columns} rows={shown} rowKey={(r) => r.id} caption={w("Stock and sales for every book")} stackOnPhone
        onRowClick={(r) => onPick(r.id)}
        empty={items.length ? <EmptyState inline icon="🔎" title="Nothing matches" description={w("Try a different title or author.")} action={<GhostButton onClick={() => setQuery("")}>Clear search</GhostButton>} /> : <EmptyState inline icon="📦" title={w("No books yet")} description={w("Books you add to the stockroom show up here with their copies and sales.")} />} />
    </div>
  );
}

export function StockPage({ bookId, load = stockroomApi.load }: { bookId?: string; load?: () => Promise<StockroomRecords>; onOpen?: (page: string) => void; isPage?: (id: string) => boolean }) {
  const w = useShopWords();
  const [records, setRecords] = useState<StockroomRecords | null>(null);
  const [failed, setFailed] = useState<"" | "refused" | "failed">("");
  const [picked, setPicked] = useState<string | null>(bookId || null);
  useEffect(() => { if (bookId) setPicked(bookId); }, [bookId]);
  const read = useCallback(() => {
    setFailed("");
    Promise.resolve().then(load).then(setRecords, (error) => { console.error("Stockroom records could not be read", error); setFailed(isRefusal(error) ? "refused" : "failed"); });
  }, [load]);
  useEffect(read, [read]);
  const items = useMemo(() => (records ? catalogueStock(records) : []), [records]);
  const publisher = hasPublisherTools(useShopSells());
  // The stockroom's records are open to the shop's owner only: a team member is told so, with nothing to retry.
  if (failed === "refused") return <EmptyState icon="🔒" title="Only the owner can see stock and sales" description="The stockroom's records are kept for the shop's owner. Ask them if you need a figure from here." />;
  if (failed) return <ErrorState title="Stock and sales didn't load" description="Check your connection, then try again." onRetry={read} />;
  if (!records) return <LoadingState label={w("Loading your books…")} />;
  const item = picked ? items.find((i) => i.id === picked) : undefined;
  if (item) {
    const book = (records.books.find((b) => b.id === item.id) || null) as Record<string, any> | null;
    const state = { hist: [], ...(records.states[item.id] || {}) };
    return <StockDetail item={item} onBack={() => setPicked(null)} edit={book ? <EditDetailsButton id={item.id} book={book} onSaved={read} /> : undefined} places={<>
      <PlacesCard bookId={item.id} book={book} state={state} onSaved={read} />
      {(publisher || item.authorHeld > 0) && <AuthorCopiesCard bookId={item.id} book={book} state={state} onSaved={read} />}
      {(publisher || ((state as Record<string, any>).artistPayouts || []).length > 0) && <AuthorMoneyCard bookId={item.id} book={book} state={state} onSaved={read} />}
    </>} />;
  }
  const currency = String((records.books[0] as Record<string, any> | undefined)?.currency || "CAD");
  return <div className="rp-stock"><WebsiteOrdersCard />
    <div className="rp-stock-add"><EditDetailsButton book={{ currency, maxPrint: 100, listPrice: 40, threshold: 10, productionCost: 0 }} onSaved={read} /></div>
    <StockList records={records} onPick={setPicked} /></div>;
}
