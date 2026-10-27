import { plainError } from "./plainError";
import { useState, useEffect, useMemo } from "react";
import { Link2, Plus, Trash2 } from "lucide-react";
import { adminApi } from "./api";
import { getOrdersCached } from "./ordersCache";
import toast from "react-hot-toast";
import { discountCategoryChoices } from "../features/site/discountCategories";
import { discountState as state, today } from "./discountState";
import { discountPerformance, duplicateDiscount, perfKey } from "./discountPerformance";
import { validateDiscountDraft, draftFrom } from "./discountValidation";
import { describeDiscount } from "./discountDescribe";
import { copyText } from "./clipboard";
import { discountShareLink } from "../features/site/sharedDiscount";
import { MAX_BATCH, batchCodes, cleanPrefix, codesCsv, randomCode } from "./discountCodes";
import {
  ActionMenu, Checkbox, ConfirmDialog, DataTable, Dialog, EmptyState, ErrorState, FilterBar, IconButton, LoadingState,
  MetricCard, PrimaryButton, SearchField, SecondaryButton, SectionCard, SelectField, StatusBadge, TextArea, TextField,
  Tabs, Toggle, useConfirm, type Column,
} from "./riso/components";

// ─── helpers ────────────────────────────────────────────────────────────────

const fmt = (n: number | null | undefined) => (n != null && n !== ("" as any) ? `CA$${Number(n).toFixed(2)}` : "—");

const TYPE_OPTIONS = [
  { id: "percentage", label: "Percentage", desc: "e.g. 20% off" },
  { id: "fixed", label: "Fixed amount", desc: "e.g. $10 off" },
  { id: "freeship", label: "Free shipping", desc: "Waive shipping cost" },
  { id: "bogo", label: "Buy X get Y", desc: "BOGO offers" },
  { id: "tiered", label: "Tiered spend", desc: "Bigger spend, bigger discount" },
  { id: "gift", label: "Free gift with purchase", desc: "Adds a free book to the order", automaticOnly: true },
];

const ONE_DISCOUNT_HELP = "Only one discount applies per order. A code the shopper enters replaces automatic offers; among automatic offers the biggest saving wins, and free shipping applies only when no other offer does.";

const isAutomatic = (d: any) => d?.method === "automatic";
/** The name the owner knows a discount by: its code, or an automatic offer's title. */
const discountName = (d: any) => (isAutomatic(d) ? d.title || "Automatic offer" : d.code);

const EMPTY: any = {
  code: "", type: "percentage", value: 10, isActive: true, startDate: "", expiryDate: "", minOrderAmount: "", minQuantity: "", maxDiscountAmount: "",
  usageLimit: "", onePerCustomer: false, appliesTo: "all", selectedCategories: [], selectedProducts: [],
  allowedEmailDomains: "", allowedCustomerEmails: "", description: "", buyQuantity: 1, getQuantity: 1,
  getDiscountValue: 100, tiers: [{ minSpend: 0, value: 0, type: "percentage" }],
  method: "code", title: "", giftBookId: "", giftVariantId: "",
};

// ─── Create / edit dialog ─────────────────────────────────────────────────────


