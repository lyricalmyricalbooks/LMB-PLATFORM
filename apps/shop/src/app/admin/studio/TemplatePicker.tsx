import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { filterOptions, type PickerOption } from "./templatePicker";

/**
 * Studio's one "Page to edit" control: a searchable list of store pages, collections, book
 * pages, custom pages and the every-page header/footer sections.
 */
export function TemplatePicker({ options, current, onPick }: {
  options: PickerOption[]; current?: PickerOption; onPick: (option: PickerOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => filterOptions(options, query), [options, query]);

  useEffect(() => {
    if (!open) return;
    setQuery(""); setActive(Math.max(0, options.findIndex(o => o.id === current?.id)));
    setTimeout(() => input.current?.focus(), 0);
    const outside = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);
  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => { document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: "nearest" }); }, [active, listId]);

  const pick = (o: PickerOption | undefined) => { if (!o) return; setOpen(false); onPick(o); };
  let lastGroup = "";
  return (
    <div className="studio-picker" ref={wrap}>
      <button type="button" className="studio-picker-trigger" aria-haspopup="listbox" aria-expanded={open} aria-label="Page to edit"
        title="Choose the page you are designing" onClick={() => setOpen(o => !o)}>
        <span className="studio-picker-group">{current?.group || "Page"}</span>
        <span className="studio-picker-label">{current?.label || "Choose a page"}</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {open && (
        <div className="studio-picker-panel" onKeyDown={e => {
          if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
          else if (e.key === "ArrowDown") { e.preventDefault(); setActive(i => Math.min(results.length - 1, i + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive(i => Math.max(0, i - 1)); }
          else if (e.key === "Enter") { e.preventDefault(); pick(results[active]); }
        }}>
          <label className="studio-picker-search">
            <Search size={14} aria-hidden />
            <input ref={input} role="combobox" aria-expanded aria-controls={listId} aria-label="Find a page, collection or book"
              aria-activedescendant={results.length ? `${listId}-${active}` : undefined}
              placeholder="Find a page, collection or book…" value={query} onChange={e => setQuery(e.target.value)} />
          </label>
          <ul id={listId} role="listbox" aria-label="Pages you can design" className="studio-picker-list">
            {results.map((o, i) => {
              const heading = o.group !== lastGroup ? (lastGroup = o.group) : null;
              return [
                heading && <li key={`h-${o.group}`} role="presentation" className="studio-picker-heading">{heading}</li>,
                <li key={o.id} id={`${listId}-${i}`} role="option" aria-selected={o.id === current?.id} data-active={i === active || undefined}
                  className="studio-picker-option" onMouseEnter={() => setActive(i)} onClick={() => pick(o)}>
                  <span>{o.label}</span>{o.hint && <small>{o.hint}</small>}
                </li>,
              ];
            })}
            {!results.length && <li role="presentation" className="studio-picker-empty">Nothing matches “{query}”.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
