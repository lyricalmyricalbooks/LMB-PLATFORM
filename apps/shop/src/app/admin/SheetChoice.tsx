import { useMemo } from "react";
import { parseCsv } from "./catalogImport";
import { SelectField } from "./riso/components";

/** Which sheet of a workbook to read, beside the chosen file's name (plan 23.37). Shows only when there is a choice. */
export function SheetChoice({ sheets, sheet, disabled, onChange }: {
  sheets: string[]; sheet: string; disabled?: boolean; onChange: (sheet: string) => void;
}) {
  if (sheets.length < 2) return null;
  return (
    <SelectField label="Sheet" hideLabel value={sheet} disabled={disabled} style={{ width: "auto", maxWidth: "100%" }}
      onChange={(e) => onChange(e.target.value)}>
      {sheets.map((name) => <option key={name} value={name}>Sheet: {name}</option>)}
    </SelectField>
  );
}

const SHOWN_ROWS = 4;
const cut = (v: string) => (v.length > 40 ? `${v.slice(0, 39)}…` : v);

/** The top of the file as it was read, folded away until asked for (plan 23.39): a quick check the right file came in. */
export function FirstRows({ text }: { text: string }) {
  const rows = useMemo(() => parseCsv(text.split(/\r?\n/).slice(0, 200).join("\n")).slice(0, SHOWN_ROWS), [text]);
  if (!rows.length) return null;
  const width = Math.max(...rows.map((r) => r.length));
  return (
    <details className="rp-first-rows">
      <summary className="rp-hint" style={{ cursor: "pointer" }}>First rows of the file</summary>
      <div style={{ overflowX: "auto", marginTop: 8, border: "var(--rp-hair) solid var(--rp-border)" }}>
        <table className="rp-mono" style={{ borderCollapse: "collapse", fontSize: "0.8125rem", whiteSpace: "nowrap" }}>
          <thead>
            <tr>{Array.from({ length: width }, (_, i) => <th key={i} scope="col" style={{ textAlign: "left", padding: "4px 8px", borderBottom: "var(--rp-hair) solid var(--rp-border)" }}>{cut(rows[0][i] ?? "")}</th>)}</tr>
          </thead>
          <tbody>
            {rows.slice(1).map((r, n) => (
              <tr key={n}>{Array.from({ length: width }, (_, i) => <td key={i} style={{ padding: "4px 8px" }}>{cut((r[i] ?? "").replace(/\s+/g, " "))}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
