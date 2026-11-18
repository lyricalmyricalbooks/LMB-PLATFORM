// "What is it?" (product types plan, change 3, 18 November 2026): Add product opens this small window first. The owner
// types what the thing is in their own words ("mug", "tote", "earrings") and picks the type; the product page then asks
// only what that type needs. The shop's usual types sit first, every group is a tap away, and "Start blank" skips it.
// Change 4: a word that names none of ours ("Tote bags") can become the shop's own type, built on the closest of ours,
// and is offered by name from then on.

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import toast from "react-hot-toast";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { Dialog, SecondaryButton } from "./riso/components";
import { PRODUCT_TYPES, TYPE_GROUPS, namesAType, searchOwnTypes, searchTypes, sellsGroups, typeById, typeGroup, typeStart, type OwnType, type ProductType, type TypeGroupId } from "../../shared/productTypes";
import { addOwnType, useOwnTypes } from "./ownTypes";

const POPULAR = ["tops", "prints", "printed-books", "candles", "ceramics", "earrings", "stickers", "downloads"];

/** The types a shop is shown before it types anything: a few from each of its groups, or a popular few. */
export function usualTypes(groups: readonly TypeGroupId[], count = 8): ProductType[] {
  if (!groups.length) return POPULAR.map((id) => PRODUCT_TYPES.find((t) => t.id === id)!).filter(Boolean);
  const each = Math.max(2, Math.ceil(count / groups.length));
  return groups.flatMap((g) => PRODUCT_TYPES.filter((t) => t.group === g).slice(0, each)).slice(0, count);
}

/** One row of the list: one of our types, or the shop's own type built on it. */
type Entry = { type: ProductType; own?: OwnType };

function ownEntries(own: readonly OwnType[]): Entry[] {
  return own.flatMap((o) => { const type = typeById(o.base); return type ? [{ type, own: o }] : []; });
}

