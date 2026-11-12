import { plainError } from "./plainError";
import { useState, useEffect, useMemo } from "react";
import { Link2, Plus, Trash2, Upload } from "lucide-react";
import { DiscountMoveDialog } from "./DiscountMoveDialog";
import { adminApi } from "./api";
import toast from "react-hot-toast";
import { discountCategoryChoices } from "../features/site/discountCategories";
import { discountState as state, today } from "./discountState";
import { duplicateDiscount } from "./discountPerformance";
import { validateDiscountDraft, draftFrom } from "./discountValidation";
import { describeDiscount, shopDayLabel } from "./discountDescribe";
import { FormChoice, FormField, FormPage, FormReadOnly, FormRow, FormSection, FormToggle, StatusBar, SummaryRail, formStatus } from "./riso/FormKit";
import { copyText } from "./clipboard";
import { discountShareLink } from "../features/site/sharedDiscount";
import { MAX_BATCH, batchCodes, cleanPrefix, codesCsv, randomCode } from "./discountCodes";
import { useShopWords } from "./shopWords";
import {
  ActionMenu, PageActions, Checkbox, ConfirmDialog, Dialog, EmptyState, ErrorState, IconButton, LoadingState,
  PageHead, PrimaryButton, SecondaryButton, SectionCard, StatusBadge, TextField, useConfirm,
} from "./riso/components";

// ─── helpers ────────────────────────────────────────────────────────────────

const TYPE_OPTIONS = [
  { id: "percentage", label: "Percentage", desc: "e.g. 20% off" },
  { id: "fixed", label: "Fixed amount", desc: "e.g. $10 off" },
  { id: "freeship", label: "Free shipping", desc: "Waive shipping cost" },
  { id: "bogo", label: "Buy X get Y", desc: "BOGO offers" },
  { id: "tiered", label: "Tiered spend", desc: "Bigger spend, bigger discount" },
  { id: "gift", label: "Free gift with purchase", desc: "Adds a free book to the order", automaticOnly: true },
];


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


