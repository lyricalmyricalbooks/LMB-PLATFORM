// Product editor › Editions (Variants in a shop that doesn't sell books) › Every combination (11 November 2026).
// Shown only for a product sold in options (size, colour…, `usesOptionPicker`): one row per combination with its own
// price, SKU and stock, figures over it in the Colophon tiles, and "same for every row" for price and stock. Edits land in
// the editor's form like every other field and save with it; stock counted in the stockroom stays read-only here.
// Pure parts: variantGridRules.ts.
import { useState } from "react";
import { DataTable, MetricCard, SectionCard, type Column } from "./riso/components";
import { productOptions, variantPicks } from "../../shared/productOptions";
import { bumpBySize, fillEvery, gridStock, gridSummary, parseFill, sizeOptionOf, type GridVariant } from "./variantGridRules";
import { useShopWords } from "./shopWords";
import { MONEY_SIGN } from "./moneySign";

const money = (n: number) => `${MONEY_SIGN}${n.toFixed(2)}`;

export function VariantGrid({ form, lowLine, onChange, onReplace, stockLocked, stockLockHint }: {
  form: any;
  lowLine: number;
  /** One field of one variant, as the editor's own boxes write it. */
  onChange: (id: string, field: string, value: any) => void;
  /** Every variant at once ("same for every row"). */
  onReplace: (variants: GridVariant[]) => void;
  stockLocked: (variantId: string) => boolean;
  stockLockHint: (variantId: string) => string | undefined;
}) {
  const w = useShopWords();
  const options = productOptions(form);
  const variants: GridVariant[] = (form.variants || []).filter((v: any) => v && v.id);
  const [fill, setFill] = useState({ price: "", stock: "" });
  const sum = gridSummary(variants, lowLine);
  const priceLine = sum.minPrice === null ? "—" : money(sum.minPrice);
  const priceFoot = sum.minPrice === null || sum.maxPrice === sum.minPrice ? undefined : `up to ${money(sum.maxPrice!)}`;
  const anyUnlocked = variants.some((v) => !stockLocked(v.id));
  // Adding products round 3: "a price bump for bigger sizes", from the price typed above or the product's own price.
  const size = sizeOptionOf(options);
  const [bump, setBump] = useState({ extra: "", from: "" });
  const bumpFrom = bump.from || (size ? size.values[Math.min(2, size.values.length - 1)] : "");
  const bumpBase = parseFill("price", fill.price) ?? (Number(form.retailPrice) > 0 ? Number(form.retailPrice) : sum.minPrice);
  const bumpExtra = parseFill("price", bump.extra);
  const applyBump = () => {
    if (!size || bumpBase === null || bumpExtra === null) return;
    onReplace(bumpBySize(variants, size, bumpFrom, bumpBase, bumpExtra));
    setBump((b) => ({ ...b, extra: "" }));
  };

  const columns: Column<GridVariant>[] = [
    ...options.map((o, i): Column<GridVariant> => ({
      key: `opt-${i}`, header: o.name, lead: i === 0,
      render: (v) => <span style={{ fontWeight: i === 0 ? 600 : undefined }}>{variantPicks(v as any, options)?.[o.name] ?? "—"}</span>,
    })),
    { key: "price", header: `Price (${MONEY_SIGN})`, render: (v) => (
      <input className="rp-input rp-mono be-vg-num" type="number" min={0} step="0.01" inputMode="decimal"
        aria-label={`Price of ${v.name || "this combination"}`} value={v.price === undefined || v.price === null ? "" : String(v.price)}
        onChange={(e) => onChange(v.id, "price", e.target.value === "" ? "" : Number(e.target.value))} />
    ) },
    { key: "sku", header: "Item code", render: (v) => (
      <input className="rp-input rp-mono be-vg-sku" aria-label={`Item code of ${v.name || "this combination"}`} value={String(v.sku || "")}
        onChange={(e) => onChange(v.id, "sku", e.target.value)} />
    ) },
    { key: "stock", header: "Stock", render: (v) => (
      <input className="rp-input rp-mono be-vg-num" type="number" min={0} step={1} inputMode="numeric"
        aria-label={`Stock of ${v.name || "this combination"}`} value={String(gridStock(v))}
        disabled={stockLocked(v.id)} title={stockLockHint(v.id)}
        onChange={(e) => onChange(v.id, "stock", Number(e.target.value))} />
    ) },
  ];

  const apply = (field: "price" | "stock") => {
    onReplace(fillEvery(variants, field, fill[field], stockLocked));
    setFill((f) => ({ ...f, [field]: "" }));
  };

  return (
    <SectionCard title={w("Every combination")} foldKey="be-variant-grid"
      description={w("One row per combination, each with its own price, item code and stock. Shoppers pick them on the book page.")}>
      <div className="rp-kpi-grid be-vg-figures">
        <MetricCard label="Combinations" value={sum.count} />
        <MetricCard label="In stock" value={sum.units} footer={w("copies across all of them")} />
        <MetricCard label="Sold out" value={sum.soldOut} tone={sum.soldOut ? "danger" : undefined} footer={sum.low ? `${sum.low} running low` : undefined} />
        <MetricCard label={priceFoot ? "Price from" : "Price"} value={priceLine} footer={priceFoot} />
      </div>
      <div className="be-vg-fill" role="group" aria-label="Same for every row">
        <label className="be-vg-fill-field">
          <span className="be-label-xs">Price for every row</span>
          <input className="rp-input rp-mono be-vg-num" type="number" min={0} step="0.01" inputMode="decimal" placeholder="e.g. 30"
            value={fill.price} onChange={(e) => setFill({ ...fill, price: e.target.value })} />
        </label>
        <button type="button" className="rp-btn rp-btn-secondary rp-btn-sm" disabled={parseFill("price", fill.price) === null} onClick={() => apply("price")}>Set price</button>
        <label className="be-vg-fill-field">
          <span className="be-label-xs">Stock for every row</span>
          <input className="rp-input rp-mono be-vg-num" type="number" min={0} step={1} inputMode="numeric" placeholder="e.g. 10" disabled={!anyUnlocked}
            value={fill.stock} onChange={(e) => setFill({ ...fill, stock: e.target.value })} />
        </label>
        <button type="button" className="rp-btn rp-btn-secondary rp-btn-sm" disabled={!anyUnlocked || parseFill("stock", fill.stock) === null} onClick={() => apply("stock")}>Set stock</button>
      </div>
      {size && (
        <div className="be-vg-fill" role="group" aria-label="Bigger sizes cost more">
          <label className="be-vg-fill-field">
            <span className="be-label-xs">Extra for bigger sizes</span>
            <input className="rp-input rp-mono be-vg-num" type="number" min={0} step="0.01" inputMode="decimal" placeholder="e.g. 5"
              value={bump.extra} onChange={(e) => setBump({ ...bump, extra: e.target.value })} />
          </label>
          <label className="be-vg-fill-field">
            <span className="be-label-xs">Starting at</span>
            <select className="rp-input be-vg-select" aria-label={`Extra starting at this ${size.name.toLowerCase()}`} value={bumpFrom} onChange={(e) => setBump({ ...bump, from: e.target.value })}>
              {size.values.slice(1).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <button type="button" className="rp-btn rp-btn-secondary rp-btn-sm" disabled={bumpBase === null || bumpExtra === null} onClick={applyBump}>Set prices</button>
          <p className="be-vg-fill-note">{bumpBase === null ? "Set a price for every row first." : bumpExtra === null ? `Sizes below ${bumpFrom} stay at ${money(bumpBase)}; ${bumpFrom} and up get the extra.` : `Sizes below ${bumpFrom} ${money(bumpBase)}, ${bumpFrom} and up ${money(bumpBase + bumpExtra)}.`}</p>
        </div>
      )}
      <DataTable columns={columns} rows={variants} rowKey={(v) => v.id} caption={w("Every combination of this book's options")} stackOnPhone />
    </SectionCard>
  );
}
