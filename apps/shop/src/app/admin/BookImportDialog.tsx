import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { adminApi } from "./api";
import { IMPORT_COLUMNS, MATCHABLE_COLUMNS, parseCsv, type ImportField, type ImportPlan } from "./catalogImport";
import { ImportPreviewRows, MAX_FILE_BYTES } from "./importPreview";
import { importRedirects, oldLinksMessage, planShopMove, SHAPE_WORDS, type ProductMove } from "./shopMove";
import { inventoryLinkApi } from "./inventoryLinkApi";
import { OldShopAddressForm } from "./OldShopAddressForm";
import { readOldShopAddress } from "./oldShopApi";
import { photoCheckLine, useBrokenPhotos, withoutBrokenPhotos } from "./photoLinks";
import { Dialog, PrimaryButton, SecondaryButton, SelectField, StatusBadge } from "./riso/components";
import { normalizeCategories } from "../features/site/navItems";
import { sellsBooks } from "./sells";
import { useShopSells } from "./shopWords";
import { useShopWords } from "./shopWords";
import { SPREADSHEET_ACCEPT, readProblem, readSpreadsheet, type SpreadsheetRead } from "./spreadsheetFile";
import { FirstRows, SheetChoice } from "./SheetChoice";
import { XLSX_TYPE, saveFile, toXlsx } from "./xlsxWriter";
import { rememberColumns, rememberedColumns } from "./columnMemory";
import { GoogleSheetLink } from "./GoogleSheetLink";


type Result = { line: number; title: string; ok: boolean; message?: string };
type LinkResult = { added: number; skipped: number; full: number; failed: boolean };


/**
 * Books › Import CSV: choose a file → preview every row's changes → import. Rows with problems are
 * skipped; new books arrive as drafts and are handed back (`onDone`) so the catalog can select them
 * for its Publish review.
 */
