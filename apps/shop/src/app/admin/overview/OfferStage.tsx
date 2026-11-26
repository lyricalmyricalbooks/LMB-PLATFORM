import { useState, type ReactNode } from "react";
import { BookOpen, Check } from "lucide-react";
import { PrimaryButton, SectionCard } from "../riso/components";
import { TYPE_GROUPS, type TypeGroupId } from "../../../shared/productTypes";
import { SERVICE_CHOICES } from "../WhatYouSellCard";
import { friendlyError } from "../studio/friendlyError";
import { offerChange, offerProblem, offerStart, type OfferAnswers } from "../offerStage";
import type { FirstWeekDoc } from "../firstWeek";

const KIND_NAME = { products: "Product shop", services: "Services", both: "Products and services" } as const;

/**
 * Get started, step 1 (shop types plan, part 1): What you offer. Sign-up asked the kind of shop; this asks what a
 * product shop sells (books turn the book tools on, nothing else does), what people book, and for a shop doing both,
 * what most customers come for. One Continue saves it all (offerStage.ts `offerChange`). The kind itself changes in
 * Settings › What you offer, so it is named here, not asked again.
 */
export function OfferStage({ doc, onDone }: { doc: FirstWeekDoc; onDone: (change: ReturnType<typeof offerChange>) => Promise<void> }) {
  const [a, setA] = useState<OfferAnswers>(() => offerStart(doc));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (change: Partial<OfferAnswers>) => { setA((was) => ({ ...was, ...change })); setError(""); };
  const toggleGroup = (id: TypeGroupId) => set({ groups: a.groups.includes(id) ? a.groups.filter((g) => g !== id) : [...a.groups, id] });
  const save = async () => {
    const problem = offerProblem(a);
    if (problem) { setError(problem); return; }
    setBusy(true); setError("");
    try { await onDone(offerChange(a, doc, new Date().toISOString())); }
    catch (e) { setError(friendlyError(e, "your answers")); setBusy(false); }
  };
  const question = (id: string, title: string, hint: string, body: ReactNode) => (
    <section aria-labelledby={id} style={{ display: "grid", gap: 10 }}>
      <div>
        <h3 id={id} style={{ margin: 0, fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}>{title}</h3>
        <p className="rp-hint" style={{ margin: "2px 0 0" }}>{hint}</p>
      </div>
      {body}
    </section>
  );
  // An answer picked is the admin's on state (a filled pill), like the product groups in Settings.
  // `radio` picks one of a group (aria-checked); otherwise each pill is on or off by itself (aria-pressed).
  const pill = (on: boolean, label: string, onClick: () => void, extra: Record<string, string> = {}, radio = false) => (
    <button key={label} type="button" className="rp-group-chip" {...(radio ? { role: "radio", "aria-checked": on } : { "aria-pressed": on })} disabled={busy} onClick={onClick} {...extra}>
      {on && <Check size={14} aria-hidden />}{label}
    </button>
  );
  const sellsThings = a.kind !== "services";
  const takesBookings = a.kind !== "products";
  return (
    <SectionCard title="What you offer" description="So your menu, your words and your website fit what you do." collapsible={false}>
      <div data-offer-stage style={{ display: "grid", gap: 24 }}>
        <p data-offer-kind style={{ margin: 0, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <span className="rp-hint">You signed up as</span>
          <strong style={{ padding: "4px 12px", borderRadius: 999, background: "var(--rp-primary-tint)", fontWeight: 600 }}>{KIND_NAME[a.kind]}</strong>
          <span className="rp-hint">You can change this later in Settings.</span>
        </p>
        {takesBookings && question("offer-does", "What do people book?", "We'll start your calendar and website with services like these.",
          <div className="rp-group-chips" role="radiogroup" aria-labelledby="offer-does">
            {SERVICE_CHOICES.map((c) => pill(a.does === c.id, c.label, () => set({ does: c.id }), { "data-offer-does": c.id }, true))}
          </div>)}
        {sellsThings && question("offer-groups", a.kind === "both" ? "What do you sell alongside?" : "What do you sell?", "Pick all that fit. Adding a product offers these kinds first.",
          <div className="rp-group-chips" role="group" aria-labelledby="offer-groups">
            {TYPE_GROUPS.filter((g) => g.id !== "books" || a.kind === "both").map((g) => pill(a.groups.includes(g.id), g.name, () => toggleGroup(g.id), { "data-offer-group": g.id }))}
          </div>)}
        {a.kind === "products" && (
          <label data-offer-books style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: 12, alignItems: "start", padding: 16, borderRadius: "var(--rp-radius-lg)", cursor: "pointer",
            border: `1px solid ${a.books ? "var(--rp-text)" : "var(--rp-border)"}`, background: a.books ? "var(--rp-primary-tint)" : "var(--rp-surface)" }}>
            <input type="checkbox" checked={a.books} disabled={busy} onChange={(e) => set({ books: e.target.checked })} style={{ marginTop: 3, width: 18, height: 18 }} />
            <span style={{ display: "grid", gap: 2 }}>
              <strong style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}><BookOpen size={16} aria-hidden />Books, zines or comics</strong>
              <span className="rp-hint">Adds the book tools: authors, ISBNs and royalties. Leave it off if you don't sell books.</span>
            </span>
          </label>
        )}
        {a.kind === "both" && question("offer-lead", "What do most customers come for?", "That side leads your menu and your website. Both stay in.",
          <div className="rp-group-chips" role="radiogroup" aria-labelledby="offer-lead">
            {pill(a.lead === "services", "Booking a time", () => set({ lead: "services" }), { "data-offer-lead": "services" }, true)}
            {pill(a.lead === "products", "Buying things", () => set({ lead: "products" }), { "data-offer-lead": "products" }, true)}
          </div>)}
        {error && <p role="alert" className="rp-hint" style={{ margin: 0, color: "var(--rp-danger)" }}>{error}</p>}
        <div><PrimaryButton busy={busy} disabled={busy} onClick={() => { void save(); }}>Continue</PrimaryButton></div>
      </div>
    </SectionCard>
  );
}
