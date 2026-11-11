// Tax centre › Log several at once (the old Tax Centre's batch entry): paste or type one expense per line, check the
// preview, log them all in one save. Lines with a problem or already in the ledger are shown and left out.
import { useMemo, useRef, useState } from "react";

import { DataTable, PrimaryButton, SectionCard, SelectField, StatusBadge, TextArea } from "../riso/components";
import { baseCurrencyOf, EXPENSE_CATEGORIES } from "./taxExpense";
import { addExpenseLines, loggable, MAX_LINES, readExpenseLines, type ExpenseLine } from "./taxExpenseLines";
import { describeResult, stockroomWriteApi } from "./stockroomWrite";
import { taxRatesApi } from "./taxRates";

type Row = Record<string, any>;
type Note = { tone: "ok" | "warn" | "error" | "busy"; text: string };
const todayText = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export function LogSeveralCard({ taxCenter, onSaved, today = todayText() }: { taxCenter: Row | null; onSaved: (taxCenter: Row) => void; today?: string }) {
  const base = baseCurrencyOf(taxCenter);
  const [text, setText] = useState("");
  const [cat, setCat] = useState("Other");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const firstId = useRef(Date.now() * 10);
  const lines = useMemo(() => readExpenseLines(text, { taxCenter, base, today, cat }), [text, taxCenter, base, today, cat]);
  const ready = loggable(lines);
  const tooMany = lines.length > MAX_LINES;
  const total = ready.reduce((n, l) => n + l.amount, 0);

  async function logAll() {
    if (busy || !ready.length || tooMany) return;
    setBusy(true); setNote({ tone: "busy", text: "Saving…" });
    try {
      const foreign = ready.filter((l) => l.form.currency !== base).map((l) => ({ currency: l.form.currency, date: l.form.date }));
      const rates = foreign.length ? await taxRatesApi.expenseRatesFor(foreign, taxCenter as Row | null) : undefined;
      const result = await stockroomWriteApi.updateSetting("taxCenter", (current) => addExpenseLines(current as Row | null, lines, firstId.current, new Date(), rates));
      if (result.status === "saved" || result.status === "unchanged") {
        onSaved((result.value as Row) || {});
        const d = describeResult(result);
        setNote({ tone: d.tone, text: d.tone === "ok" && !result.merged ? `Logged ${ready.length} ${ready.length === 1 ? "expense" : "expenses"}.` : d.text });
        setText(""); firstId.current = Date.now() * 10;
      } else setNote({ tone: "error", text: describeResult(result).text });
    } catch (error) {
      console.error("Tax centre save failed", error);
      setNote({ tone: "error", text: "That didn't save. Nothing was changed." });
    } finally { setBusy(false); }
  }

  const state = (l: ExpenseLine) => l.problem ? <StatusBadge tone="danger">{l.problem}</StatusBadge>
    : l.duplicate ? <StatusBadge tone="warning">Already logged</StatusBadge>
    : <StatusBadge tone="success">Ready</StatusBadge>;

  return (
    <SectionCard title="Log several at once" foldKey="tax-log-several" description="One expense per line: date, what it was, amount. Paste from a spreadsheet works too.">
      <div className="rp-money-form">
        <TextArea label="Expenses" rows={6} placeholder={"2026-11-03, Canva, 16.99\n2026-11-04, Canada Post, 42.10\nPrinter ink, 38.00"}
          hint={`No date means today. Amounts are in ${base}.`} value={text} onChange={(e) => { setText(e.target.value); setNote(null); }} />
        <SelectField label="Category for lines no sorting rule matches" value={cat} onChange={(e) => setCat(e.target.value)}>
          {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </SelectField>
      </div>
      {lines.length > 0 && (
        <DataTable stackOnPhone caption="Expenses to log" rowKey={(l) => String(l.line)} rows={lines.slice(0, MAX_LINES)}
          columns={[
            { key: "d", header: "Date", render: (l) => l.form.date },
            { key: "e", header: "Expense", lead: true, render: (l) => l.form.desc || l.text },
            { key: "c", header: "Category", render: (l) => l.form.cat },
            { key: "a", header: "Amount", numeric: true, render: (l) => (l.problem ? "-" : l.amount.toFixed(2)) },
            { key: "s", header: "", render: state },
          ]} />
      )}
      <div className="rp-money-actions">
        <PrimaryButton busy={busy} disabled={!ready.length || tooMany} onClick={() => void logAll()}>
          {busy ? "Saving…" : ready.length ? `Log ${ready.length} ${ready.length === 1 ? "expense" : "expenses"} (${total.toFixed(2)} ${base})` : "Log expenses"}
        </PrimaryButton>
        {tooMany && <p className="rp-sr-save" data-tone="error" role="alert">Up to {MAX_LINES} lines at a time.</p>}
        {note && <p className="rp-sr-save" data-tone={note.tone} role={note.tone === "error" ? "alert" : "status"}>{note.text}</p>}
      </div>
    </SectionCard>
  );
}