export function BookImportDialog({ books, onClose, onDone, initialFile }: {
  books: any[];
  onClose: () => void;
  onDone: (createdIds: string[]) => void;
  /** A file to read as soon as the dialog opens, e.g. the one the press kept in setup (code plan 18.9). */
  initialFile?: File;
}) {
  const w = useShopWords();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [filePlan, setPlan] = useState<ImportPlan | null>(null);
  // Plan 23.3: photos that can't be loaded from the old shop are left out of what is saved, each book saying so.
  const photoCheck = useBrokenPhotos(filePlan);
  const plan = useMemo(() => (filePlan ? withoutBrokenPhotos(filePlan, photoCheck.broken) : null), [filePlan, photoCheck.broken]);
  // Set when the file is an export from another shop (plan 3.1): it was read and translated first.
  const [moved, setMoved] = useState<ProductMove | null>(null);
  const [oldPaths, setOldPaths] = useState<Map<number, string[]>>(new Map());
  const [links, setLinks] = useState<LinkResult | null>(null);
  const [readError, setReadError] = useState("");
  /** What reading an old shop's address had to say (plan 23.11), shown with the preview. */
  const [readNotes, setReadNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<Result[] | null>(null);

  const [stockMode, setStockMode] = useState<"leave" | "set">("leave");
  // The owner's matches for columns the shop didn't recognise (plan 23.36), by heading.
  const [book, setBook] = useState<{ file: File } & SpreadsheetRead | null>(null);
  const [columns, setColumns] = useState<Record<string, ImportField>>({});
  // A shop that doesn't sell books keeps the old shop's sizes and colours as option buttons (plan 10.6).
  const keepOptions = !sellsBooks(useShopSells());
  const [source, setSource] = useState<{ text: string; shopCategories: string[]; profiles: string[]; linkedBookIds: string[] } | null>(null);
  // The first value under each heading, shown under its Match columns choice.
  const samples = useMemo(() => {
    const table = source ? parseCsv(source.text.split(/\r?\n/).slice(0, 60).join("\n")) : [];
    const out: Record<string, string> = {};
    (table[0] || []).forEach((h, i) => {
      const value = table.slice(1).map((r) => (r[i] ?? "").trim()).find(Boolean);
      if (value) out[h.trim()] = value.length > 40 ? `${value.slice(0, 39)}…` : value;
    });
    return out;
  }, [source]);
  const work = plan ? plan.rows.filter(r => r.action === "create" || r.action === "update") : [];

  const replan = (src: typeof source, mode: "leave" | "set", cols = columns) => {
    if (!src) return;
    const next = planShopMove(src.text, books, src.shopCategories, { stockMode: mode, shippingProfiles: src.profiles, linkedBookIds: src.linkedBookIds, columns: cols }, { keepOptions });
    setPlan(next.plan); setMoved(next.moved); setOldPaths(next.oldPaths);
    return next.plan;
  };
  // How many of the matches came from the last import (plan 23.41), for the Match columns hint.
  const [recalled, setRecalled] = useState(0);

  async function choose(file: File | undefined, notes: string[] = [], sheet?: string) {
    if (!file) return;
    setReadNotes(notes);
    setReadError(""); setPlan(null); setMoved(null); setOldPaths(new Map()); setLinks(null); setResults(null); setFileName(file.name); if (!sheet) setBook(null);
    if (file.size > MAX_FILE_BYTES) { setReadError("That file is larger than 5 MB. Split it into smaller files and import them one at a time."); return; }
    try {
      const [text, settings, profiles, links] = await Promise.all([readSpreadsheet(file, sheet), adminApi.getPublicSettings().catch(() => null), Promise.resolve().then(() => adminApi.getShippingProfiles()).catch(() => []), inventoryLinkApi.links().catch(() => ({}))]);
      setBook({ file, ...text });
      const defined = (settings as any)?.design?.categories;
      const shopCategories = Array.isArray(defined) ? normalizeCategories(defined).map((c: any) => c?.name).filter(Boolean) : [];
      // Books counted in the inventory app keep the stock it sets (adminApi.updateBook enforces it too).
      const linkedBookIds = Object.entries(links as Record<string, Record<string, string>>).filter(([, e]) => !!e?.["_"]).map(([id]) => id);
      const src = { text: text.text, shopCategories, profiles: (profiles as any[]).map(p => p.id), linkedBookIds };
      setSource(src);
      // Headings matched in an earlier import are matched the same way again (plan 23.41).
      const first = replan(src, stockMode, {});
      const recalledCols = rememberedColumns(first?.unknownColumns ?? []);
      const count = Object.keys(recalledCols).length;
      setColumns(recalledCols); setRecalled(count);
      if (count) replan(src, stockMode, recalledCols);
    } catch (err) {
      setReadError(readProblem(err));
    }
  }

  // Read once, when the dialog opens with a file already in hand; choosing another file works as usual.
  useEffect(() => { if (initialFile) void choose(initialFile); }, []);

  async function run() {
    setBusy(true); setProgress(0);
    if (plan?.unknownColumns?.length) rememberColumns(plan.unknownColumns, columns);
    const byId = new Map(books.map(b => [b.id, b]));
    const done: Result[] = [];
    const created: string[] = [];
    // Plan 3.2: each saved book's old shop addresses, so old product links keep working.
    const linked: { oldPaths: string[]; bookId: string }[] = [];
    // One at a time: a catalog of a few hundred books imports in seconds, and a failure stops nothing else.
    for (const row of work) {
      try {
        if (row.action === "create") {
          const saved = await adminApi.createBook(row.patch);
          created.push(saved.id);
          if (oldPaths.has(row.line)) linked.push({ oldPaths: oldPaths.get(row.line)!, bookId: saved.id });
        } else {
          const loaded = byId.get(row.bookId);
          await adminApi.updateBook(row.bookId!, { title: loaded?.title, ...row.patch }, loaded);
          if (oldPaths.has(row.line)) linked.push({ oldPaths: oldPaths.get(row.line)!, bookId: row.bookId! });
        }
        done.push({ line: row.line, title: row.title, ok: true });
      } catch (err: any) {
        done.push({ line: row.line, title: row.title, ok: false, message: err?.message || "Not saved" });
      }
      setProgress(done.length);
    }
    // Books that were already up to date still get their old links.
    for (const row of plan?.rows || []) if (row.action === "unchanged" && row.bookId && oldPaths.has(row.line)) linked.push({ oldPaths: oldPaths.get(row.line)!, bookId: row.bookId });
    if (linked.length) {
      try {
        const next = importRedirects(await adminApi.getRedirects(), linked);
        if (next.added.length) {
          await adminApi.saveRedirects(next.items);
          await adminApi.recordAuditLog("catalog", `Old shop links: ${next.added.length} now lead to the imported books`).catch(() => {});
        }
        setLinks({ added: next.added.length, skipped: next.skipped.length - next.full, full: next.full, failed: false });
      } catch {
        setLinks({ added: 0, skipped: 0, full: 0, failed: true });
      }
    }
    setResults(done);
    setBusy(false);
    onDone(created);
  }

  const failed = results?.filter(r => !r.ok) || [];

  const footer = results
    ? <PrimaryButton onClick={onClose}>Done</PrimaryButton>
    : <>
        <SecondaryButton disabled={busy} onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton disabled={busy || !work.length} onClick={run}>
          {busy ? `Importing ${progress} of ${work.length}…` : work.length ? `Import ${work.length} book${work.length === 1 ? "" : "s"}` : "Nothing to import"}
        </PrimaryButton>
      </>;

  return (
    <Dialog open size="lg" onClose={() => { if (!busy) onClose(); }} title={w("Import books from a spreadsheet")} footer={footer}
      description={w("Add new books or update many at once from a spreadsheet: Excel, CSV and LibreOffice files all work. You'll see every change before anything is saved.")}>
      <div className="rp-stack">
        {!results && <>
          {/* Once a file is chosen, the how-to and the address box step aside so the preview sits near the top. */}
          {!fileName && <>
          <ul className="rp-hint" style={{ margin: 0, paddingLeft: 18 }}>
            <li>{w("Easiest: in Books, open")} <strong>⋯ More catalog actions › Export…</strong>, edit the file in Excel, Numbers or Google Sheets and import it back here, as Excel or CSV.</li>
            <li>{w("Books are matched by")} <strong>ID</strong>, then <strong>ISBN</strong>, then <strong>SKU</strong>. Rows that match nothing become <strong>{w("new draft books")}</strong>.</li>
            <li>{w("A blank cell keeps what the book has now. To end a sale, type 0 in Sale price. Stock numbers are only written when you choose “Set stock to the file's numbers”. Extra image URLs are separated with “|”.")}</li>
            <li>{w("Import never publishes. Publish new books from the catalog afterwards; it checks each one first.")}</li>
            <li><strong>Bring your shop with you:</strong> {w("choose the product export from your old shop as it is. Books, photos and editions come over as new drafts.")}</li>
          </ul>
          <p className="rp-hint" style={{ margin: 0 }}>Columns it reads: {IMPORT_COLUMNS.map(c => c.label).join(", ")}. Categories are separated with “;”.</p>
          </>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <input ref={fileRef} type="file" accept={SPREADSHEET_ACCEPT} hidden aria-label="Spreadsheet file"
              onChange={e => { choose(e.target.files?.[0]); e.target.value = ""; }} />
            <PrimaryButton icon={<Upload size={16} aria-hidden />} disabled={busy} onClick={() => fileRef.current?.click()}>
              {fileName ? "Choose another file" : "Choose a file"}
            </PrimaryButton>
            <SecondaryButton size="sm" icon={<Download size={14} aria-hidden />} disabled={busy} onClick={() => saveFile("books-import-template.xlsx", toXlsx([IMPORT_COLUMNS.map(c => c.label)], "Books"), XLSX_TYPE)}>
              Blank template
            </SecondaryButton>
            <GoogleSheetLink disabled={busy} onFile={(f) => void choose(f)} />
            {fileName && <span className="rp-mono" style={{ overflowWrap: "anywhere" }}>{fileName}</span>}
            {book && <SheetChoice sheets={book.sheets} sheet={book.sheet} disabled={busy} onChange={(s) => choose(book.file, readNotes, s)} />}
          </div>
          {book && <FirstRows text={book.text} />}
          {/* Plan 23.11: the same address box as setup's Books page, for products found after the shop opened. */}
          {!fileName && <div className="rp-stack" style={{ borderTop: "var(--rp-hair) solid var(--rp-border)", paddingTop: 12 }}>
            <p className="rp-hint" style={{ margin: 0 }}>{w("Or bring your books straight from your old shop's web address: no file needed.")}</p>
            <OldShopAddressForm read={readOldShopAddress} onRead={choose} disabled={busy} primary={false} />
          </div>}
        </>}

        {readError && <p role="alert" className="rp-hint" style={{ color: "var(--rp-danger)", margin: 0 }}>{readError}</p>}

        {plan && !results && !moved && (plan.unknownColumns?.length ?? 0) > 0 && (
          <ColumnMatch unknown={plan.unknownColumns!} samples={samples} chosen={columns} used={plan.matchedFields ?? []} disabled={busy} recalled={recalled}
            onChange={(next) => { setColumns(next); setRecalled(0); replan(source, stockMode, next); }} />
        )}

        {plan && !results && (plan.problems.length
          ? <div role="alert" className="rp-stack">
              <StatusBadge tone="danger">Nothing can be imported from this file</StatusBadge>
              <ul className="rp-hint" style={{ margin: 0, paddingLeft: 18 }}>{plan.problems.map(p => <li key={p}>{p}</li>)}</ul>
            </div>
          : <div className="rp-stack">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} aria-live="polite">
                <StatusBadge tone="info">{plan.counts.create} new</StatusBadge>
                <StatusBadge tone="primary">{plan.counts.update} to update</StatusBadge>
                <StatusBadge tone="neutral">{plan.counts.unchanged} unchanged</StatusBadge>
                {plan.counts.error > 0 && <StatusBadge tone="danger">{plan.counts.error} with problems (skipped)</StatusBadge>}
              </div>
              <SelectField label="Stock numbers in the file" value={stockMode} disabled={busy}
                hint="Sales since the file was exported would be undone by its stock numbers, so they are only used when you choose to."
                onChange={e => { const mode = e.target.value as "leave" | "set"; setStockMode(mode); replan(source, mode); }}>
                <option value="leave">Leave stock unchanged (show differences only)</option>
                <option value="set">Set stock to the file's numbers</option>
              </SelectField>
              {moved && <p className="rp-hint" style={{ margin: 0 }}>Read as {SHAPE_WORDS[moved.shape]}: {moved.books.length} product{moved.books.length === 1 ? "" : "s"}. Line numbers are the old file's.</p>}
              {moved && oldPaths.size > 0 && <p className="rp-hint" style={{ margin: 0 }}>{w("Links to these books on your old shop will open them here once your address points at this shop. They are added to Settings › General › URL redirects.")}</p>}
              {photoCheckLine(photoCheck) && <p className="rp-hint" role="status" style={{ margin: 0 }}>{w(photoCheckLine(photoCheck))}</p>}
              {readNotes.map(n => <p key={n} className="rp-hint" style={{ margin: 0 }}>{w(n)}</p>)}
              {moved && moved.notices.map(n => <p key={n} className="rp-hint" style={{ margin: 0 }}>{n}</p>)}
              <ImportPreviewRows plan={plan} />
            </div>)}

        {results && <div className="rp-stack" role="status">
          <StatusBadge tone={failed.length ? "warning" : "success"}>
            {results.length - failed.length} of {results.length} saved{failed.length ? ` · ${failed.length} not saved` : ""}
          </StatusBadge>
          {failed.length > 0 && <ul className="rp-hint" style={{ margin: 0, paddingLeft: 18 }}>
            {failed.map(r => <li key={r.line}>Line {r.line} · {r.title}: {r.message}. Import the file again to retry; rows already saved show as unchanged.</li>)}
          </ul>}
          {links && <p className="rp-hint" style={{ margin: 0 }}>
            {oldLinksMessage(links)}
          </p>}
          {(plan?.counts.create || 0) > 0 && <p className="rp-hint" style={{ margin: 0 }}>{w("New books are drafts and are now selected in the catalog. Choose")} <strong>Publish</strong> to review and put them on sale.</p>}
        </div>}
      </div>
    </Dialog>
  );
}

/**
 * Columns the shop didn't recognise (plan 23.36): each can be matched to a field, so a spreadsheet with its own
 * headings ("Cost to buyer", "Writer") still fills in prices and authors. Left as "Leave out", it is skipped.
 */
function ColumnMatch({ unknown, samples, chosen, used, disabled, recalled = 0, onChange }: {
  unknown: string[]; samples: Record<string, string>; chosen: Record<string, ImportField>; used: ImportField[]; disabled: boolean; recalled?: number;
  onChange: (next: Record<string, ImportField>) => void;
}) {
  const matched = unknown.filter((h) => chosen[h]).length;
  return (
    <section className="rp-stack" aria-label="Match columns" style={{ gap: 8, borderTop: "var(--rp-hair) solid var(--rp-border)", paddingTop: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline", justifyContent: "space-between" }}>
        <strong>Match columns</strong>
        <span className="rp-hint">{matched} of {unknown.length} matched{recalled > 0 ? ", as last time" : ""}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))", gap: 8 }}>
        {unknown.map((heading) => (
          <SelectField key={heading} label={heading} value={chosen[heading] ?? ""} disabled={disabled}
            hint={samples[heading] ? `e.g. ${samples[heading]}` : undefined}
            onChange={(e) => {
              const next = { ...chosen };
              if (e.target.value) next[heading] = e.target.value as ImportField; else delete next[heading];
              onChange(next);
            }}>
            <option value="">Leave out</option>
            {MATCHABLE_COLUMNS.filter((c) => c.field === chosen[heading] || !used.includes(c.field)).map((c) => (
              <option key={c.field} value={c.field}>{c.label}</option>
            ))}
          </SelectField>
        ))}
      </div>
    </section>
  );
}
