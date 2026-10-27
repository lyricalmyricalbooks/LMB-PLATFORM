// Book editor sections for scheduled sales, paid add-ons, box sets and gift-card products.
// State lives in BookEditor's formData; these components only edit their own fields.
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { SectionCard, SelectField, StatusBadge, TextField, Toggle } from "./riso/components";
import {
  ADD_ON_PRESETS, MAX_ADD_ONS, MAX_BUNDLE_PARTS, bundleAvailable, bundlePartProblem, newAddOn, saleStatus, saleWindowProblem,
} from "./productExtras";

type Setter = (name: string, value: any) => void;

// ── Pricing › Sale pricing: dates ──────────────────────────────────
export function SaleWindowFields({ form, set }: { form: any; set: Setter }) {
  const status = saleStatus(form);
  const problem = saleWindowProblem(form);
  const badge = status === "scheduled" ? <StatusBadge tone="info">Scheduled — starts {form.saleStartsAt}</StatusBadge>
    : status === "ended" ? <StatusBadge tone="neutral">Ended {form.saleEndsAt} — shoppers see the regular price</StatusBadge>
    : status === "on" ? <StatusBadge tone="success">On now{form.saleEndsAt ? ` — until ${form.saleEndsAt}` : ""}</StatusBadge>
    : null;
  return (
    <div className="mt-4">
      <div className="be-grid be-grid-3">
        <TextField label="Sale starts" type="date" value={form.saleStartsAt || ""} onChange={(e) => set("saleStartsAt", e.target.value)}
          hint="Leave blank to start now." />
        <TextField label="Sale ends" type="date" value={form.saleEndsAt || ""} min={form.saleStartsAt || undefined} onChange={(e) => set("saleEndsAt", e.target.value)}
          hint="Leave blank to never end. The sale runs to the end of this day." error={problem || undefined} />
        <div className="be-stock-status" aria-live="polite">{badge}</div>
      </div>
      <p className="rp-hint">Dates follow the shop's calendar (Toronto time). Outside these dates shoppers see and pay the regular price, without changing anything here.</p>
    </div>
  );
}

