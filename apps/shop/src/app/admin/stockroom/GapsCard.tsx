// Tax centre › Costs that may be missing: the old app's gap list and category checks, each with Remind me later
// (30 days) and Not a gap, "Move to …" for a business cost, and Show hidden to bring every set-aside one back.
import { useState } from "react";

import { EmptyState, GhostButton, SecondaryButton, SectionCard, StatusBadge } from "../riso/components";
import { saveTaxCenter, type SaveNote } from "./saveTaxCenter";
import { changeCategory } from "./taxLedger";
import { openMismatches, withGapNote, withGapNotesCleared, type GapAction } from "./taxGaps";

type Row = Record<string, any>;
type Gap = { id: string; title: string; category: string; detail: string; estimate: number | null };

export function GapsCard({ gaps, hidden, books, states, taxCenter, today, money, onSaved }: {
  gaps: Gap[]; hidden: number; books: Record<string, Row>; states: Record<string, Row>; taxCenter: Row | null; today: string;
  money: (n: number) => string; onSaved?: (tc: Row) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<SaveNote | null>(null);
  const checks = openMismatches({ books, states, taxCenter }, today);
  const hiddenCount = hidden + checks.hidden;
  const empty = !gaps.length && !checks.open.length;

  async function run(mutate: (tc: Row | null) => Row, done: string) {
    if (busy || !onSaved) return;
    setBusy(true); setNote({ tone: "busy", text: "Saving…" });
    const r = await saveTaxCenter(mutate, done);
    if (r.ok && r.taxCenter) onSaved(r.taxCenter);
    setNote(r.note); setBusy(false);
  }
  const act = (id: string, action: GapAction) =>
    void run((tc) => withGapNote(tc, id, action), action === "snooze" ? "We'll remind you in 30 days." : "Set aside.");
  const actions = (id: string, setAside: string) => onSaved && (
    <span className="rp-money-line-actions">
      <GhostButton size="sm" disabled={busy} onClick={() => act(id, "snooze")}>Remind me later</GhostButton>
      <GhostButton size="sm" disabled={busy} onClick={() => act(id, "dismiss")}>{setAside}</GhostButton>
    </span>
  );

  return (
    <SectionCard title="Costs that may be missing" description="Gaps in your own records, not tax advice." flush={empty}
      actions={onSaved && hiddenCount > 0 && <SecondaryButton size="sm" disabled={busy} onClick={() => void run(withGapNotesCleared, "Everything set aside is back.")}>Show hidden ({hiddenCount})</SecondaryButton>}>
      {empty
        ? <EmptyState inline title="Nothing obviously missing" description="Checked again each time you open this page." />
        : <ul className="rp-money-gaps">
            {gaps.map((g) => (
              <li key={g.id}>
                <strong>{g.title}</strong> <StatusBadge glyph={false}>{g.category}</StatusBadge>
                {g.estimate != null && <span className="rp-money-sub"> about {money(g.estimate)}</span>}
                <p>{g.detail}</p>
                {actions(g.id, "Not missing")}
              </li>
            ))}
            {checks.open.map((f) => (
              <li key={f.id}>
                <strong>{f.title}</strong> <StatusBadge glyph={false}>{f.currentCategory}</StatusBadge>
                <span className="rp-money-sub"> {money(f.amount)}</span>
                <p>{f.detail}</p>
                <span className="rp-money-line-actions">
                  {onSaved && f.canMove && <SecondaryButton size="sm" disabled={busy}
                    onClick={() => void run((tc) => changeCategory(tc, f.expenseId, f.suggestedCategory), `Moved to ${f.suggestedCategory}.`)}>Move to {f.suggestedCategory}</SecondaryButton>}
                  {actions(f.id, "Not a mistake")}
                </span>
              </li>
            ))}
          </ul>}
      {note && <p className="rp-sr-save" data-tone={note.tone} role={note.tone === "error" ? "alert" : "status"}>{note.text}</p>}
    </SectionCard>
  );
}
