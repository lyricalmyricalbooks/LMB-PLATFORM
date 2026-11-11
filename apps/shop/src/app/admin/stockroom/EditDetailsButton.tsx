// Stockroom › Stock › one item › Edit details (catalogEdit.ts). Saved through updateSetting("catalog").
import { useState } from "react";

import { Dialog, PrimaryButton, SecondaryButton, TextField } from "../riso/components";
import { useShopWords } from "../shopWords";
import { detailsFormOf, type DetailsForm, withDetails } from "./catalogEdit";
import { describeResult, stockroomWriteApi } from "./stockroomWrite";

export function EditDetailsButton({ id, book, onSaved }: { id: string; book: Record<string, any>; onSaved: () => void }) {
  const w = useShopWords();
  const [form, setForm] = useState<DetailsForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: string; text: string } | null>(null);
  const set = (k: keyof DetailsForm) => (e: { target: { value: string } }) => setForm((f) => (f ? { ...f, [k]: e.target.value } : f));

  async function save() {
    if (!form || busy) return;
    setBusy(true); setMsg(null);
    try {
      const r = await stockroomWriteApi.updateSetting("catalog", withDetails(id, form));
      const d = describeResult(r);
      if (r.status === "saved" || r.status === "unchanged") { setForm(null); onSaved(); } else setMsg(d);
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "Nothing was saved. Try again." });
    }
    setBusy(false);
  }
  return (
    <>
      <SecondaryButton size="sm" onClick={() => { setMsg(null); setForm(detailsFormOf(book)); }}>Edit details</SecondaryButton>
      {form && (
        <Dialog open onClose={() => setForm(null)} title="Edit details"
          footer={<><SecondaryButton onClick={() => setForm(null)}>Cancel</SecondaryButton><PrimaryButton busy={busy} onClick={() => void save()}>Save changes</PrimaryButton></>}>
          <TextField label="Title" value={form.title} onChange={set("title")} />
          <TextField label={w("Author")} value={form.author} onChange={set("author")} />
          <TextField label={w("Print run")} hint={w("Copies printed")} type="number" min={0} value={form.maxPrint} onChange={set("maxPrint")} />
          <TextField label={`List price (${book.currency || "CAD"})`} type="number" min={0} step="0.01" value={form.listPrice} onChange={set("listPrice")} />
          <TextField label="Running low at" hint="Copies left" type="number" min={0} value={form.threshold} onChange={set("threshold")} />
          <TextField label={`Production cost (${book.currency || "CAD"})`} hint="The whole run" type="number" min={0} step="0.01" value={form.productionCost} onChange={set("productionCost")} />
          {msg && <p className="rp-sr-save" data-tone={msg.tone} role="alert">{msg.text}</p>}
        </Dialog>
      )}
    </>
  );
}
