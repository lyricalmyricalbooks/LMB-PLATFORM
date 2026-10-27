import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { COUNTRIES } from "./shippingZones";
import { flagEmoji, matchCountries, orderedCountries } from "./countryPicker";
import { comboboxInputProps, optionId } from "./comboboxAria";

// ─── Country picker: pinned favourites, type-to-search, keyboard friendly ─────
export function CountryField({ value, onChange, label = "Country", pinnedCodes, showFlags, words, id, error, stacked = false }: {
  value: string; onChange: (v: string) => void; label?: string; id?: string; error?: string;
  /** Checkout's order-slip look: the label sits above a square box (Studio › Checkout page › Field labels). */
  stacked?: boolean;
  pinnedCodes: string[]; showFlags: boolean;
  words: { search: string; popular: string; all: string; none: (q: string) => string };
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const ownId = useId();
  const inputId = id || ownId;
  const { pinned, rest } = useMemo(() => orderedCountries(pinnedCodes), [pinnedCodes]);
  const results = useMemo(() => (query.trim() ? matchCountries(query, pinnedCodes) : [...pinned, ...rest]), [query, pinned, rest, pinnedCodes]);
  const selected = COUNTRIES.find(c => c.name === value);
  const flag = (code: string) => (showFlags ? `${flagEmoji(code)} ` : "");

  const choose = (name: string) => { onChange(name); setOpen(false); setQuery(""); };
  const openList = () => {
    setOpen(true);
    setQuery("");
    const idx = [...pinned, ...rest].findIndex(c => c.name === value);
    setActive(idx >= 0 ? idx : 0);
  };

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  return (
    <div className={stacked ? "fm-co-field" : "relative"} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) { setOpen(false); setQuery(""); } }}>
      {stacked && <label htmlFor={inputId} className="fm-co-label fm-co-mono">{label}</label>}
      <div className={stacked ? "fm-co-select" : "contents"}>
      <input
        ref={inputRef}
        id={inputId}
        {...comboboxInputProps({ open, listId, activeIndex: active, count: results.length })}
        aria-controls={listId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error && id ? `${id}-error` : undefined}
        aria-label={stacked ? undefined : label}
        autoComplete="country-name"
        value={open ? query : `${selected ? flag(selected.code) : ""}${value}`}
        placeholder={open ? words.search : ""}
        onFocus={openList}
        onClick={() => { if (!open) openList(); }}
        onChange={e => {
          // Browser autofill types the whole name in one go: take an exact match straight away.
          const exact = COUNTRIES.find(c => c.name.toLowerCase() === e.target.value.trim().toLowerCase());
          const inputType = (e.nativeEvent as InputEvent).inputType;
          if (exact && inputType !== "insertText" && !String(inputType || "").startsWith("delete")) { choose(exact.name); return; }
          setQuery(e.target.value); setActive(0); if (!open) setOpen(true);
        }}
        onKeyDown={e => {
          if (!open && (e.key === "ArrowDown" || e.key === "Enter")) { e.preventDefault(); openList(); return; }
          if (!open) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(results.length - 1, a + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
          else if (e.key === "Enter") { e.preventDefault(); if (results[active]) choose(results[active].name); }
          else if (e.key === "Tab") { if (query.trim() && results[active]) choose(results[active].name); else setOpen(false); }
          else if (e.key === "Escape") { setOpen(false); setQuery(""); }
        }}
        className={stacked ? "fm-co-input" : "peer w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3.5 pb-2 pt-6 text-sm text-slate-900 outline-none transition focus:border-[color:var(--accent)] focus:ring-1 focus:ring-[color:var(--accent)]"}
      />
      {stacked
        ? <svg className="fm-co-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
        : <><label className="absolute left-3.5 top-2 text-xs text-slate-500 pointer-events-none">{label}</label>
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none text-xs">▾</span></>}
      </div>
      {error && id && <p id={`${id}-error`} data-studio-target="copy:Checkout" data-studio-label="Field error" className="mt-1 text-xs leading-5" style={{ color: "var(--danger, #b4271a)" }}><span aria-hidden="true">✕ </span>{error}</p>}
      {open && (
        <ul ref={listRef} id={listId} role="listbox" aria-label={label} data-studio-target="style:checkout" data-studio-label="Country list"
          className="fm-address-suggest absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-300 bg-white py-1 shadow-lg">
          {results.length === 0 && <li role="presentation" className="px-3.5 py-3 text-sm text-slate-500">{words.none(query.trim())}</li>}
          {results.map((c, i) => (
            <li key={c.code} role="presentation">
              {!query.trim() && i === 0 && pinned.length > 0 && <p className="px-3.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{words.popular}</p>}
              {!query.trim() && i === pinned.length && pinned.length > 0 && <p className="mt-1 border-t border-slate-200 px-3.5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{words.all}</p>}
              <button type="button" role="option" id={optionId(listId, i)} aria-selected={i === active} data-index={i} tabIndex={-1}
                onMouseDown={e => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => choose(c.name)}
                className={`flex w-full items-center justify-between px-3.5 py-2 text-left text-sm text-slate-900 ${i === active ? "bg-slate-100" : ""}`}>
                <span>{flag(c.code)}{c.name}</span>
                {c.name === value && <Check size={14} aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