// ── Add-ons tab ────────────────────────────────────────────────────
export function AddOnsEditor({ form, set }: { form: any; set: Setter }) {
  const addOns: any[] = Array.isArray(form.addOns) ? form.addOns : [];
  const full = addOns.length >= MAX_ADD_ONS;
  const update = (id: string, patch: any) => set("addOns", addOns.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const move = (index: number, delta: number) => {
    const next = [...addOns];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    set("addOns", next);
  };
  return (
    <SectionCard title="Paid add-ons" description={`Extras shoppers can tick for each copy, like a signed copy or gift wrap. Up to ${MAX_ADD_ONS}. The price is added per copy, and the packing checklist shows each one (with any inscription wording) so you don't miss it.`}
      actions={<button type="button" className="rp-btn rp-btn-primary rp-btn-sm" disabled={full} onClick={() => set("addOns", [...addOns, newAddOn()])}><Plus size={14} aria-hidden /> Add add-on</button>}>
      <div className="be-inline-actions" role="group" aria-label="Quick add">
        <span className="be-label-xs">Quick add:</span>
        {ADD_ON_PRESETS.map((preset) => (
          <button key={preset.key} type="button" className="rp-btn rp-btn-secondary rp-btn-sm" disabled={full}
            onClick={() => set("addOns", [...addOns, newAddOn(preset)])}>
            <Plus size={13} aria-hidden /> {preset.label}
          </button>
        ))}
      </div>
      {addOns.length === 0 && <p className="be-note">No add-ons. Shoppers buy the book as it is.</p>}
      <div className="be-variants mt-4">
        {addOns.map((a, i) => (
          <fieldset key={a.id} className="be-variant">
            <legend>Add-on {i + 1}{a.label ? ` — ${a.label}` : ""}</legend>
            <div className="be-variant-tools">
              {a.enabled === false && <StatusBadge tone="neutral">Off</StatusBadge>}
              <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${a.label || `add-on ${i + 1}`} up`}>Move up</button>
              <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" disabled={i === addOns.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${a.label || `add-on ${i + 1}`} down`}>Move down</button>
              <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={() => set("addOns", addOns.filter((x) => x.id !== a.id))} aria-label={`Remove ${a.label || `add-on ${i + 1}`}`}><Trash2 size={13} aria-hidden /> Remove</button>
            </div>
            <div className="be-grid be-grid-4">
              <div className="be-span-2"><TextField label="Name shoppers see" maxLength={80} value={a.label} placeholder="e.g. Signed copy" onChange={(e) => update(a.id, { label: e.target.value })} /></div>
              <TextField label="Price per copy (CA$)" type="number" min={0} step="0.01" value={a.price} onChange={(e) => update(a.id, { price: e.target.value === "" ? "" : Number(e.target.value) })} hint="0 for a free option." />
              <SelectField label="Type" value={a.kind === "text" ? "text" : "option"} onChange={(e) => update(a.id, e.target.value === "text" ? { kind: "text", maxLength: a.maxLength || 120 } : { kind: "option", maxLength: undefined })}>
                <option value="option">Tick box</option>
                <option value="text">Short message (e.g. inscription)</option>
              </SelectField>
              {a.kind === "text" && (
                <TextField label="Longest message (characters)" type="number" min={1} max={300} step={1} value={a.maxLength ?? 120}
                  onChange={(e) => update(a.id, { maxLength: e.target.value === "" ? "" : Number(e.target.value) })} hint="Shoppers must type the wording; 1–300." />
              )}
              <div className="be-self-end"><Toggle label="Offer this add-on" checked={a.enabled !== false} onChange={(v) => update(a.id, { enabled: v })} /></div>
            </div>
          </fieldset>
        ))}
      </div>
    </SectionCard>
  );
}

