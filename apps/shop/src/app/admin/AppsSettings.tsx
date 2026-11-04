// Settings › Apps (platform plan 26.5): every change an installed app made, or was refused, newest first. Lean on
// purpose: a refused change shows the shop's reason, so an order an app couldn't send never sits there unexplained.
import { useEffect, useState } from "react";
import { DataTable, EmptyState, SectionCard, StatusBadge, type Column } from "./riso/components";
import { appActivityApi, type ActivityRow } from "./appActivity";

const when = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";
};

const COLUMNS: Column<ActivityRow>[] = [
  { key: "app", header: "App", lead: true, render: (r) => r.app },
  { key: "what", header: "Change", render: (r) => (
    <span className="rp-stack" style={{ gap: 2 }}>
      <span>{r.what}</span>
      {r.reason && <span className="rp-hint">{r.reason}</span>}
    </span>
  ) },
  { key: "state", header: "Result", render: (r) => (
    r.state === "done" ? <StatusBadge tone="success">Done</StatusBadge>
      : r.state === "refused" ? <StatusBadge tone="danger">Refused</StatusBadge>
        : <StatusBadge tone="neutral">Waiting</StatusBadge>
  ) },
  { key: "when", header: "When", render: (r) => when(r.when) },
];

export function AppsSettings({ api = appActivityApi }: { api?: { recent: () => Promise<ActivityRow[]> } }) {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    api.recent().then((r) => { if (live) setRows(r); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [api]);
  return (
    <div className="rp-stack" style={{ gap: 24 }}>
      <SectionCard title="App activity" description="What your apps changed. Each change passes your shop's own checks first.">
        {failed ? <EmptyState inline title="Couldn't load app activity" description="Try again in a minute." />
          : rows === null ? <p className="rp-hint" role="status">Loading…</p>
            : <DataTable caption="App activity" rowKey={(r) => r.id} rows={rows} columns={COLUMNS} stackOnPhone
                empty={<EmptyState inline title="No app activity yet" description="Changes from apps you add show here." />} />}
      </SectionCard>
    </div>
  );
}
