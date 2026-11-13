// The rows of an import preview: the first 150 rows of the file, problems first, with what will happen to it. Shared by Books ›
// Import (BookImportDialog) and setup mode's Books page (code plan 18.7), which previews a file before the shop exists.
// No database here, so setup mode can show it.
import type { ImportPlan, ImportRow } from "./catalogImport";
import { StatusBadge, type BadgeTone } from "./riso/components";
import { useShopWords } from "./shopWords";

/**
 * A note about a row in this shop's words ("the book editor" is "the product editor" in a shop that sells other
 * things). What the file itself said, in “quotes” or (brackets), keeps its spelling: a title is never reworded.
 */
export const noteWords = (text: string, w: (t: string) => string): string =>
  text.split(/(“[^”]*”|\([^)]*\))/).map((part, i) => (i % 2 ? part : w(part))).join("");

/** The largest product file the importer reads (and setup mode keeps): a few thousand products. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const SHOWN_ROWS = 150;

const ACTION: Record<ImportRow["action"], { tone: BadgeTone; text: string }> = {
  create: { tone: "info", text: "New book (draft)" },
  update: { tone: "primary", text: "Update" },
  unchanged: { tone: "neutral", text: "No change" },
  error: { tone: "danger", text: "Won't import" },
};

const order = (row: ImportRow) => ({ error: 0, create: 1, update: 2, unchanged: 3 })[row.action];
const clip = (value: string) => (value.length > 80 ? `${value.slice(0, 77)}…` : value);

export function ImportPreviewRows({ plan }: { plan: ImportPlan }) {
  const w = useShopWords();
  const shown = [...plan.rows].sort((a, b) => order(a) - order(b)).slice(0, SHOWN_ROWS);
  return (
    <ol aria-label="Import preview" style={{ margin: 0, padding: 0, listStyle: "none", maxHeight: 380, overflow: "auto", borderTop: "1px solid var(--rp-border)" }}>
      {shown.map(row => (
        <li key={row.line} style={{ padding: "10px 0", borderBottom: "1px solid var(--rp-border)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span className="rp-mono rp-hint">Line {row.line}</span>
            <strong style={{ overflowWrap: "anywhere" }}>{row.title}</strong>
            <StatusBadge tone={ACTION[row.action].tone}>{w(ACTION[row.action].text)}</StatusBadge>
          </div>
          {(row.errors.length > 0 || row.warnings.length > 0 || (row.action === "update" && row.changes.length > 0)) && (
            <ul className="rp-hint" style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {row.errors.map(e => <li key={e} style={{ color: "var(--rp-danger)" }}>{noteWords(e, w)}</li>)}
              {row.action === "update" && row.changes.map(c => (
                <li key={c.field}>{c.label}: <span style={{ textDecoration: "line-through" }}>{clip(c.from) || "blank"}</span> → <strong>{clip(c.to)}</strong></li>
              ))}
              {row.warnings.map(text => <li key={text}>{noteWords(text, w)}</li>)}
            </ul>
          )}
        </li>
      ))}
      {plan.rows.length > SHOWN_ROWS && <li className="rp-hint" style={{ padding: "10px 0" }}>…and {plan.rows.length - SHOWN_ROWS} more rows.</li>}
    </ol>
  );
}
