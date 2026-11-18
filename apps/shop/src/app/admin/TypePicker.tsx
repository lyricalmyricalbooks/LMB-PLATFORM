// "What is it?" (product types plan, change 3, 18 November 2026): Add product opens this small window first. The owner
// types what the thing is in their own words ("mug", "tote", "earrings") and picks the type; the product page then asks
// only what that type needs. The shop's usual types sit first, every group is a tap away, and "Start blank" skips it.

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Dialog, SecondaryButton } from "./riso/components";
import { PRODUCT_TYPES, TYPE_GROUPS, searchTypes, sellsGroups, typeGroup, typeStart, type ProductType, type TypeGroupId } from "../../shared/productTypes";

const POPULAR = ["tops", "prints", "printed-books", "candles", "ceramics", "earrings", "stickers", "downloads"];

/** The types a shop is shown before it types anything: a few from each of its groups, or a popular few. */
export function usualTypes(groups: readonly TypeGroupId[], count = 8): ProductType[] {
  if (!groups.length) return POPULAR.map((id) => PRODUCT_TYPES.find((t) => t.id === id)!).filter(Boolean);
  const each = Math.max(2, Math.ceil(count / groups.length));
  return groups.flatMap((g) => PRODUCT_TYPES.filter((t) => t.group === g).slice(0, each)).slice(0, count);
}

export function TypePicker({ open, onClose, onPick, groups, current, title = "Add a product", allowBlank = true, appearance }: {
  open: boolean;
  onClose: () => void;
  /** The picked type, or null for "Start blank". */
  onPick: (type: ProductType | null) => void;
  /** The shop's own groups, shown first; [] means none in particular. */
  groups: readonly TypeGroupId[];
  /** The type the product has now, marked in the list. */
  current?: string | null;
  title?: string;
  allowBlank?: boolean;
  /** Set when mounted outside the admin shell, so the window carries the admin's colours. */
  appearance?: "light" | "dark";
}) {
  const [query, setQuery] = useState("");
  const [browse, setBrowse] = useState<TypeGroupId | null>(null);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const inputId = useId();

  useEffect(() => {
    if (!open) return;
    setQuery(""); setBrowse(null); setActive(0);
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const searching = query.trim().length > 0;
  const results = useMemo(() => (searching ? searchTypes(query, { groups, limit: 8 }).map((m) => m.type) : []), [query, groups, searching]);
  const browsing = browse ? PRODUCT_TYPES.filter((t) => t.group === browse) : [];
  const usual = useMemo(() => usualTypes(groups), [groups]);
  const shown = searching ? results : browse ? browsing : usual;
  const otherGroups = [...groups.map((g) => typeGroup(g)!).filter(Boolean), ...TYPE_GROUPS.filter((g) => !groups.includes(g.id))];

  useEffect(() => setActive(0), [query, browse]);

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!shown.length) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((i) => (i + 1) % shown.length); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => (i - 1 + shown.length) % shown.length); }
    else if (event.key === "Enter") { event.preventDefault(); onPick(shown[Math.min(active, shown.length - 1)]); }
  };

  const optionId = (i: number) => `${listId}-${i}`;
  const row = (type: ProductType, i: number) => (
    <li key={type.id} id={optionId(i)} role="option" aria-selected={i === active} className="rp-tp-option" data-active={i === active ? "" : undefined}
      onMouseEnter={() => setActive(i)} onClick={() => onPick(type)}>
      <span className="rp-tp-name">{type.name}{type.id === current && <span className="rp-tp-now"> · now</span>}</span>
      <span className="rp-tp-group">{typeGroup(type.group)?.name}</span>
    </li>
  );

  const heading = searching ? null : browse ? typeGroup(browse)?.name : groups.length ? "Your usual types" : "Popular types";

  return (
    <Dialog open={open} onClose={onClose} title={title} size="md" appearance={appearance}
      description="Say what it is in your own words. The page then asks only what that kind of product needs."
      footer={allowBlank ? <SecondaryButton onClick={() => onPick(null)}>Start blank</SecondaryButton> : undefined}>
      <div className="rp-tp">
        <label htmlFor={inputId} className="rp-tp-label">What is it?</label>
        <div className="rp-search rp-tp-search">
          <Search size={18} className="rp-search-icon" aria-hidden />
          <input ref={input} id={inputId} className="rp-input" type="search" autoComplete="off" spellCheck={false}
            placeholder="A candle, T-shirt, print, mug…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey}
            role="combobox" aria-expanded={shown.length > 0} aria-controls={listId} aria-autocomplete="list"
            aria-activedescendant={shown.length ? optionId(Math.min(active, shown.length - 1)) : undefined} />
        </div>

        {heading && (
          <div className="rp-tp-head">
            {browse && <button type="button" className="rp-tp-back" onClick={() => setBrowse(null)}><ChevronLeft size={16} aria-hidden />All groups</button>}
            <h3 className="rp-tp-title">{heading}</h3>
          </div>
        )}

        {shown.length > 0 ? (
          <ul id={listId} role="listbox" aria-label={searching ? "Matching types" : heading || "Types"} className="rp-tp-list" data-grid={!searching ? "" : undefined}>
            {shown.map(row)}
          </ul>
        ) : (
          <div id={listId} className="rp-tp-empty" role="status">
            <p><strong>No type called “{query.trim()}” yet.</strong></p>
            <p>Try another word for it, pick the closest group below, or start blank and choose later.</p>
          </div>
        )}

        {!browse && (
          <details className="rp-tp-groups" open={searching && !results.length ? true : undefined}>
            <summary>Browse all {TYPE_GROUPS.length} groups</summary>
            <ul className="rp-tp-group-list">
              {otherGroups.map((g) => (
                <li key={g.id}>
                  <button type="button" onClick={() => { setQuery(""); setBrowse(g.id); input.current?.focus(); }}>
                    <span><span className="rp-tp-name">{g.name}</span><span className="rp-tp-group">{g.blurb}</span></span>
                    <ChevronRight size={16} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Dialog>
  );
}

/** Books › Add product: the picker for a new product, handing back what it starts with (null = blank). */
export function AddProductPicker({ sells, title, appearance, onClose, onStart }: {
  sells: string | null; title: string; appearance?: "light" | "dark";
  onClose: () => void; onStart: (start: Record<string, any> | null) => void;
}) {
  const groups = useMemo(() => sellsGroups(sells), [sells]);
  return <TypePicker open appearance={appearance} groups={groups} title={title} onClose={onClose}
    onPick={(type) => onStart(type ? typeStart(type) : null)} />;
}