function DiscountDialog({ initial, otherCodes = [], books, shopCategories, onClose, onSave, onSaveBatch }: { initial?: any; otherCodes?: string[]; books: any[] | null; shopCategories: any[] | null; onClose: () => void; onSave: (data: any) => Promise<void>; onSaveBatch: (data: any, codes: string[]) => Promise<void> }) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState<any>(initial ? draftFrom(initial, EMPTY) : EMPTY);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [giftSearch, setGiftSearch] = useState("");
  const [bookSearch, setBookSearch] = useState("");
  // "Create several single-use codes": N codes PREFIX-XXXXXX with the same rules, one use each.
  const [batch, setBatch] = useState({ on: false, count: "10", prefix: "" });
  // Closing with typed changes asks first, so a half-made discount isn't lost to a stray Escape or click outside.
  const [startForm] = useState(() => JSON.stringify(form));
  const [ask, confirmNode] = useConfirm();
  const close = async () => {
    const changed = JSON.stringify(form) !== startForm || batch.on;
    if (changed && !saving && !(await ask({ title: isEdit ? "Discard your changes?" : "Discard this discount?", message: isEdit ? "Your changes to this discount aren't saved yet." : "This discount hasn't been created yet.", confirmLabel: "Discard" }))) return;
    onClose();
  };
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const automatic = form.method === "automatic";
  const giftBook = (books || []).find(b => b.id === form.giftBookId);
  const setMethod = (method: "code" | "automatic") => setForm((f: any) => ({
    ...f, method,
    // A free gift is automatic-only: switching back to a code picks an ordinary type.
    ...(method === "code" && f.type === "gift" ? { type: "percentage" } : {}),
  }));

  const validate = () => {
    const batching = batch.on && !isEdit && !automatic;
    const e = validateDiscountDraft(batching ? { ...form, code: randomCode(batch.prefix), usageLimit: "" } : form, undefined, otherCodes, giftBook, isEdit ? String(initial?.expiryDate || "") : "");
    const n = Number(batch.count);
    if (batching && !(Number.isInteger(n) && n >= 1 && n <= MAX_BATCH)) e.batch = `Choose between 1 and ${MAX_BATCH} codes.`;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) { toast.error("Fix the highlighted fields first"); return; }
    setSaving(true);
    try {
      const save = batch.on && !isEdit && !automatic
        ? (data: any) => onSaveBatch({ ...data, usageLimit: 1 }, batchCodes(batch.prefix, Number(batch.count), otherCodes))
        : onSave;
      await save({
        ...form,
        method: automatic ? "automatic" : "code",
        // Automatic offers have no code, so they can never be typed in at checkout.
        code: automatic ? "" : String(form.code || "").toUpperCase().trim(),
        title: automatic ? String(form.title || "").trim() : "",
        giftBookId: form.type === "gift" ? form.giftBookId || null : null,
        giftVariantId: form.type === "gift" ? form.giftVariantId || null : null,
        onePerCustomer: automatic ? false : !!form.onePerCustomer,
        value: form.type === "freeship" || form.type === "gift" ? 0 : Number(form.value) || 0,
        minOrderAmount: form.minOrderAmount !== "" ? Number(form.minOrderAmount) : null,
        minQuantity: form.minQuantity !== "" ? Number(form.minQuantity) : null,
        maxDiscountAmount: form.maxDiscountAmount !== "" && form.maxDiscountAmount != null && form.type !== "freeship" && form.type !== "gift" ? Number(form.maxDiscountAmount) : null,
        usageLimit: form.usageLimit !== "" ? Number(form.usageLimit) : null,
        selectedCategories: form.appliesTo === "categories" ? (form.selectedCategories || []) : [],
        selectedProducts: form.appliesTo === "products" ? (form.selectedProducts || []) : [],
        allowedEmailDomains: automatic ? "" : form.allowedEmailDomains || "",
        allowedCustomerEmails: automatic ? "" : form.allowedCustomerEmails || "",
        buyQuantity: form.type === "bogo" ? (Number(form.buyQuantity) || 1) : null,
        getQuantity: form.type === "bogo" ? (Number(form.getQuantity) || 1) : null,
        getDiscountValue: form.type === "bogo" ? Number(form.getDiscountValue ?? 100) : null,
        tiers: form.type === "tiered" ? (form.tiers || []) : null,
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleIn = (key: "selectedCategories" | "selectedProducts", id: string) => {
    const cur: string[] = form[key] || [];
    set(key, cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);
  };
  const setTier = (i: number, patch: any) => set("tiers", (form.tiers || []).map((t: any, idx: number) => (idx === i ? { ...t, ...patch } : t)));

  return (
    <>
    <Dialog open onClose={() => { void close(); }} size="lg" badge="🏷️" title={isEdit ? "Edit discount" : "New discount"}
      description="Checkout checks every rule again when a shopper uses it — this form only sets the rules."
      footer={<>
        <SecondaryButton onClick={() => { void close(); }}>Cancel</SecondaryButton>
        <PrimaryButton onClick={handleSave} disabled={saving}>{saving ? "Saving…" : isEdit ? "Save changes" : automatic ? "Create offer" : batch.on ? `Create ${Number(batch.count) || 0} codes` : "Create code"}</PrimaryButton>
      </>}>
      <div className="rp-stack" style={{ gap: 20 }}>
        <p className="rp-card" role="status" aria-live="polite" style={{ margin: 0, padding: "10px 12px", boxShadow: "none" }}>
          <strong>Shoppers get:</strong> {describeDiscount(form, books || [])}
        </p>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="rp-label" style={{ marginBottom: 8 }}>Method</legend>
          <div role="radiogroup" aria-label="Method" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[{ id: "code", label: "Discount code", desc: "Shoppers type a code at checkout" }, { id: "automatic", label: "Automatic (no code)", desc: "Applies by itself when the order qualifies" }].map(m => (
              <button key={m.id} type="button" role="radio" aria-checked={form.method === m.id} onClick={() => setMethod(m.id as any)}
                className={`rp-btn ${form.method === m.id ? "rp-btn-ink" : "rp-btn-secondary"}`}
                style={{ flexDirection: "column", alignItems: "flex-start", textAlign: "left", whiteSpace: "normal", height: "auto", padding: "10px 12px", flex: "1 1 200px" }}>
                <span>{m.label}</span>
                <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: "none", opacity: 0.8 }}>{m.desc}</span>
              </button>
            ))}
          </div>
          <p className="rp-hint" style={{ margin: "8px 0 0" }}>{ONE_DISCOUNT_HELP}</p>
        </fieldset>
        {automatic ? (
          <TextField label="Title shown to shoppers" value={form.title || ""} maxLength={60} onChange={e => set("title", e.target.value)} placeholder="e.g. Spring sale"
            error={errors.title} hint="Shown in the bag and at checkout next to the saving." />
        ) : batch.on && !isEdit ? (
          <div className="rp-card" style={{ padding: 16, boxShadow: "none" }}>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <TextField label="How many codes" type="number" min={1} max={MAX_BATCH} step={1} value={batch.count} onChange={e => setBatch(b => ({ ...b, count: e.target.value }))} error={errors.batch} hint={`Up to ${MAX_BATCH}. Each works once.`} />
              <TextField label="Code prefix (optional)" value={batch.prefix} maxLength={20} onChange={e => setBatch(b => ({ ...b, prefix: e.target.value.toUpperCase() }))} placeholder="e.g. FAIR" hint={`Codes look like ${cleanPrefix(batch.prefix) ? `${cleanPrefix(batch.prefix)}-XXXXXX` : "XXXXXXXX"}.`} style={{ fontFamily: "var(--rp-font-mono)" }} />
            </div>
            <p className="rp-hint" style={{ margin: "8px 0 0" }}>A spreadsheet (CSV) of the new codes downloads when they are created.</p>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="rp-grow"><TextField label="Code" value={form.code} onChange={e => set("code", e.target.value.toUpperCase())} placeholder="e.g. SUMMER25"
              error={errors.code} data-autofocus style={{ fontFamily: "var(--rp-font-mono)", textTransform: "uppercase" }} /></div>
            <SecondaryButton onClick={() => set("code", randomCode())}>Generate</SecondaryButton>
          </div>
        )}
        {!automatic && !isEdit && <Toggle label="Create several single-use codes" checked={batch.on} onChange={v => setBatch(b => ({ ...b, on: v }))} />}
        <TextField label="Internal description" value={form.description || ""} onChange={e => set("description", e.target.value)}
          placeholder="e.g. Summer sale 2026" hint="Only administrators see this." />

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="rp-label" style={{ marginBottom: 8 }}>Discount type</legend>
          <div role="radiogroup" aria-label="Discount type" style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
            {TYPE_OPTIONS.filter(t => !t.automaticOnly || automatic).map(t => (
              <button key={t.id} type="button" role="radio" aria-checked={form.type === t.id} onClick={() => set("type", t.id)}
                className={`rp-btn ${form.type === t.id ? "rp-btn-ink" : "rp-btn-secondary"}`}
                style={{ flexDirection: "column", alignItems: "flex-start", textAlign: "left", whiteSpace: "normal", height: "auto", padding: "10px 12px" }}>
                <span>{t.label}</span>
                <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: "none", opacity: 0.8 }}>{t.desc}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {(form.type === "percentage" || form.type === "fixed") && (
          <TextField label={form.type === "percentage" ? "Percentage off" : "Amount off (CA$)"} type="number" min={0}
            max={form.type === "percentage" ? 100 : undefined} value={form.value} onChange={e => set("value", e.target.value)} error={errors.value} />
        )}

        {form.type === "bogo" && (
          <div>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
            <TextField label="Buy quantity" type="number" min={1} value={form.buyQuantity ?? 1} onChange={e => set("buyQuantity", parseInt(e.target.value) || 1)} />
            <TextField label="Get quantity" type="number" min={1} value={form.getQuantity ?? 1} onChange={e => set("getQuantity", parseInt(e.target.value) || 1)} />
            <TextField label="Discount on the free items (%)" type="number" min={0} max={100} value={form.getDiscountValue ?? 100} onChange={e => set("getDiscountValue", parseInt(e.target.value) || 0)} />
          </div>
          {errors.bogo && <p role="alert" className="rp-error-text">{errors.bogo}</p>}
          </div>
        )}

        {form.type === "tiered" && (
          <div className="rp-card" style={{ padding: 16, boxShadow: "none" }}>
            <div className="rp-sect">Tiers</div>
            <div className="rp-stack" style={{ gap: 12 }}>
              {(form.tiers || []).map((tier: any, i: number) => (
                <div key={i} style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr)) auto", alignItems: "end" }}>
                  <TextField label={`Tier ${i + 1} · minimum spend (CA$)`} type="number" min={0} value={tier.minSpend} onChange={e => setTier(i, { minSpend: parseFloat(e.target.value) || 0 })} />
                  <TextField label="Discount value" type="number" min={0} value={tier.value} onChange={e => setTier(i, { value: parseFloat(e.target.value) || 0 })} />
                  <SelectField label="Type" value={tier.type} onChange={e => setTier(i, { type: e.target.value })}>
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed ($)</option>
                  </SelectField>
                  {(form.tiers || []).length > 1 && <IconButton tone="danger" label={`Remove tier ${i + 1}`} onClick={() => set("tiers", form.tiers.filter((_: any, x: number) => x !== i))}><Trash2 size={16} aria-hidden /></IconButton>}
                </div>
              ))}
              {(form.tiers || []).length < 3 && (
                <SecondaryButton size="sm" icon={<Plus size={14} aria-hidden />} onClick={() => set("tiers", [...(form.tiers || []), { minSpend: 0, value: 0, type: "percentage" }])}>Add tier</SecondaryButton>
              )}
              {errors.tiers && <p role="alert" className="rp-error-text">{errors.tiers}</p>}
            </div>
          </div>
        )}

        {form.type === "gift" && (
          <div className="rp-card" style={{ padding: 16, boxShadow: "none" }}>
            <div className="rp-sect">Free gift</div>
            <p className="rp-hint" style={{ marginTop: 0 }}>When an order meets the conditions below, this book is added to it for free. It uses the book's stock; if it runs out, the offer simply stops applying.</p>
            {books === null ? <p className="rp-hint">Loading catalog…</p> : (
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                <TextField label="Find a book" value={giftSearch} onChange={e => setGiftSearch(e.target.value)} placeholder="Type part of the title" />
                <SelectField label="Book to give away" value={form.giftBookId || ""} error={errors.gift && !form.giftBookId ? errors.gift : undefined}
                  onChange={e => setForm((f: any) => ({ ...f, giftBookId: e.target.value, giftVariantId: "" }))}>
                  <option value="">Choose a book</option>
                  {giftBook && <option value={giftBook.id}>{giftBook.title}</option>}
                  {books.filter(b => b.id !== form.giftBookId && b.productType !== "giftCard" && !(Array.isArray(b.bundleItems) && b.bundleItems.length) && String(b.title || "").toLowerCase().includes(giftSearch.trim().toLowerCase()))
                    .map(b => <option key={b.id} value={b.id}>{b.title}{b.status !== "published" ? " (not published)" : ""}</option>)}
                </SelectField>
                {giftBook && (giftBook.variants || []).length > 0 && (
                  <SelectField label="Edition" value={form.giftVariantId || ""} onChange={e => set("giftVariantId", e.target.value)}
                    error={errors.gift && form.giftBookId ? errors.gift : undefined}>
                    <option value="">Choose an edition</option>
                    {(giftBook.variants || []).map((v: any) => <option key={v.id} value={v.id}>{v.name || "Edition"}</option>)}
                  </SelectField>
                )}
              </div>
            )}
            {errors.gift && form.giftBookId && !(giftBook && (giftBook.variants || []).length) && <p role="alert" className="rp-error-text">{errors.gift}</p>}
            {giftBook && giftBook.status !== "published" && <p className="rp-hint" role="status">⚠ This book isn't published, so shoppers won't get it until it is.</p>}
          </div>
        )}

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="rp-label" style={{ marginBottom: 8 }}>Applies to</legend>
          <div role="radiogroup" aria-label="Applies to" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[{ id: "all", label: "All products" }, { id: "categories", label: "Categories" }, { id: "products", label: "Specific books" }].map(o => (
              <button key={o.id} type="button" role="radio" aria-checked={form.appliesTo === o.id} onClick={() => set("appliesTo", o.id)}
                className={`rp-btn ${form.appliesTo === o.id ? "rp-btn-ink" : "rp-btn-secondary"}`}>{o.label}</button>
            ))}
          </div>
          {errors.applies && <p role="alert" className="rp-error-text" style={{ marginTop: 8 }}>{errors.applies}</p>}
          {form.appliesTo === "categories" && (
            <div style={{ display: "grid", gap: 4, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginTop: 12 }}>
              {shopCategories === null ? <p className="rp-hint">Loading shop categories…</p>
                : discountCategoryChoices(shopCategories, form.selectedCategories || []).map(cat => (
                  <Checkbox key={cat.name} checked={(form.selectedCategories || []).includes(cat.name)} onChange={() => toggleIn("selectedCategories", cat.name)}
                    label={cat.parent ? `${cat.parent} › ${cat.name}` : cat.missing ? `${cat.name} (no longer a shop category)` : cat.renamedTo ? `${cat.name} (old name of ${cat.renamedTo})` : cat.name} />
                ))}
              {shopCategories !== null && <p className="rp-hint" style={{ gridColumn: "1 / -1", margin: "4px 0 0" }}>Categories come from Studio › Menus › Shop categories. A parent category also covers its sub-categories’ books, just like the shop’s category pages.</p>}
            </div>
          )}
          {form.appliesTo === "products" && (() => {
            const chosen: string[] = form.selectedProducts || [];
            const q = bookSearch.trim().toLowerCase();
            const shown = (books || []).filter(b => !q || `${b.title || ""} ${b.isbn || ""}`.toLowerCase().includes(q));
            return (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
                  <div className="rp-grow"><SearchField label="Find books" placeholder="Search by title or ISBN…" value={bookSearch} onChange={e => setBookSearch(e.target.value)} /></div>
                  <span className="rp-hint" role="status">{chosen.length} selected</span>
                </div>
                <div style={{ maxHeight: 220, overflowY: "auto", marginTop: 8, border: "1px solid var(--rp-border)", padding: "4px 12px" }}>
                  {books === null ? <p className="rp-hint">Loading catalog…</p>
                    : books.length === 0 ? <p className="rp-hint">No books in the catalog yet.</p>
                    : shown.length === 0 ? <p className="rp-hint">No books match “{bookSearch}”.</p>
                    : shown.map(b => <Checkbox key={b.id} label={b.title} checked={chosen.includes(b.id)} onChange={() => toggleIn("selectedProducts", b.id)} />)}
                </div>
              </div>
            );
          })()}
        </fieldset>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
          <TextField label="Start date (optional)" type="date" value={form.startDate || ""} onChange={e => set("startDate", e.target.value)} hint={automatic ? "The offer stays off until this day — schedule a sale ahead of time." : "Code stays off until this day — schedule a sale ahead of time."} />
          <TextField label="Expiry date (optional)" type="date" min={isEdit && initial?.expiryDate ? undefined : today()} value={form.expiryDate || ""} onChange={e => set("expiryDate", e.target.value)} hint={automatic ? "Last day the offer applies." : "Last day the code works."} error={errors.expiryDate} />
          <TextField label="Minimum order (CA$)" type="number" min={0} value={form.minOrderAmount} onChange={e => set("minOrderAmount", e.target.value)} placeholder="No minimum" error={errors.minOrderAmount} />
          <TextField label="Minimum quantity" type="number" min={0} step={1} value={form.minQuantity} onChange={e => set("minQuantity", e.target.value)} placeholder="No minimum" error={errors.minQuantity} />
          {form.type !== "freeship" && form.type !== "gift" && <TextField label="Maximum discount (CA$)" type="number" min={0} value={form.maxDiscountAmount ?? ""} onChange={e => set("maxDiscountAmount", e.target.value)} placeholder="No cap" hint="Most this code can take off one order, e.g. 20% off up to $15." error={errors.maxDiscountAmount} />}
          {!(batch.on && !isEdit && !automatic) && <TextField label="Total usage limit" type="number" min={1} step={1} value={form.usageLimit} onChange={e => set("usageLimit", e.target.value)} placeholder="Unlimited" error={errors.usageLimit} />}
        </div>

        <div style={{ display: "grid", gap: 4 }}>
          {!automatic && <Toggle label="One use per customer" checked={!!form.onePerCustomer} onChange={v => set("onePerCustomer", v)} />}
          <Toggle label={automatic ? "Offer is active" : "Code is active"} checked={!!form.isActive} onChange={v => set("isActive", v)} />
        </div>

        {!automatic && <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <TextArea label="Allowed email domains" rows={2} value={form.allowedEmailDomains || ""} onChange={e => set("allowedEmailDomains", e.target.value)}
            placeholder="e.g. .edu, student.ca" hint="Comma separated. Leave empty for everyone." style={{ minHeight: 64 }} />
          <TextArea label="Allowed customer emails" rows={2} value={form.allowedCustomerEmails || ""} onChange={e => set("allowedCustomerEmails", e.target.value)}
            placeholder="e.g. vip@gmail.com" hint="Comma separated list of specific customers." style={{ minHeight: 64 }} />
        </div>}
      </div>
    </Dialog>
    {confirmNode}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

