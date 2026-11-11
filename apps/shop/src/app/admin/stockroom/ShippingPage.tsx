// Stockroom › Shipping, drawn by the admin itself (no frame): paid website orders still waiting to go out (oldest first,
// late ones flagged) and parcels that cost more to post than the customer paid. A row that is a website order here gets
// Buy label (ShipLabelDialog: the order page's own label path, confirmed first); the stockroom's records are only read.
import { useEffect, useState } from "react";
import { fmt } from "@stockroom/money.js";

import { adminApi } from "../api";
import { DataTable, EmptyState, MetricCard, PrimaryButton, SectionCard, StatusBadge } from "../riso/components";
import { useShopWords } from "../shopWords";
import type { NativePageProps } from "./nativePages";
import { RecordsGate } from "./RecordsGate";
import { ShipLabelDialog } from "./ShipLabelDialog";
import { buildShipping, joinShopOrders, LATE_AFTER_DAYS, LOSS_WITHIN_DAYS, shopOrderId, type ShippingView, type WaitingWithOrder } from "./shipping";
import type { StockroomRecords } from "./stockroomData";
import "./stockroom.css";
import "./stockists.css";

const ago = (days: number) => `${days} ${days === 1 ? "day" : "days"}`;
const hash = (num: string) => (num.startsWith("#") ? num : `#${num}`);

/** At most this many waiting rows are looked up as website orders (one read each, plus its private record). */
const LOOKUP_LIMIT = 60;

/** The website orders behind the waiting rows, by row key (null = none; absent = still loading or not looked up). */
function useShopOrders(view: ShippingView) {
  const [found, setFound] = useState<Record<string, any | null>>({});
  useEffect(() => {
    let alive = true;
    view.waiting.slice(0, LOOKUP_LIMIT).forEach((row) => {
      const id = shopOrderId(row.num);
      const done = (order: any | null) => { if (alive) setFound((f) => ({ ...f, [row.key]: order })); };
      if (!id) return done(null);
      adminApi.getOrderById(id).then((o) => done(o || null), () => done(null));
    });
    return () => { alive = false; };
  }, [view.waiting.map((r) => `${r.key}\u0001${r.num}`).join("\u0002")]);
  return [found, setFound] as const;
}

export function ShippingBoard({ view: base }: { view: ShippingView }) {
  const w = useShopWords();
  const [found, setFound] = useShopOrders(base);
  const [labelFor, setLabelFor] = useState<WaitingWithOrder | null>(null);
  const waiting = joinShopOrders(base.waiting, found);
  const view = { ...base, waiting };
  const late = view.waiting.filter((o) => o.late).length;
  return (
    <div className="rp-sk">
      <div className="rp-grid-metrics">
        <MetricCard label="Waiting to be sent" value={view.waiting.length} tone={view.waiting.length ? "warn" : undefined} footer={late ? `${late} waiting ${LATE_AFTER_DAYS}+ days` : "Nothing is late"} />
        <MetricCard label="Parcels that lost money" value={view.losses.length} tone={view.losses.length ? "danger" : undefined}
          footer={view.losses.length ? `${fmt(view.lossTotal, "CAD")} short in the last ${LOSS_WITHIN_DAYS} days` : `Checked the last ${LOSS_WITHIN_DAYS} days`} />
        <MetricCard label="Website orders" value={view.websiteOrders} footer="in dollars, with an order number" />
      </div>
      <SectionCard title="Waiting to be sent" description="Paid, with an address, no label or tracking yet. Oldest first.">
        {view.waiting.length ? (
          <DataTable<WaitingWithOrder> stackOnPhone caption="Orders waiting to be sent" rows={view.waiting} rowKey={(o) => o.key}
            columns={[
              { key: "order", header: "Order", lead: true, render: (o) => <strong>{o.num ? hash(o.num) : "No number"}</strong> },
              { key: "customer", header: "Customer", render: (o) => o.customer },
              { key: "items", header: w("Books"), render: (o) => `${o.titles.join(", ") || "—"} (${o.qty})` },
              { key: "to", header: "Going to", render: (o) => o.destination },
              { key: "waiting", header: "Waiting", numeric: true, render: (o) => <StatusBadge tone={o.late ? "danger" : "warning"}>{ago(o.days)}</StatusBadge> },
              { key: "label", header: "Label", render: (o) => (o.shopOrderId
                ? <PrimaryButton size="sm" onClick={() => setLabelFor(o)}>Buy label</PrimaryButton>
                : null) },
            ]} />
        ) : <EmptyState inline icon="✅" title="Nothing is waiting" description="Every paid website order with an address has gone out, or has a label." />}
      </SectionCard>
      {labelFor?.shopOrderId && (
        <ShipLabelDialog orderId={labelFor.shopOrderId} title={labelFor.num ? hash(labelFor.num) : "this order"} onClose={() => setLabelFor(null)}
          onBought={() => { const key = labelFor.key; setFound((f) => ({ ...f, [key]: { ...(f[key] || {}), labelUrl: "bought" } })); }} />
      )}
      <SectionCard title="Parcels that cost more than customers paid" description={`Orders from the last ${LOSS_WITHIN_DAYS} days where the label cost over 50 cents more than the shipping charge.`}>
        {view.losses.length ? (
          <DataTable<ShippingView["losses"][number]> stackOnPhone caption="Parcels that cost more to post than the customer paid" rows={view.losses} rowKey={(l) => l.num}
            columns={[
              { key: "order", header: "Order", lead: true, render: (l) => <strong>{hash(l.num)}</strong> },
              { key: "to", header: "Going to", render: (l) => l.destination },
              { key: "paid", header: "Customer paid", numeric: true, render: (l) => fmt(l.paid, "CAD") },
              { key: "postage", header: "Label cost", numeric: true, render: (l) => fmt(l.postage, "CAD") },
              { key: "gap", header: "Short by", numeric: true, render: (l) => <StatusBadge tone="danger">{fmt(l.gap, "CAD")}</StatusBadge> },
            ]} />
        ) : <EmptyState inline icon="✅" title="Shipping is paying for itself" description="No recent parcel cost more to post than the customer paid." />}
      </SectionCard>
    </div>
  );
}

export function ShippingPage({ load }: Partial<NativePageProps> & { load?: () => Promise<StockroomRecords> }) {
  return <RecordsGate what="shipping" load={load}>{(records) => <ShippingBoard view={buildShipping(records)} />}</RecordsGate>;
}
