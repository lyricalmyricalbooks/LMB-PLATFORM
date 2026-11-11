// Today at the fair (docs/combined-admin.md, step 4a): the till's own end-of-day figures, worked out from the stockroom's
// records with its own rules (`{ what: "fair" }`, stockroom/stockroomAnswers.ts). Home's "Selling today" tile shows them (overview/HomeToday.tsx).
// Read-only: the stockroom stays the only place a sale is recorded.
import { useEffect, useState } from "react";
import { stockroomBridge, type StockroomFair } from "./stockroomBridge";
import { money } from "./StockroomBookPanel";

/** Every minute: the figures come from the stockroom's records, read again each time. */
const REFRESH_MS = 60_000;
type Totals = StockroomFair["totals"];
export const totalsText = (totals: Totals) => (totals.length ? totals.map((t) => money(t.amount, t.cur)).join(" + ") : money(0, "CAD"));

/** The one line above the till: "Harbour Fair · 4 sales · 9 books · CA$180.00 + US$20.00". */
export function fairLine(fair: StockroomFair, words: (text: string) => string): string {
  const things = words(fair.units === 1 ? "book" : "books");
  return [fair.fair, `${fair.sales} ${fair.sales === 1 ? "sale" : "sales"}`, `${fair.units} ${things}`, totalsText(fair.totals)].filter(Boolean).join(" · ");
}

/** "Harbour Lights (none left) · Tide Tables (2 left)", or "" when nothing is running low. */
export const lowText = (low: StockroomFair["low"]) =>
  (low || []).map((b) => `${b.title} (${b.left === 0 ? "none left" : `${b.left} left`})`).join(" · ");

/** Whether there's anything to show: a sale today, or a fair named on the till. */
export const fairWorthShowing = (fair: StockroomFair | null): fair is StockroomFair => !!fair && (fair.sales > 0 || !!fair.fair);

/** The till's day, read while `active` and every minute after; null until it answers (or for an author). */
export function useFairToday(active: boolean): StockroomFair | null {
  const [fair, setFair] = useState<StockroomFair | null>(null);
  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    const ask = async () => {
      const answer = await stockroomBridge.askUntil<StockroomFair | { refused: true }>({ what: "fair" });
      if (!alive) return;
      // An author's sign-in, or a stockroom still loading: show nothing rather than a wrong "no sales".
      setFair(answer && !("refused" in answer) && Array.isArray(answer.totals) ? answer : null);
    };
    void ask();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void ask(); }, REFRESH_MS);
    return () => { alive = false; window.clearInterval(timer); };
  }, [active]);
  return fair;
}
