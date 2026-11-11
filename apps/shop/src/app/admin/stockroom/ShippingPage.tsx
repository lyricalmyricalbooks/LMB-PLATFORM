// Stockroom › Shipping, drawn by the admin itself (no frame): paid website orders still waiting to go out (oldest first,
// late ones flagged) and parcels that cost more to post than the customer paid. Read-only: buying labels waits for the
// safe write layer.
import { fmt } from "@stockroom/money.js";

import { DataTable, EmptyState, MetricCard, SectionCard, StatusBadge } from "../riso/components";
import { useShopWords } from "../shopWords";
import type { NativePageProps } from "./nativePages";
import { RecordsGate } from "./RecordsGate";
import { buildShipping, LATE_AFTER_DAYS, LOSS_WITHIN_DAYS, type ShippingView } from "./shipping";
import type { StockroomRecords } from "./stockroomData";
import "./stockroom.css";
import "./stockists.css";

const ago = (days: number) => `${days} ${days === 1 ? "day" : "days"}`;
const hash = (num: string) => (num.startsWith("#") ? num : `#${num}`);

export function ShippingBoard({ view }: { view: ShippingView }) {
  const w = useShopWords();
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
          <DataTable<ShippingView["waiting"][number]> stackOnPhone caption="Orders waiting to be sent" rows={view.waiting} rowKey={(o) => o.key}
            columns={[
              { key: "order", header: "Order", lead: true, render: (o) => <strong>{o.num ? hash(o.num) : "No number"}</strong> },
              { key: "customer", header: "Customer", render: (o) => o.customer },
              { key: "items", header: w("Books"), render: (o) => `${o.titles.join(", ") || "—"} (${o.qty})` },
              { key: "to", header: "Going to", render: (o) => o.destination },
              { key: "waiting", header: "Waiting", numeric: true, render: (o) => <StatusBadge tone={o.late ? "danger" : "warning"}>{ago(o.days)}</StatusBadge> },
            ]} />
        ) : <EmptyState inline icon="✅" title="Nothing is waiting" description="Every paid website order with an address has gone out, or has a label." />}
      </SectionCard>
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
