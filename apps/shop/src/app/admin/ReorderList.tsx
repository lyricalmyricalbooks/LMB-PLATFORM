// Stock › Reorder list (combined admin, `#reorder`): what is about to run out, most urgent first. Read-only; the maths
// is reorderList.ts. Stockroom items use the stockroom's count; products only the website keeps use website stock.
import { useCallback, useEffect, useMemo, useState } from "react";

import { adminApi } from "./api";
import { inventoryApi } from "./inventoryApi";
import { lowStockThreshold } from "./inventoryInsights";
import { getOrdersCached } from "./ordersCache";
import { buildReorder, reorderCsv, weeksText, type ReorderRow } from "./reorderList";
import { DataTable, EmptyState, ErrorState, LoadingState, MetricCard, SecondaryButton, StatusBadge, type Column } from "./riso/components";
import { useShopWords } from "./shopWords";
import { stockroomApi, type StockroomRecords } from "./stockroom/stockroomData";
import { saveTable } from "./xlsxWriter";
import "./stockroom/sales.css";

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
    { key: "onHand", header: "On hand", numeric: true, render: (r) => r.onHand <= 0 ? <StatusBadge tone="danger">Out</StatusBadge> : r.onHand },
    { key: "threshold", header: "Low at", numeric: true, render: (r) => r.threshold },
    { key: "sold30", header: "Sold 30 days", numeric: true, render: (r) => r.sold30 },
    { key: "month", header: "Sold last month", numeric: true, render: (r) => r.soldLastMonth },
    { key: "weeks", header: "Weeks left", numeric: true, render: (r) => weeksText(r.weeksLeft) },
    { key: "order", header: "Order", numeric: true, render: (r) => <strong>{r.suggested}</strong> },
  ], [w]);

  if (failed) return <ErrorState title="The reorder list didn't load" description="Check your connection, then try again." onRetry={load} />;
  if (!data) return <LoadingState label="Working out what's running low…" />;
  const { rows } = data;
  const day = new Date().toISOString().slice(0, 10);
  const save = (format: "xlsx" | "csv") => saveTable(`reorder-${day}`, reorderCsv(rows, w), format, "Reorder");
  return (
    <div className="rp-sr">
      <div className="rp-grid-metrics">
        <MetricCard label="Running low" value={rows.length} footer="To reorder" tone={rows.length ? "warn" : undefined} />
        <MetricCard label="Sold out" value={rows.filter((r) => r.onHand <= 0).length} tone={rows.some((r) => r.onHand <= 0) ? "danger" : undefined} />
        <MetricCard label="Units to order" value={rows.reduce((n, r) => n + r.suggested, 0)} footer="12 weeks of sales" />
      </div>
      {data.stockroomMissed && <p className="rp-sr-status" role="status">Stockroom counts didn't load; showing website stock.</p>}
      {rows.length ? (
        <>
          <p className="rp-sr-more">
            <SecondaryButton onClick={() => save("xlsx")}>Download Excel</SecondaryButton>{" "}
            <SecondaryButton onClick={() => save("csv")}>Download CSV</SecondaryButton>
          </p>
          <DataTable caption="Reorder list" columns={columns} rows={rows} rowKey={(r) => r.key} stackOnPhone />
        </>
      ) : (
        <EmptyState icon="✓" title="Nothing running low" description={w("Every book is above its low-stock line.")} />
      )}
    </div>
  );
}
