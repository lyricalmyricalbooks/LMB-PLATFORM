// Stockroom › Shipping, drawn by the admin itself (no frame): paid website orders still waiting to go out (oldest first,
// late ones flagged) and parcels that cost more to post than the customer paid. A row that is a website order here gets
// Buy label (ShipLabelDialog: the order page's own label path, confirmed first); the stockroom's records are only read.
import { useEffect, useState } from "react";
import { fmt } from "@stockroom/money.js";

import { adminApi } from "../api";
import { DataTable, EmptyState, PrimaryButton, StatusBadge } from "../riso/components";
import { useShopWords } from "../shopWords";
import type { NativePageProps } from "./nativePages";
import { RecordsGate } from "./RecordsGate";
import { ShipLabelDialog } from "./ShipLabelDialog";
import { buildShipping, joinShopOrders, LOSS_WITHIN_DAYS, shopOrderId, type ShippingView, type WaitingWithOrder } from "./shipping";
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
  return (
    <div className="rp-sk">
      {view.waiting.length ? (
        <DataTable<WaitingWithOrder> stackOnPhone caption="Parcels waiting to be sent, oldest first" rows={view.waiting} rowKey={(o) => o.key}
          columns={[
            { key: "to", header: "To", lead: true, render: (o) => <>{o.customer}<div className="rp-hint">{[o.num ? hash(o.num) : "", o.destination].filter(Boolean).join(" · ")}</div></> },
            { key: "items", header: "Contents", render: (o) => `${o.qty} × ${o.titles.join(", ") || w("book")}` },
            { key: "status", header: "", render: (o) => <StatusBadge glyph={false} tone={o.late ? "danger" : "warning"}>To post · {ago(o.days)}</StatusBadge> },
            { key: "label", header: "", render: (o) => (o.shopOrderId
              ? <PrimaryButton size="sm" onClick={() => setLabelFor(o)}>Buy label</PrimaryButton>
              : null) },
          ]} />
      ) : <EmptyState inline icon="✅" title="Nothing to post" description="Every paid order with an address has gone out, or has a label." />}
      {labelFor?.shopOrderId && (
        <ShipLabelDialog orderId={labelFor.shopOrderId} title={labelFor.num ? hash(labelFor.num) : "this order"} onClose={() => setLabelFor(null)}
          onBought={() => { const key = labelFor.key; setFound((f) => ({ ...f, [key]: { ...(f[key] || {}), labelUrl: "bought" } })); }} />
      )}
      {view.losses.length > 0 && (
        <p className="rp-sr-status" role="status">
          {view.losses.length === 1 ? "1 parcel" : `${view.losses.length} parcels`} cost {fmt(view.lossTotal, "CAD")} more to post than customers paid in the last {LOSS_WITHIN_DAYS} days
          ({view.losses.map((l) => hash(l.num)).join(", ")}).
        </p>
      )}
    </div>
  );
}

export function ShippingPage({ load }: Partial<NativePageProps> & { load?: () => Promise<StockroomRecords> }) {
  return <RecordsGate what="shipping" load={load}>{(records) => <ShippingBoard view={buildShipping(records)} />}</RecordsGate>;
}
