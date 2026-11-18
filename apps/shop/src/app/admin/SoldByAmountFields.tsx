import { SelectField, TextField, Toggle } from "./riso/components";
import { MONEY_SIGN } from "./moneySign";
import { AMOUNT_UNITS, formatAmount, minSteps, perLabel, pricePerUnit, soldAmount, startingAmount, stepText, type AmountUnit, type SoldAmount } from "../../shared/soldByAmount";

/**
 * Sold by the metre or the gram (product types plan, round 2). Shown in the editor's Price card for a type sold that
 * way (fabric, beads) or a product already set up so. The price and stock boxes keep counting steps; this card picks
 * the step and the smallest amount and says what the price comes to per metre or per 100 g.
 */
export function SoldByAmountFields({ form, soldBy, set }: { form: any; soldBy?: string; set: (name: string, value: any) => void }) {
  const amount = soldAmount(form);
  const unit: AmountUnit = amount?.unit || (soldBy === "gram" ? "g" : "m");
  const turnOn = (on: boolean) => set("amount", on ? (startingAmount(unit === "g" ? "gram" : "metre") as SoldAmount) : null);
  const update = (patch: Partial<SoldAmount>) => amount && set("amount", { ...amount, ...patch });
  const price = Number(form.retailPrice) || 0;
  return (
    <div className="be-amount">
      <Toggle label={unit === "g" ? "Sell by weight (shoppers pick how many grams)" : "Sell by the metre (shoppers pick the length)"} checked={!!amount} onChange={turnOn} />
      {amount && (
        <>
          <div className="be-grid be-grid-3 mt-4">
            <SelectField label="Shoppers buy in steps of" value={String(amount.step)} onChange={(e) => {
              const step = Number(e.target.value);
              update({ step, min: Math.max(step, amount.min) });
            }}>
              {AMOUNT_UNITS[unit].steps.map((s) => <option key={s} value={s}>{formatAmount(unit, s)}</option>)}
            </SelectField>
            <TextField label={unit === "g" ? "Smallest weight (g)" : "Smallest length (m)"} type="number" min={amount.step} step={amount.step}
              value={amount.min} onChange={(e) => update({ min: Math.max(amount.step, Number(e.target.value) || amount.step) })}
              hint={`Shoppers start at ${formatAmount(unit, minSteps(amount) * amount.step)}.`} />
          </div>
          <p className="rp-hint mt-2" role="status">
            {`Enter the price and the stock for each ${stepText(amount)}. `}
            {price > 0 ? `At ${MONEY_SIGN}${price.toFixed(2)} for each ${stepText(amount)}, shoppers see ${MONEY_SIGN}${pricePerUnit(amount, price).toFixed(2)} / ${perLabel(amount)}.` : ""}
          </p>
        </>
      )}
    </div>
  );
}
