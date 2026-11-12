// Bookkeeping › Transactions' payouts (ReconcileView, drawn on TaxCenterPage.tsx): two tiles (payouts matched, payouts that
// need a look) and one table of payouts with their sales, fees and a Matched chip. Read-only, from the shop's orders
// (reconcileModel.ts); a row opens the orders in that payout.
import { useMemo, useState } from "react";
import { fmt, fmtD } from "@stockroom/money.js";
import { DataTable, Drawer, EmptyState, StatusBadge, type Column } from "../riso/components";
import { payoutChip, reconcileModel, type PayoutRow } from "./reconcileModel";
import "./stockroom.css";
import "./sales.css";

const when = (p: PayoutRow) => (p.date ? fmtD(p.date) : "On its way");

export function ReconcileView({ orders }: { orders: Record<string, any>[] }) {
  const m = useMemo(() => reconcileModel(orders), [orders]);
  const money = (cents: number) => fmt(cents / 100, m.currency);
  const [open, setOpen] = useState<PayoutRow | null>(null);
  const columns: Column<PayoutRow>[] = [
    { key: "payout", header: "Payout", lead: true, render: (p) => <button type="button" className="rp-sr-open" onClick={() => setOpen(p)}>{when(p)}</button> },
    { key: "sales", header: "Sales", numeric: true, render: (p) => money(p.salesCents) },
    { key: "fees", header: "Fees", numeric: true, render: (p) => money(p.feesCents) },
    { key: "chip", header: "Status", render: (p) => { const c = payoutChip(p); return <StatusBadge glyph={false} tone={c.tone}>{c.label}</StatusBadge>; } },
  ];
  const short = m.needsLookCents;
  return (
    <div className="rp-sr">
      <div className="rp-tiles">
        <div className="rp-tile" data-tone="mint">
          <span className="rp-tile-label">Payouts matched</span>
          <span className="rp-tile-value">{m.payouts.length ? `${m.matched} of ${m.payouts.length}` : "–"}</span>
          {m.waiting ? <span className="rp-tile-sub">{m.waiting} {m.waiting === 1 ? "sale" : "sales"} not paid out yet</span> : null}
        </div>
        <div className="rp-tile" data-tone="apricot">
          <span className="rp-tile-label">Needs a look</span>
          <span className="rp-tile-value">{m.needsLook}</span>
          {m.needsLook ? <span className="rp-tile-sub">{short > 0 ? `${money(short)} refund` : `${money(Math.abs(short))} to check`}</span> : null}
        </div>
      </div>
      <DataTable caption="Payouts" columns={columns} rows={m.payouts} rowKey={(p) => p.payoutId} stackOnPhone onRowClick={setOpen}
        empty={<EmptyState inline icon="🏦" title="No payouts yet" description="Card sales show here once they reach your bank." />} />
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open ? `Payout, ${when(open)}` : "Payout"}
        description={open ? `${money(open.netCents)} to your bank` : undefined}>
        {open && (
          <ul className="rp-sr-lines">
            {open.orders.map((o) => (
              <li key={o.id}>
                <span>Order {o.num}</span>
                <span className="rp-sr-line-meta">{money(o.salesCents)} less {money(o.feesCents)} fee{o.differenceCents ? ` · ${money(Math.abs(o.differenceCents))} ${o.differenceCents > 0 ? "refunded" : "extra"}` : ""}</span>
                <span className="rp-sr-line-amount">{money(o.netCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </Drawer>
    </div>
  );
}
