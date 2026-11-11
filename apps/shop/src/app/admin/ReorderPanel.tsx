// Stock › Reorder list (combined admin, `#reorder`): what is about to run out, most urgent first. Read-only; the maths
// is reorderList.ts. Stockroom items use the stockroom's count; products only the website keeps use website stock.
import { useCallback, useEffect, useMemo, useState } from "react";

import { adminApi } from "./api";
import { inventoryApi } from "./inventoryApi";
import { lowStockThreshold } from "./inventoryInsights";
import { getOrdersCached } from "./ordersCache";
import { buildReorder, reorderCsv, weeksText, type ReorderRow } from "./reorderList";
import { DataTable, EmptyState, ErrorState, LoadingState, PageActions, SecondaryButton, StatusBadge, type Column } from "./riso/components";
import { useShopWords } from "./shopWords";
import { stockroomApi, type StockroomRecords } from "./stockroom/stockroomData";
import { saveTable } from "./xlsxWriter";
import "./stockroom/sales.css";

/** Out, or under two weeks left at the current pace: the mockup's "Reprint now". */
const urgent = (r: ReorderRow) => r.onHand <= 0 || (r.weeksLeft !== null && r.weeksLeft < 2);

type Loaded = { rows: ReorderRow[]; stockroomMissed: boolean };

export function ReorderList() {
  const w = useShopWords();
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setFailed(false); setData(null);
    Promise.allSettled([stockroomApi.load(), adminApi.getAllBooks(), getOrdersCached(), inventoryApi.lowStockSetting()]).then(([s, b, o, t]) => {
      if (s.status === "rejected" && b.status === "rejected") { setFailed(true); return; }
      const stockroom: StockroomRecords | null = s.status === "fulfilled" ? s.value : null;
      const orders = o.status === "fulfilled" ? (o.value as any[]).filter((x) => x.paymentStatus === "paid" && x.isTest !== true) : [];
      const rows = buildReorder({
        stockroom, shopBooks: b.status === "fulfilled" ? (b.value as any[]) : [], paidOrders: orders,
        shopThreshold: lowStockThreshold(t.status === "fulfilled" ? t.value : null),
      });
      setData({ rows, stockroomMissed: !stockroom });
    });
  }, []);
  useEffect(load, [load]);

  const columns = useMemo<Column<ReorderRow>[]>(() => [
    { key: "title", header: w("Book"), lead: true, render: (r) => r.title },
    { key: "onHand", header: "On hand", numeric: true, render: (r) => Math.max(0, r.onHand) },
    { key: "sold30", header: "Sells / month", numeric: true, render: (r) => r.sold30 },
    { key: "weeks", header: "Weeks left", numeric: true, render: (r) => weeksText(r.weeksLeft) },
    { key: "order", header: "To order", numeric: true, render: (r) => <strong>{r.suggested}</strong> },
    { key: "status", header: "", render: (r) => urgent(r)
      ? <StatusBadge tone="danger">Reprint now</StatusBadge>
      : <StatusBadge tone="warning">Reprint soon</StatusBadge> },
  ], [w]);

  if (failed) return <ErrorState title="The reorder list didn't load" description="Check your connection, then try again." onRetry={load} />;
  if (!data) return <LoadingState label="Working out what's running low…" />;
  const { rows } = data;
  const day = new Date().toISOString().slice(0, 10);
  const save = (format: "xlsx" | "csv") => saveTable(`reorder-${day}`, reorderCsv(rows, w), format, "Reorder");
  return (
    <div className="rp-sr">
      {rows.length > 0 && (
        <PageActions>
          <SecondaryButton onClick={() => save("csv")}>Download CSV</SecondaryButton>
          <SecondaryButton onClick={() => save("xlsx")}>Download Excel</SecondaryButton>
        </PageActions>
      )}
      {data.stockroomMissed && <p className="rp-sr-status" role="status">Stockroom counts didn't load; showing website stock.</p>}
      {rows.length ? (
        <section className="rp-card rp-reorder-card" aria-labelledby="rp-reorder-title">
          <h2 className="rp-card-title" id="rp-reorder-title">Reprint suggestions</h2>
          <DataTable caption="Reprint suggestions" columns={columns} rows={rows} rowKey={(r) => r.key} stackOnPhone />
        </section>
      ) : (
        <EmptyState icon="✓" title="Nothing running low" description={w("Every book is above its low-stock line.")} />
      )}
    </div>
  );
}
