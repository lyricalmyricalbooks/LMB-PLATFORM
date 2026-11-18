// The tip line at checkout (Donations & tips, beta): No tip, each of the shop's percents with what it comes to, and
// Other with a box. Display only: the picked tip is worked out in tipAtCheckout.ts, sent with the order and checked on
// the server. Every word is Text & labels › Checkout › Tip at checkout (`coTip*`).
import { regionProps } from "./storefrontRegions";
import { tipChoices } from "../../../shared/givingRules";
import type { TipPick } from "./tipAtCheckout";

type Copy = (key: string, vars?: Record<string, string | number>) => string;

export function CheckoutTip({ c, percents, baseMinor, pick, setPick, typed, setTyped, problem, formatPrice, currency, disabled }: {
  c: Copy; percents: number[]; baseMinor: number; pick: TipPick; setPick: (pick: TipPick) => void;
  typed: string; setTyped: (typed: string) => void; problem: string | null;
  formatPrice: (amountInShopCurrency: number) => string; currency: string; disabled: boolean;
}) {
  const choices = tipChoices(baseMinor, percents);
  const choice = (key: string, value: TipPick, top: string, bottom?: string) => (
    <label key={key} className="fm-co-tip-choice">
      <input type="radio" name="checkout-tip" checked={pick === value} disabled={disabled} onChange={() => setPick(value)} />
      <span className="fm-co-tip-pct">{top}</span>
      {bottom && <span className="fm-co-tip-amt" translate="no">{bottom}</span>}
    </label>
  );
  return (
    <div {...regionProps("checkoutTip")} className="fm-co-box flex flex-col gap-3" data-checkout-tip>
      <div>
        <h3 id="fm-co-tip-title" className="fm-co-mono">{c("coTipTitle")}</h3>
        {c("coTipText") && <p className="fm-co-note mt-1">{c("coTipText")}</p>}
      </div>
      <div className="fm-co-tip-choices" role="radiogroup" aria-labelledby="fm-co-tip-title">
        {choice("none", "none", c("coTipNone"))}
        {choices.map(({ percent, minor }) => choice(String(percent), percent, `${percent}%`, formatPrice(minor / 100)))}
        {choice("other", "other", c("coTipOther"))}
      </div>
      {pick === "other" && (
        <div className="fm-co-tip-other">
          <label htmlFor="checkout-tip-amount" className="fm-co-mono">{c("coTipOtherLabel", { currency })}</label>
          <input id="checkout-tip-amount" className="fm-co-input" inputMode="decimal" autoComplete="off" maxLength={10} value={typed} disabled={disabled}
            onChange={(e) => setTyped(e.target.value)} aria-invalid={problem ? true : undefined} aria-describedby={problem ? "checkout-tip-error" : undefined} />
          {problem && <p id="checkout-tip-error" className="fm-co-tip-error" role="alert">{problem}</p>}
        </div>
      )}
    </div>
  );
}
