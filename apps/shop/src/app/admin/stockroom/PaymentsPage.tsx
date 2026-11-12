// Stockroom › Bookkeeping › Payments (v4 mockup): three tiles (paid out in the last 30 days, on its way, payment links
// waiting), the payouts table and Pay by QR and links. Read-only; figures from paymentsModel.ts. A payout row opens
// Reconcile payouts, where its orders are; the list's button opens QR codes.
import { useEffect, useMemo, useState } from "react";
import { fmt, fmtD } from "@stockroom/money.js";
import { DataTable, EmptyState, ErrorState, GhostButton, LoadingState, SectionCard, StatusBadge, type Column } from "../riso/components";
import { getOrdersCached, invalidateOrders } from "../ordersCache";
import type { NativePageProps } from "./nativePages";
import { RecordsGate } from "./RecordsGate";
import { stockroomApi, type StockroomRecords } from "./stockroomData";
import { moneyText } from "./stockists";
import { paymentsModel, type PayLink } from "./paymentsModel";
import type { PayoutRow } from "./reconcileModel";
import "./stockroom.css";
import "./sales.css";

const LINK_CHIP = { active: { label: "Active", tone: "success" }, unpaid: { label: "Unpaid", tone: "warning" }, paid: { label: "Paid", tone: "neutral" } } as const;

export function PaymentsView({ orders, records, onOpen, now = Date.now() }: { orders: Record<string, any>[]; records: StockroomRecords; onOpen?: NativePageProps["onOpen"]; now?: number }) {
  const m = useMemo(() => paymentsModel({ orders, records, now }), [orders, records, now]);
  const money = (cents: number) => fmt(cents / 100, m.currency);
  const columns: Column<PayoutRow>[] = [
    { key: "d", header: "Date", lead: true, render: (p) => (p.date ? fmtD(p.date) : "On its way") },
    { key: "m", header: "Method", render: () => "Card" },
    { key: "s", header: "Sales", numeric: true, render: (p) => money(p.salesCents) },
    { key: "f", header: "Fees", numeric: true, render: (p) => money(p.feesCents) },
    { key: "t", header: "Status", render: (p) => <StatusBadge glyph={false} tone={p.date ? "success" : "info"}>{p.date ? "Paid out" : "Pending"}</StatusBadge> },
  ];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return (
    <div className="rp-sr">
      <div className="rp-tiles">
        <div className="rp-tile" data-tone="mint">
          <span className="rp-tile-label">Paid out, last 30 days</span>
          <span className="rp-tile-value">{money(m.paidOut30Cents)}</span>
          <span className="rp-tile-sub">{plural(m.paidOut30Count, "payout", "payouts")}</span>
        </div>
        <div className="rp-tile" data-tone="sky">
          <span className="rp-tile-label">Pending</span>
          <span className="rp-tile-value">{money(m.onWayCents)}</span>
          <span className="rp-tile-sub">{m.waiting ? `${plural(m.waiting, "sale", "sales")} not in a payout yet` : m.onWayCount ? "On its way to your bank" : "Nothing on its way"}</span>
        </div>
        <div className="rp-tile" data-tone="apricot">
          <span className="rp-tile-label">Payment links</span>
          <span className="rp-tile-value">{m.unpaidLinks} open</span>
          <span className="rp-tile-sub">{m.unpaidLinks ? `${moneyText(m.unpaidOwed)} unpaid` : "Nothing waiting"}</span>
        </div>
      </div>
      <SectionCard title="Payouts" flush>
        <DataTable caption="Payouts" columns={columns} rows={m.payouts} rowKey={(p) => p.payoutId} stackOnPhone
          onRowClick={onOpen ? () => onOpen("reconcile") : undefined}
          empty={<EmptyState inline icon="🏦" title="No payouts yet" description="Card sales show here once they reach your bank." />} />
      </SectionCard>
      <SectionCard title="Pay by QR and links" actions={onOpen ? <GhostButton onClick={() => onOpen("qrcodes")}>QR codes</GhostButton> : undefined}>
        {m.links.length ? (
          <ul className="rp-sr-lines">
            {m.links.map((l: PayLink) => (
              <li key={l.id}>
                <span>{l.name}</span>
                <span className="rp-sr-line-meta">{l.amount != null ? `${fmt(l.amount, l.code || m.currency)} · ${l.sub}` : l.sub}</span>
                <span className="rp-sr-line-amount"><StatusBadge glyph={false} tone={LINK_CHIP[l.state].tone}>{LINK_CHIP[l.state].label}</StatusBadge></span>
              </li>
            ))}
          </ul>
        ) : <EmptyState inline title="No pay links yet" description="Card payment links on your items and invoices show here." />}
      </SectionCard>
    </div>
  );
}

export function PaymentsPage({ onOpen, load = stockroomApi.load }: Partial<NativePageProps> & { load?: () => Promise<StockroomRecords> }) {
  const [orders, setOrders] = useState<Record<string, any>[] | "loading" | "failed">("loading");
  const [round, setRound] = useState(0);
  useEffect(() => {
    let alive = true;
    setOrders("loading");
    getOrdersCached().then((o) => { if (alive) setOrders(o as Record<string, any>[]); }).catch(() => { if (alive) setOrders("failed"); });
    return () => { alive = false; };
  }, [round]);
  if (orders === "loading") return <LoadingState label="Reading your payouts…" />;
  if (orders === "failed") return <ErrorState title="Couldn't read your payouts" onRetry={() => { invalidateOrders(); setRound((n) => n + 1); }} />;
  return <RecordsGate load={load} what="your payments">{(records) => <PaymentsView orders={orders} records={records} onOpen={onOpen} />}</RecordsGate>;
}
