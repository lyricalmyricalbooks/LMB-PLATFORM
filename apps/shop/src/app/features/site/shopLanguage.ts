// The language a shop's pages are written in (design.language: "fr", or absent for English). Quebec's Charter of the
// French Language asks a shop selling to Quebec to offer its pages in French. Studio › Text & labels › Shop language
// fills the French words (admin/studio/shopLanguageSwitch.ts); here the storefront only tells browsers and screen
// readers which language the page is in.
export type ShopLanguage = "en" | "fr";

export const shopLanguageOf = (design: any): ShopLanguage => (design?.language === "fr" ? "fr" : "en");

/** Sets <html lang> so screen readers pronounce the words right and browsers don't offer to translate French pages. */
export function noteShopLanguage(design: any) {
  try { document.documentElement.lang = shopLanguageOf(design) === "fr" ? "fr-CA" : "en"; } catch { /* no document */ }
}
