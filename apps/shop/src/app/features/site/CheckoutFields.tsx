// The checkout page's form fields: text boxes, the state/province drop-down, the street address box with suggestions
// while typing, field errors and section headings. Both label layouts (Studio › Style › Checkout page › Field labels:
// above the boxes, the order slip, or inside them) are drawn here; Checkout.tsx picks one through LabelsAbove.
import React, { useState, useEffect, useRef, useId } from "react";
import { newAddressSession, resolveAddress, searchAddresses, type AddressSuggestion } from "./addressSuggest";
import { comboboxInputProps, optionId } from "./comboboxAria";

// Studio › Style › Checkout page › Field labels: above the boxes (order slip) or inside them.
export const LabelsAbove = React.createContext(false);
export const Chevron = () => <svg className="fm-co-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>;

// ─── State / province drop-down for countries with a fixed list ──────────────
export function RegionField({ value, onChange, label, choose, regions, id, error }: { value: string; onChange: (v: string) => void; label: string; choose: string; regions: [string, string][]; id?: string; error?: string }) {
  // Saved addresses may hold the full name ("Ontario"); match it to its code.
  const match = regions.find(([code, name]) => code === value.toUpperCase() || name.toLowerCase() === value.toLowerCase());
  // A saved value that isn't on the list (typo, other country) would show "Choose…" yet still
  // be sent and taxed as typed. Clear it so the shopper picks a real one.
  useEffect(() => { if (value.trim() && !match) onChange(""); }, [value, !!match]); // eslint-disable-line react-hooks/exhaustive-deps
  const stacked = React.useContext(LabelsAbove);
  const ownId = useId();
  if (stacked) {
    const selectId = id || ownId;
    return (
      <div className="fm-co-field">
        <label htmlFor={selectId} className="fm-co-label fm-co-mono">{label}</label>
        <div className="fm-co-select">
          <select id={selectId} value={match ? match[0] : ""} onChange={(e) => onChange(e.target.value)}
            aria-required="true" aria-invalid={error ? true : undefined} aria-describedby={error && id ? `${id}-error` : undefined}
            autoComplete="address-level1" required className="fm-co-input">
            <option value="">{choose}</option>
            {regions.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
          <Chevron />
        </div>
        <FieldError id={id} error={error} />
      </div>
    );
  }
  return (
    <div className="relative">
      <select
        id={id}
        value={match ? match[0] : ""}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        aria-required="true"
        aria-invalid={error ? true : undefined}
        aria-describedby={error && id ? `${id}-error` : undefined}
        autoComplete="address-level1"
        required
        className="peer w-full rounded-lg border border-slate-300 bg-white px-3.5 pb-2 pt-6 text-sm text-slate-900 outline-none transition focus:border-[color:var(--accent)] focus:ring-1 focus:ring-[color:var(--accent)] appearance-none cursor-pointer"
      >
        <option value="" className="bg-white text-slate-900">{choose}</option>
        {regions.map(([code, name]) => (
          <option key={code} value={code} className="bg-white text-slate-900">{name}</option>
        ))}
      </select>
      <label className="absolute left-3.5 top-2 text-xs text-slate-500 pointer-events-none">{label}</label>
      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none text-xs">▾</span>
      <FieldError id={id} error={error} />
    </div>
  );
}

// The words under a box that needs fixing; the box points at it with aria-describedby.
export function FieldError({ id, error }: { id?: string; error?: string }) {
  if (!error || !id) return null;
  return (
    <p id={`${id}-error`} data-studio-target="copy:Checkout" data-studio-label="Field error" className="mt-1 text-xs leading-5" style={{ color: "var(--danger, #b4271a)" }}>
      <span aria-hidden="true">✕ </span>{error}
    </p>
  );
}


// ─── Reusable input ───────────────────────────────────────────────────────────
export function Field({
  label, type = "text", value, onChange, placeholder, autoComplete, inputMode, required, id, error, inputProps
}: {
  label: string; type?: string; value: string;
  onChange: (v: string) => void; placeholder?: string;
  autoComplete?: string; inputMode?: any; required?: boolean;
  id?: string; error?: string; inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
}) {
  const [focused, setFocused] = useState(false);
  const filled = value.length > 0;
  const stacked = React.useContext(LabelsAbove);
  const ownId = useId();
  if (stacked) {
    const inputId = id || ownId;
    return (
      <div className="fm-co-field">
        <label htmlFor={inputId} className="fm-co-label fm-co-mono">{label}</label>
        <input
          {...inputProps}
          id={inputId}
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          required={required}
          aria-required={required ? true : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error && id ? `${id}-error` : undefined}
          className="fm-co-input"
        />
        <FieldError id={id} error={error} />
      </div>
    );
  }
  return (
    <div className="relative">
      <input
        {...inputProps}
        id={id}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder=" "
        autoComplete={autoComplete}
        inputMode={inputMode}
        required={required}
        aria-required={required ? true : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error && id ? `${id}-error` : undefined}
        aria-label={label}
        className="peer w-full rounded-lg border border-slate-300 bg-white px-3.5 pb-2 pt-6 text-sm text-slate-900 outline-none transition focus:border-[color:var(--accent)] focus:ring-1 focus:ring-[color:var(--accent)] placeholder-transparent"
      />
      <label className={`absolute left-3.5 pointer-events-none transition-all duration-150
        ${focused || filled
          ? "top-2 text-xs text-slate-500"
          : "top-1/2 -translate-y-1/2 text-sm text-slate-500"
        }`}>
        {label}
      </label>
      <FieldError id={id} error={error} />
    </div>
  );
}

// ─── Street address with suggestions while typing ────────────────────────────
export function AddressField({ label, value, country, state, onChange, onPick, listLabel, attribution, googleAttribution, enterHint, id, error }: {
  label: string; value: string; country: string; state: string;
  onChange: (v: string) => void; onPick: (s: AddressSuggestion) => void;
  listLabel: string; attribution: string; googleAttribution: string; enterHint?: string; id?: string; error?: string;
}) {
  const listId = useId();
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const typed = useRef(false);
  const session = useRef(newAddressSession());
  const picking = useRef(0);

  useEffect(() => {
    if (!typed.current || value.trim().length < 4) { setItems([]); setOpen(false); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchAddresses(value, country, ctrl.signal, { state, sessionToken: session.current })
        .then(list => { if (ctrl.signal.aborted) return; setItems(list); setActive(-1); setOpen(list.length > 0); })
        .catch(() => {});
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [value, country, state]);

  const pick = async (s: AddressSuggestion) => {
    typed.current = false; setOpen(false); setItems([]);
    const ticket = ++picking.current;
    const full = await resolveAddress(s, value, session.current).catch(() => ({ ...s, street: s.street || s.main || s.label }));
    session.current = newAddressSession();
    // The shopper typed again while the address was looked up: keep what they typed.
    if (ticket !== picking.current || typed.current) return;
    onPick(full);
  };

  const credit = items.some(s => s.source === "google") ? googleAttribution : attribution;
  const stacked = React.useContext(LabelsAbove);

  return (
    <div className="relative"
      onKeyDown={e => {
        if (!open || items.length === 0) return;
        if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => (a + 1) % items.length); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => (a <= 0 ? items.length - 1 : a - 1)); }
        // Enter with the list open never submits the checkout form; it picks the highlighted address, if any.
        else if (e.key === "Enter") { e.preventDefault(); if (active >= 0) void pick(items[active]); }
        else if (e.key === "Escape") setOpen(false);
      }}
      onFocus={() => { if (typed.current && items.length) setOpen(true); }}
      onBlur={() => setTimeout(() => setOpen(false), 150)}>
      <Field label={label} value={value} onChange={v => { typed.current = true; onChange(v); }} autoComplete="address-line1" required id={id} error={error}
        inputProps={comboboxInputProps({ open: open && items.length > 0, listId, activeIndex: active, count: items.length })} />
      {open && (
        <ul id={listId} role="listbox" aria-label={listLabel} data-studio-target="style:checkout" data-studio-label="Address suggestions"
          className="fm-address-suggest absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-lg">
          {items.map((s, i) => (
            <li key={s.placeId || s.label} id={optionId(listId, i)} role="option" aria-selected={i === active}>
              <button type="button" tabIndex={-1} role="presentation" onMouseDown={e => e.preventDefault()} onClick={() => void pick(s)}
                className={`block w-full px-3.5 py-2.5 text-left text-sm text-slate-900 ${i === active ? "bg-slate-100" : "hover:bg-slate-50"}`}>
                {s.secondary
                  ? <><span className="block font-medium">{s.main}</span><span className="block text-xs text-slate-500">{s.secondary}</span></>
                  : s.label}
                {stacked && i === active && enterHint && <span className="fm-co-mono float-right" style={{ color: "var(--accent)" }} aria-hidden="true">{enterHint}</span>}
              </button>
            </li>
          ))}
          {credit && <li role="presentation" className="px-3.5 py-1.5 text-[10px] text-slate-500">{credit}</li>}
        </ul>
      )}
    </div>
  );
}

// ─── Section heading: a small marker (A, B… or 01, 02…), the name, an optional tag ──
export function SectionHead({ marker, title, tag }: { marker: string | null; title: string; tag?: string }) {
  return (
    <div className="fm-co-section-head">
      {marker && <span className="fm-co-marker fm-co-mono" aria-hidden="true">{marker}</span>}
      <h2 className="fm-co-h2">{title}</h2>
      {tag && <span className="fm-co-tag fm-co-mono">{tag}</span>}
    </div>
  );
}
