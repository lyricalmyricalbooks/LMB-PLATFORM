// Buy-card extras on the product page (BookDetail.tsx): paid add-ons (signed copy, inscription,
// gift wrap), a box set's contents and a gift card's recipient form. Words are Studio › Text &
// labels › Product page; each block is a region (Theme settings › Fine-tune single elements ›
// Product details · content layout) with its own show/hide switch and click-to-edit outline.
import { Link } from "react-router";
import { getCopy } from "./storeCopy";
import { regionProps, regionVisible } from "./storefrontRegions";
import { bundleComponents, giftCardDetails, type BookAddOn, type GiftCardDetails } from "./promotions";

export type AddOnPicks = Record<string, { on: boolean; text: string }>;

/** The add-ons to send with Add to bag, in catalog order. */
export function addOnRequest(addOns: BookAddOn[], picks: AddOnPicks): { id: string; text?: string }[] {
  return addOns.filter((a) => picks[a.id]?.on).map((a) => (a.kind === "text" ? { id: a.id, text: picks[a.id]?.text || "" } : { id: a.id }));
}

/** The first ticked inscription with no wording yet (Add to bag waits for it). */
export function missingWording(addOns: BookAddOn[], picks: AddOnPicks): BookAddOn | undefined {
  return addOns.find((a) => a.kind === "text" && picks[a.id]?.on && !String(picks[a.id]?.text || "").replace(/\s+/g, " ").trim());
}

/** Per-copy price of the ticked add-ons (CAD). */
export function addOnsPrice(addOns: BookAddOn[], picks: AddOnPicks): number {
  return Math.round(addOns.filter((a) => picks[a.id]?.on).reduce((sum, a) => sum + a.price, 0) * 100) / 100;
}

/** False when the recipient email is filled in but malformed (blank sends the card to the buyer). */
export function giftFormValid(value: Partial<GiftCardDetails>): boolean {
  try { giftCardDetails(value); return true; } catch { return false; }
}

// Look: Studio › Style › Product page · buy card & details › Extras & gift card fields (`pdpField*`,
// productPageStyle.ts `extraFieldsCss`); empty controls keep these built-in classes.
const fieldClass = "fm-pdp-field min-w-0 w-full rounded-xl border border-white/[0.12] bg-transparent px-4 py-3 text-sm outline-none focus:border-white/40";

export function AddOnPicker({ design, addOns, picks, onChange, error, formatPrice, unitPrice }: {
  design: any;
  addOns: BookAddOn[];
  picks: AddOnPicks;
  onChange: (next: AddOnPicks) => void;
  error?: string;
  /** CAD → shopper's currency, like the rest of the page. */
  formatPrice: (cad: number) => string;
  /** CAD price of one copy without extras (NaN hides the "with extras" line). */
  unitPrice: number;
}) {
  if (!addOns.length || !regionVisible(design, "productAddOns")) return null;
  const set = (id: string, patch: Partial<{ on: boolean; text: string }>) => onChange({ ...picks, [id]: { on: false, text: "", ...(picks[id] as Partial<{ on: boolean; text: string }> | undefined), ...patch } });
  const extra = addOnsPrice(addOns, picks);
  return (
    <fieldset {...regionProps("productAddOns")} className="fm-pdp-addons w-full flex flex-col gap-2.5 text-left">
      <legend className="fm-pdp-meta mb-2">{getCopy(design, "pdpAddOnsHeading")}</legend>
      {addOns.map((addOn) => {
        const pick = picks[addOn.id] || { on: false, text: "" };
        const inputId = `pdp-addon-${addOn.id}`;
        const left = (addOn.maxLength || 120) - pick.text.length;
        return (
          <div key={addOn.id} className="flex flex-col gap-2">
            <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
              <input type="checkbox" checked={pick.on} onChange={(e) => set(addOn.id, { on: e.target.checked })} className="w-4 h-4 shrink-0" style={{ accentColor: "var(--accent)" }} />
              <span className="text-sm">
                {addOn.price > 0
                  ? getCopy(design, "pdpAddOnOption", { label: addOn.label, price: formatPrice(addOn.price) })
                  : getCopy(design, "pdpAddOnFree", { label: addOn.label })}
              </span>
            </label>
            {addOn.kind === "text" && pick.on && (
              <div className="flex flex-col gap-1 pl-7">
                <label htmlFor={inputId} className="fm-pdp-meta">{getCopy(design, "pdpAddOnTextLabel", { label: addOn.label })}</label>
                <input
                  id={inputId}
                  type="text"
                  value={pick.text}
                  maxLength={addOn.maxLength || 120}
                  onChange={(e) => set(addOn.id, { text: e.target.value })}
                  placeholder={getCopy(design, "pdpAddOnTextPlaceholder")}
                  aria-describedby={`${inputId}-count`}
                  aria-invalid={!!error && !pick.text.trim()}
                  className={fieldClass}
                />
                <span id={`${inputId}-count`} className="fm-pdp-meta" aria-live="polite">{getCopy(design, "pdpAddOnTextCount", { count: Math.max(0, left) })}</span>
              </div>
            )}
          </div>
        );
      })}
      {extra > 0 && Number.isFinite(unitPrice) && (
        <p className="fm-pdp-meta" aria-live="polite">{getCopy(design, "pdpAddOnsTotal", { price: formatPrice(unitPrice + extra) })}</p>
      )}
      {error && <p role="alert" className="text-sm fm-danger-text">{error}</p>}
    </fieldset>
  );
}

