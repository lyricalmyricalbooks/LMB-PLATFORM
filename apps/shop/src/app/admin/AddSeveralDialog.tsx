// Adding products round 3, "Add several at once" (plan https://claude.ai/artifact/MEmMDYot4WY3S1c8cRDRaL): Products ›
// Add several opens a short table. Each filled row becomes a draft; blank type, price and stock copy the row above.
// Every row is checked before anything is saved, and a row that fails to save stays in the table to try again.
// Pure parts: addSeveral.ts.
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ImagePlus, Plus, X } from "lucide-react";
import { Dialog, PrimaryButton, SecondaryButton } from "./riso/components";
import { PRODUCT_TYPES, TYPE_GROUPS, typeById, type TypeGroupId } from "../../shared/productTypes";
import { blankRow, draftsWord, filledRows, rowProblems, rowProduct, type SeveralRow } from "./addSeveral";
import { adminApi } from "./api";
import { uploadBookPhoto } from "./bookPhotoUpload";
import { useShopWords } from "./shopWords";

export function AddSeveralDialog({ groups, onClose, onDone }: {
  /** The shop's own groups, listed first in the Type menu. */
  groups: readonly TypeGroupId[];
  onClose: () => void;
  /** After saving: how many drafts were made, and whether every row saved (false keeps the window open on the rest). */
  onDone: (made: number, finished: boolean) => void;
}) {
  const w = useShopWords();
  const [rows, setRows] = useState<SeveralRow[]>(() => [0, 1, 2].map(blankRow));
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const firstName = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = window.setTimeout(() => firstName.current?.focus(), 60); return () => window.clearTimeout(t); }, []);

  const filled = useMemo(() => filledRows(rows), [rows]);
  const filledByKey = useMemo(() => new Map(filled.map((r) => [r.key, r])), [filled]);
  const problems = useMemo(() => rowProblems(rows), [rows]);
  const problemCount = Object.keys(problems).length;
  const groupOrder = [...groups, ...TYPE_GROUPS.map((g) => g.id).filter((g) => !groups.includes(g))];
  const previews = useMemo(() => new Map(rows.filter((r) => r.photo).map((r) => [r.key, URL.createObjectURL(r.photo!)])), [rows]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  const edit = (key: string, patch: Partial<SeveralRow>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => setRows((list) => (list.length > 1 ? list.filter((r) => r.key !== key) : [blankRow(0)]));
  const addRow = () => setRows((list) => [...list, blankRow(list.length)]);

  const save = async () => {
    setChecked(true);
    if (!filled.length) { toast.error("Type a name in the first row to start."); return; }
    if (problemCount) { toast.error(problemCount === 1 ? "One row needs fixing first." : `${problemCount} rows need fixing first.`); return; }
    toast.dismiss();
    setSaving({ done: 0, total: filled.length });
    const failed = new Set<string>();
    let made = 0;
    for (const row of filled) {
      try {
        const product = rowProduct(row, typeById(row.typeId)!);
        if (row.photo) {
          // A photo that won't upload leaves the draft without it, never unsaved.
          try { product.photos = [{ ...(await uploadBookPhoto(row.photo)), id: Math.random().toString(36).slice(2, 11), altText: product.title }]; }
          catch (err) { console.error("Photo upload failed", err); }
        }
        await adminApi.createBook(product, { quiet: true });
        made += 1;
      } catch (err) {
        console.error("Add several: couldn't save a row", err);
        failed.add(row.key);
      }
      setSaving((s) => (s ? { ...s, done: s.done + 1 } : s));
    }
    if (made) await adminApi.recordAuditLog("catalog", `Added ${draftsWord(made)} with Add several`).catch(() => {});
    setSaving(null);
    if (failed.size) {
      setRows((list) => list.filter((r) => failed.has(r.key)));
      toast.error(`${made ? `${draftsWord(made)} added. ` : ""}${failed.size === 1 ? "One row" : `${failed.size} rows`} couldn't be saved. Check your connection and press Create again.`);
      if (made) onDone(made, false);
      return;
    }
    onDone(made, true);
  };

  const count = filled.length;
  return (
    <Dialog open onClose={() => { if (!saving) onClose(); }} size="lg" title={w("Add several books")}
      description="One row for each. Leave a type, price or stock blank to copy the row above. Each row becomes a draft you finish later."
      footer={<>
        <SecondaryButton onClick={onClose} disabled={!!saving}>Cancel</SecondaryButton>
        <PrimaryButton onClick={() => void save()} disabled={!!saving}>
          {saving ? `Saving ${saving.done + 1} of ${saving.total}…` : count ? `Create ${draftsWord(count)}` : "Create drafts"}
        </PrimaryButton>
      </>}>
      <div className="as-wrap">
        <table className="as-table">
          <caption className="rp-sr-only">{w("New books, one per row")}</caption>
          <thead><tr>
            <th scope="col" className="as-photo-col">Photo</th>
            <th scope="col">Name</th>
            <th scope="col">Type</th>
            <th scope="col" className="as-num">Price</th>
            <th scope="col" className="as-num">Stock</th>
            <th scope="col"><span className="rp-sr-only">Remove</span></th>
          </tr></thead>
          <tbody>
            {rows.map((row, i) => {
              const shown = filledByKey.get(row.key);
              const copied = (field: "typeId" | "price" | "stock") => !row[field] && shown?.[field] ? shown[field] : "";
              const issues = checked ? problems[row.key] : undefined;
              const label = row.name.trim() || `row ${i + 1}`;
              const copiedType = copied("typeId");
              return (
                <tr key={row.key} data-problem={issues ? "" : undefined}>
                  <td className="as-photo-col">
                    <label className="as-photo" title={row.photo ? "Change photo" : "Add a photo"}>
                      {previews.get(row.key) ? <img src={previews.get(row.key)} alt="" /> : <ImagePlus size={18} aria-hidden />}
                      <input type="file" accept="image/*" className="rp-sr-only" aria-label={`Photo for ${label}`}
                        onChange={(e) => edit(row.key, { photo: e.target.files?.[0] || null })} />
                    </label>
                  </td>
                  <td>
                    <input ref={i === 0 ? firstName : undefined} className="rp-input" value={row.name} maxLength={200} aria-label={`Name, ${label}`}
                      aria-invalid={issues?.includes("Add a name") || undefined}
                      placeholder={i === 0 ? "What shoppers will call it" : ""} onChange={(e) => edit(row.key, { name: e.target.value })} />
                    {issues && <span className="as-problem" role="status">{issues.join(" · ")}</span>}
                  </td>
                  <td data-label="Type">
                    <select className="rp-input as-type" value={row.typeId} aria-label={`Type, ${label}`} onChange={(e) => edit(row.key, { typeId: e.target.value })}
                      aria-invalid={issues?.includes("Pick a type") || undefined} data-copied={copiedType ? "" : undefined}>
                      <option value="">{copiedType ? `Same: ${typeById(copiedType)?.name}` : "Pick a type"}</option>
                      {groupOrder.map((g) => (
                        <optgroup key={g} label={TYPE_GROUPS.find((x) => x.id === g)?.name}>
                          {PRODUCT_TYPES.filter((t) => t.group === g).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </td>
                  <td className="as-num" data-label="Price">
                    <input className="rp-input rp-mono" type="number" min={0} step="0.01" inputMode="decimal" value={row.price} aria-label={`Price, ${label}`}
                      placeholder={copied("price") || "0.00"} onChange={(e) => edit(row.key, { price: e.target.value })} />
                  </td>
                  <td className="as-num" data-label="Stock">
                    <input className="rp-input rp-mono" type="number" min={0} step={1} inputMode="numeric" value={row.stock} aria-label={`Stock, ${label}`}
                      placeholder={copied("stock") || "0"} onChange={(e) => edit(row.key, { stock: e.target.value })} />
                  </td>
                  <td>
                    <button type="button" className="as-remove" onClick={() => remove(row.key)} aria-label={`Remove ${label}`}><X size={16} aria-hidden /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button type="button" className="as-add" onClick={addRow} disabled={rows.length >= 50}><Plus size={16} aria-hidden /> Add a row</button>
        <p className="as-note">Grey numbers and “Same:” are copied from the row above. Weight, photos, sizes and the rest are added on each draft.</p>
      </div>
    </Dialog>
  );
}
