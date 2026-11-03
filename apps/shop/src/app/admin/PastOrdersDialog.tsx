import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { importPastOrders } from "./oldShopApi";
import { readPastOrders, type PastOrderFile } from "./pastOrders";
import { Dialog, PrimaryButton, SecondaryButton, StatusBadge } from "./riso/components";

/**
 * Orders › Bring past orders over (plan 23.7): the old shop's order file → a preview → the server saves each order as
 * history only (functions/orderImport.js): counted in sales reports and each customer's history, with no stock change,
 * no email and no payment. Bringing the same file again adds nothing.
 */
const BATCH = 500;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`;
const dollars = (n: number) => `CA$${n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dayWords = (d: string) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "");

export function PastOrdersDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [file, setFile] = useState<PastOrderFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<null | { added: number; skipped: string[] }>(null);

  const choose = async (picked: File | undefined) => {
    if (!picked) return;
    setError(""); setResult(null); setName(picked.name);
    if (picked.size > 20 * 1024 * 1024) { setFile(null); setError("That file is larger than 20 MB. Export a shorter date range and bring the parts one at a time."); return; }
    try { setFile(readPastOrders(await picked.text())); }
    catch { setFile(null); setError("This file couldn't be read. Save it as CSV (comma separated) and try again."); }
  };

  const bring = async () => {
    if (!file?.orders.length || busy) return;
    setBusy(true); setError("");
    const numberOf = new Map(file.orders.map((o) => [o.oldRef, o.number]));
    const done = { added: 0, skipped: [] as string[] };
    try {
      for (let i = 0; i < file.orders.length; i += BATCH) {
        const answer = await importPastOrders(file.orders.slice(i, i + BATCH));
        done.added += answer.added;
        for (const s of answer.skipped) done.skipped.push(`Order ${numberOf.get(s.oldRef) ?? s.oldRef}: ${s.reason}`);
      }
      setResult(done);
      onDone();
    } catch (err: any) {
      setError(`${err?.message || "The orders couldn't be brought over."} Choose the same file again to finish: orders already brought over are skipped.`);
      if (done.added) onDone();
    } finally {
      setBusy(false);
    }
  };

  const leftOut = (rows: string[]) => rows.length > 0 && (
    <details>
      <summary className="rp-hint">{plural(rows.length, "order")} left out</summary>
      <ul className="rp-hint" style={{ margin: "6px 0 0", paddingLeft: 18, maxHeight: 200, overflow: "auto" }}>
        {rows.slice(0, 200).map((r, i) => <li key={`${r}-${i}`}>{r}</li>)}
      </ul>
    </details>
  );

  if (result) {
    return (
      <Dialog open onClose={onClose} title="Past orders brought over" badge="🧾" footer={<PrimaryButton onClick={onClose}>Done</PrimaryButton>}>
        <div className="rp-stack" style={{ gap: 12 }} role="status">
          <StatusBadge tone={result.added ? "success" : "neutral"}>{plural(result.added, "past order")} added</StatusBadge>
          {result.added > 0 && <p className="rp-hint" style={{ margin: 0 }}>They show in your sales reports and in each customer's history, marked as brought over from your old shop.</p>}
          {leftOut(result.skipped)}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={() => { if (!busy) onClose(); }} title="Bring past orders over" badge="🧾" size="lg"
      description="Choose the order file from your old shop. Each order comes over as history: it counts in your sales reports and in the customer's history, but changes no stock, sends no email and takes no payment."
      footer={<>
        <SecondaryButton disabled={busy} onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton disabled={busy || !file?.orders.length} onClick={bring}>
          {busy ? "Bringing them over…" : file?.orders.length ? `Bring ${plural(file.orders.length, "past order")} over` : "Nothing to bring over"}
        </PrimaryButton>
      </>}>
      <div className="rp-stack" style={{ gap: 12 }}>
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden aria-label="Order file"
          onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ""; }} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <SecondaryButton icon={<Upload size={16} aria-hidden />} disabled={busy} onClick={() => fileRef.current?.click()}>{name ? "Choose another file" : "Choose the file"}</SecondaryButton>
          {name && <span className="rp-mono" style={{ overflowWrap: "anywhere" }}>{name}</span>}
        </div>
        {!file && <p className="rp-hint" style={{ margin: 0 }}>In your old shop, open its orders page and export them as a CSV file.</p>}
        {error && <p role="alert" className="rp-error-text" style={{ margin: 0 }}>{error}</p>}
        {file && (file.problems.length ? (
          <div role="alert" className="rp-error-text">{file.problems.map((p) => <p key={p} style={{ margin: 0 }}>{p}</p>)}</div>
        ) : (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} aria-live="polite">
              <StatusBadge tone="info">{plural(file.orders.length, "order")}</StatusBadge>
              <StatusBadge tone="neutral">{dollars(file.totalSales)} in sales</StatusBadge>
              <StatusBadge tone="neutral">{plural(file.customers, "customer")}</StatusBadge>
            </div>
            {file.from && <p className="rp-hint" style={{ margin: 0 }}>From {dayWords(file.from)} to {dayWords(file.to)}.</p>}
            {leftOut(file.skipped.map((s) => s.reason))}
          </>
        ))}
      </div>
    </Dialog>
  );
}