// ── Box set tab ────────────────────────────────────────────────────
export function BoxSetEditor({ form, set, bookId, catalog, catalogError, on, onToggle }: {
  form: any; set: Setter; bookId?: string | null; catalog: any[]; catalogError: boolean; on: boolean; onToggle: (on: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const parts: any[] = Array.isArray(form.bundleItems) ? form.bundleItems : [];
  const byId = useMemo(() => Object.fromEntries(catalog.map((b) => [b.id, b])), [catalog]);
  const sets = bundleAvailable({ bundleItems: parts }, (id) => byId[id]);
  const update = (index: number, patch: any) => set("bundleItems", parts.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  const move = (index: number, delta: number) => {
    const next = [...parts];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    set("bundleItems", next);
  };
  const q = search.trim().toLowerCase();
  const choices = catalog.filter((b) => !bundlePartProblem(b, bookId) && !parts.some((p) => p.bookId === b.id) && String(b.title || "").toLowerCase().includes(q));

  return (
    <SectionCard title="Box set" description="Sell several of your books together at one price. The set has no stock of its own: each set sold takes copies from every book inside it, so it sells out when any of them does.">
      <Toggle label="This product is a box set of other books" checked={on} onChange={onToggle} />
      {on && (
        <>
          <p className="be-note">Stock comes from the books inside, so inventory tracking is switched off for the set itself when you save. Add-ons aren't offered on box sets.</p>
          <ol className="be-variants" style={{ listStyle: "none", padding: 0 }}>
            {parts.map((part, i) => {
              const book = byId[part.bookId];
              const editions = Array.isArray(book?.variants) ? book.variants : [];
              return (
                <li key={`${part.bookId}-${i}`}>
                  <fieldset className="be-variant">
                    <legend>{i + 1}. {book?.title || "Book no longer in the catalog"}{book && book.status !== "published" ? " (not published)" : ""}</legend>
                    <div className="be-variant-tools">
                      <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${book?.title || "book"} up`}>Move up</button>
                      <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" disabled={i === parts.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${book?.title || "book"} down`}>Move down</button>
                      <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={() => set("bundleItems", parts.filter((_, x) => x !== i))} aria-label={`Remove ${book?.title || "book"} from the set`}><Trash2 size={13} aria-hidden /> Remove</button>
                    </div>
                    <div className="be-grid be-grid-3">
                      {editions.length > 0 ? (
                        <SelectField label="Edition" value={part.variantId || ""} onChange={(e) => update(i, { variantId: e.target.value || null })}
                          error={!part.variantId ? "Choose which edition goes in the set." : undefined}>
                          <option value="">Choose an edition</option>
                          {editions.map((v: any) => <option key={v.id} value={v.id}>{v.name || "Edition"}</option>)}
                        </SelectField>
                      ) : <div className="be-stock-status rp-hint">Single edition</div>}
                      <TextField label="Copies in each set" type="number" min={1} max={20} step={1} value={part.quantity ?? 1}
                        onChange={(e) => update(i, { quantity: e.target.value === "" ? "" : Number(e.target.value) })} />
                      <div className="be-stock-status rp-hint">
                        {book ? (book.trackInventory !== true || book.allowBackorder ? "Stock not limited" : `${Number(part.variantId ? (editions.find((v: any) => v.id === part.variantId)?.stock ?? 0) : book.stockLevel) || 0} in stock`) : ""}
                      </div>
                    </div>
                  </fieldset>
                </li>
              );
            })}
          </ol>
          {parts.length === 0 && <p className="be-warn" role="status">⚠ Add at least one book below, or turn this off. A box set with no books is saved as an ordinary product.</p>}
          {parts.length > 0 && (
            <p className="be-note" aria-live="polite"><strong>Sets available from current stock: {Number.isFinite(sets) ? sets : "unlimited (no book inside tracks stock)"}</strong></p>
          )}
          {catalogError ? <p role="alert">The catalog could not be loaded. Your saved books are kept; reopen this editor to retry.</p> : parts.length < MAX_BUNDLE_PARTS && (
            <div className="be-grid">
              <TextField label="Find a book to add" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Type part of the title" />
              <SelectField label="Add a book to the set" value="" onChange={(e) => {
                const id = e.target.value;
                if (!id) return;
                const book = byId[id];
                const editions = Array.isArray(book?.variants) ? book.variants : [];
                set("bundleItems", [...parts, { bookId: id, variantId: editions.length === 1 ? editions[0].id : null, quantity: 1 }]);
              }}>
                <option value="">Choose a book</option>
                {choices.map((b) => <option key={b.id} value={b.id}>{b.title}{b.status !== "published" ? " (not published)" : ""}</option>)}
              </SelectField>
            </div>
          )}
          <p className="rp-hint">Gift cards, other box sets and this product itself can't be added.</p>
        </>
      )}
    </SectionCard>
  );
}

// ── Details › Product type ─────────────────────────────────────────
export function ProductTypeCard({ form, onChange }: { form: any; onChange: (type: "book" | "giftCard") => void }) {
  const giftCard = form.productType === "giftCard";
  return (
    <SectionCard title="Product type" description="Most products are books. Choose Gift card to sell gift cards: shoppers pick an amount and the code is emailed to them (or the person they're giving it to).">
      <div role="radiogroup" aria-label="Product type" className="be-chips">
        {[{ id: "book", label: "Book" }, { id: "giftCard", label: "Gift card" }].map((t) => {
          const on = (t.id === "giftCard") === giftCard;
          return <button key={t.id} type="button" role="radio" aria-checked={on} className={`be-chip ${on ? "is-on" : ""}`} onClick={() => onChange(t.id as any)}>{on ? "✓ " : ""}{t.label}</button>;
        })}
      </div>
      {giftCard && (
        <p className="be-note">Each edition is an amount, e.g. CA$25 — set them on the <strong>Amounts</strong> tab. Gift cards are always delivered by email, never shipped, taxed or discounted, and have no stock limit or add-ons.</p>
      )}
    </SectionCard>
  );
}