// A plain date ("2026-10-31") is that calendar day; new Date() would read it as UTC midnight
// and show the day before anywhere west of UTC.
const shopDay = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date)
  ? new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
  : new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

const shareLinkFor = (code: string) => discountShareLink(code, window.location.origin, import.meta.env.BASE_URL);

// The link a shopper opens to get the code filled in at checkout (sharedDiscount.ts). Checkout checks
// it with the server like a typed code, so a paused, expired or used-up code is simply refused there.
function ShareDiscountDialog({ code, discount, onClose }: { code: string; discount?: any; onClose: () => void }) {
  const link = shareLinkFor(code);
  const s = discount ? state(discount) : null;
  return (
    <Dialog open onClose={onClose} title={`Share ${code}`}
      description="Send this link by email, in a newsletter or on social media. Anyone who opens it gets the code filled in at checkout."
      footer={<>
        <SecondaryButton onClick={() => { void copyText(code); }}>Copy code</SecondaryButton>
        <PrimaryButton icon={<Link2 size={16} aria-hidden />} onClick={() => { void copyText(link, "Share link"); }}>Copy link</PrimaryButton>
      </>}>
      <div className="rp-stack">
        <TextField label="Share link" value={link} readOnly onFocus={e => e.currentTarget.select()} />
        {s && s.key !== "active" && (
          <p className="rp-hint" role="status" style={{ margin: 0 }}>
            <StatusBadge tone={s.tone}>{s.label}</StatusBadge>{" "}
            {s.key === "scheduled" ? "The link works from the code's start date. Before then checkout says the code isn't valid yet."
              : "Checkout won't accept this code right now, so the link won't take anything off until you activate or edit the code."}
          </p>
        )}
        <p className="rp-hint" style={{ margin: 0 }}>The link opens the shop's home page. The code is applied when the shopper reaches checkout, and checkout still checks every rule you set (dates, minimum spend, usage limits).</p>
      </div>
    </Dialog>
  );
}