export function BoxSetContents({ design, book, books }: { design: any; book: any; books: any[] }) {
  const parts = bundleComponents(book);
  if (!parts.length || !regionVisible(design, "productBoxSet")) return null;
  const byId = new Map((books || []).map((b: any) => [b.id, b]));
  const rows = parts.map((part) => {
    const partBook = byId.get(part.id);
    const edition = part.variantId ? (partBook?.variants || []).find((v: any) => v.id === part.variantId)?.name : "";
    return { ...part, book: partBook, edition: edition || "" };
  }).filter((row) => row.book);
  if (!rows.length) return null;
  return (
    <div {...regionProps("productBoxSet")} className="fm-pdp-boxset w-full text-left">
      <p className="fm-pdp-meta mb-2">{getCopy(design, "pdpBoxSetHeading")}</p>
      <ul className="list-none p-0 m-0 flex flex-col gap-1.5">
        {rows.map((row, i) => (
          <li key={`${row.id}-${row.variantId || ""}-${i}`} className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="fm-pdp-meta">{getCopy(design, "pdpBoxSetQty", { count: row.quantity })}</span>
            <Link to={`/books/${encodeURIComponent(row.book.slug || row.book.id)}`} className="underline underline-offset-4">{row.book.title}</Link>
            {row.edition && <span className="fm-pdp-meta">{getCopy(design, "pdpBoxSetEdition", { edition: row.edition })}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GiftCardForm({ design, value, onChange, error }: {
  design: any;
  value: GiftCardDetails;
  onChange: (next: GiftCardDetails) => void;
  error?: string;
}) {
  if (!regionVisible(design, "productGiftCardForm")) return null;
  const field = (key: keyof GiftCardDetails, label: string, extra: Record<string, any> = {}) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={`pdp-gift-${key}`} className="fm-pdp-meta">{label}</label>
      <input id={`pdp-gift-${key}`} value={value[key]} onChange={(e) => onChange({ ...value, [key]: e.target.value })} className={fieldClass} {...extra} />
    </div>
  );
  return (
    <fieldset {...regionProps("productGiftCardForm")} className="fm-pdp-giftcard w-full flex flex-col gap-3 text-left">
      <legend className="fm-pdp-meta mb-2">{getCopy(design, "pdpGiftHeading")}</legend>
      {field("recipientName", getCopy(design, "pdpGiftRecipientName"), { maxLength: 100, autoComplete: "off" })}
      {field("recipientEmail", getCopy(design, "pdpGiftRecipientEmail"), { type: "email", maxLength: 320, autoComplete: "off", "aria-describedby": "pdp-gift-email-hint", "aria-invalid": !!error })}
      <p id="pdp-gift-email-hint" className="fm-pdp-meta -mt-1">{getCopy(design, "pdpGiftEmailHint")}</p>
      {error && <p role="alert" className="text-sm fm-danger-text">{error}</p>}
      {field("senderName", getCopy(design, "pdpGiftSenderName"), { maxLength: 100, autoComplete: "name" })}
      <div className="flex flex-col gap-1">
        <label htmlFor="pdp-gift-message" className="fm-pdp-meta">{getCopy(design, "pdpGiftMessage")}</label>
        <textarea id="pdp-gift-message" value={value.message} maxLength={300} rows={3} onChange={(e) => onChange({ ...value, message: e.target.value })} className={`${fieldClass} resize-y`} />
      </div>
      <p className="fm-pdp-meta">{getCopy(design, "pdpGiftDelivery")}</p>
    </fieldset>
  );
}
