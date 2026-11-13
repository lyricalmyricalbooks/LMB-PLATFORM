// Inventory › Count stock (v4 mockup 1k): expected / counted (− and + or type it) / difference, three facts on top and
// one status bar. Finish count is blocked until every row is counted; Save for later keeps the counts in this browser.
// After finishing, the difference report: what changed, by how many, and its value at cost, with a spreadsheet download.
import { useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { PageHead, SecondaryButton, PrimaryButton } from "./riso/components";
import { toCsv } from "./spreadsheetFile";
import { StatusBar } from "./riso/FormKit";
import { countReport, countReportRows, countStatus, countSummary, differenceText, readCountSession, writeCountSession, type CountReport, type Counts } from "./stockCount";

export type CountItem = { id: string; title: string; sub?: string; cover?: string | null; expected: number; cost?: number };

const startedText = (t: number) => new Date(t).toLocaleString("en-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function CountStock({ items, onFinish, onClose, money = (n: number) => n.toFixed(2) }: {
  items: CountItem[];
  /** Applies the changes; resolves to the ids that could not be saved (empty when all went through). */
  onFinish: (changes: { id: string; from: number; to: number }[]) => Promise<string[] | null>;
  onClose: () => void;
  /** How the shop writes an amount (its own currency). */
  money?: (n: number) => string;
}) {
  const [session] = useState(() => readCountSession() || { startedAt: Date.now(), counts: {} as Counts });
  const known = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const [counts, setCounts] = useState<Counts>(() => Object.fromEntries(Object.entries(session.counts).filter(([id]) => known.has(id))));
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [report, setReport] = useState<{ at: number; data: CountReport } | null>(null);
  const summary = countSummary(items, counts);
  const status = countStatus(summary);
  const setCount = (id: string, n: number | undefined) => { setNote(""); setCounts((c) => { const next = { ...c }; if (n === undefined) delete next[id]; else next[id] = Math.max(0, n); return next; }); };
  const shown = q.trim() ? items.filter((i) => `${i.title} ${i.sub || ""}`.toLowerCase().includes(q.trim().toLowerCase())) : items;

  const later = () => { writeCountSession(summary.counted ? { startedAt: session.startedAt, counts } : null); onClose(); };
  const finish = async () => {
    setBusy(true); setNote("");
    const failed = await onFinish(summary.changes);
    setBusy(false);
    if (failed === null) return; // the owner stepped back (e.g. from the restock emails question)
    if (failed.length) {
      setNote(`${failed.length} could not be saved, so ${failed.length === 1 ? "it is" : "they are"} still here. Try Finish count again.`);
      writeCountSession({ startedAt: session.startedAt, counts });
      return;
    }
    writeCountSession(null);
    if (!summary.counted) { onClose(); return; }
    setReport({ at: Date.now(), data: countReport(items, summary.changes, summary.counted) });
  };

  if (report) return <CountReportView report={report.data} at={report.at} money={money} onDone={onClose} />;

  return (
    <>
      <PageHead title="Count stock" description={`Shelf check · started ${startedText(session.startedAt)}`} back={{ label: "Inventory", onClick: later }} />
      <div className="rp-fk-facts">
        <div><span>Counted</span><b>{summary.counted} / {summary.total}</b></div>
        <div><span>Differences</span><b>{summary.differences}</b></div>
        <div><span>Net change</span><b>{summary.net > 0 ? "+" : summary.net < 0 ? "−" : ""}{Math.abs(summary.net)}</b></div>
      </div>
      <div className="rp-fk-card rp-count">
        <label className="rp-count-search">
          <span className="rp-sr-only">Find an item</span>
          <input type="search" placeholder="Find an item" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="rp-count-head" aria-hidden><span>Item</span><span>Expected</span><span>Counted</span><span>Difference</span></div>
        <ul className="rp-count-rows" aria-label="Items to count">
          {shown.map((it) => {
            const n = counts[it.id];
            const diff = differenceText(it.expected, n);
            const tone = n === undefined ? "none" : n === it.expected ? "good" : "warn";
            return (
              <li key={it.id} className="rp-count-row">
                <span className="rp-count-item">
                  <span className="rp-count-cover" aria-hidden>{it.cover ? <img src={it.cover} alt="" loading="lazy" decoding="async" /> : it.title.slice(0, 1)}</span>
                  <span><b>{it.title}</b>{it.sub && <span className="rp-count-sub">{it.sub}</span>}</span>
                </span>
                <span className="rp-count-expected"><span className="rp-count-label">Expected </span>{it.expected}</span>
                <span className="rp-count-step">
                  {n === undefined
                    ? <button type="button" className="rp-count-start" onClick={() => setCount(it.id, it.expected)} aria-label={`Start counting ${it.title}`}>Start counting</button>
                    : <>
                        <button type="button" className="rp-count-btn" onClick={() => setCount(it.id, n - 1)} disabled={n <= 0} aria-label={`One fewer ${it.title}`}><Minus size={18} aria-hidden /></button>
                        <input inputMode="numeric" aria-label={`Counted ${it.title}`} value={n}
                          onChange={(e) => { const v = e.target.value.trim(); setCount(it.id, v === "" ? 0 : /^\d+$/.test(v) ? Number(v) : n); }} />
                        <button type="button" className="rp-count-btn" onClick={() => setCount(it.id, n + 1)} aria-label={`One more ${it.title}`}><Plus size={18} aria-hidden /></button>
                      </>}
                </span>
                <span className="rp-count-diff"><span className="rp-count-chip" data-tone={tone}>{diff}</span></span>
              </li>
            );
          })}
          {shown.length === 0 && <li className="rp-fk-hint" style={{ padding: "12px 0" }}>{items.length ? `Nothing matches “${q.trim()}”.` : "Nothing here keeps a stock count yet. Items counted in the inventory app are counted there."}</li>}
        </ul>
      </div>
      {note && <p className="rp-fk-hint" data-error="" role="alert" style={{ marginTop: 12 }}>{note}</p>}
      <StatusBar status={{ tone: status.tone, text: status.text }} primaryLabel="Finish count" busy={busy} blocked={status.blocked}
        onBlocked={() => setNote("Count every item first. Start counting on a row sets it to what is expected; then change it to what is on the shelf.")}
        onPrimary={() => void finish()} cancelLabel="Save for later" onCancel={later} />
    </>
  );
}

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;

