import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { rowsLeft, type OpenRow } from "../openList";
import { useShopWords } from "../shopWords";

/**
 * The one list on Home (sign-up to open shop plan, move 4): a mint header with how far the press is, the done rows struck
 * through, the step to do now opened in place (`children`: the run's own stage), the steps still to come, and Open my
 * shop at the foot, waiting until they are done. `final` is true when the last check is the step on screen: the foot
 * then belongs to it.
 */
export function OpenListCard({ rows, name, final, children }: {
  rows: OpenRow[];
  name?: string | null;
  final: boolean;
  children: ReactNode;
}) {
  const w = useShopWords();
  const left = rowsLeft(rows);
  const total = rows.length;
  const done = total - left;
  const shop = name?.trim() || "your shop";
  const title = final ? `Last step: open ${shop}` : left === 1 ? `1 step to open ${shop}` : `${left} steps to open ${shop}`;
  const upcoming = rows.map((r, i) => ({ r, n: i + 1 })).filter(({ r }) => r.state !== "done");
  const firstLeft = upcoming[0]?.n;
  const lastLeft = upcoming[upcoming.length - 1]?.n;
  const ring = Math.round((done / Math.max(1, total)) * 100);
  return (
    <section className="rp-openlist" aria-labelledby="rp-openlist-title" data-open-list="">
      <header className="rp-openlist-head">
        <div className="rp-openlist-ring" role="img" aria-label={`${done} of ${total} done`} style={{ ["--rp-ring" as string]: `${ring}%` }}>
          <span>{done}/{total}</span>
        </div>
        <div>
          <p className="rp-openlist-kicker">Private · only you can see it</p>
          <h2 id="rp-openlist-title" className="rp-openlist-title">{title}</h2>
          <p className="rp-openlist-sub">{final ? "Check what is left below, then let shoppers in." : "About 15 minutes. Everything else can wait until after you open."}</p>
        </div>
      </header>
      <ol className="rp-openlist-rows">
        {rows.map((row, i) => (
          <li key={row.id} className="rp-openlist-row" data-state={row.state} data-row={row.id} aria-current={row.state === "now" ? "step" : undefined}>
            <span className="rp-openlist-mark" aria-hidden="true">{row.state === "done" ? <Check size={14} strokeWidth={3} /> : i + 1}</span>
            {row.state === "now" ? (
              <div className="rp-openlist-now">
                <p className="rp-openlist-next">Next</p>
                <h3 className="rp-openlist-row-title">{w(row.title)}</h3>
                <p className="rp-openlist-row-detail">{w(row.detail)}</p>
                <div className="rp-openlist-stage">{children}</div>
              </div>
            ) : (
              <div className="rp-openlist-text">
                <p className="rp-openlist-row-title">{w(row.title)}{row.state === "done" && <span className="rp-sr-only"> (done)</span>}</p>
                <p className="rp-openlist-row-detail">{w(row.detail)}</p>
              </div>
            )}
            {row.id === "look" && row.state === "done" && <a className="rp-openlist-link" href="#designer?yours=1">Make it yours</a>}
          </li>
        ))}
      </ol>
      {final ? (
        <div className="rp-openlist-final">{children}</div>
      ) : (
        <footer className="rp-openlist-foot">
          <button type="button" className="rp-btn rp-btn-primary" disabled aria-describedby="rp-openlist-wait">Open my shop</button>
          <p id="rp-openlist-wait" className="rp-openlist-wait">
            {firstLeft === lastLeft ? `Opens when step ${firstLeft} is done.` : `Opens when steps ${firstLeft} to ${lastLeft} are done.`} Then a practice order, if you like.
          </p>
        </footer>
      )}
    </section>
  );
}
