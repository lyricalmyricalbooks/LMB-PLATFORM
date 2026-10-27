import { googleFontHref } from "./fonts";
import { cardFontNames, cardTypographyCss } from "./cardTypography";
import { smallPrintCss, smallPrintFontNames } from "./smallPrint";
import { photoOutlineCss } from "./photoShapes";
import { storefrontRegionCss, regionFontNames } from "./storefrontRegions";
import { schemeCss } from "./colorSchemes";
import { logoHoverCss } from "../../components/LogoMark";
import { phoneHeaderCss } from "./phoneHeader";
import { designTokensCss } from "./designTokens";
import { shopFilterBarCss, shopFilterBarFontNames } from "./shopFilterBar";
import { shopTypographyCss } from "./shopTypography";

// The Studio › Style controls that are turned into CSS rules (book-card title & price, small print)
// live in ONE place so every storefront surface obeys them — the shop grid (MainSite), the standalone
// pages (StorefrontThemeStyle) and the Studio preview iframe all render this. Any new storefront root
// that carries `data-fm-store` and injects its own token <style> must render <StorefrontOverrides>
// (`storefrontOverrides.test.ts` fails otherwise).

/** CSS for the merchant overrides. Empty until a control is set, so defaults are untouched — except the
 *  wordmark's pointed-at/clicked colour, which defaults to the link hover colour. */
// Colour schemes (`[data-scheme]` and element-scheme variables) come first; see colorSchemes.ts.
export const storefrontOverridesCss = (design: any): string => schemeCss(design) + shopTypographyCss(design) + smallPrintCss(design) + cardTypographyCss(design) + photoOutlineCss(design) + storefrontRegionCss(design) + logoHoverCss(design) + phoneHeaderCss(design) + designTokensCss(design) + shopFilterBarCss(design);

/** Google Fonts the override controls may ask for. */
export const storefrontOverridesFontNames = (design: any): string[] => [...cardFontNames(design), ...smallPrintFontNames(design), ...regionFontNames(design), ...shopFilterBarFontNames(design)];

export function StorefrontOverrides({ design }: { design?: any }) {
  const fonts = Array.from(new Set(storefrontOverridesFontNames(design)));
  return (
    <>
      {fonts.map((n) => <link key={n} rel="stylesheet" href={googleFontHref(n)} />)}
      <style>{storefrontOverridesCss(design)}</style>
    </>
  );
}
