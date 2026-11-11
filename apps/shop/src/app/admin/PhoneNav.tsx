import { useEffect, useState } from "react";

// Phones (v3 mockups, 11 Nov 2026): a bottom menu with the side's first four items and, when the side has more than
// five, a More pill that opens a page listing the rest, then fair mode, help and the night look.
export interface PhoneNavItem { id: string; label: string; children?: { id: string }[]; badge?: number }

export function phoneNavSplit<T>(items: T[]): { shown: T[]; more: T[] } {
  return items.length > 5 ? { shown: items.slice(0, 4), more: items.slice(4) } : { shown: items, more: [] };
}

export function PhoneNav({ items, activeId, onPick, fairMode, onFair, onHelp, night, onNight }: {
  items: PhoneNavItem[]; activeId: string | null; onPick: (id: string) => void;
  fairMode?: boolean; onFair?: () => void; onHelp: () => void; night: boolean; onNight: () => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const { shown, more } = phoneNavSplit(items);
  const moreActive = more.some((n) => n.id === activeId);
  useEffect(() => { setMoreOpen(false); }, [activeId]);
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMoreOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);
  const pick = (id: string) => { setMoreOpen(false); onPick(id); };
  return (
    <>
      {moreOpen && (
        <section className="rp-more-page" aria-label="More">
          <h2 className="rp-more-title">More</h2>
          <ul className="rp-more-list">
            {more.map((n) => (
              <li key={n.id}>
                <button type="button" className="rp-more-card" aria-current={n.id === activeId ? "page" : undefined} onClick={() => pick(n.id)}>
                  <span className="rp-more-label">{n.label}</span>
                  <span className="rp-more-sub">{(n.children?.length || 1) === 1 ? "1 page" : `${n.children!.length} pages`}</span>
                </button>
              </li>
            ))}
            {onFair && (
              <li><button type="button" className="rp-more-card" onClick={() => { setMoreOpen(false); onFair(); }}>
                <span className="rp-more-label">{fairMode ? "End fair mode" : "Start fair mode"}</span>
                <span className="rp-more-sub">{fairMode ? "Back to the whole stockroom" : "Till, QR codes and stock check only"}</span>
              </button></li>
            )}
            <li><button type="button" className="rp-more-card" onClick={() => { setMoreOpen(false); onHelp(); }}>
              <span className="rp-more-label">Help</span><span className="rp-more-sub">Ask a person and shortcuts</span>
            </button></li>
            <li><button type="button" className="rp-more-card" aria-pressed={night} onClick={onNight}>
              <span className="rp-more-label">{night ? "Day look" : "Night look"}</span><span className="rp-more-sub">Change how the admin looks</span>
            </button></li>
          </ul>
        </section>
      )}
      <nav className="rp-bottom-nav" aria-label="Main menu">
        {shown.map((n) => (
          <button key={n.id} type="button" className="rp-bottom-pill" aria-current={!moreOpen && n.id === activeId ? "page" : undefined} onClick={() => pick(n.id)}>
            {n.label}{n.badge ? <span className="rp-bottom-badge" aria-label={`${n.badge} waiting`}>{n.badge}</span> : null}
          </button>
        ))}
        {more.length > 0 && (
          <button type="button" className="rp-bottom-pill" aria-expanded={moreOpen} aria-current={moreOpen || moreActive ? "page" : undefined}
            onClick={() => setMoreOpen((v) => !v)}>More</button>
        )}
      </nav>
    </>
  );
}
