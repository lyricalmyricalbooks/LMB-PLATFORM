// Option buttons on the product page (plan 10.2): one row of choices per option (Size, Colour), for a product saved
// with options (src/shared/productOptions.ts `usesOptionPicker`). A book with editions keeps the editions list in
// BookDetail.tsx. The buttons reuse the edition chips' look (`fm-pdp-chip`, Studio › Style › Product page), the option
// names and values are the press's own words, and a value that can't lead to something in stock is marked sold out.
import { getCopy } from "./storeCopy";
import { productOptions, valueAvailable, type OptionPicks } from "../../../shared/productOptions";

/** A variant can be bought when it has copies, or takes orders while out (back-order). */
export const variantBuyable = (v: any): boolean => Number(v?.stockLevel ?? v?.stock ?? 0) > 0 || !!v?.onBackorder;

export function OptionPicker({ design, product, picks, onPick, error, align }: {
  design: any;
  product: any;
  picks: OptionPicks;
  onPick: (optionName: string, value: string) => void;
  error?: string;
  align: "start" | "center";
}) {
  const options = productOptions(product);
  return (
    <div className={`flex flex-col gap-4 w-full ${align === "center" ? "items-center" : "items-start"}`}>
      {options.map((option, i) => {
        const labelId = `pdp-option-${i}-label`;
        return (
          <div key={option.name} className={`flex flex-col gap-2.5 w-full ${align === "center" ? "items-center" : "items-start"}`}>
            <span id={labelId} className="fm-pdp-meta">
              {option.name}{picks[option.name] ? `: ${picks[option.name]}` : ""}
            </span>
            <div role="group" aria-labelledby={labelId} className={`flex flex-wrap gap-2 ${align === "center" ? "justify-center" : "justify-start"}`}>
              {option.values.map((value) => {
                const open = valueAvailable(product, picks, option.name, value, variantBuyable);
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onPick(option.name, value)}
                    aria-pressed={picks[option.name] === value}
                    aria-label={open ? value : `${value} · ${getCopy(design, "pdpEditionSoldOut")}`}
                    data-soldout={!open}
                    className="fm-pdp-chip"
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {error && <span id="pdp-edition-error" role="alert" className="fm-pdp-meta" style={{ color: "var(--danger)" }}>{error}</span>}
    </div>
  );
}
