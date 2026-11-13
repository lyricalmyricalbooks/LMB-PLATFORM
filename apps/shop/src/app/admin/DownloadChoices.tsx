import { useEffect, useState } from "react";
import { Checkbox, Dialog, PrimaryButton, SecondaryButton, SelectField, TextField } from "./riso/components";
import { adminApi } from "./api";
import { combinedAdmin } from "./combined";
import { planDate } from "./platformPlan";
import { TAKEOUT_PARTS, WHOLE_SHOP, choiceProblem, pastDownloads, type PastDownload, type TakeoutChoice, type TakeoutPart } from "./takeoutChoice";

// Choose what to download: the parts, the days of orders, CSV or Excel, and the last few downloads. One dialog, opened
// beside Download your shop (Close your shop, Settings › General, Stockroom › Backups). The rules are in takeoutChoice.ts.
export function DownloadChoices({ open, onClose, onDownload }: { open: boolean; onClose: () => void; onDownload: (c: TakeoutChoice) => void }) {
  const parts = TAKEOUT_PARTS.filter((p) => !p.combinedOnly || combinedAdmin());
  const [choice, setChoice] = useState<TakeoutChoice>({ ...WHOLE_SHOP, parts: parts.map((p) => p.id) });
  const [past, setPast] = useState<PastDownload[] | null>(null);
  useEffect(() => {
    if (!open) return;
    adminApi.getAuditLog(200).then((rows: any[]) => setPast(pastDownloads(rows))).catch(() => setPast([]));
  }, [open]);
  const toggle = (id: TakeoutPart, on: boolean) => setChoice((c) => ({ ...c, parts: on ? [...c.parts, id] : c.parts.filter((p) => p !== id) }));
  const problem = choiceProblem(choice);

  return (
    <Dialog open={open} onClose={onClose} title="Choose what to download" description="One zip with only the parts you pick."
      footer={<>
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton disabled={!!problem} onClick={() => onDownload(choice)}>Download</PrimaryButton>
      </>}>
      <div className="rp-stack" style={{ gap: 16 }} data-download-choices>
        <fieldset className="rp-stack" style={{ gap: 8, border: 0, margin: 0, padding: 0 }}>
          <legend className="rp-label" style={{ marginBottom: 8 }}>What to include</legend>
          {parts.map((p) => (
            <div key={p.id}>
              <Checkbox label={p.label} checked={choice.parts.includes(p.id)} onChange={(e) => toggle(p.id, e.target.checked)} />
              <p className="rp-hint" style={{ margin: "2px 0 0 28px" }}>{p.hint}</p>
            </div>
          ))}
        </fieldset>
        {choice.parts.includes("orders") && (
          <div className="flex flex-wrap gap-3">
            <TextField type="date" label="Orders from (optional)" value={choice.from ?? ""} onChange={(e) => setChoice((c) => ({ ...c, from: e.target.value || undefined }))} />
            <TextField type="date" label="Orders to (optional)" value={choice.to ?? ""} onChange={(e) => setChoice((c) => ({ ...c, to: e.target.value || undefined }))} />
          </div>
        )}
        <SelectField label="Spreadsheets as" value={choice.format} onChange={(e) => setChoice((c) => ({ ...c, format: e.target.value === "xlsx" ? "xlsx" : "csv" }))}>
          <option value="csv">CSV, ready to import into another shop system</option>
          <option value="xlsx">Excel, easy to open and read</option>
        </SelectField>
        {problem && <p className="rp-hint" role="alert" style={{ margin: 0 }}>{problem}</p>}
        <div>
          <p className="rp-label" style={{ margin: "0 0 6px" }}>Your last downloads</p>
          {past === null ? <p className="rp-hint" style={{ margin: 0 }}>Reading…</p>
            : !past.length ? <p className="rp-hint" style={{ margin: 0 }}>None yet.</p>
            : <ul className="rp-stack" style={{ gap: 4, margin: 0, padding: 0, listStyle: "none" }}>
                {past.map((d) => <li key={d.at} className="rp-hint"><strong>{planDate(d.at)}</strong> · {d.words}</li>)}
              </ul>}
        </div>
      </div>
    </Dialog>
  );
}
