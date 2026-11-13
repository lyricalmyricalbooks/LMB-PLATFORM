// Books bulk bar › Put on sale: one dated sale for every ticked product (gap-list item 5, 13 November 2026). The shop
// already charges a product's sale price only between its own dates (promotions.saleActive, on the server too), so
// this writes those same four fields per product; nothing new is trusted at checkout.
import { useMemo, useState } from "react";
import { Dialog, PrimaryButton, SecondaryButton, TextField } from "./riso/components";
import { planSale, saleScheduleProblem } from "./bulkPricing";
import { shopDate } from "../../shared/preorder";

const money = (n: number) => `$${n.toFixed(2)}`;

export function BulkSaleDialog({ books, onClose, onSave }: {
  books: any[]; onClose: () => void;
  onSave: (changes: { id: string; patch: Record<string, any> }[]) => Promise<void>;
}) {
  const [percent, setPercent] = useState("20");
  const [startsAt, setStartsAt] = useState(() => shopDate(new Date()));
  const [endsAt, setEndsAt] = useState("");
  const [saving, setSaving] = useState(false);
  const schedule = { percent: Number(percent), startsAt, endsAt };
  const problem = saleScheduleProblem(schedule);
  const plan = useMemo(() => planSale(books, { percent: Number(percent), startsAt, endsAt }), [books, percent, startsAt, endsAt]);
  const save = async () => { setSaving(true); try { await onSave(plan.changes); } finally { setSaving(false); } };
  const first = plan.changes[0];

  return (
    <Dialog open onClose={onClose} title="Put on sale"
      description="Shoppers pay the sale price between these days, then the regular price comes back by itself."
      footer={<>
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton onClick={() => void save()} disabled={!!problem || !plan.changes.length || saving}>
          {saving ? "Saving…" : `Put ${plan.changes.length} on sale`}
        </PrimaryButton>
      </>}>
      <div className="bk-sale-grid">
        <TextField label="Percent off" type="number" inputMode="decimal" min={1} max={99} step={1} value={percent}
          onChange={(e) => setPercent(e.target.value)} />
        <TextField label="Starts" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} hint="Blank starts now." />
        <TextField label="Ends" type="date" value={endsAt} min={startsAt || undefined} onChange={(e) => setEndsAt(e.target.value)}
          hint="Blank never ends. Runs to the end of this day." />
      </div>
      {problem ? <p className="bk-sale-problem" role="alert">{problem}</p> : first && (
        <p className="rp-hint" aria-live="polite">
          {plan.changes.length === 1 ? `${first.title}: ${money(first.from)} → ${money(first.to)}` : `${plan.changes.length} products, for example ${first.title}: ${money(first.from)} → ${money(first.to)}`}
        </p>
      )}
      {plan.skipped.length > 0 && (
        <p className="rp-hint">Left out: {plan.skipped.map((s) => `${s.title} (${s.reason})`).join("; ")}.</p>
      )}
    </Dialog>
  );
}
