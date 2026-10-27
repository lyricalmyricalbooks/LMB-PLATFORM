import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Search, X } from "lucide-react";
import {
  bookOptions, categoryOptions, describeLink, describeVideo, filterPickOptions, fontOptions, linkOptions, pageOptions,
  type PickOption,
} from "./pickers";
import { joinSlugList, parseSlugList } from "../../features/site/merchandising";

// Studio's catalog pickers (2.3). The section/block field editors (ThemeEditorExtensions.tsx)
// render these for `link`, `book`, `books`, `category`, `page`, `video` and `font` fields. Each
// saves the same string the field held before (see pickers.ts), so nothing needs migrating.

export type StudioPickerData = { books: any[]; pages: any[]; categories: any[] };
const EMPTY: StudioPickerData = { books: [], pages: [], categories: [] };
const PickerData = createContext<StudioPickerData>(EMPTY);

/** StudioEditor provides the books, custom pages and shop categories it already loaded. */
export function StudioPickerProvider({ value, children }: { value: StudioPickerData; children: ReactNode }) {
  return <PickerData.Provider value={value}>{children}</PickerData.Provider>;
}
export const useStudioPickerData = () => useContext(PickerData);

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return <label htmlFor={htmlFor} className="text-[9px] font-black tracking-[0.25em] text-neutral-400 uppercase block mb-1.5">{children}</label>;
}

/** Searchable list shown inside the field (never a floating pop-over the inspector could clip). */
function OptionSearch({ options, label, placeholder, selected, onPick, onClose }: {
  options: PickOption[]; label: string; placeholder: string; selected?: string;
  onPick: (option: PickOption) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => filterPickOptions(options, query), [options, query]);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => { document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: "nearest" }); }, [active, listId]);
  let lastGroup = "";
  return (
    <div className="studio-picker-panel studio-field-picker-panel" onKeyDown={(e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(results.length - 1, i + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
      else if (e.key === "Enter") { e.preventDefault(); if (results[active]) onPick(results[active]); }
    }}>
      <label className="studio-picker-search">
        <Search size={14} aria-hidden />
        <input ref={input} role="combobox" aria-expanded aria-controls={listId} aria-label={label}
          aria-activedescendant={results.length ? `${listId}-${active}` : undefined}
          placeholder={placeholder} value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <ul id={listId} role="listbox" aria-label={label} className="studio-picker-list">
        {results.map((o, i) => {
          const heading = o.group !== lastGroup ? (lastGroup = o.group) : null;
          return [
            heading && <li key={`h-${o.group}`} role="presentation" className="studio-picker-heading">{heading}</li>,
            <li key={o.id} id={`${listId}-${i}`} role="option" aria-selected={o.value === selected}
              data-active={i === active || undefined} className="studio-picker-option"
              onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(o)}>
              <span>{o.label}</span>{o.hint && <small>{o.hint}</small>}
            </li>,
          ];
        })}
        {!results.length && <li role="presentation" className="studio-picker-empty">
          {options.length ? `Nothing matches “${query}”.` : "Nothing to choose from yet."}
        </li>}
      </ul>
      <button type="button" className="studio-field-picker-close" onClick={onClose}>Close list</button>
    </div>
  );
}

