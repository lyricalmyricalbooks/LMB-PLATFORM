import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import toast from "react-hot-toast";
import { auth, db } from "../../lib/firebase";
import { functionFetch } from "../lib/functionsBase";
import { adminApi } from "./api";
import { catalogToCsv } from "./bulkPricing";
import { buildCustomers, customersToCsv } from "./customerInsights";
import { exportOrdersCsv } from "./orderCsv";
import { describeBackup, describeBackupDay, type BackupDay, type BackupRecord } from "./backupStatus";
import { friendlyError } from "./settingsLayout";
import { DataTable, GhostButton, PrimaryButton, SecondaryButton, SectionCard, StatusBadge } from "./riso/components";

const IAM_URL = "https://console.cloud.google.com/iam-admin/iam?project=lmb-test-shop";

// Server calls for this card (createStripeCheckoutSession, admin only): "backupNow" runs the same backup as the
// nightly job; "backups" lists the daily backups (op "list") or signs a 15-minute download link (op "download").
async function callServer<T>(body: Record<string, unknown>, fallback: string): Promise<T> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("You must be signed in as admin.");
  const response = await functionFetch("createStripeCheckoutSession", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || fallback);
  return result as T;
}
const backupNow = () => callServer<{ ok: boolean; error?: string }>({ action: "backupNow" }, "The backup didn't finish. Try again in a minute.");
const listBackups = () => callServer<{ backups: BackupDay[] }>({ action: "backups", op: "list" }, "Couldn't read the backups. Try again in a minute.");
const downloadLink = (day: string) => callServer<{ url: string }>({ action: "backups", op: "download", day }, "Couldn't prepare the download. Try again in a minute.");

const today = () => new Date().toISOString().slice(0, 10);

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