/** After Finish count: the differences, biggest loss first, with their value at cost price. */
function CountReportView({ report, at, money, onDone }: { report: CountReport; at: number; money: (n: number) => string; onDone: () => void }) {
  const day = new Date(at).toISOString().slice(0, 10);
  const download = () => {
    const url = URL.createObjectURL(new Blob([toCsv(countReportRows(report, day))], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `stock-count-${day}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <>
      <PageHead title="Count report" description={`Counted ${startedText(at)}`} back={{ label: "Inventory", onClick: onDone }} />
      <div className="rp-fk-facts">
        <div><span>Matched</span><b>{report.matched}</b></div>
        <div><span>Missing</span><b>{report.missing}{report.valueMissing ? <small> · {money(report.valueMissing)}</small> : null}</b></div>
        <div><span>Found</span><b>{report.found}{report.valueFound ? <small> · {money(report.valueFound)}</small> : null}</b></div>
      </div>
      <div className="rp-fk-card rp-count">
        {report.rows.length === 0
          ? <p className="rp-fk-hint" style={{ padding: "12px 0" }}>Everything on the shelf matched. Nothing was changed.</p>
          : <>
              <div className="rp-count-head" aria-hidden><span>Item</span><span>Was</span><span>Now</span><span>Difference</span></div>
              <ul className="rp-count-rows" aria-label="Differences">
                {report.rows.map((r) => (
                  <li key={r.id} className="rp-count-row">
                    <span className="rp-count-item"><span><b>{r.title}</b>{r.sub && <span className="rp-count-sub">{r.sub}</span>}</span></span>
                    <span className="rp-count-expected"><span className="rp-count-label">Was </span>{r.from}</span>
                    <span className="rp-count-step rp-count-now"><span className="rp-count-label">Now </span>{r.to}</span>
                    <span className="rp-count-diff"><span className="rp-count-chip" data-tone="warn">{signed(r.diff)}{r.value !== null ? ` · ${money(Math.abs(r.value))}` : ""}</span></span>
                  </li>
                ))}
              </ul>
              {report.noCost > 0 && <p className="rp-fk-hint">{`${report.noCost} ${report.noCost === 1 ? "item has" : "items have"} no cost price, so ${report.noCost === 1 ? "its" : "their"} value isn't counted.`}</p>}
            </>}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        {report.rows.length > 0 && <SecondaryButton onClick={download}>Download report</SecondaryButton>}
        <PrimaryButton onClick={onDone}>Done</PrimaryButton>
      </div>
    </>
  );
}
