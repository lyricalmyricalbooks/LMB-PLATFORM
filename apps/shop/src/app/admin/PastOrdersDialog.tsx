import { useMemo, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { importPastOrders } from "./oldShopApi";
import { goodRate, readPastOrders, readyToSend, type PastOrderFile } from "./pastOrders";
import { Dialog, PrimaryButton, SecondaryButton, StatusBadge, TextField } from "./riso/components";

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
  // Orders sold in another currency come over converted at the owner's rate (plan 23.11), typed per currency.
  const [rateText, setRateText] = useState<Record<string, string>>({});
  const rates = useMemo(() => Object.fromEntries(Object.entries(rateText).map(([c, t]) => [c, Number(t.replace(",", "."))])), [rateText]);
  const ready = useMemo(() => (file ? readyToSend(file, rates) : null), [file, rates]);
  const waiting = ready ? Object.values(ready.waiting).reduce((a, b) => a + b, 0) : 0;

  const choose = async (picked: File | undefined) => {
    if (!picked) return;
    setError(""); setResult(null); setName(picked.name); setRateText({});
    if (picked.size > 20 * 1024 * 1024) { setFile(null); setError("That file is larger than 20 MB. Export a shorter date range and bring the parts one at a time."); return; }
    try { setFile(readPastOrders(await picked.text())); }
    catch { setFile(null); setError("This file couldn't be read. Save it as CSV (comma separated) and try again."); }
  };

  const bring = async () => {
    if (!ready?.orders.length || busy) return;
    setBusy(true); setError("");
    const numberOf = new Map(ready.orders.map((o) => [o.oldRef, o.number]));
    const done = { added: 0, skipped: [] as string[] };
    try {
      for (let i = 0; i < ready.orders.length; i += BATCH) {
        const answer = await importPastOrders(ready.orders.slice(i, i + BATCH));
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
        <PrimaryButton disabled={busy || !ready?.orders.length} onClick={bring}>
          {busy ? "Bringing them over…" : ready?.orders.length ? `Bring ${plural(ready.orders.length, "past order")} over` : "Nothing to bring over"}
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
        {file && ready && (file.problems.length ? (
          <div role="alert" className="rp-error-text">{file.problems.map((p) => <p key={p} style={{ margin: 0 }}>{p}</p>)}</div>
        ) : (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} aria-live="polite">
              <StatusBadge tone="info">{plural(ready.orders.length, "order")}</StatusBadge>
              <StatusBadge tone="neutral">{dollars(ready.totalSales)} in sales</StatusBadge>
              <StatusBadge tone="neutral">{plural(ready.customers, "customer")}</StatusBadge>
              {waiting > 0 && <StatusBadge tone="warning">{plural(waiting, "order")} waiting for a rate</StatusBadge>}
            </div>
            {ready.from && <p className="rp-hint" style={{ margin: 0 }}>From {dayWords(ready.from)} to {dayWords(ready.to)}.</p>}
            {Object.keys(file.foreign).length > 0 && (
              <div className="rp-stack" style={{ gap: 8 }}>
                <p className="rp-hint" style={{ margin: 0 }}>Some orders were in another currency. Type what one unit was worth in Canadian dollars around when you sold, for example your bank's average rate for that time. Each order is converted at that rate, and what the old shop charged is kept on the order.</p>
                {Object.entries(file.foreign).sort().map(([code, count]) => {
                  const typed = rateText[code] ?? "";
                  return (
                    <TextField key={code} label={`1 ${code} in Canadian dollars (${plural(count, "order")})`} inputMode="decimal" placeholder="e.g. 1.37"
                      value={typed} disabled={busy} onChange={(e) => setRateText((r) => ({ ...r, [code]: e.target.value }))}
                      error={typed.trim() && !goodRate(rates[code]) ? "Type a number above 0, such as 1.37." : undefined} />
                  );
                })}
              </div>
            )}
            {leftOut(file.skipped.map((s) => s.reason))}
          </>
        ))}
      </div>
    </Dialog>
  );
}
