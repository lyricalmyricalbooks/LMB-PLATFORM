import { recordMoveStep } from "./moveProgress";
import { useEffect, useMemo, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { importPastOrders, removePastOrders, suggestedRates } from "./oldShopApi";
import { goodRate, readPastOrders, readyToSend, type PastOrderFile } from "./pastOrders";
import { Dialog, GhostButton, PrimaryButton, SecondaryButton, StatusBadge, TextField } from "./riso/components";

/**
 * Orders › Bring past orders over (plan 23.7): the old shop's order file → a preview → the server saves each order as
 * history only (functions/orderImport.js): counted in sales reports and each customer's history, with no stock change,
 * no email and no payment. Bringing the same file again adds nothing.
 */
const BATCH = 500;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`;
const dollars = (n: number) => `CA$${n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Names one run, so the whole run can be taken back at once (plan 23.15). */
const newBatch = () => `run-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`}`.toLowerCase().slice(0, 40);
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
  // The Bank of Canada's average for the file's dates, filled in as a starting point (plan 23.14).
  const [suggested, setSuggested] = useState<{ rates: Record<string, number>; from: string; to: string } | null>(null);
  const batch = useRef("");
  const [undo, setUndo] = useState<"" | "confirm" | "busy" | "done" | "failed">("");
  const [removed, setRemoved] = useState(0);

  useEffect(() => {
    const codes = file ? Object.keys(file.foreign) : [];
    if (!file || !codes.length) return;
    const days = file.orders.filter((o) => o.currency && o.currency !== "CAD").map((o) => o.orderedAt.slice(0, 10)).sort();
    let alive = true;
    suggestedRates(codes, days[0], days[days.length - 1])
      .then((rates) => {
        if (!alive) return;
        setSuggested({ rates, from: days[0], to: days[days.length - 1] });
        setRateText((typed) => ({ ...Object.fromEntries(Object.entries(rates).map(([c, r]) => [c, String(r)])), ...typed }));
      })
      .catch(() => { /* the owner types a rate instead */ });
    return () => { alive = false; };
  }, [file]);

  const choose = async (picked: File | undefined) => {
    if (!picked) return;
    setError(""); setResult(null); setName(picked.name); setRateText({}); setSuggested(null); setUndo(""); batch.current = newBatch();
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
        const answer = await importPastOrders(ready.orders.slice(i, i + BATCH), batch.current);
        done.added += answer.added;
        for (const s of answer.skipped) done.skipped.push(`Order ${numberOf.get(s.oldRef) ?? s.oldRef}: ${s.reason}`);
      }
      if (done.added) void recordMoveStep("move-orders");
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
    // Orders a run brought over before keep that run's rate (plan 23.18): the server skips them by their old reference.
    const already = result.skipped.filter((s) => s.endsWith(": already brought over")).length;
    return (
      <Dialog open onClose={onClose} title="Past orders brought over" badge="🧾" footer={<PrimaryButton onClick={onClose}>Done</PrimaryButton>}>
        <div className="rp-stack" style={{ gap: 12 }} role="status">
          <StatusBadge tone={result.added ? "success" : "neutral"}>{plural(result.added, "past order")} added</StatusBadge>
          {result.added > 0 && <p className="rp-hint" style={{ margin: 0 }}>They show in your sales reports and in each customer's history, marked as brought over from your old shop.</p>}
          {leftOut(result.skipped)}
          {already > 0 && file && Object.keys(file.foreign).length > 0 && (
            <p className="rp-hint" style={{ margin: 0 }}>{already === 1 ? "1 order was" : `${already.toLocaleString("en")} orders were`} already here from an earlier import, so {already === 1 ? "it keeps" : "they keep"} the rate used then. To use a new rate, open one of those orders, choose Remove this import, then bring the file again.</p>
          )}
          {result.added > 0 && batch.current && (
            undo === "done" ? <p className="rp-hint" style={{ margin: 0 }}>{plural(removed, "past order")} removed. Bring the file again whenever you like.</p>
            : undo === "confirm" || undo === "busy" ? (
              <div className="rp-stack" style={{ gap: 8 }}>
                <p style={{ margin: 0 }}>Remove the past orders this file brought over? Orders already here before, and new sales, are never touched.</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <SecondaryButton disabled={undo === "busy"} onClick={() => setUndo("")}>Keep them</SecondaryButton>
                  <PrimaryButton disabled={undo === "busy"} onClick={() => {
                    setUndo("busy");
                    removePastOrders(batch.current).then((n) => { setRemoved(n); setUndo("done"); onDone(); }).catch(() => setUndo("failed"));
                  }}>{undo === "busy" ? "Removing them…" : "Yes, remove them"}</PrimaryButton>
                </div>
              </div>
            ) : (
              <div>
                <GhostButton onClick={() => setUndo("confirm")}>Wrong file? Take this import back</GhostButton>
                {undo === "failed" && <p role="alert" className="rp-error-text" style={{ margin: "6px 0 0" }}>They couldn't be removed just now. Try again in a minute.</p>}
              </div>
            )
          )}
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
                      hint={suggested?.rates[code] ? `Bank of Canada average from ${dayWords(suggested.from)} to ${dayWords(suggested.to)}: ${suggested.rates[code]}.` : undefined}
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

/**
 * On a brought-over order's page (plan 23.15): takes back the whole run of Bring past orders over that added it, after
 * a second click. Orders made here are never touched (the server removes only `source: "import"` orders of that run).
 */
export function PastImportUndo({ batch, onRemoved }: { batch: string; onRemoved: (removed: number) => void }) {
  const [step, setStep] = useState<"" | "confirm" | "busy" | "failed">("");
  if (step === "confirm" || step === "busy") {
    return (
      <div className="rp-card rp-stack" style={{ padding: 16, gap: 8 }} role="group" aria-label="Remove this import">
        <p style={{ margin: 0 }}>Remove every past order brought over with this one, from the same file? Orders made in this shop are never touched, and you can bring the file again later.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <SecondaryButton disabled={step === "busy"} onClick={() => setStep("")}>Keep them</SecondaryButton>
          <PrimaryButton disabled={step === "busy"} onClick={() => {
            setStep("busy");
            removePastOrders(batch).then(onRemoved).catch(() => setStep("failed"));
          }}>{step === "busy" ? "Removing them…" : "Yes, remove them"}</PrimaryButton>
        </div>
      </div>
    );
  }
  return (
    <div>
      <GhostButton onClick={() => setStep("confirm")}>Wrong file? Remove this import</GhostButton>
      {step === "failed" && <p role="alert" className="rp-error-text" style={{ margin: "6px 0 0" }}>They couldn't be removed just now. Try again in a minute.</p>}
    </div>
  );
}
