// Books list › Inventory badge of a book sold in editions: set each edition's shelf count without opening
// the full editor. Every change goes through inventoryApi.adjustStock (a transaction against the live book
// + an inventoryLog row), so a sale made while the dialog was open is never undone.
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Dialog, PrimaryButton, SecondaryButton, SelectField, TextField } from "./riso/components";
import { inventoryApi } from "./inventoryApi";
import { inventoryLinkApi } from "./inventoryLinkApi";
import { isStockLinked, type InventoryLinks } from "./inventoryLink";
import { ADJUST_REASONS, kindOf, variantStock, type AdjustReason } from "./inventoryInsights";

export function EditionStockDialog({ book, onClose, onSaved }: { book: any | null; onClose: () => void; onSaved: () => void }) {
  const editions: any[] = Array.isArray(book?.variants) ? book.variants.filter((v: any) => v && v.id) : [];
  const [values, setValues] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<AdjustReason>("Count correction");
  const [busy, setBusy] = useState(false);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [links, setLinks] = useState<InventoryLinks>({});

  useEffect(() => {
    setValues(Object.fromEntries(editions.map((v) => [v.id, String(variantStock(v))])));
    setConflicts([]);
    if (book?.id) inventoryLinkApi.links().then(setLinks).catch(() => setLinks({}));
  }, [book?.id]);

  if (!book) return null;
  // Editions matched to the inventory app are counted there (Inventory › Inventory app link).
  const linkedEdition = (v: any) => isStockLinked(links, book.id, v.id);
  const counted = (v: any) => kindOf(book, v) === "stock" && !linkedEdition(v);
  const invalid = editions.some((v) => counted(v) && !/^\d+$/.test(String(values[v.id] ?? "").trim()));

  const save = async () => {
    if (invalid) return;
    setBusy(true);
    const failed: string[] = [], clashed: string[] = [];
    let changed = 0;
    for (const v of editions) {
      if (!counted(v)) continue;
      const to = Number(values[v.id]);
      const expected = variantStock(v);
      if (to === expected) continue;
      try {
        const res = await inventoryApi.adjustStock(book.id, v.id, { kind: "set", to, expected },
          { reason, title: book.title, edition: v.name || "" });
        if (res.ok) changed++;
        else if (res.reason === "conflict") clashed.push(`${v.name || "Edition"} (now ${res.live})`);
        else if (res.reason === "linked") failed.push(`${v.name || "Edition"} (counted in the inventory app)`);
        else failed.push(v.name || "Edition");
      } catch { failed.push(v.name || "Edition"); }
    }
    setBusy(false);
    if (clashed.length) {
      setConflicts(clashed);
      toast.error("Some copies sold while this was open. Check the numbers and save again.");
      onSaved();
      return;
    }
    if (failed.length) toast.error(`Could not update: ${failed.join(", ")}.`);
    else toast.success(changed ? `${book.title}: stock updated` : "Nothing changed");
    onSaved();
    onClose();
  };

  return (
    <Dialog open onClose={onClose} title={`Stock · ${book.title || "Untitled"}`}
      description="This book is sold in editions, so each edition has its own count. Shoppers see it as sold out only when every edition is at 0."
      footer={<><SecondaryButton onClick={onClose} disabled={busy}>Cancel</SecondaryButton>
        <PrimaryButton onClick={save} disabled={busy || invalid}>{busy ? "Saving…" : "Save stock"}</PrimaryButton></>}>
      <div className="rp-stack">
        {!book.trackInventory && <p className="rp-hint">Inventory tracking is off for this book, so it never sells out. Turn it on in Edit › Inventory to count copies.</p>}
        {editions.map((v) => counted(v) ? (
          <TextField key={v.id} label={v.name || "Edition"} type="number" min={0} step={1} inputMode="numeric"
            value={values[v.id] ?? ""} onChange={(e) => setValues((p) => ({ ...p, [v.id]: e.target.value }))}
            error={!/^\d+$/.test(String(values[v.id] ?? "").trim()) ? "Enter a whole number (0 or more)." : undefined} />
        ) : (
          <p key={v.id} className="rp-hint"><b>{v.name || "Edition"}</b>: {linkedEdition(v) ? `${variantStock(v)} — counted in the inventory app; change it there` : kindOf(book, v) === "digital" ? "digital — no stock to count" : "not counted"}</p>
        ))}
        <SelectField label="Reason (kept in Inventory › history)" value={reason} onChange={(e) => setReason(e.target.value as AdjustReason)}>
          {ADJUST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </SelectField>
        {conflicts.length > 0 && (
          <div role="alert" className="rp-stack">
            <p className="rp-hint">Sold since you opened this: {conflicts.join(", ")}. Press Save stock again to keep your numbers.</p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
