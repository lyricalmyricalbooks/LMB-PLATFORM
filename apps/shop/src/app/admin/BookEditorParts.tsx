// Everything else as one list of rows (product types plan, change 10, 18 November 2026). A new product's page shows its
// essentials in full; each other part (sale price, shipping, categories, search…) is one row with a plain summary of
// what it holds now and an Open button that opens it where it stands. A part the product's type doesn't need has no row.
// Parts stay mounted while closed (only hidden), so nothing typed or loaded is lost when one opens or closes.
import { createContext, useContext, useId, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export type PartsState = {
  /** True on a new product until the owner asks for everything: closed parts show as rows. */
  folded: boolean;
  opened: ReadonlySet<string>;
  open: (id: string) => void;
};

export const PartsFold = createContext<PartsState>({ folded: false, opened: new Set(), open: () => {} });

export function Part({ id, title, summary, essential, needed = true, children }: {
  id: string;
  /** The row's name, the same as the part's own heading. */
  title: string;
  /** What the part holds now, in a few plain words ("Not on sale", "Poetry, New"). */
  summary: string;
  /** Shown in full on a new product (its type needs it filled in now). */
  essential?: boolean;
  /** False when the product's type has no use for this part: no row while folded. */
  needed?: boolean;
  children: ReactNode;
}) {
  const { folded, opened, open } = useContext(PartsFold);
  const bodyId = useId();
  const shut = folded && !essential && !opened.has(id);
  if (shut && !needed) return <div hidden data-part={id}>{children}</div>;
  return (
    <>
      {shut && (
        <section className="rp-fk-section be-part" data-part-row={id}>
          <div className="rp-fk-section-head"><h2 className="rp-fk-section-title">{title}</h2></div>
          <div className="rp-fk-card be-part-card">
            <span className="be-part-summary">{summary}</span>
            <button type="button" className="rp-btn rp-btn-secondary rp-btn-sm" aria-expanded={false} aria-controls={bodyId}
              aria-label={`Open ${title}`} onClick={() => open(id)}>
              Open <ChevronDown size={14} aria-hidden />
            </button>
          </div>
        </section>
      )}
      <div id={bodyId} className="be-part-body" hidden={shut} data-part={id}>{children}</div>
    </>
  );
}

/** Opens a part and moves to it once it shows. */
export function revealPart(id: string) {
  requestAnimationFrame(() => {
    const body = document.querySelector<HTMLElement>(`.book-editor-riso [data-part="${id}"]`);
    const first = body?.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea, button");
    body?.firstElementChild?.scrollIntoView({ block: "start", behavior: "smooth" });
    first?.focus({ preventScroll: true });
  });
}