function DiscountForm({ initial, otherCodes = [], books, shopCategories, onClose, onSave, onSaveBatch }: { initial?: any; otherCodes?: string[]; books: any[] | null; shopCategories: any[] | null; onClose: () => void; onSave: (data: any) => Promise<void>; onSaveBatch: (data: any, codes: string[]) => Promise<void> }) {
  const w = useShopWords();
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

  // v4 New discount page (mockup 1i): Code · What they get · Rules on the left, "What it does" in a sky rail, one
  // status bar. Real fields the mockup leaves out (automatic offers, buy X get Y, tiers, a free gift, email lists)
  // stay, in the section they belong to.
  const batching = batch.on && !isEdit && !automatic;
  const needsValue = form.type === "percentage" || form.type === "fixed";
  const missing = [
    !automatic && !batching && !String(form.code || "").trim(),
    automatic && !String(form.title || "").trim(),
    needsValue && !(Number(form.value) > 0),
    form.type === "gift" && !form.giftBookId,
  ].filter(Boolean).length;
  const dirty = JSON.stringify(form) !== startForm || batch.on;
  const status = formStatus({ missing, create: !isEdit, verb: "create", dirty });
  const primaryLabel = isEdit ? "Save changes" : automatic ? "Create offer" : batching ? `Create ${Number(batch.count) || 0} codes` : "Create discount";
  const day = today();
  const runs = !form.isActive ? "Paused" : form.startDate && form.startDate > day ? `Starts ${shopDayLabel(form.startDate, false)}`
    : form.expiryDate && form.expiryDate < day ? "Ended" : form.expiryDate ? `Until ${shopDayLabel(form.expiryDate, false)}` : "Active";
  const pageTitle = isEdit ? `Edit ${discountName(initial) || "discount"}` : "New discount";
  const pageLine = automatic ? "An offer that applies by itself when the order qualifies" : "A code shoppers type at checkout";
  const typeOptions = TYPE_OPTIONS.filter(t => !t.automaticOnly || automatic).map(t => ({ value: t.id, label: t.label }));

  return (
    <>
    <PageHead title={pageTitle} description={pageLine} back={{ label: "Discounts", onClick: () => { void close(); } }} />
    <form onSubmit={e => { e.preventDefault(); if (missing) { validate(); toast.error("Fill in the highlighted fields."); } else void handleSave(); }}>
    <FormPage rail={
      <SummaryRail tone="sky" title="What it does"
        rows={[
          { label: automatic ? "Offer" : "Code", value: automatic ? (String(form.title || "").trim() || "—") : batching ? `${Number(batch.count) || 0} single-use codes` : (String(form.code || "").trim().toUpperCase() || "—") },
          { label: "Status", value: runs },
        ]}
        note={describeDiscount(form, books || [])} />
    }>
      <FormSection title={automatic ? "Offer" : "Code"} description={automatic ? "What shoppers see in the bag." : "What shoppers type."}>
        <FormChoice label="How shoppers get it" value={form.method} onChange={v => setMethod(v as "code" | "automatic")}
          options={[{ value: "code", label: "Discount code" }, { value: "automatic", label: "Automatic (no code)" }]} />
        <p className="rp-fk-hint" style={{ margin: "-8px 0 0" }}>One discount per order: a typed code replaces automatic offers.</p>
        {automatic ? (
          <FormField label="Title shown to shoppers" required empty={!String(form.title || "").trim()} error={errors.title} hint="Shown in the bag and at checkout next to the saving.">
            {a => <input {...a} value={form.title || ""} maxLength={60} onChange={e => set("title", e.target.value)} placeholder="e.g. Spring sale" />}
          </FormField>
        ) : batching ? (
          <FormRow>
            <FormField label="How many codes" required empty={!batch.count} error={errors.batch} hint={`Up to ${MAX_BATCH}. Each works once.`}>
              {a => <input {...a} type="number" min={1} max={MAX_BATCH} step={1} value={batch.count} onChange={e => setBatch(b => ({ ...b, count: e.target.value }))} />}
            </FormField>
            <FormField label="Code prefix" hint={`Codes look like ${cleanPrefix(batch.prefix) ? `${cleanPrefix(batch.prefix)}-XXXXXX` : "XXXXXXXX"}. A spreadsheet of them downloads.`}>
              {a => <input {...a} value={batch.prefix} maxLength={20} onChange={e => setBatch(b => ({ ...b, prefix: e.target.value.toUpperCase() }))} placeholder="e.g. FAIR" style={{ fontFamily: "var(--rp-font-mono)" }} />}
            </FormField>
          </FormRow>
        ) : (
          <div className="rp-fk-row" style={{ alignItems: "flex-end" }}>
            <FormField label="Code" required empty={!String(form.code || "").trim()} error={errors.code} hint="Not case-sensitive.">
              {a => <input {...a} value={form.code} onChange={e => set("code", e.target.value.toUpperCase())} placeholder="AUTUMN10" data-autofocus
                style={{ fontFamily: "var(--rp-font-mono)", textTransform: "uppercase" }} />}
            </FormField>
            <button type="button" className="rp-fk-pill" style={{ flex: "0 0 auto", marginBottom: 22 }} onClick={() => set("code", randomCode())}>Generate</button>
          </div>
        )}
        {!automatic && !isEdit && <FormToggle label="Several single-use codes" hint="Same rules, one use each. Good for a fair or a mailing." checked={batch.on} onChange={v => setBatch(b => ({ ...b, on: v }))} />}
        <FormField label="Internal note" hint="Only you and your team see this.">
          {a => <input {...a} value={form.description || ""} onChange={e => set("description", e.target.value)} placeholder="e.g. Autumn sale 2026" />}
        </FormField>
      </FormSection>

      <FormSection title="What they get" description="Pick the kind, then the amount.">
        <FormChoice label="Type" value={form.type} onChange={v => set("type", v)} options={typeOptions} />
        {needsValue && (
          <FormField label={form.type === "percentage" ? "Percent" : "Amount"} required empty={!(Number(form.value) > 0)} error={errors.value}
            prefix={form.type === "fixed" ? "CA$" : undefined} suffix={form.type === "percentage" ? "%" : undefined}>
            {a => <input {...a} type="number" inputMode="decimal" min={0} max={form.type === "percentage" ? 100 : undefined} value={form.value} onChange={e => set("value", e.target.value)} />}
          </FormField>
        )}
        {form.type === "freeship" && <FormReadOnly label="Amount" value="Postage is free" />}
        {form.type === "bogo" && (
          <>
            <FormRow>
              <FormField label="Buy">{a => <input {...a} type="number" min={1} value={form.buyQuantity ?? 1} onChange={e => set("buyQuantity", parseInt(e.target.value) || 1)} />}</FormField>
              <FormField label="Get">{a => <input {...a} type="number" min={1} value={form.getQuantity ?? 1} onChange={e => set("getQuantity", parseInt(e.target.value) || 1)} />}</FormField>
              <FormField label="Off the items they get" suffix="%">{a => <input {...a} type="number" min={0} max={100} value={form.getDiscountValue ?? 100} onChange={e => set("getDiscountValue", parseInt(e.target.value) || 0)} />}</FormField>
            </FormRow>
            {errors.bogo && <p role="alert" className="rp-fk-hint" data-error="">{errors.bogo}</p>}
          </>
        )}
        {form.type === "tiered" && (
          <>
            {(form.tiers || []).map((tier: any, i: number) => (
              <div key={i} className="rp-fk-row" style={{ alignItems: "flex-end" }}>
                <FormField label={`Tier ${i + 1}: spend at least`} prefix="CA$">{a => <input {...a} type="number" min={0} value={tier.minSpend} onChange={e => setTier(i, { minSpend: parseFloat(e.target.value) || 0 })} />}</FormField>
                <FormField label="Discount">{a => <input {...a} type="number" min={0} value={tier.value} onChange={e => setTier(i, { value: parseFloat(e.target.value) || 0 })} />}</FormField>
                <FormField label="As">{a => <select {...a} value={tier.type} onChange={e => setTier(i, { type: e.target.value })}><option value="percentage">Percent (%)</option><option value="fixed">Amount (CA$)</option></select>}</FormField>
                {(form.tiers || []).length > 1 && <span style={{ flex: "0 0 auto", marginBottom: 2 }}><IconButton tone="danger" label={`Remove tier ${i + 1}`} onClick={() => set("tiers", form.tiers.filter((_: any, x: number) => x !== i))}><Trash2 size={16} aria-hidden /></IconButton></span>}
              </div>
            ))}
            {(form.tiers || []).length < 3 && <button type="button" className="rp-fk-pill" style={{ alignSelf: "flex-start" }} onClick={() => set("tiers", [...(form.tiers || []), { minSpend: 0, value: 0, type: "percentage" }])}><Plus size={14} aria-hidden /> Add a tier</button>}
            {errors.tiers && <p role="alert" className="rp-fk-hint" data-error="">{errors.tiers}</p>}
          </>
        )}
        {form.type === "gift" && (books === null ? <p className="rp-fk-hint">Loading catalog…</p> : (
          <>
            <FormRow>
              <FormField label={w("Find a book")}>{a => <input {...a} type="search" value={giftSearch} onChange={e => setGiftSearch(e.target.value)} placeholder="Type part of the title" />}</FormField>
              <FormField label={w("Book to give away")} required empty={!form.giftBookId} error={errors.gift && !form.giftBookId ? errors.gift : undefined}
                hint={w("Added free when the order qualifies. It uses the book's stock.")}>
                {a => <select {...a} value={form.giftBookId || ""} onChange={e => setForm((f: any) => ({ ...f, giftBookId: e.target.value, giftVariantId: "" }))}>
                  <option value="">{w("Choose a book")}</option>
                  {giftBook && <option value={giftBook.id}>{giftBook.title}</option>}
                  {books.filter(b => b.id !== form.giftBookId && b.productType !== "giftCard" && !(Array.isArray(b.bundleItems) && b.bundleItems.length) && String(b.title || "").toLowerCase().includes(giftSearch.trim().toLowerCase()))
                    .map(b => <option key={b.id} value={b.id}>{b.title}{b.status !== "published" ? " (not published)" : ""}</option>)}
                </select>}
              </FormField>
            </FormRow>
            {giftBook && (giftBook.variants || []).length > 0 && (
              <FormField label="Edition" error={errors.gift && form.giftBookId ? errors.gift : undefined}>
                {a => <select {...a} value={form.giftVariantId || ""} onChange={e => set("giftVariantId", e.target.value)}>
                  <option value="">Choose an edition</option>
                  {(giftBook.variants || []).map((v: any) => <option key={v.id} value={v.id}>{v.name || "Edition"}</option>)}
                </select>}
              </FormField>
            )}
            {errors.gift && form.giftBookId && !(giftBook && (giftBook.variants || []).length) && <p role="alert" className="rp-fk-hint" data-error="">{errors.gift}</p>}
            {giftBook && giftBook.status !== "published" && <p className="rp-fk-hint" role="status">{w("This book isn't published, so shoppers won't get it until it is.")}</p>}
          </>
        ))}
        <FormChoice label="Applies to" value={form.appliesTo} onChange={v => set("appliesTo", v)}
          options={[{ value: "all", label: "Everything" }, { value: "products", label: w("Selected books") }, { value: "categories", label: "Categories" }]} />
        {errors.applies && <p role="alert" className="rp-fk-hint" data-error="">{errors.applies}</p>}
        {form.appliesTo === "categories" && (
          <div style={{ display: "grid", gap: 4, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            {shopCategories === null ? <p className="rp-fk-hint">Loading shop categories…</p>
              : discountCategoryChoices(shopCategories, form.selectedCategories || []).map(cat => (
                <Checkbox key={cat.name} checked={(form.selectedCategories || []).includes(cat.name)} onChange={() => toggleIn("selectedCategories", cat.name)}
                  label={cat.parent ? `${cat.parent} › ${cat.name}` : cat.missing ? `${cat.name} (no longer a shop category)` : cat.renamedTo ? `${cat.name} (old name of ${cat.renamedTo})` : cat.name} />
              ))}
            {shopCategories !== null && <p className="rp-fk-hint" style={{ gridColumn: "1 / -1", margin: "4px 0 0" }}>{w("Categories come from Studio › Menus › Shop categories. A parent category also covers its sub-categories’ books, just like the shop’s category pages.")}</p>}
          </div>
        )}
        {form.appliesTo === "products" && (() => {
          const chosen: string[] = form.selectedProducts || [];
          const q = bookSearch.trim().toLowerCase();
          const shown = (books || []).filter(b => !q || `${b.title || ""} ${b.isbn || ""}`.toLowerCase().includes(q));
          return (
            <>
              <FormField label={w("Find books")} hint={`${chosen.length} selected`}>
                {a => <input {...a} type="search" placeholder={w("Search by title or ISBN…")} value={bookSearch} onChange={e => setBookSearch(e.target.value)} />}
              </FormField>
              <div className="rp-fk-picklist">
                {books === null ? <p className="rp-fk-hint">Loading catalog…</p>
                  : books.length === 0 ? <p className="rp-fk-hint">{w("No books in the catalog yet.")}</p>
                  : shown.length === 0 ? <p className="rp-fk-hint">{w("No books match “")}{bookSearch}”.</p>
                  : shown.map(b => <Checkbox key={b.id} label={b.title} checked={chosen.includes(b.id)} onChange={() => toggleIn("selectedProducts", b.id)} />)}
              </div>
            </>
          );
        })()}
      </FormSection>

      <FormSection title="Rules" description="Optional limits.">
        <FormRow>
          <FormField label="Minimum spend" prefix="CA$" error={errors.minOrderAmount} hint="Leave empty for none.">
            {a => <input {...a} type="number" min={0} value={form.minOrderAmount} onChange={e => set("minOrderAmount", e.target.value)} />}
          </FormField>
          <FormField label="Starts" hint={automatic ? "The offer stays off until this day." : "The code stays off until this day."}>
            {a => <input {...a} type="date" value={form.startDate || ""} onChange={e => set("startDate", e.target.value)} />}
          </FormField>
          <FormField label="Ends" error={errors.expiryDate} hint="The last day it works.">
            {a => <input {...a} type="date" min={isEdit && initial?.expiryDate ? undefined : day} value={form.expiryDate || ""} onChange={e => set("expiryDate", e.target.value)} />}
          </FormField>
        </FormRow>
        <FormRow>
          <FormField label="Minimum items" error={errors.minQuantity} hint="Leave empty for none.">
            {a => <input {...a} type="number" min={0} step={1} value={form.minQuantity} onChange={e => set("minQuantity", e.target.value)} />}
          </FormField>
          {form.type !== "freeship" && form.type !== "gift" && <FormField label="Most it takes off" prefix="CA$" error={errors.maxDiscountAmount} hint="Per order, e.g. 20% off up to $15.">
            {a => <input {...a} type="number" min={0} value={form.maxDiscountAmount ?? ""} onChange={e => set("maxDiscountAmount", e.target.value)} placeholder="No cap" />}
          </FormField>}
          {!batching && <FormField label="Limit total uses" suffix="orders" error={errors.usageLimit} hint="Stops working after this many orders.">
            {a => <input {...a} type="number" min={1} step={1} value={form.usageLimit} onChange={e => set("usageLimit", e.target.value)} placeholder="No limit" />}
          </FormField>}
        </FormRow>
        {!automatic && <FormToggle label="One use per customer" hint="Checked by email address." checked={!!form.onePerCustomer} onChange={v => set("onePerCustomer", v)} />}
        <FormToggle label={automatic ? "Offer is on" : "Code is on"} hint="Turn off to pause it without deleting it." checked={!!form.isActive} onChange={v => set("isActive", v)} />
        {!automatic && <FormRow>
          <FormField label="Only these email endings" hint="Comma separated, e.g. .edu. Empty means everyone.">
            {a => <textarea {...a} rows={2} value={form.allowedEmailDomains || ""} onChange={e => set("allowedEmailDomains", e.target.value)} placeholder="e.g. .edu, student.ca" />}
          </FormField>
          <FormField label="Only these customers" hint="Comma separated email addresses.">
            {a => <textarea {...a} rows={2} value={form.allowedCustomerEmails || ""} onChange={e => set("allowedCustomerEmails", e.target.value)} placeholder="e.g. friend@example.com" />}
          </FormField>
        </FormRow>}
      </FormSection>
    </FormPage>
    <StatusBar status={status} primaryLabel={primaryLabel} busy={saving} blocked={missing > 0}
      onBlocked={() => { validate(); toast.error("Fill in the highlighted fields."); }}
      onPrimary={() => { void handleSave(); }} onCancel={() => { void close(); }} cancelLabel={isEdit ? "Discard" : "Cancel"} />
    </form>
    {confirmNode}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

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
  // Bring codes over from the old shop (plan 23.30).
  const [moving, setMoving] = useState(false);
  const bringButton = <SecondaryButton icon={<Upload size={16} aria-hidden />} onClick={() => setMoving(true)}>Bring codes over</SecondaryButton>;
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [books, setBooks] = useState<any[] | null>(null);
  const [shopCategories, setShopCategories] = useState<any[] | null>(null);
  // The code just created: its share link opens straight away so it can be sent by email etc.
  const [sharing, setSharing] = useState<string | null>(null);

  useEffect(() => { load(); }, []);
  // The whole catalog (drafts too) for the book pickers and free-gift names. Best-effort.
  useEffect(() => { adminApi.getAllBooks().then(setBooks).catch(() => setBooks([])); }, []);
  // The published shop categories (Studio › Menus › Shop categories), the names checkout matches.
  useEffect(() => { adminApi.getPublicSettings().then((st: any) => setShopCategories(Array.isArray(st?.design?.categories) ? st.design.categories : [])).catch(() => setShopCategories([])); }, []);

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
      setFormOpen(false); setEditing(null); load();
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
    if (created.length) { setFormOpen(false); setEditing(null); load(); }
  };

  const handleDelete = async (d: any) => {
    try { await adminApi.deleteDiscount(d.id); toast.success("Discount deleted"); load(); } catch { toast.error("Delete failed"); }
  };

  const handleToggle = async (d: any) => {
    try { await adminApi.updateDiscount(d.id, { isActive: !d.isActive }); toast.success(`${isAutomatic(d) ? "Offer" : "Code"} ${d.isActive ? "paused" : "activated"}`); load(); } catch { toast.error("Toggle failed"); }
  };

  // The mockup's order: live offers first, then scheduled, paused, used up and ended; by name within each.
  const rows = useMemo(() => {
    const rank = { active: 0, scheduled: 1, paused: 2, exhausted: 3, expired: 4 } as const;
    return [...discounts].sort((a, b) => rank[state(a).key] - rank[state(b).key] || String(discountName(a) || "").localeCompare(String(discountName(b) || "")));
  }, [discounts]);

  /** The small line under a name: what it takes off and its dates (describeDiscount carries "until …"). */
  const subline = (d: any) => [isAutomatic(d) ? "Automatic offer" : "", describeDiscount(d, books || [])].filter(Boolean).join(" · ");

  const edit = (d: any) => { setEditing(d); setFormOpen(true); };
  const actionsOf = (d: any) => (
    <ActionMenu label={`Actions for ${discountName(d)}`} actions={[
      { label: "Edit", onSelect: () => edit(d) },
      { label: d.isActive ? "Pause" : "Activate", onSelect: () => handleToggle(d) },
      { label: "Duplicate", onSelect: () => { setEditing(duplicateDiscount(d, discounts.filter(x => !isAutomatic(x)).map(x => x.code))); setFormOpen(true); } },
      ...(isAutomatic(d) ? [] : [
        { label: "Share link", onSelect: () => setSharing(d.code) },
        { label: "Copy code", onSelect: () => { void copyText(d.code); } },
      ]),
      { label: "Delete", tone: "danger", onSelect: () => setDeleting(d) },
    ]} />
  );

  if (loading) return <LoadingState label="Loading discounts…" />;
  if (failed) return <ErrorState description="Discount codes could not be loaded." onRetry={load} />;
  // v4: New discount and editing one are their own page (Back returns to the list).
  if (formOpen) return <DiscountForm initial={editing} books={books} shopCategories={shopCategories} otherCodes={discounts.filter(d => d.id !== editing?.id && !isAutomatic(d)).map(d => d.code)} onClose={() => { setFormOpen(false); setEditing(null); }} onSave={handleSave} onSaveBatch={handleSaveBatch} />;

  return (
    <div className="rp-stack">
      {discounts.length > 0 && <PageActions><SecondaryButton onClick={() => setMoving(true)}>Bring codes over</SecondaryButton><PrimaryButton onClick={() => { setEditing(null); setFormOpen(true); }}>New discount</PrimaryButton></PageActions>}

      {discounts.length === 0 ? (
        <SectionCard>
          <EmptyState icon="🏷️" title="No discounts yet" description="Create a code shoppers type at checkout, or an automatic offer that applies by itself: a percentage, fixed amount, free shipping, buy-X-get-Y, tiered discount or a free gift with purchase."
            action={<div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
              <PrimaryButton icon={<Plus size={16} aria-hidden />} onClick={() => { setEditing(null); setFormOpen(true); }}>New discount</PrimaryButton>
              {bringButton}
            </div>} />
        </SectionCard>
      ) : (
        <ul className="rp-listcard" aria-label="Discounts">
          {rows.map(d => {
            const s = state(d);
            const ended = s.key === "expired";
            return (
              <li key={d.id}>
                <button type="button" className="rp-listcard-main" onClick={() => edit(d)} aria-label={`Edit ${discountName(d)}`}>
                  <span className={isAutomatic(d) ? "rp-listcard-name" : "rp-listcard-name is-code"}>{discountName(d)}</span>
                  <span className="rp-listcard-sub">{subline(d)}</span>
                </button>
                <StatusBadge tone={ended ? "neutral" : s.tone} glyph={false}>{ended ? "Ended" : s.label}</StatusBadge>
                {actionsOf(d)}
              </li>
            );
          })}
        </ul>
      )}


      {moving && <DiscountMoveDialog existing={discounts.filter(d => !isAutomatic(d)).map(d => String(d.code || ""))}
        onClose={() => setMoving(false)} onDone={() => { void load(); }} />}

      {sharing && <ShareDiscountDialog code={sharing} discount={discounts.find(d => !isAutomatic(d) && String(d.code || "").toUpperCase() === sharing)} onClose={() => setSharing(null)} />}

      <ConfirmDialog open={!!deleting} title={isAutomatic(deleting) ? "Delete this automatic offer?" : "Delete this discount code?"} confirmLabel={isAutomatic(deleting) ? "Delete offer" : "Delete code"}
        message={deleting ? `“${discountName(deleting)}” will stop working immediately. Pause it instead if you may reuse it.` : ""}
        onConfirm={() => { const d = deleting; setDeleting(null); handleDelete(d); }} onCancel={() => setDeleting(null)} />
    </div>
  );
}
