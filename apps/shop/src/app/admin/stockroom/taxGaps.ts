// Tax centre › Costs that may be missing: "Remind me later", "Not a gap" and "Show hidden" for the gaps, and the
// category checks (an expense whose words were filed elsewhere before). Port of the old taxcentre.js notes
// (TAX_CENTER.deductionNotes, keyed by the finding's id; "cat-mismatch:" ids never collide with gap ids).
import { DEFAULT_SNOOZE_DAYS, gapNoteState, snoozeUntil } from "@stockroom/deduction-gaps.js";
import { findCategoryMismatches } from "@stockroom/category-fit.js";

type Row = Record<string, any>;
export type GapAction = "snooze" | "dismiss";

/** The Tax centre with one finding put off for 30 days or set aside for good. */
export function withGapNote(tc: Row | null, id: string, action: GapAction, now = new Date()): Row {
  const base = tc || {};
  const at = now.toISOString();
  const note = action === "snooze" ? { status: "snoozed", until: snoozeUntil(DEFAULT_SNOOZE_DAYS, now), at } : { status: "dismissed", at };
  return { ...base, deductionNotes: { ...(base.deductionNotes || {}), [id]: note } };
}

/** Every put-off or set-aside finding comes back (the old "Show hidden"). */
export function withGapNotesCleared(tc: Row | null): Row {
  return { ...(tc || {}), deductionNotes: {} };
}

/** Category checks still open today, with whether "Move to …" can be done here (business costs only). */
export function openMismatches(ctx: { books: Record<string, Row>; states: Record<string, Row>; taxCenter: Row | null }, today: string) {
  const notes = ctx.taxCenter?.deductionNotes || {};
  let hidden = 0;
  const open = findCategoryMismatches(ctx).filter((f) => {
    const shown = gapNoteState(notes[f.id], today) === "open";
    if (!shown) hidden++;
    return shown;
  }).map((f) => ({ ...f, canMove: f.scope === "business" && f.expenseId != null }));
  return { open, hidden };
}