export function TypePicker({ open, onClose, onPick, groups, current, currentName, title = "Add a product", allowBlank = true, appearance }: {
  open: boolean;
  onClose: () => void;
  /** The picked type (null for "Start blank"), and the shop's own type when one was picked or just named. */
  onPick: (type: ProductType | null, own?: OwnType | null) => void;
  /** The shop's own groups, shown first; [] means none in particular. */
  groups: readonly TypeGroupId[];
  /** The type the product has now, marked in the list. */
  current?: string | null;
  /** The own type's name the product has now, if any. */
  currentName?: string | null;
  title?: string;
  allowBlank?: boolean;
  /** Set when mounted outside the admin shell, so the window carries the admin's colours. */
  appearance?: "light" | "dark";
}) {
  const [query, setQuery] = useState("");
  const [browse, setBrowse] = useState<TypeGroupId | null>(null);
  const [active, setActive] = useState(0);
  // Naming the owner's own type: the list then asks which of ours it is most like.
  const [naming, setNaming] = useState(false);
  const [saving, setSaving] = useState(false);
  const own = useOwnTypes();
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const inputId = useId();

  useEffect(() => {
    if (!open) return;
    setQuery(""); setBrowse(null); setActive(0); setNaming(false);
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const name = query.trim().replace(/\s+/g, " ");
  const searching = name.length > 0;
  const typed = useMemo(() => (searching ? searchTypes(name, { groups, limit: 8 }).map((m) => m.type) : []), [name, groups, searching]);
  const ownFound = useMemo(() => (searching && !naming ? ownEntries(searchOwnTypes(name, own)) : []), [name, own, searching, naming]);
  const usual = useMemo(() => [...ownEntries(own), ...usualTypes(groups).map((type) => ({ type }))].slice(0, Math.max(8, own.length)), [groups, own]);
  const browsing: Entry[] = browse ? PRODUCT_TYPES.filter((t) => t.group === browse).map((type) => ({ type })) : [];
  const shown: Entry[] = browse ? browsing
    : naming ? (typed.length ? typed.map((type) => ({ type })) : usualTypes(groups).map((type) => ({ type })))
    : searching ? [...ownFound, ...typed.map((type) => ({ type }))]
    : usual;
  const listed = searching && !naming && !browse;
  const canName = listed && name.length <= 40 && !namesAType(name, own);
  const otherGroups = [...groups.map((g) => typeGroup(g)!).filter(Boolean), ...TYPE_GROUPS.filter((g) => !groups.includes(g.id))];

  useEffect(() => setActive(0), [query, browse, naming]);

  const choose = async (entry: Entry) => {
    if (!naming) { onPick(entry.type, entry.own ?? null); return; }
    setSaving(true);
    try {
      const made = await addOwnType(name, entry.type.id);
      toast.success(`“${made.name}” is one of your types now.`);
      onPick(entry.type, made);
    } catch {
      toast.error("Couldn't save your type. Check your connection and try again.");
    } finally { setSaving(false); }
  };

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && naming) { event.preventDefault(); event.stopPropagation(); setNaming(false); return; }
    if (!shown.length || saving) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((i) => (i + 1) % shown.length); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => (i - 1 + shown.length) % shown.length); }
    else if (event.key === "Enter") { event.preventDefault(); void choose(shown[Math.min(active, shown.length - 1)]); }
  };

  const optionId = (i: number) => `${listId}-${i}`;
  const isNow = (entry: Entry) => !naming && entry.type.id === current && (entry.own ? entry.own.name === currentName : !currentName);
  const row = (entry: Entry, i: number) => (
    <li key={entry.own?.id ?? entry.type.id} id={optionId(i)} role="option" aria-selected={i === active} aria-disabled={saving || undefined}
      className="rp-tp-option" data-active={i === active ? "" : undefined} data-own={entry.own ? "" : undefined}
      onMouseEnter={() => setActive(i)} onClick={() => { if (!saving) void choose(entry); }}>
      <span className="rp-tp-name">{entry.own?.name ?? entry.type.name}{isNow(entry) && <span className="rp-tp-now"> · now</span>}</span>
      <span className="rp-tp-group">{entry.own ? `Yours · like ${entry.type.name}` : typeGroup(entry.type.group)?.name}</span>
    </li>
  );

  const heading = browse ? typeGroup(browse)?.name
    : naming ? (typed.length ? "Closest of ours" : "Pick the closest, or browse a group")
    : searching ? null
    : own.length ? "Your types" : groups.length ? "Your usual types" : "Popular types";

  return (
    <Dialog open={open} onClose={onClose} title={title} size="md" appearance={appearance}
      description="Say what it is in your own words. The page then asks only what that kind of product needs."
      footer={allowBlank ? <SecondaryButton onClick={() => onPick(null)}>Start blank</SecondaryButton> : undefined}>
      <div className="rp-tp">
        <label htmlFor={inputId} className="rp-tp-label">{naming ? "Name your type" : "What is it?"}</label>
        <div className="rp-search rp-tp-search">
          <Search size={18} className="rp-search-icon" aria-hidden />
          <input ref={input} id={inputId} className="rp-input" type="search" autoComplete="off" spellCheck={false} maxLength={naming ? 40 : undefined}
            placeholder="A candle, T-shirt, print, mug…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey}
            role="combobox" aria-expanded={shown.length > 0} aria-controls={listId} aria-autocomplete="list"
            aria-activedescendant={shown.length ? optionId(Math.min(active, shown.length - 1)) : undefined} />
        </div>

        {naming && (
          <div className="rp-tp-naming" role="status">
            <p><strong>Which of ours is “{name || "your type"}” most like?</strong></p>
            <p>It asks what that type asks and uses its sizes, facts and Google category. Next time, pick “{name || "your type"}” by name.</p>
            <button type="button" className="rp-tp-back" onClick={() => { setNaming(false); setBrowse(null); input.current?.focus(); }}><ChevronLeft size={16} aria-hidden />Back to the list</button>
          </div>
        )}

        {heading && (
          <div className="rp-tp-head">
            {browse && <button type="button" className="rp-tp-back" onClick={() => setBrowse(null)}><ChevronLeft size={16} aria-hidden />All groups</button>}
            <h3 className="rp-tp-title">{heading}</h3>
          </div>
        )}

        {shown.length > 0 ? (
          <ul id={listId} role="listbox" aria-label={listed ? "Matching types" : heading || "Types"} aria-busy={saving || undefined}
            className="rp-tp-list" data-grid={!listed ? "" : undefined}>
            {shown.map(row)}
          </ul>
        ) : (
          <div id={listId} className="rp-tp-empty" role="status">
            <p><strong>No type called “{name}” yet.</strong></p>
            <p>{canName ? "Add it as your own type below, try another word for it, or start blank and choose later." : "Try another word for it, pick the closest group below, or start blank and choose later."}</p>
          </div>
        )}

        {canName && (
          <button type="button" className="rp-tp-add" onClick={() => { setNaming(true); input.current?.focus(); }}>
            <Plus size={18} aria-hidden />
            <span><span className="rp-tp-name">Add “{name}” as your own type</span>
              <span className="rp-tp-group">Built on the closest of ours, so it asks the right questions.</span></span>
          </button>
        )}

        {!browse && (
          <details className="rp-tp-groups" open={(searching && !shown.length) || (naming && !typed.length) ? true : undefined}>
            <summary>Browse all {TYPE_GROUPS.length} groups</summary>
            <ul className="rp-tp-group-list">
              {otherGroups.map((g) => (
                <li key={g.id}>
                  <button type="button" onClick={() => { if (!naming) setQuery(""); setBrowse(g.id); input.current?.focus(); }}>
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
    onPick={(type, own) => onStart(type ? typeStart(type, own) : null)} />;
}
