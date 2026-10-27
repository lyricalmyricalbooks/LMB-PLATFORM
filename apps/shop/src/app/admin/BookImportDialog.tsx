import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { adminApi } from "./api";
import { importTemplateCsv, IMPORT_COLUMNS, planImport, type ImportPlan, type ImportRow } from "./catalogImport";
import { inventoryLinkApi } from "./inventoryLinkApi";
import { Dialog, PrimaryButton, SecondaryButton, SelectField, StatusBadge, type BadgeTone } from "./riso/components";
import { normalizeCategories } from "../features/site/navItems";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const SHOWN_ROWS = 150;

type Result = { line: number; title: string; ok: boolean; message?: string };

const ACTION: Record<ImportRow["action"], { tone: BadgeTone; text: string }> = {
  create: { tone: "info", text: "New book (draft)" },
  update: { tone: "primary", text: "Update" },
  unchanged: { tone: "neutral", text: "No change" },
  error: { tone: "danger", text: "Won't import" },
};

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

/**
 * Books › Import CSV: choose a file → preview every row's changes → import. Rows with problems are
 * skipped; new books arrive as drafts and are handed back (`onDone`) so the catalog can select them
 * for its Publish review.
 */
export function BookImportDialog({ books, onClose, onDone }: { books: any[]; onClose: () => void; onDone: (createdIds: string[]) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [readError, setReadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<Result[] | null>(null);

  const [stockMode, setStockMode] = useState<"leave" | "set">("leave");
  const [source, setSource] = useState<{ text: string; shopCategories: string[]; profiles: string[]; linkedBookIds: string[] } | null>(null);
  const work = plan ? plan.rows.filter(r => r.action === "create" || r.action === "update") : [];

  const replan = (src: typeof source, mode: "leave" | "set") => {
    if (src) setPlan(planImport(src.text, books, src.shopCategories, { stockMode: mode, shippingProfiles: src.profiles, linkedBookIds: src.linkedBookIds }));
  };

  async function choose(file: File | undefined) {
    if (!file) return;
    setReadError(""); setPlan(null); setResults(null); setFileName(file.name);
    if (file.size > MAX_FILE_BYTES) { setReadError("That file is larger than 5 MB. Split it into smaller files and import them one at a time."); return; }
    try {
      const [text, settings, profiles, links] = await Promise.all([file.text(), adminApi.getPublicSettings().catch(() => null), Promise.resolve().then(() => adminApi.getShippingProfiles()).catch(() => []), inventoryLinkApi.links().catch(() => ({}))]);
      const defined = (settings as any)?.design?.categories;
      const shopCategories = Array.isArray(defined) ? normalizeCategories(defined).map((c: any) => c?.name).filter(Boolean) : [];
      // Books counted in the inventory app keep the stock it sets (adminApi.updateBook enforces it too).
      const linkedBookIds = Object.entries(links as Record<string, Record<string, string>>).filter(([, e]) => !!e?.["_"]).map(([id]) => id);
      const src = { text, shopCategories, profiles: (profiles as any[]).map(p => p.id), linkedBookIds };
      setSource(src);
      replan(src, stockMode);
    } catch {
      setReadError("This file couldn't be read. Save it from your spreadsheet as CSV (comma separated) and try again.");
    }
  }

  async function run() {
    setBusy(true); setProgress(0);
    const byId = new Map(books.map(b => [b.id, b]));
    const done: Result[] = [];
    const created: string[] = [];
    // One at a time: a catalog of a few hundred books imports in seconds, and a failure stops nothing else.
    for (const row of work) {
      try {
        if (row.action === "create") {
          const saved = await adminApi.createBook(row.patch);
          created.push(saved.id);
        } else {
          const loaded = byId.get(row.bookId);
          await adminApi.updateBook(row.bookId!, { title: loaded?.title, ...row.patch }, loaded);
        }
        done.push({ line: row.line, title: row.title, ok: true });
      } catch (err: any) {
        done.push({ line: row.line, title: row.title, ok: false, message: err?.message || "Not saved" });
      }
      setProgress(done.length);
    }
    setResults(done);
    setBusy(false);
    onDone(created);
  }

  const failed = results?.filter(r => !r.ok) || [];
  const shown = plan ? [...plan.rows].sort((a, b) => order(a) - order(b)).slice(0, SHOWN_ROWS) : [];

  const footer = results
    ? <PrimaryButton onClick={onClose}>Done</PrimaryButton>
    : <>
        <SecondaryButton disabled={busy} onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton disabled={busy || !work.length} onClick={run}>
          {busy ? `Importing ${progress} of ${work.length}…` : work.length ? `Import ${work.length} book${work.length === 1 ? "" : "s"}` : "Nothing to import"}
        </PrimaryButton>
      </>;

  return (
    <Dialog open size="lg" onClose={() => { if (!busy) onClose(); }} title="Import books from a spreadsheet" footer={footer}
      description="Add new books or update many at once from a CSV file. You'll see every change before anything is saved.">
      <div className="rp-stack">
        {!results && <>
          <ul className="rp-hint" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Easiest: in Books, open <strong>⋯ More catalog actions › Export…</strong>, edit the file in Excel, Numbers or Google Sheets, save as CSV and import it here.</li>
            <li>Books are matched by <strong>ID</strong>, then <strong>ISBN</strong>, then <strong>SKU</strong>. Rows that match nothing become <strong>new draft books</strong>.</li>
            <li>A blank cell keeps what the book has now. To end a sale, type 0 in Sale price. Stock numbers are only written when you choose “Set stock to the file's numbers”. Extra image URLs are separated with “|”.</li>
            <li>Import never publishes. Publish new books from the catalog afterwards; it checks each one first.</li>
          </ul>
          <p className="rp-hint" style={{ margin: 0 }}>Columns it reads: {IMPORT_COLUMNS.map(c => c.label).join(", ")}. Categories are separated with “;”.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden aria-label="CSV file"
              onChange={e => { choose(e.target.files?.[0]); e.target.value = ""; }} />
            <PrimaryButton icon={<Upload size={16} aria-hidden />} disabled={busy} onClick={() => fileRef.current?.click()}>
              {fileName ? "Choose another file" : "Choose CSV file"}
            </PrimaryButton>
            <SecondaryButton size="sm" icon={<Download size={14} aria-hidden />} disabled={busy} onClick={() => download("books-import-template.csv", importTemplateCsv())}>
              Blank template
            </SecondaryButton>
            {fileName && <span className="rp-mono" style={{ overflowWrap: "anywhere" }}>{fileName}</span>}
          </div>
        </>}

        {readError && <p role="alert" className="rp-hint" style={{ color: "var(--rp-danger)", margin: 0 }}>{readError}</p>}

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
              {plan.ignoredColumns.length > 0 && <p className="rp-hint" style={{ margin: 0 }}>Ignored columns: {plan.ignoredColumns.join(", ")}.</p>}
              <ol aria-label="Import preview" style={{ margin: 0, padding: 0, listStyle: "none", maxHeight: 380, overflow: "auto", borderTop: "1px solid var(--rp-border)" }}>
                {shown.map(row => (
                  <li key={row.line} style={{ padding: "10px 0", borderBottom: "1px solid var(--rp-border)" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      <span className="rp-mono rp-hint">Line {row.line}</span>
                      <strong style={{ overflowWrap: "anywhere" }}>{row.title}</strong>
                      <StatusBadge tone={ACTION[row.action].tone}>{ACTION[row.action].text}</StatusBadge>
                    </div>
                    {(row.errors.length > 0 || row.warnings.length > 0 || (row.action === "update" && row.changes.length > 0)) && (
                      <ul className="rp-hint" style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                        {row.errors.map(e => <li key={e} style={{ color: "var(--rp-danger)" }}>{e}</li>)}
                        {row.action === "update" && row.changes.map(c => (
                          <li key={c.field}>{c.label}: <span style={{ textDecoration: "line-through" }}>{clip(c.from) || "blank"}</span> → <strong>{clip(c.to)}</strong></li>
                        ))}
                        {row.warnings.map(w => <li key={w}>{w}</li>)}
                      </ul>
                    )}
                  </li>
                ))}
                {plan.rows.length > SHOWN_ROWS && <li className="rp-hint" style={{ padding: "10px 0" }}>…and {plan.rows.length - SHOWN_ROWS} more rows.</li>}
              </ol>
            </div>)}

        {results && <div className="rp-stack" role="status">
          <StatusBadge tone={failed.length ? "warning" : "success"}>
            {results.length - failed.length} of {results.length} saved{failed.length ? ` · ${failed.length} not saved` : ""}
          </StatusBadge>
          {failed.length > 0 && <ul className="rp-hint" style={{ margin: 0, paddingLeft: 18 }}>
            {failed.map(r => <li key={r.line}>Line {r.line} · {r.title}: {r.message}. Import the file again to retry; rows already saved show as unchanged.</li>)}
          </ul>}
          {(plan?.counts.create || 0) > 0 && <p className="rp-hint" style={{ margin: 0 }}>New books are drafts and are now selected in the catalog. Choose <strong>Publish</strong> to review and put them on sale.</p>}
        </div>}
      </div>
    </Dialog>
  );
}

const order = (row: ImportRow) => ({ error: 0, create: 1, update: 2, unchanged: 3 })[row.action];
const clip = (value: string) => (value.length > 80 ? `${value.slice(0, 77)}…` : value);