export function Discounts() {
  const [discounts, setDiscounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "scheduled" | "paused" | "expired" | "exhausted">("all");
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<any | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [books, setBooks] = useState<any[] | null>(null);
  const [shopCategories, setShopCategories] = useState<any[] | null>(null);
  // The code just created: its share link opens straight away so it can be sent by email etc.
  const [sharing, setSharing] = useState<string | null>(null);

  useEffect(() => { load(); }, []);
  // The whole catalog (drafts too) for the book pickers and free-gift names. Best-effort.
  useEffect(() => { adminApi.getAllBooks().then(setBooks).catch(() => setBooks([])); }, []);
  // The published shop categories (Studio › Menus › Shop categories), the names checkout matches.
  useEffect(() => { adminApi.getPublicSettings().then((st: any) => setShopCategories(Array.isArray(st?.design?.categories) ? st.design.categories : [])).catch(() => setShopCategories([])); }, []);
  // Performance is best-effort: a failure here must not block managing codes.
  // Every order (the admin's shared copy, read in pages), so older redemptions count too.
  useEffect(() => { getOrdersCached().then(setOrders).catch(() => {}); }, []);
  const perf = useMemo(() => discountPerformance(orders), [orders]);

  async function load() {
    setLoading(true); setFailed(false);
    try { setDiscounts(await adminApi.getDiscounts()); } catch { setFailed(true); toast.error("Failed to load discounts"); } finally { setLoading(false); }
  }

  const handleSave = async (data: any) => {
    try {
      if (data.id) { await adminApi.updateDiscount(data.id, data); toast.success("Discount updated"); }
      else {
        await adminApi.saveDiscount(data);
        toast.success(isAutomatic(data) ? "Automatic offer created" : "Discount code created");
        if (!isAutomatic(data) && data.code) setSharing(String(data.code).toUpperCase());
      }
      setDialogOpen(false); setEditing(null); load();
    } catch (err: any) {
      toast.error(plainError(err, "Save failed"));
    }
  };

  // Single-use batch: one createDiscount per code; reports what worked and downloads those codes.
  const handleSaveBatch = async (data: any, codes: string[]) => {
    const results = await Promise.allSettled(codes.map(code => adminApi.saveDiscount({ ...data, code })));
    const created = codes.filter((_, i) => results[i].status === "fulfilled");
    const failed = codes.length - created.length;
    if (created.length) {
      try {
        const url = URL.createObjectURL(new Blob([codesCsv(created, describeDiscount(data, books || []))], { type: "text/csv;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url; a.download = `discount-codes-${today()}.csv`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch { /* the codes are still in the list */ }
    }
    if (!failed) toast.success(`${created.length} single-use codes created`);
    else if (created.length) toast.error(`${created.length} codes created; ${failed} failed. Create the rest again.`);
    else toast.error(plainError((results.find(r => r.status === "rejected") as PromiseRejectedResult | undefined)?.reason, "No codes could be created"));
    // Nothing created: keep the dialog (and what was typed) as it is for another try.
    if (created.length) { setDialogOpen(false); setEditing(null); load(); }
  };

  const handleDelete = async (d: any) => {
    try { await adminApi.deleteDiscount(d.id); toast.success("Discount deleted"); load(); } catch { toast.error("Delete failed"); }
  };

  const handleToggle = async (d: any) => {
    try { await adminApi.updateDiscount(d.id, { isActive: !d.isActive }); toast.success(`${isAutomatic(d) ? "Offer" : "Code"} ${d.isActive ? "paused" : "activated"}`); load(); } catch { toast.error("Toggle failed"); }
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return discounts.filter(d => {
      if (filter !== "all" && state(d).key !== filter) return false;
      return !q || `${d.code || ""} ${d.title || ""} ${d.description || ""}`.toLowerCase().includes(q);
    });
  }, [discounts, filter, search]);

  const totalGiven = useMemo(() => Array.from(perf.values()).reduce((a, p) => a + p.discountGiven, 0), [perf]);
  const totalCodeRevenue = useMemo(() => Array.from(perf.values()).reduce((a, p) => a + p.revenue, 0), [perf]);
  const totalRedemptions = discounts.reduce((a, d) => a + (d.usageCount || 0), 0);
  const activeCodes = discounts.filter(d => state(d).key === "active").length;
  const statusCounts = useMemo(() => discounts.reduce((counts, discount) => {
    counts[state(discount).key] += 1;
    return counts;
  }, { active: 0, scheduled: 0, paused: 0, expired: 0, exhausted: 0 }), [discounts]);

  const edit = (d: any) => { setEditing(d); setDialogOpen(true); };
  const nowrap = { whiteSpace: "nowrap" } as const;
  const columns: Column<any>[] = [
    { key: "code", header: "Code or title", lead: true, render: d => (
      <div style={{ minWidth: 200, maxWidth: 420 }}>
        <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={() => edit(d)} aria-label={`Edit ${discountName(d)}`}
            className={isAutomatic(d) ? "rp-row-link" : "rp-row-link rp-mono"}>
            {discountName(d)}
          </button>
          {isAutomatic(d)
            ? <StatusBadge tone="info">Automatic</StatusBadge>
            : <IconButton label={`Share link for ${d.code}`} onClick={() => setSharing(d.code)}><Link2 size={16} aria-hidden /></IconButton>}
        </span>
        <div className="rp-hint" style={{ overflowWrap: "anywhere", marginTop: 2 }}>{describeDiscount(d, books || [])}</div>
        {d.description && <div className="rp-hint" style={{ overflowWrap: "anywhere" }}>{d.description}</div>}
      </div>
    ) },
    { key: "status", header: "Status", render: d => { const s = state(d); return <span style={nowrap}><StatusBadge tone={s.tone}>{s.label}</StatusBadge></span>; } },
    { key: "used", header: "Used", numeric: true, render: d => <span style={nowrap}>{d.usageCount || 0} / {d.usageLimit ?? "∞"}</span> },
    { key: "results", header: "Paid orders", numeric: true, render: d => {
      const p = perf.get(perfKey(d));
      return (
        <div style={nowrap}>
          <div>{p?.orders ?? 0} order{(p?.orders ?? 0) === 1 ? "" : "s"}</div>
          <div className="rp-hint">{fmt(p?.revenue ?? 0)} sales</div>
          <div className="rp-hint">{fmt(p?.discountGiven ?? 0)} off</div>
        </div>
      );
    } },
    { key: "expiry", header: "Expires", render: d => <span style={nowrap}>{d.expiryDate ? shopDay(d.expiryDate) : "Never"}</span> },
    { key: "actions", header: "Actions", render: d => (
      <ActionMenu label={`Actions for ${discountName(d)}`} actions={[
        { label: "Edit", onSelect: () => edit(d) },
        { label: d.isActive ? "Pause" : "Activate", onSelect: () => handleToggle(d) },
        { label: "Duplicate", onSelect: () => { setEditing(duplicateDiscount(d, discounts.filter(x => !isAutomatic(x)).map(x => x.code))); setDialogOpen(true); } },
        ...(isAutomatic(d) ? [] : [
          { label: "Copy code", onSelect: () => { void copyText(d.code); } },
          { label: "Copy share link", onSelect: () => { void copyText(shareLinkFor(d.code), "Share link"); } },
        ]),
        { label: "Delete", tone: "danger", onSelect: () => setDeleting(d) },
      ]} />
    ) },
  ];

  if (loading) return <LoadingState label="Loading discounts…" />;
  if (failed) return <ErrorState description="Discount codes could not be loaded." onRetry={load} />;

  return (
    <div className="rp-stack">
      <div className="rp-kpi-grid">
        <MetricCard label="Active discounts" value={activeCodes} footer={`${discounts.length} total`} />
        <MetricCard label="Redemptions" value={totalRedemptions.toLocaleString()} footer="Counted by the payment webhook" />
        <MetricCard label="Revenue with a discount" value={fmt(totalCodeRevenue)} footer="Paid orders, less refunds (CAD)" />
        <MetricCard label="Discounts given" value={fmt(totalGiven)} footer="Total taken off those orders" />
      </div>

      {discounts.length === 0 ? (
        <SectionCard>
          <EmptyState icon="🏷️" title="No discounts yet" description="Create a code shoppers type at checkout, or an automatic offer that applies by itself: a percentage, fixed amount, free shipping, buy-X-get-Y, tiered discount or a free gift with purchase."
            action={<PrimaryButton icon={<Plus size={16} aria-hidden />} onClick={() => { setEditing(null); setDialogOpen(true); }}>New discount</PrimaryButton>} />
        </SectionCard>
      ) : (
        <>
          <Tabs label="Discount status" value={filter} onChange={setFilter} tabs={[
            { id: "all", label: "All", count: discounts.length },
            { id: "active", label: "Active", count: statusCounts.active },
            { id: "scheduled", label: "Scheduled", count: statusCounts.scheduled },
            { id: "paused", label: "Paused", count: statusCounts.paused },
            { id: "expired", label: "Expired", count: statusCounts.expired },
            { id: "exhausted", label: "Exhausted", count: statusCounts.exhausted },
          ]} />
          <FilterBar>
            <div className="rp-grow"><SearchField label="Search discounts" placeholder="Search codes, titles or descriptions…" value={search} onChange={e => setSearch(e.target.value)} /></div>
            <PrimaryButton icon={<Plus size={16} aria-hidden />} onClick={() => { setEditing(null); setDialogOpen(true); }}>New discount</PrimaryButton>
          </FilterBar>
          <SectionCard flush collapsible={false} title="Discounts" description={`${rows.length} of ${discounts.length} · one discount per order, the biggest saving wins.`}>
            <DataTable caption="Discounts" columns={columns} rows={rows} rowKey={d => d.id}
              empty={<EmptyState title="No codes match" description="Try a different status or search."
                action={<SecondaryButton onClick={() => { setFilter("all"); setSearch(""); }}>Reset filters</SecondaryButton>} />} />
          </SectionCard>
        </>
      )}

      {dialogOpen && <DiscountDialog initial={editing} books={books} shopCategories={shopCategories} otherCodes={discounts.filter(d => d.id !== editing?.id && !isAutomatic(d)).map(d => d.code)} onClose={() => { setDialogOpen(false); setEditing(null); }} onSave={handleSave} onSaveBatch={handleSaveBatch} />}

      {sharing && <ShareDiscountDialog code={sharing} discount={discounts.find(d => !isAutomatic(d) && String(d.code || "").toUpperCase() === sharing)} onClose={() => setSharing(null)} />}

      <ConfirmDialog open={!!deleting} title={isAutomatic(deleting) ? "Delete this automatic offer?" : "Delete this discount code?"} confirmLabel={isAutomatic(deleting) ? "Delete offer" : "Delete code"}
        message={deleting ? `“${discountName(deleting)}” will stop working immediately. Pause it instead if you may reuse it.` : ""}
        onConfirm={() => { const d = deleting; setDeleting(null); handleDelete(d); }} onCancel={() => setDeleting(null)} />
    </div>
  );
}