/** One chosen value: summary line + Choose / Clear buttons, with the search list underneath. */
function SinglePicker({ label, value, options, emptyText, chooseText, searchLabel, placeholder, missingText, onChange, children }: {
  label: string; value: string; options: PickOption[]; emptyText: string; chooseText: string; searchLabel: string;
  placeholder: string; missingText: (value: string) => string; onChange: (value: string) => void; children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const found = options.find((o) => o.value === value);
  return (
    <div className="studio-field-picker" data-picker-value={value || undefined}>
      <FieldLabel>{label}</FieldLabel>
      <div className="studio-field-picker-current">
        <span className="studio-field-picker-summary" data-missing={value && !found ? true : undefined}>
          {found ? <><small>{found.group}</small>{found.label}</> : value ? missingText(value) : <em>{emptyText}</em>}
        </span>
        <button type="button" className="studio-field-picker-button" aria-expanded={open} aria-label={`${chooseText}: ${label}`}
          onClick={() => setOpen((o) => !o)}>{chooseText}<ChevronDown size={12} aria-hidden /></button>
        {value && <button type="button" className="studio-field-picker-icon" aria-label={`Clear ${label}`} onClick={() => onChange("")}><X size={13} /></button>}
      </div>
      {open && <OptionSearch options={options} label={searchLabel} placeholder={placeholder} selected={value}
        onPick={(o) => { onChange(o.value); setOpen(false); }} onClose={() => setOpen(false)} />}
      {children}
    </div>
  );
}

/** Link: pick a store page, custom page, shop category or book — or type any address. */
export function LinkPicker({ label, value, onChange }: { label: string; value: any; onChange: (v: string) => void }) {
  const data = useStudioPickerData();
  const options = useMemo(() => linkOptions(data), [data]);
  const [open, setOpen] = useState(false);
  const inputId = useId();
  const href = typeof value === "string" ? value : "";
  const where = describeLink(href, options);
  return (
    <div className="studio-field-picker" data-picker-kind="link">
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <div className="studio-field-picker-current">
        <span className="studio-field-picker-summary">
          {where ? <><small>{where.group}</small>{where.label}</> : <em>No link yet</em>}
        </span>
        <button type="button" className="studio-field-picker-button" aria-expanded={open} aria-label={`Choose link: ${label}`}
          onClick={() => setOpen((o) => !o)}>Choose<ChevronDown size={12} aria-hidden /></button>
        {href && <button type="button" className="studio-field-picker-icon" aria-label={`Clear ${label}`} onClick={() => onChange("")}><X size={13} /></button>}
      </div>
      {open && <OptionSearch options={options} label="Find a page, category or book" placeholder="Find a page, category or book…"
        selected={href} onPick={(o) => { onChange(o.value); setOpen(false); }} onClose={() => setOpen(false)} />}
      <input id={inputId} aria-label={`${label} (address)`} value={href} placeholder="Or type an address: /page/about or https://…"
        onChange={(e) => onChange(e.target.value)} className="studio-field-picker-input" />
    </div>
  );
}

export function BookPicker({ label, value, onChange, emptyText = "No book chosen" }: { label: string; value: any; onChange: (v: string) => void; emptyText?: string }) {
  const { books } = useStudioPickerData();
  const options = useMemo(() => bookOptions(books), [books]);
  return <SinglePicker label={label} value={typeof value === "string" ? value.trim() : ""} options={options} onChange={onChange}
    emptyText={emptyText} chooseText="Choose book" searchLabel="Find a book" placeholder="Find a book by title or author…"
    missingText={(v) => `“${v}” — not a book in the shop right now`} />;
}

export function CategoryPicker({ label, value, onChange, emptyText = "No category chosen" }: { label: string; value: any; onChange: (v: string) => void; emptyText?: string }) {
  const { categories } = useStudioPickerData();
  const options = useMemo(() => categoryOptions(categories), [categories]);
  return <SinglePicker label={label} value={typeof value === "string" ? value : ""} options={options} onChange={onChange}
    emptyText={emptyText} chooseText="Choose category" searchLabel="Find a shop category" placeholder="Find a category…"
    missingText={(v) => `“${v}” — no shop category has this name now`} />;
}

export function PagePicker({ label, value, onChange, emptyText = "No page chosen" }: { label: string; value: any; onChange: (v: string) => void; emptyText?: string }) {
  const { pages } = useStudioPickerData();
  const options = useMemo(() => pageOptions(pages), [pages]);
  return <SinglePicker label={label} value={typeof value === "string" ? value : ""} options={options} onChange={onChange}
    emptyText={emptyText} chooseText="Choose page" searchLabel="Find a custom page" placeholder="Find a page…"
    missingText={(v) => `“${v}” — no custom page has this address now`} />;
}

/** Several books, in the order picked. Saves the comma-separated slugs the field always held. */
export function BooksPicker({ label, value, onChange }: { label: string; value: any; onChange: (v: string) => void }) {
  const { books } = useStudioPickerData();
  const options = useMemo(() => bookOptions(books), [books]);
  const [open, setOpen] = useState(false);
  const slugs = parseSlugList(value);
  const save = (next: string[]) => onChange(joinSlugList(next));
  const move = (index: number, delta: number) => {
    const next = [...slugs]; const j = index + delta;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    save(next);
  };
  const available = options.filter((o) => !slugs.includes(o.value));
  return (
    <div className="studio-field-picker" data-picker-kind="books">
      <FieldLabel>{label}</FieldLabel>
      {slugs.length ? <ol className="studio-field-picker-list" aria-label={`${label}: chosen books`}>
        {slugs.map((slug, i) => {
          const found = options.find((o) => o.value === slug);
          return <li key={`${slug}-${i}`} data-missing={found ? undefined : true}>
            <span>{found ? found.label : `“${slug}” — not a book in the shop right now`}{found?.hint && <small>{found.hint}</small>}</span>
            <button type="button" className="studio-field-picker-icon" aria-label={`Move ${found?.label || slug} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={13} /></button>
            <button type="button" className="studio-field-picker-icon" aria-label={`Move ${found?.label || slug} down`} disabled={i === slugs.length - 1} onClick={() => move(i, 1)}><ArrowDown size={13} /></button>
            <button type="button" className="studio-field-picker-icon" aria-label={`Remove ${found?.label || slug}`} onClick={() => save(slugs.filter((_, j) => j !== i))}><X size={13} /></button>
          </li>;
        })}
      </ol> : <p className="studio-field-picker-summary"><em>No books picked yet</em></p>}
      <button type="button" className="studio-field-picker-button studio-field-picker-add" aria-expanded={open} aria-label={`Add a book: ${label}`}
        onClick={() => setOpen((o) => !o)}>+ Add a book</button>
      {open && <OptionSearch options={available} label="Find a book to add" placeholder="Find a book by title or author…"
        onPick={(o) => { save([...slugs, o.value]); setOpen(false); }} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** Video URL with an instant "will this play?" check, matching what the storefront can embed. */
export function VideoPicker({ label, value, onChange }: { label: string; value: any; onChange: (v: string) => void }) {
  const inputId = useId();
  const url = typeof value === "string" ? value : "";
  const info = describeVideo(url);
  return (
    <div className="studio-field-picker" data-picker-kind="video">
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <input id={inputId} aria-label={label} value={url} placeholder="https://youtu.be/… · vimeo.com/… · …/film.mp4"
        onChange={(e) => onChange(e.target.value)} className="studio-field-picker-input" aria-describedby={`${inputId}-note`} />
      <small id={`${inputId}-note`} className="studio-field-picker-note" data-tone={info.kind === "unknown" ? "warn" : undefined}>{info.text}</small>
    </div>
  );
}

/** Google Fonts family: the curated list, a typed name kept as-is, blank = the theme's font. */
export function FontPicker({ label, value, onChange, blankLabel = "Theme font (blank)" }: { label: string; value: any; onChange: (v: string) => void; blankLabel?: string }) {
  const id = useId();
  const current = typeof value === "string" ? value : "";
  const options = useMemo(() => fontOptions(current), [current]);
  return (
    <div className="studio-field-picker" data-picker-kind="font">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <select id={id} aria-label={label} value={current} onChange={(e) => onChange(e.target.value)} className="studio-field-picker-input">
        <option value="">{blankLabel}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

/** Field kinds rendered by a Studio picker. */
export const PICKER_KINDS = ["link", "book", "books", "category", "page", "video", "font"] as const;
export type PickerKind = (typeof PICKER_KINDS)[number];
export const isPickerKind = (kind: string): kind is PickerKind => (PICKER_KINDS as readonly string[]).includes(kind);

/** The picker for a section/block field of one of the picker kinds. */
export function PickerField({ kind, label, value, onChange, emptyText }: { kind: PickerKind; label: string; value: any; onChange: (v: string) => void; emptyText?: string }) {
  switch (kind) {
    case "link": return <LinkPicker label={label} value={value} onChange={onChange} />;
    case "book": return <BookPicker label={label} value={value} onChange={onChange} emptyText={emptyText} />;
    case "books": return <BooksPicker label={label} value={value} onChange={onChange} />;
    case "category": return <CategoryPicker label={label} value={value} onChange={onChange} emptyText={emptyText} />;
    case "page": return <PagePicker label={label} value={value} onChange={onChange} emptyText={emptyText} />;
    case "video": return <VideoPicker label={label} value={value} onChange={onChange} />;
    case "font": return <FontPicker label={label} value={value} onChange={onChange} blankLabel={emptyText} />;
  }
}
