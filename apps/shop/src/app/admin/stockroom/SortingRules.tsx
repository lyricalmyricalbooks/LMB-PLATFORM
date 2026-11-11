// Tax centre › Sorting rules: "say where a shop's expenses go, once". Add and remove only; a rule never re-sorts the ledger.
import { useState } from "react";

import { EmptyState, GhostButton, PrimaryButton, SectionCard, SelectField, TextField } from "../riso/components";
import { EXPENSE_CATEGORIES } from "./taxExpense";
import { addRule, removeRule, rulesOf } from "./taxRules";
import { saveTaxCenter, type SaveNote } from "./saveTaxCenter";

type Row = Record<string, any>;

export function SortingRulesCard({ taxCenter, onSaved }: { taxCenter: Row | null; onSaved: (taxCenter: Row) => void }) {
  const rules = rulesOf(taxCenter);
  const [match, setMatch] = useState("");
  const [cat, setCat] = useState(EXPENSE_CATEGORIES[0]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<SaveNote | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(mutate: (tc: Row | null) => Row, done: string): Promise<boolean> {
    if (busy) return false;
    setBusy(true); setNote({ tone: "busy", text: "Saving…" });
    const r = await saveTaxCenter(mutate, done);
    if (r.ok && r.taxCenter) onSaved(r.taxCenter);
    setNote(r.note); setBusy(false);
    return r.ok;
  }
  async function add() {
    const probe = addRule(taxCenter, { match, cat }, "probe", "");
    if ("error" in probe) { setError(probe.error); return; }
    setError(null);
    const id = `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    if (await run((tc) => { const out = addRule(tc, { match, cat }, id, new Date().toISOString()); return "taxCenter" in out ? out.taxCenter : (tc || {}); }, `Rule saved: ${match.trim()} goes under ${cat}.`)) setMatch("");
  }

  return (
    <SectionCard title="Sorting rules" description="Say where a shop's expenses go, once. New expenses that mention it start in that category. You can always pick another, and expenses already logged stay as they are.">
      <form className="rp-money-form" onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <div className="rp-money-form-row">
          <TextField label="When it mentions" placeholder="e.g. Canva" value={match} error={error || undefined} onChange={(e) => { setMatch(e.target.value); setError(null); }} />
          <SelectField label="File under" value={cat} onChange={(e) => setCat(e.target.value)}>{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</SelectField>
        </div>
        <div className="rp-money-actions">
          <PrimaryButton type="submit" busy={busy}>Add rule</PrimaryButton>
          {note && <p className="rp-sr-save" data-tone={note.tone} role={note.tone === "error" ? "alert" : "status"}>{note.text}</p>}
        </div>
      </form>
      {rules.length === 0
        ? <EmptyState inline icon="🗂️" title="No rules yet" description={`Try one for a shop you buy from often, like "Canva" under Software & Subscriptions.`} />
        : <ul className="rp-money-pending">
            {rules.map((r) => (
              <li key={r.id}>
                <div className="rp-money-pending-main"><strong>{r.match}</strong> <span className="rp-money-sub">files under {r.cat}</span></div>
                <GhostButton size="sm" onClick={() => run((tc) => removeRule(tc, String(r.id)), "Rule removed.")} disabled={busy}>Remove</GhostButton>
              </li>
            ))}
          </ul>}
    </SectionCard>
  );
}
