// Stockroom › Stock › one book › Author money: the settle-up between the press and the book's author, moved from the
// old stockroom's settle-up panel. The maths is the stockroom's own (artist-settlement.js, earnings.js), unchanged:
// this file only picks what the card shows and turns "record it" and "undo it" into book saves.
import { applyArtistSettlement, artistSettlementStatement, planArtistSettlement, undoArtistSettlement } from "@stockroom/artist-settlement.js";
import type { SettlePlan } from "@stockroom/artist-settlement.js";

type Row = Record<string, any>;

/** The settle-up as it stands, or null when the book has no author share set (no profit tiers). */
export function authorMoneyPlan(book: Row | null, state: Row): SettlePlan | null {
  if (!book) return null;
  return planArtistSettlement(book, { hist: [], ...state });
}

/** The plain-words statement for the author (the old "copy statement" text). */
export function authorStatement(book: Row, plan: SettlePlan, date: string): string {
  return artistSettlementStatement(book, plan.balance, date, false);
}

/** Settlements already recorded, newest first, with the ones undone left out. */
export function pastSettlements(state: Row): Row[] {
  return (state.artistPayouts || []).filter((p: Row) => p?.settlement && !p.voided).slice().reverse();
}

const REFUSED: Record<string, string> = {
  changed: "Something changed since this was worked out. Nothing was saved; open it again.",
  date: "Pick a real date.",
  missing: "That settlement is no longer there.",
  load: "The book's records did not load. Nothing was saved.",
};

/** A save step that records the settle-up worked out from the book as saved (refuses if it moved since `expected`). */
export function recordSettlement(book: Row, expectedId: string, opts: { date: string; method?: string; notes?: string }) {
  return (state: Row) => {
    const plan = planArtistSettlement(book, state);
    if (!plan || plan.id !== expectedId) throw new Error(REFUSED.changed);
    if (plan.error) throw new Error("Two settlements overlap. Undo one before recording another.");
    const r = applyArtistSettlement(book, state, plan, opts);
    if (!r.ok) throw new Error(REFUSED[r.reason] || REFUSED.changed);
    return state;
  };
}

/** A save step that undoes one recorded settlement. */
export function undoSettlement(id: string) {
  return (state: Row) => {
    const r = undoArtistSettlement(state, id);
    if (!r.ok) throw new Error(REFUSED[r.reason || ""] || REFUSED.changed);
    return state;
  };
}
