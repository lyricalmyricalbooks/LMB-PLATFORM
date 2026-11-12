// Bookkeeping › Receipts (mockup, 12 November 2026): two tiles (receipts filed, expenses that need one), filter pills
// and one card per expense of the year with where its receipt stands. Business expenses missing one get Attach receipt
// and No receipt needed; a book's own costs keep theirs on the book. Figures from expensesModel (moneyReports.ts).
import { useMemo, useRef, useState } from "react";
import { fmt } from "@stockroom/money.js";

import { EmptyState, GhostButton } from "../riso/components";
import { useShopWords } from "../shopWords";
import { expensesModel, type ExpenseLine } from "./moneyReports";
import { setNoReceiptNeeded } from "./taxLedger";
import { AttachReceiptButton, defaultUpload, useLineSave, type Upload } from "./lineSave";
import type { SaveNote } from "./saveTaxCenter";
import type { StockroomRecords } from "./stockroomData";

type Row = Record<string, any>;
type Filter = "all" | "needs" | "filed" | "over";
const FILTERS: Array<[Filter, string]> = [["all", "All"], ["needs", "Needs receipt"], ["filed", "Filed"], ["over", "Over $50"]];

/** What a card counts in the base currency (its own amount when no rate is saved yet). */
const baseOf = (l: ExpenseLine) => (l.baseAmount != null ? l.baseAmount : l.amount);

/** The year's receipt figures and the cards a filter shows. Pure. */
export function receiptsModel(lines: ExpenseLine[], year: string) {
  const inYear = lines.filter((l) => l.date.startsWith(year));
  const counted = inYear.filter((l) => l.receipt !== "exempt");
  const needs = inYear.filter((l) => l.receipt === "missing");
  const filed = inYear.filter((l) => l.receipt === "attached");
  const pick = (f: Filter) => (f === "needs" ? needs : f === "filed" ? filed : f === "over" ? inYear.filter((l) => baseOf(l) > 50) : inYear);
  return { inYear, filedCount: filed.length, countedCount: counted.length, needsCount: needs.length, needsWorth: needs.reduce((s, l) => s + baseOf(l), 0), pick };
}

const TAG = { attached: ["Filed", "mint"], missing: ["Needs receipt", "apricot"], exempt: ["Not needed", "plain"], reference: ["Reference on file", "plain"] } as const;

function MissingButtons({ line, onSaved, onNote, upload }: { line: ExpenseLine; onSaved: (tc: Row) => void; onNote: (n: SaveNote) => void; upload: Upload }) {
  const { busy, run, attach } = useLineSave(onSaved, onNote);
  return (
    <span className="rp-rc-actions">
      <AttachReceiptButton desc={line.desc} busy={busy} onFile={(f) => void attach(line.id, f, upload)} />
      <GhostButton size="sm" disabled={busy} aria-label={`${line.desc || "This expense"} needs no receipt`}
        onClick={() => void run((tc) => setNoReceiptNeeded(tc, line.id, true), "Marked as needing no receipt.")}>No receipt needed</GhostButton>
    </span>
  );
}

/** "Drop receipts here": a receipt photo dropped or picked opens Log expense with the photo read (receiptRead.ts). */
function DropZone({ onPhoto }: { onPhoto: (file: File) => void }) {
  const picker = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const take = (f: File | undefined) => { if (f && f.type.startsWith("image/")) onPhoto(f); };
  return (
    <button type="button" className="rp-rc-drop" data-over={over || undefined} onClick={() => picker.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files?.[0]); }}>
      <strong>Drop a receipt photo here</strong>
      <span>We read the shop, date and amount for you.</span>
      <input ref={picker} type="file" accept="image/*" hidden aria-label="Receipt photo" onChange={(e) => { take(e.target.files?.[0]); e.target.value = ""; }} />
    </button>
  );
}

export function ReceiptsGrid({ records, year, onSaved, upload = defaultUpload, onPhoto }: {
  records: StockroomRecords; year: string; onSaved?: (taxCenter: Row) => void; upload?: Upload;
  /** Opens Log expense with a receipt photo to read; no drop zone without it. */ onPhoto?: (file: File) => void;
}) {
  const w = useShopWords();
  const model = useMemo(() => receiptsModel(expensesModel(records).lines, year), [records, year]);
  const base = String(((records.taxCenter || {}) as Row).settings?.baseCurrency || "CAD");
  const [filter, setFilter] = useState<Filter>("all");
  const [note, setNote] = useState<SaveNote | null>(null);
  const cards = model.pick(filter);
  return (
    <div className="rp-rc">
      <div className="rp-rc-tiles" data-drop={onPhoto ? "" : undefined}>
        {onPhoto && <DropZone onPhoto={onPhoto} />}
        <div className="rp-tax-tile" data-tone="sky">
          <p className="rp-tax-tile-label">Receipts filed</p>
          <p className="rp-tax-tile-value">{model.filedCount}</p>
          <p className="rp-tax-tile-foot">of {model.countedCount} {model.countedCount === 1 ? "expense" : "expenses"} in {year}</p>
        </div>
        <div className="rp-tax-tile" data-tone="apricot">
          <p className="rp-tax-tile-label">Need a receipt</p>
          <p className="rp-tax-tile-value">{model.needsCount}</p>
          <p className="rp-tax-tile-foot">{model.needsCount ? `Worth about ${fmt(model.needsWorth, base)}` : "Nothing missing"}</p>
        </div>
      </div>
      <div className="rp-rc-filters" role="group" aria-label="Show">
        {FILTERS.map(([id, label]) => (
          <button key={id} type="button" className="rp-page-tab" aria-current={filter === id ? "page" : undefined} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
      {note && <p className="rp-sr-save" data-tone={note.tone} role={note.tone === "error" ? "alert" : "status"}>{note.text}</p>}
      {cards.length ? (
        <ul className="rp-rc-grid">
          {cards.map((l) => {
            const [word, tone] = TAG[l.receipt];
            return (
              <li key={l.key} className="rp-rc-card">
                <div className="rp-rc-thumb" aria-hidden="true">{l.receipt === "attached" ? `Receipt${l.receiptCount > 1 ? ` ×${l.receiptCount}` : ""}` : "—"}</div>
                <div className="rp-rc-head">
                  <strong>{l.desc || "(no description)"}</strong>
                  <span className="rp-rc-amount">{fmt(l.amount, l.currency)}</span>
                </div>
                <span className="rp-rc-meta">{[l.date, l.cat, l.scope === "item" ? l.itemTitle : ""].filter(Boolean).join(" · ")}</span>
                <span className="rp-rc-tag" data-tone={tone}>{word}</span>
                {l.receipt === "missing" && l.scope === "business" && onSaved && <MissingButtons line={l} onSaved={onSaved} onNote={setNote} upload={upload} />}
                {l.receipt === "missing" && l.scope === "item" && <span className="rp-rc-meta">{w("Attach it on the book's own page.")}</span>}
              </li>
            );
          })}
        </ul>
      ) : <EmptyState inline title={model.inYear.length ? "Nothing matches" : `No expenses in ${year}`} />}
    </div>
  );
}
