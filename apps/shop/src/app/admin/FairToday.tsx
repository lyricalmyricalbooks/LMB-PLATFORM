// Today at the fair, on Home in the combined admin (docs/combined-admin.md, step 4a): the till's own
// end-of-day figures and upload state, asked of the stockroom (`{ what: "fair" }`, its `fairForAdmin`). Read-only: the
// stockroom stays the only place a sale is recorded. Quiet on a day with no sales and no fair named.
import { useEffect, useState } from "react";
import { GhostButton, StatusBadge } from "./riso/components";
import { stockroomBridge, type StockroomFair } from "./stockroomBridge";
import { useShopWords } from "./shopWords";
import { money } from "./StockroomBookPanel";

const REFRESH_MS = 15_000;
type Totals = StockroomFair["totals"];
export const totalsText = (totals: Totals) => (totals.length ? totals.map((t) => money(t.amount, t.cur)).join(" + ") : money(0, "CAD"));
const UPLOAD_TONE = { ok: "success", pending: "info", offline: "warning", failed: "danger" } as const;

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

export function FairToday({ active, onOpen }: { active: boolean; onOpen: () => void }) {
  const w = useShopWords();
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

  if (!active || !fairWorthShowing(fair)) return null;
  return (
    <section className="rp-fair-today" aria-label="Today at the fair">
      <div className="rp-fair-today-head">
        <span className="rp-fair-today-kicker">Today</span>
        <strong className="rp-fair-today-line">{fairLine(fair, w)}</strong>
        <StatusBadge glyph={false} tone={UPLOAD_TONE[fair.upload.tone as keyof typeof UPLOAD_TONE] || "neutral"}>{fair.upload.text}</StatusBadge>
        <GhostButton onClick={onOpen}>Open the Till</GhostButton>
      </div>
      {lowText(fair.low) && (
        <p className="rp-fair-today-low"><strong>Running low:</strong> {lowText(fair.low)}</p>
      )}
      {fair.sales > 0 && (
        <details className="rp-fair-today-more">
          <summary>{w("By book and by way of paying")}</summary>
          <div className="rp-fair-today-cols">
            <ul aria-label={w("By book")}>
              {fair.titles.map((t) => (
                <li key={t.bookId}><span>{t.title}<small>{t.units} sold{t.left === null ? "" : ` · ${t.left} left`}</small></span><strong>{totalsText(t.totals)}</strong></li>
              ))}
            </ul>
            <ul aria-label="By way of paying">
              {fair.methods.map((m) => (
                <li key={m.label}><span>{m.label}<small>{m.sales} {m.sales === 1 ? "sale" : "sales"}</small></span><strong>{totalsText(m.totals)}</strong></li>
              ))}
            </ul>
          </div>
        </details>
      )}
    </section>
  );
}
