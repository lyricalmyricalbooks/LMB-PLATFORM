import { useMemo, useState } from "react";
import { DrillList } from "./OverviewParts";
import { orderItems, titlesIn } from "./overviewDrill";
import type { Order } from "./overviewInsights";

/**
 * What an Overview figure is made of, opened under its row: the orders (each links to Orders) and, for figures made
 * of several orders, the books those orders sold. `extra` adds the fact that put an order on this list.
 */
export function OrdersDrill({ orders, label, extra, books = true, empty }: {
  orders: Order[]; label: string; extra?: (o: Order) => string | undefined; books?: boolean; empty?: string;
}) {
  const [view, setView] = useState<"orders" | "books">("orders");
  const items = useMemo(() => (view === "orders" ? orderItems(orders, extra) : titlesIn(orders)), [orders, extra, view]);
  const showSwitch = books && orders.length > 1;
  return (
    <>
      {showSwitch && (
        <div className="rp-ov-drill-switch" role="group" aria-label={`${label}: show`}>
          {(["orders", "books"] as const).map(v => (
            <button key={v} type="button" className={`rp-btn rp-btn-sm ${view === v ? "rp-btn-secondary" : "rp-btn-ghost"}`} aria-pressed={view === v} onClick={() => setView(v)}>
              {v === "orders" ? `Orders (${orders.length})` : "Books sold"}
            </button>
          ))}
        </div>
      )}
      <DrillList label={view === "orders" ? `${label}: orders` : `${label}: books`} items={items} empty={empty || "No orders in this period."} />
    </>
  );
}
