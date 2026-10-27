import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { adminApi } from "./api";
import { friendlyError, HowTo } from "./settingsLayout";
import { KIND_LABELS, shopErrorRows, type ShopErrorRow } from "./shopErrors";
import { ConfirmDialog, DataTable, EmptyState, ErrorState, GhostButton, LoadingState, SecondaryButton, SectionCard, StatusBadge } from "./riso/components";

const when = (t: number) => (t ? new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");

// Settings › General › Tools & records › Shop errors: errors shoppers' browsers reported (src/app/lib/errorReport.ts,
// functions/clientErrors.js), one row per distinct error. Clearing a row only removes the record; it comes back if it
// happens again.
export function ShopErrorsCard() {
  const [rows, setRows] = useState<ShopErrorRow[] | null>(null);
  const [error, setError] = useState("");
  const [confirmAll, setConfirmAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = () => adminApi.getClientErrors(50)
    .then((docs) => { setRows(shopErrorRows(docs)); setError(""); })
    .catch((err: any) => setError(friendlyError(err, "read the shop errors")));
  useEffect(() => { load(); }, []);

  const clear = async (ids: string[]) => {
    try {
      await adminApi.clearClientErrors(ids);
      setRows((prev) => (prev || []).filter((r) => !ids.includes(r.id)));
      toast.success(ids.length === 1 ? "Error cleared" : "Errors cleared");
    } catch (err: any) {
      toast.error(friendlyError(err, "clear the errors"));
    }
  };

  const total = rows?.length ?? 0;
  return (
    <SectionCard title="Shop errors" description="What broke in shoppers' browsers."
      actions={rows ? <StatusBadge tone={total ? "warning" : "success"}>{total ? `${total} to look at` : "None"}</StatusBadge> : undefined}>
      {error ? <ErrorState title="Couldn't read the shop errors" description={error} onRetry={load} />
        : !rows ? <LoadingState label="Reading shop errors…" />
        : !rows.length ? <EmptyState inline title="No errors reported" description="Shoppers' pages have drawn without a problem." />
        : (
          <>
            <DataTable caption="Shop errors" stackOnPhone rows={rows} rowKey={(r) => r.id}
              columns={[
                { key: "error", header: "Error", lead: true, render: (r) => (
                  <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                    <span style={{ overflowWrap: "anywhere" }}>{r.message}</span>
                    {r.stack && (
                      <GhostButton size="sm" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                        {open === r.id ? "Hide details" : "Details"}
                      </GhostButton>
                    )}
                    {open === r.id && <pre className="rp-mono" style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 12, maxHeight: 200, overflow: "auto" }}>{r.stack}</pre>}
                  </div>
                ) },
                { key: "where", header: "Where", render: (r) => (
                  <span className="rp-mono" style={{ overflowWrap: "anywhere" }}>
                    {KIND_LABELS[r.kind] || "Script"}{r.section ? ` · ${r.section}` : ""} · {r.lastPath}
                    {r.paths.length > 1 ? ` +${r.paths.length - 1}` : ""}
                  </span>
                ) },
                { key: "count", header: "Times", numeric: true, render: (r) => r.count },
                { key: "last", header: "Last seen", render: (r) => when(r.lastSeen) },
                { key: "clear", header: "", render: (r) => <SecondaryButton size="sm" onClick={() => clear([r.id])}>Clear</SecondaryButton> },
              ]} />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <SecondaryButton size="sm" onClick={() => setConfirmAll(true)}>Clear all</SecondaryButton>
            </div>
          </>
        )}
      <div style={{ marginTop: 12 }}>
        <HowTo summary="Fine print">
          <ul className="rp-hint" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6, listStyle: "disc" }}>
            <li>No names, addresses or order numbers are kept. Only the error and the page.</li>
            <li>The same error is counted once, wherever it happens.</li>
            <li>Errors leave by themselves after 30 days without happening again.</li>
            <li>Cleared errors come back if they happen again.</li>
          </ul>
        </HowTo>
      </div>
      <ConfirmDialog open={confirmAll} title="Clear every shop error?" confirmLabel="Clear all"
        message="The list empties. Any error that happens again is listed again."
        onConfirm={() => { setConfirmAll(false); void clear((rows || []).map((r) => r.id)); }} onCancel={() => setConfirmAll(false)} />
    </SectionCard>
  );
}
