import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { adminApi } from "./api";
import { today } from "./discountState";
import { describeMoved, readDiscountFile, type DiscountFile } from "./discountMove";
import { Dialog, PrimaryButton, SecondaryButton, StatusBadge } from "./riso/components";
import { SPREADSHEET_ACCEPT, readProblem, spreadsheetText } from "./spreadsheetFile";

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`;

/**
 * Discounts › Bring codes over (plan 23.30): the old shop's discount code file → a preview → each simple code saved as
 * a discount here (adminApi.saveDiscount, the same shape and checks as one made by hand), so a code customers were
 * given before the move still works at checkout. A code already here is left alone, so bringing the file again adds
 * nothing.
 */
export function DiscountMoveDialog({ existing, onClose, onDone }: { existing: string[]; onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [file, setFile] = useState<DiscountFile | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<null | { added: number; failed: string[] }>(null);

  const choose = async (picked: File | undefined) => {
    if (!picked) return;
    setError(""); setResult(null); setName(picked.name);
    if (picked.size > 5 * 1024 * 1024) { setFile(null); setError("That file is larger than 5 MB. A discount code list is usually much smaller: check it is the right file."); return; }
    try { setFile(readDiscountFile(await spreadsheetText(picked), today(), existing)); }
    catch (err) { setFile(null); setError(readProblem(err)); }
  };

  const bring = async () => {
    if (!file?.codes.length || busy) return;
    setBusy(true);
    let added = 0;
    const failed: string[] = [];
    for (const d of file.codes) {
      try {
        await adminApi.saveDiscount({
          code: d.code, type: d.type, value: d.value, isActive: true, method: "code", appliesTo: "all",
          minOrderAmount: d.minOrderAmount, minQuantity: d.minQuantity, usageLimit: d.usageLimit, onePerCustomer: d.onePerCustomer,
          startDate: d.startDate, expiryDate: d.expiryDate, description: "Brought over from your old shop",
        });
        added++;
      } catch {
        failed.push(d.code);
      }
    }
    setResult({ added, failed });
    setBusy(false);
    if (added) onDone();
  };

  const leftOut = (rows: string[], label: string) => rows.length > 0 && (
    <details>
      <summary className="rp-hint">{label}</summary>
      <ul className="rp-hint" style={{ margin: "6px 0 0", paddingLeft: 18, maxHeight: 200, overflow: "auto" }}>
        {rows.slice(0, 200).map((r, i) => <li key={`${r}-${i}`}>{r}</li>)}
      </ul>
    </details>
  );

  if (result) {
    return (
      <Dialog open onClose={onClose} title="Discount codes brought over" badge="🏷️" footer={<PrimaryButton onClick={onClose}>Done</PrimaryButton>}>
        <div className="rp-stack" style={{ gap: 12 }} role="status">
          <StatusBadge tone={result.added ? "success" : "neutral"}>{plural(result.added, "code")} added</StatusBadge>
          {result.added > 0 && <p className="rp-hint" style={{ margin: 0 }}>They work at checkout now, each with the uses it had left. They're marked “Brought over from your old shop” in the list, where you can pause or change any of them.</p>}
          {result.failed.length > 0 && <p role="alert" className="rp-error-text" style={{ margin: 0 }}>{plural(result.failed.length, "code")} couldn't be saved ({result.failed.slice(0, 10).join(", ")}). Check your connection and bring the file again: codes already here are skipped.</p>}
          {file && leftOut(file.skipped.map((s) => s.reason), `${plural(file.skipped.length, "code")} left out`)}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={() => { if (!busy) onClose(); }} title="Bring discount codes over" badge="🏷️" size="lg"
      description="Choose the discount code file from your old shop, so codes your customers already have still work here. Nothing is sent to anyone."
      footer={<>
        <SecondaryButton disabled={busy} onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton disabled={busy || !file?.codes.length} onClick={() => void bring()}>
          {busy ? "Bringing them over…" : file?.codes.length ? `Bring ${plural(file.codes.length, "code")} over` : "Nothing to bring over"}
        </PrimaryButton>
      </>}>
      <div className="rp-stack" style={{ gap: 12 }}>
        <input ref={fileRef} type="file" accept={SPREADSHEET_ACCEPT} hidden aria-label="Discount code file"
          onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ""; }} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <SecondaryButton icon={<Upload size={16} aria-hidden />} disabled={busy} onClick={() => fileRef.current?.click()}>{name ? "Choose another file" : "Choose the file"}</SecondaryButton>
          {name && <span className="rp-mono" style={{ overflowWrap: "anywhere" }}>{name}</span>}
        </div>
        {!file && <p className="rp-hint" style={{ margin: 0 }}>In your old shop, open its discounts or coupons page and export them as a CSV or Excel file.</p>}
        {error && <p role="alert" className="rp-error-text" style={{ margin: 0 }}>{error}</p>}
        {file && (file.problems.length ? (
          <div role="alert" className="rp-error-text">{file.problems.map((p) => <p key={p} style={{ margin: 0 }}>{p}</p>)}</div>
        ) : (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} aria-live="polite">
              <StatusBadge tone="info">{plural(file.codes.length, "code")} to bring over</StatusBadge>
              {file.skipped.length > 0 && <StatusBadge tone="neutral">{plural(file.skipped.length, "code")} left out</StatusBadge>}
            </div>
            {file.codes.length > 0 && (
              <ul className="rp-hint" style={{ margin: 0, paddingLeft: 18, maxHeight: 220, overflow: "auto" }}>
                {file.codes.slice(0, 200).map((d) => (
                  <li key={d.code}><span className="rp-mono">{d.code}</span>: {describeMoved(d)}
                    {d.minOrderAmount ? `, on orders of CA$${d.minOrderAmount.toFixed(2)} or more` : d.minQuantity ? `, on ${d.minQuantity} items or more` : ""}
                    {d.usageLimit != null ? `, ${plural(d.usageLimit, "use")} left` : ""}{d.expiryDate ? `, until ${d.expiryDate}` : ""}</li>
                ))}
              </ul>
            )}
            <p className="rp-hint" style={{ margin: 0 }}>Amounts come over as Canadian dollars. Codes that only worked on some items, or buy-some-get-some offers, are listed as left out so you can set them up by hand.</p>
            {leftOut(file.skipped.map((s) => s.reason), "Why some were left out")}
          </>
        ))}
      </div>
    </Dialog>
  );
}
