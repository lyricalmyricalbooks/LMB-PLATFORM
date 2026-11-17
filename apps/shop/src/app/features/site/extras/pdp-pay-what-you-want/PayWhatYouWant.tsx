// "Pay what you want" on a product page (Digital D2): the product's price is the lowest amount and the buyer may pay
// more. Shown only for a product that lets the buyer choose (Books › edit › Pricing). The server checks the amount again.
import { useId } from "react";
import { getCopy } from "../../storeCopy";
import { regionProps } from "../../storefrontRegions";
import { payWhatYouWantMax } from "../../../../../shared/payWhatYouWant";

export default function PayWhatYouWant({ design, lowest, value, onChange, error, formatPrice, currencySign }: {
  design: any;
  /** The product's price, in the shop's currency: the least the buyer can pay. */
  lowest: number;
  value: string;
  onChange: (next: string) => void;
  error: string;
  formatPrice: (amount: number) => string;
  /** The sign of the currency the shop is shown in (the buyer types in it). */
  currencySign: string;
}) {
  const id = useId();
  const hint = lowest > 0 ? getCopy(design, "pdpPwywHint", { min: formatPrice(lowest) }) : getCopy(design, "pdpPwywFreeHint");
  return (
    <div {...regionProps("productPayWhatYouWant")} className="fm-pdp-pwyw w-full flex flex-col gap-1 text-left">
      <label htmlFor={`${id}-amount`} className="fm-pdp-meta">{getCopy(design, "pdpPwywLabel")}</label>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="fm-pdp-meta shrink-0">{currencySign.trim()}</span>
        <input
          id={`${id}-amount`}
          inputMode="decimal"
          autoComplete="off"
          placeholder={formatPrice(lowest).replace(/[^0-9.,]/g, "")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
          aria-invalid={!!error}
          className="fm-pdp-field min-w-0 w-full rounded-xl border border-white/[0.12] bg-transparent px-4 py-3 text-sm outline-none focus:border-white/40"
        />
      </div>
      <p id={`${id}-hint`} className="fm-pdp-meta">{hint}</p>
      {error && <p id={`${id}-error`} role="alert" className="text-sm fm-danger-text">
        {getCopy(design, error === "high" ? "pdpPwywTooHigh" : "pdpPwywTooLow", { min: formatPrice(lowest), max: formatPrice(payWhatYouWantMax(lowest)) })}
      </p>}
    </div>
  );
}
