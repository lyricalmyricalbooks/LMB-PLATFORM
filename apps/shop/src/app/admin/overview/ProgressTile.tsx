import type { ReactNode } from "react";

/**
 * The setup guide's progress tile (design handoff "Colophon platform", 10 November 2026): a ring with done / total, one
 * line on what is left, and the shop's two states, Private (now) and Live. Used by the shop's Overview guide and by setup
 * mode's Home. Colours are tokens only (setupBoard.css).
 */
export function ProgressTile({ done, total, title, lede, live = false, children }: {
  done: number; total: number; title: string; lede?: string; live?: boolean; children?: ReactNode;
}) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <section className="rp-sb-tile rp-sb-big rp-sb-progress" aria-labelledby="setup-progress-title">
      <div className="rp-sb-ring-row">
        <div className="rp-sb-ring" style={{ ["--rp-sb-percent" as string]: `${percent}%` }} role="img" aria-label={`${done} of ${total} steps done`}>
          <span aria-hidden>{done}/{total}</span>
        </div>
        <div style={{ minWidth: 0 }}>
          <h2 id="setup-progress-title">{title}</h2>
          {lede && <p style={{ color: "var(--rp-text-muted)" }}>{lede}</p>}
        </div>
      </div>
      <ul className="rp-sb-states" aria-label="Where your shop is">
        <li data-on={!live ? "true" : undefined}><span aria-hidden className="rp-sb-state-dot" /><span>Private · only you can see it</span>{!live && <b className="rp-sb-pill">Now</b>}</li>
        <li data-on={live ? "true" : undefined}><span aria-hidden className="rp-sb-state-dot" /><span>Live · open to shoppers</span>{live && <b className="rp-sb-pill">Now</b>}</li>
      </ul>
      {children && <div className="rp-sb-actions">{children}</div>}
    </section>
  );
}
