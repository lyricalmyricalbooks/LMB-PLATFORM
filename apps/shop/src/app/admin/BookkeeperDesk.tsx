import { useEffect, useMemo, useState } from "react";
import { Download, LogOut } from "lucide-react";
import { shopProfile } from "../../lib/shopProfile";
import { adminApi } from "./api";
import { feeLine, providerName, type PlatformPaymentsAnswer } from "./platformPayments";
import { friendlyError } from "./settingsLayout";
import { orderDay } from "../lib/shopDay";
import {
  DataTable, EmptyState, ErrorState, LoadingState, MetricCard, PageHeader, SecondaryButton, SectionCard, SelectField, StatusBadge, type Column,
} from "./riso/components";
import { PERIOD_WORDS, bookkeeperOrdersCsv, bookkeeperSalesCsv, paidInRange, periodRange, periodTotals, type BooksPeriod } from "./bookkeeping";

const money = (n: number) => `CA$${(Math.round(n * 100) / 100).toFixed(2)}`;

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

// What a press's bookkeeper sees instead of the admin (Team role "bookkeeper", plan 7.17): the period's sales, tax and
// shipping collected, the payout status and the bookkeeping downloads. Read only: the rules refuse the role any write,
// and nothing here offers one.
export function BookkeeperDesk({ email, appearance }: { email: string | null; appearance: "light" | "dark" }) {
  const [orders, setOrders] = useState<any[] | null>(null);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<BooksPeriod>("lastMonth");
  const platform = shopProfile.payments?.mode === "platform" ? shopProfile.payments.provider : null;
  const [payouts, setPayouts] = useState<PlatformPaymentsAnswer | null>(null);
  const [payoutsError, setPayoutsError] = useState("");

  const load = () => {
    setError("");
    setOrders(null);
    adminApi.getAllOrders().then(setOrders, (err: unknown) => setError(friendlyError(err, "read the orders")));
  };
  useEffect(() => {
    load();
    if (platform) adminApi.platformPayments("status").then(setPayouts, (err: unknown) => setPayoutsError(friendlyError(err, "read the payout status")));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const range = useMemo(() => periodRange(period), [period]);
  const sums = useMemo(() => (orders ? periodTotals(orders, range) : null), [orders, range]);
  const rows = useMemo(() => (orders ? paidInRange(orders, range) : []), [orders, range]);
  const span = `${range.startKey}-to-${range.endKey}`;

  const columns: Column<any>[] = [
    { key: "date", header: "Date", render: (o) => orderDay(o.createdAt) },
    { key: "order", header: "Order", lead: true, render: (o) => o.orderId || o.id },
    { key: "name", header: "Name", render: (o) => o.customer?.name || "" },
    { key: "tax", header: "Tax", numeric: true, render: (o) => money(Number(o.tax) || 0) },
    { key: "total", header: "Total", numeric: true, render: (o) => money(Number(o.total) || 0) },
  ];

  return (
    <div className="rp" data-rp-appearance={appearance}>
      <main className="rp-main" style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 16px" }}>
        <PageHeader
          title="Bookkeeping"
          description={`Signed in as ${email || "your bookkeeper account"}. You can read the shop's sales, tax and payouts here; nothing can be changed.`}
          actions={<SecondaryButton icon={<LogOut size={16} aria-hidden />} onClick={() => { void adminApi.logout(); }}>Log out</SecondaryButton>}
        />
        <div className="rp-stack" style={{ gap: 16 }}>
          <SectionCard title="Sales and tax" description="Paid orders, test orders left out. Amounts in Canadian dollars, by the day each order was placed in Toronto.">
            <div className="rp-stack" style={{ gap: 16 }}>
              <SelectField label="Period" value={period} onChange={(e) => setPeriod(e.target.value as BooksPeriod)} style={{ maxWidth: 240 }}>
                {(Object.keys(PERIOD_WORDS) as BooksPeriod[]).map((p) => <option key={p} value={p}>{PERIOD_WORDS[p]}</option>)}
              </SelectField>
              {error ? <ErrorState title="Orders not loaded" description={error} onRetry={load} />
                : !sums ? <LoadingState label="Reading the orders…" />
                : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <MetricCard label="Orders" value={sums.orders} />
                    <MetricCard label="Net sales" value={money(sums.net)} footer={sums.refunded > 0 ? `${money(sums.refunded)} refunded` : undefined} />
                    <MetricCard label="Tax collected" value={money(sums.tax)} />
                    <MetricCard label="Shipping collected" value={money(sums.shipping)} />
                  </div>
                )}
            </div>
          </SectionCard>

          <SectionCard title="Downloads" description="Spreadsheets for the period above. Order files show each order's name but no email addresses.">
            <div className="flex flex-wrap gap-3">
              <SecondaryButton icon={<Download size={16} aria-hidden />} disabled={!orders}
                onClick={() => orders && download(`orders-${span}.csv`, bookkeeperOrdersCsv(orders, range))}>Orders (CSV)</SecondaryButton>
              <SecondaryButton icon={<Download size={16} aria-hidden />} disabled={!orders}
                onClick={() => orders && download(`sales-report-${span}.csv`, bookkeeperSalesCsv(orders, range))}>Sales report by day (CSV)</SecondaryButton>
            </div>
          </SectionCard>

          <SectionCard title="Payouts">
            {!platform
              ? <p className="rp-card-desc" style={{ margin: 0 }}>Card payments go straight to the shop's own card account, and its payouts are listed there. Ask the owner for access to it.</p>
              : payoutsError ? <ErrorState title="Payout status not loaded" description={payoutsError} />
              : !payouts ? <LoadingState label="Asking the card account…" />
              : (
                <div className="rp-stack" style={{ gap: 8 }}>
                  <div><StatusBadge tone={payouts.payoutsEnabled === false ? "warning" : "success"}>{payouts.payoutsEnabled === false ? "Payouts paused" : "Payouts on"}</StatusBadge></div>
                  <p className="rp-card-desc" style={{ margin: 0 }}>Payouts go to the shop's own {providerName(platform)} account. {feeLine(payouts.platformFee)}</p>
                </div>
              )}
          </SectionCard>

          <SectionCard title="Orders in the period">
            <DataTable caption="Paid orders in the period" columns={columns} rows={rows.slice(0, 100)} rowKey={(o) => o.id} stackOnPhone
              empty={<EmptyState inline title={orders ? "No paid orders in this period" : "Reading the orders…"} />} />
            {rows.length > 100 && <p className="rp-hint">The newest 100 are shown. The Orders download has all {rows.length}.</p>}
          </SectionCard>
        </div>
      </main>
    </div>
  );
}