// Settings › General › Backups & export: the nightly backup's last result, Back up now, and one-click
// downloads of the catalog, customers and orders (built in the browser from admin reads).
export function BackupsExportCard() {
  const [record, setRecord] = useState<BackupRecord | undefined>(undefined);
  const [busy, setBusy] = useState("");

  const [loadFailed, setLoadFailed] = useState(false);
  const load = () => getDoc(doc(db, "systemStatus", "backup"))
    .then((snap) => { setRecord(snap.exists() ? (snap.data() as BackupRecord) : null); setLoadFailed(false); })
    .catch(() => { setLoadFailed(true); setRecord(null); });
  const [days, setDays] = useState<BackupDay[] | null>(null);
  const [daysError, setDaysError] = useState("");
  const loadDays = () => listBackups()
    .then((r) => { setDays(r.backups || []); setDaysError(""); })
    .catch((err: any) => setDaysError(friendlyError(err, "read the daily backups")));
  useEffect(() => { load(); loadDays(); }, []);

  const downloadDay = async (day: string) => {
    setBusy(`day:${day}`);
    try {
      const { url } = await downloadLink(day);
      // The link saves the file (Content-Disposition: attachment), so opening it never leaves this page.
      const a = document.createElement("a");
      a.href = url; a.rel = "noopener"; a.click();
    } catch (err: any) {
      toast.error(friendlyError(err, "prepare the download"));
    } finally { setBusy(""); }
  };

  const runBackup = async () => {
    setBusy("backup");
    try {
      const result = await backupNow();
      if (result.ok) toast.success("Backup finished.");
      else toast.error(result.error || "The backup didn't finish.");
    } catch (err: any) {
      toast.error(friendlyError(err, "finish the backup"));
    } finally {
      await Promise.all([load(), loadDays()]);
      setBusy("");
    }
  };

  const run = async (kind: string, make: () => Promise<[string, string, string] | null>) => {
    setBusy(kind);
    try {
      const file = await make();
      if (!file) { toast.error("Nothing to export yet."); return; }
      download(...file);
      toast.success("Download ready.");
    } catch (err: any) {
      toast.error(friendlyError(err, "make the export"));
    } finally { setBusy(""); }
  };
  const realOrders = async () => (await adminApi.getAllOrders()).filter((o: any) => o.isTest !== true);

  const view = record === undefined ? null : describeBackup(record);
  return (
    <SectionCard title="Backups & export" description="Nightly at 3:17 am. Kept 30 days.">
      <p style={{ margin: "0 0 8px" }}>
        {loadFailed ? <><StatusBadge tone="warning">Couldn't read the backup status</StatusBadge> <span className="rp-hint">Check your connection and reload this page.</span></>
          : view ? <><StatusBadge tone={view.tone}>{view.running ? "Backing up…" : view.label}</StatusBadge> <span className="rp-hint">{view.detail}</span></>
          : <span className="rp-hint">Checking the last backup…</span>}
      </p>
      {view?.notes.map((note) => <p key={note} className="rp-hint" style={{ margin: "0 0 8px" }}>{note}</p>)}
      {view?.exportNeedsRole && (
        <details style={{ margin: "0 0 12px" }}>
          <summary className="rp-label" style={{ cursor: "pointer" }}>How to switch on the full Firestore export</summary>
          <ol className="rp-hint" style={{ margin: "8px 0 0", paddingLeft: 20 }}>
            <li>Open <a href={IAM_URL} target="_blank" rel="noreferrer">Google Cloud › IAM</a> for this project (sign in as the shop's Google account).</li>
            <li>Find {view.serviceAccount ? <><code>{view.serviceAccount}</code> <GhostButton size="sm" onClick={() => navigator.clipboard?.writeText(view.serviceAccount).then(() => toast.success("Address copied."), () => toast.error("Couldn't copy. Select the address instead."))}>Copy</GhostButton></> : <>the <strong>Default compute service account</strong> (ends in <code>-compute@developer.gserviceaccount.com</code>)</>} and press its pencil (Edit).</li>
            <li>Press <strong>Add another role</strong>, choose <strong>Cloud Datastore Import Export Admin</strong>, then <strong>Save</strong>.</li>
            <li>Come back here and press <strong>Back up now</strong>.</li>
          </ol>
        </details>
      )}
      <div style={{ margin: "0 0 16px" }}>
        <PrimaryButton size="sm" disabled={!!busy || view?.running} onClick={runBackup}>{busy === "backup" ? "Backing up…" : "Back up now"}</PrimaryButton>
      </div>
      <h3 className="rp-label" style={{ margin: "0 0 8px" }}>Daily backups</h3>
      <p className="rp-hint" style={{ margin: "0 0 8px" }}>Download = that day's whole shop, one .json file.</p>
      {daysError ? (
        <p style={{ margin: "0 0 16px" }}><StatusBadge tone="warning">List unavailable</StatusBadge> <span className="rp-hint">{daysError}</span> <GhostButton size="sm" onClick={loadDays}>Try again</GhostButton></p>
      ) : days === null ? (
        <p className="rp-hint" style={{ margin: "0 0 16px" }}>Loading the daily backups…</p>
      ) : (
        <div style={{ margin: "0 0 16px" }}>
          <DataTable<BackupDay>
            caption="Daily backups"
            rows={days}
            rowKey={(r) => r.day}
            empty={<p className="rp-hint" style={{ margin: 0 }}>No backups yet. First one tonight, or back up now.</p>}
            columns={[
              { key: "day", header: "Day", lead: true, render: (r) => new Date(`${r.day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" }) },
              { key: "status", header: "Status", render: (r) => { const v = describeBackupDay(r); return <><StatusBadge tone={v.tone}>{v.label}</StatusBadge>{v.detail ? <span className="rp-hint"> {v.detail}</span> : null}</>; } },
              { key: "download", header: "Download", render: (r) => r.downloadable
                ? <SecondaryButton size="sm" disabled={!!busy} aria-label={`Download the backup from ${r.day}`} onClick={() => downloadDay(r.day)}>{busy === `day:${r.day}` ? "Preparing…" : "Download"}</SecondaryButton>
                : <span className="rp-hint">—</span> },
            ]}
          />
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <SecondaryButton size="sm" disabled={!!busy} onClick={() => run("books-csv", async () => {
          const books = await adminApi.getAllBooks();
          return books.length ? [`catalog-${today()}.csv`, catalogToCsv(books), "text/csv;charset=utf-8"] : null;
        })}>{busy === "books-csv" ? "Preparing…" : "Catalog (CSV)"}</SecondaryButton>
        <SecondaryButton size="sm" disabled={!!busy} onClick={() => run("books-json", async () => {
          const books = await adminApi.getAllBooks();
          return books.length ? [`catalog-${today()}.json`, JSON.stringify(books.map(({ _lastDoc, ...b }: any) => b), null, 2), "application/json"] : null;
        })}>{busy === "books-json" ? "Preparing…" : "Catalog (JSON)"}</SecondaryButton>
        <SecondaryButton size="sm" disabled={!!busy} onClick={() => run("customers", async () => {
          const rows = buildCustomers(await realOrders());
          return rows.length ? [`customers-${today()}.csv`, customersToCsv(rows), "text/csv;charset=utf-8"] : null;
        })}>{busy === "customers" ? "Preparing…" : "Customers (CSV)"}</SecondaryButton>
        <SecondaryButton size="sm" disabled={!!busy} onClick={() => run("orders", async () => {
          const orders = await realOrders();
          return orders.length ? [`orders-${today()}.csv`, exportOrdersCsv(orders, { paidOnly: false }), "text/csv;charset=utf-8"] : null;
        })}>{busy === "orders" ? "Preparing…" : "Orders (CSV)"}</SecondaryButton>
      </div>
      <p className="rp-hint" style={{ margin: "12px 0 0" }}>No test orders. Unpaid and cancelled included.</p>
    </SectionCard>
  );
}
