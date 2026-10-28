// Book editor › Editions › Options (plan 10.2): sizes, colours or materials for a product sold in combinations.
// The press types up to three options and their choices, then "Make the editions" turns every combination into an
// edition below (src/shared/productOptions.ts `variantsForOptions`), keeping the price and stock of any edition that
// already had that combination. A book with plain editions never needs this card; leaving it empty changes nothing.
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { SectionCard, TextField } from "./riso/components";
import { MAX_OPTIONS, optionCombinations, optionProblems, productOptions, type ProductOption } from "../../shared/productOptions";

type Row = { name: string; values: string };

/** The editor's text rows → options (choices split on commas, tidied like the saved product). */
export function rowsToOptions(rows: Row[]): ProductOption[] {
  return productOptions({ options: rows.map((r) => ({ name: r.name, values: r.values.split(",") })) });
}

const rowsOf = (form: any): Row[] => productOptions(form).map((o) => ({ name: o.name, values: o.values.join(", ") }));

export function ProductOptionsEditor({ form, onApply, onClear }: {
  form: any;
  /** Make one edition per combination of these options. */
  onApply: (options: ProductOption[]) => void;
  /** Stop using options: the editions stay as a plain list. */
  onClear: () => void;
}) {
  const saved = productOptions(form);
  const [rows, setRows] = useState<Row[]>(() => rowsOf(form));
  // A different product (or a saved change from elsewhere) resets the rows.
  const savedKey = JSON.stringify(saved);
  useEffect(() => { setRows(rowsOf(form)); }, [savedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const options = rowsToOptions(rows);
  const problems = [
    ...rows.filter((r) => r.values.trim() && !r.name.trim()).map(() => "Give every option a name, such as Size or Colour."),
    ...optionProblems(options),
  ];
  const count = optionCombinations(options).length;
  const changed = JSON.stringify(options) !== savedKey;
  const update = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <SectionCard title="Options: size, colour and more"
      description="For anything sold in sizes, colours or materials. List the choices, then make the editions: every combination becomes an edition below with its own price, stock and photo. Leave this empty for a book with plain editions."
      actions={<button type="button" className="rp-btn rp-btn-secondary rp-btn-sm" disabled={rows.length >= MAX_OPTIONS}
        onClick={() => setRows([...rows, { name: rows.length ? "" : "Size", values: "" }])}><Plus size={14} aria-hidden /> Add option</button>}>
      {!rows.length && <p className="be-note">No options. Shoppers pick from the editions below, as they do today.</p>}
      {rows.map((row, i) => (
        <div key={i} className="be-grid be-grid-4" role="group" aria-label={`Option ${i + 1}`}>
          <TextField label="Option name" placeholder="e.g. Size" value={row.name} onChange={(e) => update(i, { name: e.target.value })} />
          <div className="be-span-2">
            <TextField label="Choices, separated by commas" placeholder="e.g. S, M, L, XL" value={row.values}
              onChange={(e) => update(i, { values: e.target.value })} />
          </div>
          <div style={{ alignSelf: "end" }}>
            <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}
              aria-label={`Remove option ${row.name || i + 1}`}><Trash2 size={13} aria-hidden /> Remove</button>
          </div>
        </div>
      ))}
      {problems.length > 0 && <ul className="be-note" role="alert">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      {(rows.length > 0 || saved.length > 0) && (
        <div className="be-inline-actions">
          {rows.length > 0 && (
            <button type="button" className="rp-btn rp-btn-primary rp-btn-sm" disabled={!!problems.length || !count || (!changed && saved.length > 0)}
              onClick={() => onApply(options)}>
              {saved.length ? "Update the editions" : "Make the editions"}{count ? ` (${count})` : ""}
            </button>
          )}
          {saved.length > 0 && (
            <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={() => { setRows([]); onClear(); }}>Stop using options</button>
          )}
          {changed && saved.length > 0 && <span className="be-note">Changes to the options apply when you update the editions.</span>}
        </div>
      )}
    </SectionCard>
  );
}
