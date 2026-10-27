// Studio › Style › Footer & social links › Currency picker in the footer (`showFooterCurrency`, off by default):
// a labelled "Currency" drop-down in the footer's bottom bar, like the country/currency selector Shopify themes put
// there. It uses the same choice as the header's picker (CurrencyContext, remembered in fm_currency), so prices
// everywhere switch together. Display only: checkout still charges the CAD price × today's rate.
import { ChevronDown } from "lucide-react";
import { useCurrency, type Currency } from "../../../../CurrencyContext";
import { getCopy } from "../../storeCopy";
import { regionProps } from "../../storefrontRegions";

export const FOOTER_CURRENCIES: { code: Currency; copyKey: string }[] = [
  { code: "CAD", copyKey: "footerCurrencyCAD" },
  { code: "USD", copyKey: "footerCurrencyUSD" },
  { code: "EUR", copyKey: "footerCurrencyEUR" },
];

export function footerCurrencyOn(design: any): boolean {
  return design?.showFooterCurrency === true;
}

/** Mounted only while the switch is on, so a footer without a CurrencyProvider (tests, previews) never asks for one. */
export function FooterCurrency({ design }: { design: any }) {
  const { currency, setCurrency } = useCurrency();
  return (
    <label {...regionProps("footerCurrency")} data-studio-target="copy:Footer|style:footer|style:catalogElements" data-studio-label="Footer currency picker"
      className="fm-footer-currency fm-footer-icon relative inline-flex items-center gap-2 text-[9px] uppercase tracking-[0.3em] text-white/55">
      <span data-studio-copy="footerCurrencyLabel">{getCopy(design, "footerCurrencyLabel")}</span>
      <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}
        className="appearance-none cursor-pointer border border-white/30 bg-transparent py-1.5 pl-2 pr-6 text-[11px] normal-case tracking-normal text-white/80 hover:text-white focus-visible:outline focus-visible:outline-2">
        {FOOTER_CURRENCIES.map(({ code, copyKey }) => (
          <option key={code} value={code} className="bg-[var(--surface,#050508)] text-[var(--text-color,#fff)]">{getCopy(design, copyKey)}</option>
        ))}
      </select>
      <ChevronDown size={10} aria-hidden="true" className="pointer-events-none absolute right-2 opacity-60" />
    </label>
  );
}
