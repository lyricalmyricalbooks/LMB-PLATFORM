// Book editor › Editions › Options (plan 10.2): sizes, colours or materials for a product sold in combinations.
// The press types up to three options and their choices, then "Make the editions" turns every combination into an
// edition below (src/shared/productOptions.ts `variantsForOptions`), keeping the price and stock of any edition that
// already had that combination. A book with plain editions never needs this card; leaving it empty changes nothing.
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { SectionCard, TextField } from "./riso/components";
import { MAX_OPTIONS, optionCombinations, optionProblems, productOptions, type ProductOption } from "../../shared/productOptions";
import { SIZE_SETS, orderSizes, type SizeSet } from "../../shared/productSizes";
import { sizeListsFor, typeOfProduct } from "../../shared/productTypes";
import { useShopWords } from "./shopWords";

/** One option being typed; `set` is the ready-made size list it came from, so its sizes can be tapped on and off. */
type Row = { name: string; values: string; set?: string };

const splitValues = (text: string) => text.split(",").map((v) => v.trim()).filter(Boolean);
const sameText = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/** The size list a saved option most likely came from: same option name and every value in the list. */
export function setForOption(name: string, values: string[]): SizeSet | null {
  return SIZE_SETS.find((set) => sameText(set.option, name) && values.length > 0
    && values.every((v) => set.values.some((s) => sameText(s, v)))) ?? null;
}

/** Turns one size on or off in a row from a size list, keeping the list's order (S before XL). */
export function toggleSize(row: Row, size: string): Row {
  const now = splitValues(row.values);
  const on = now.some((v) => sameText(v, size));
  const next = on ? now.filter((v) => !sameText(v, size)) : [...now, size];
  return { ...row, values: orderSizes(row.set || "", next).join(", ") };
}

/** The editor's text rows → options (choices split on commas, tidied like the saved product). */
export function rowsToOptions(rows: Row[]): ProductOption[] {
  return productOptions({ options: rows.map((r) => ({ name: r.name, values: r.values.split(",") })) });
}

const rowsOf = (form: any): Row[] => productOptions(form).map((o) => ({ name: o.name, values: o.values.join(", "), set: setForOption(o.name, o.values)?.id }));

export function ProductOptionsEditor({ form, onApply, onClear }: {
  form: any;
  /** Make one edition per combination of these options. */
  onApply: (options: ProductOption[]) => void;
  /** Stop using options: the editions stay as a plain list. */
  onClear: () => void;
}) {
  const w = useShopWords();
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

  // Product types plan, change 6: the type's ready-made size lists and usual choices, one tap each.
  const type = typeOfProduct(form);
  const lists = sizeListsFor(type).filter((set) => !rows.some((r) => r.set === set.id || (sameText(r.name, set.option) && r.values.trim())));
  const choiceNames = (type?.choices ?? []).filter((name) => !rows.some((r) => sameText(r.name, name)));
  const full = rows.length >= MAX_OPTIONS;
  const addList = (set: SizeSet) => {
    const row: Row = { name: set.option, values: (set.common ?? set.values).join(", "), set: set.id };
    const blank = rows.findIndex((r) => !r.values.trim() && (!r.name.trim() || sameText(r.name, set.option)));
    setRows(blank >= 0 ? rows.map((r, j) => (j === blank ? row : r)) : [...rows, row]);
  };
  const addChoice = (name: string) => {
    const blank = rows.findIndex((r) => !r.name.trim() && !r.values.trim());
    setRows(blank >= 0 ? rows.map((r, j) => (j === blank ? { name, values: "" } : r)) : [...rows, { name, values: "" }]);
  };

  return (
    <SectionCard title="Options: size, colour and more"
      description={w("For anything sold in sizes, colours or materials. List the choices, then make the editions: every combination becomes an edition below with its own price, stock and photo. Leave this empty for a book with plain editions.")}
      actions={<button type="button" className="rp-btn rp-btn-secondary rp-btn-sm" disabled={rows.length >= MAX_OPTIONS}
        onClick={() => setRows([...rows, { name: rows.length ? "" : "Size", values: "" }])}><Plus size={14} aria-hidden /> Add option</button>}>
      {(lists.length > 0 || choiceNames.length > 0) && !full && (
        <div className="be-quick" role="group" aria-label={`Ready-made for ${type?.name ?? "this type"}`}>
          <span className="be-quick-label">Ready-made for {type?.name ?? "this type"}</span>
          <div className="be-chips">
            {lists.map((set) => <button key={set.id} type="button" className="be-chip" onClick={() => addList(set)}><Plus size={13} aria-hidden /> {set.label}</button>)}
            {choiceNames.map((name) => <button key={name} type="button" className="be-chip" onClick={() => addChoice(name)}><Plus size={13} aria-hidden /> {name}</button>)}
          </div>
        </div>
      )}
      {!rows.length && <p className="be-note">{w("No options. Shoppers pick from the editions below, as they do today.")}</p>}
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
          {row.set && (() => {
            const set = SIZE_SETS.find((x) => x.id === row.set);
            if (!set) return null;
            const on = splitValues(row.values);
            return (
              <div className="be-span-4 be-sizes" role="group" aria-label={`${set.label}: tap to add or remove`}>
                {set.values.map((size) => {
                  const picked = on.some((v) => sameText(v, size));
                  return <button key={size} type="button" className={`be-chip be-size ${picked ? "is-on" : ""}`} aria-pressed={picked}
                    onClick={() => update(i, toggleSize(row, size))}>{size}</button>;
                })}
              </div>
            );
          })()}
        </div>
      ))}
      {problems.length > 0 && <ul className="be-note" role="alert">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      {(rows.length > 0 || saved.length > 0) && (
        <div className="be-inline-actions">
          {rows.length > 0 && (
            <button type="button" className="rp-btn rp-btn-primary rp-btn-sm" disabled={!!problems.length || !count || (!changed && saved.length > 0)}
              onClick={() => onApply(options)}>
              {w(saved.length ? "Update the editions" : "Make the editions")}{count ? ` (${count})` : ""}
            </button>
          )}
          {saved.length > 0 && (
            <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={() => { setRows([]); onClear(); }}>Stop using options</button>
          )}
          {changed && saved.length > 0 && <span className="be-note">{w("Changes to the options apply when you update the editions.")}</span>}
        </div>
      )}
    </SectionCard>
  );
}
