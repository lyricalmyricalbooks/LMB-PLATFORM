import { googleFontHref } from "./fonts";
import { storefrontOverridesCss, storefrontOverridesFontNames } from "./StorefrontOverrides";
import { buildStorefrontTokenVars, RISO_STOREFRONT_CSS, RISO_CHECKOUT_DARK_CSS, risoGrainCss, STOREFRONT_TOKEN_CSS, hexToRgbTriplet } from "./themeTokens";

/**
 * Drop-in <style> block that wires the semantic token layer onto any storefront
 * surface. Render it once inside an element that has the `data-fm-store`
 * attribute and every Tailwind white/black alpha utility + the fm-* helper
 * classes below it become themeable.
 *
 * Use on standalone pages (Collection, Wishlist, Page, Account, Checkout, the
 * cart drawer, …). The homepage uses MainSite's richer TypographyTokens, which
 * injects the same token layer.
 */
const fontStack = (name?: string, fallback = "system-ui, sans-serif") =>
  name ? `'${String(name).replace(/'/g, "")}', ${fallback}` : fallback;

export function StorefrontThemeStyle({ design }: { design?: any }) {
  const d = design || {};
  const bodyFont = fontStack(d.font || d.bodyFont, "system-ui, -apple-system, 'Segoe UI', sans-serif");
  const headingFont = fontStack(d.headingFont || d.font || d.bodyFont, "Impact, 'Arial Narrow', sans-serif");
  const css = `
    [data-fm-store]{
      ${buildStorefrontTokenVars(d)}
      --bg-color:${d.backgroundColor || "#000000"};
      --text-color:${d.textColor || "#ffffff"};
      --link-hover-color:${d.linkColorHover || "#ff6b55"};
      --border-color:${d.borderColor || "rgba(255,255,255,0.22)"};
      --btn-bg:${d.buttonColor || d.primaryColor || "#e8402a"};
      --btn-text:${d.buttonTextColor || "#100f0d"};
      --btn-hover-bg:${d.buttonHoverBgColor || "#ff6b55"};
      --btn-hover-text:${d.buttonHoverTextColor || "#100f0d"};
      --badge-text-primary:${d.badgeTextPrimary || "#100f0d"};
      --badge-bg-primary:${d.badgeBgPrimary || "#e8402a"};
      --badge-text-secondary:${d.badgeTextSecondary || "#000000"};
      --badge-bg-secondary:${d.badgeBgSecondary || "#E0E0E0"};
      --low-inventory-color:${d.lowInventoryColor || "#056FFA"};
      --body-font:${bodyFont};
      --heading-font:${headingFont};
    }
    [data-fm-store]{font-family:var(--body-font);}
    [data-fm-store] :where(h1,h2,h3,h4,h5,h6){font-family:var(--heading-font);${d.headingWeight ? `font-weight:${d.headingWeight};` : ""}}
    ${d.navFont ? `[data-fm-store] header[data-section="navigation"]{font-family:'${String(d.navFont).replace(/'/g, "")}',${"sans-serif"};}` : ""}
    [data-fm-store] a:hover{color:var(--link-hover-color);}
    [data-fm-store] .custom-btn{background-color:var(--btn-bg) !important;color:var(--btn-text) !important;}
    [data-fm-store] .custom-btn:hover{background-color:var(--btn-hover-bg) !important;color:var(--btn-hover-text) !important;}
    ${STOREFRONT_TOKEN_CSS}
    ${d.themeStyle === "riso" ? RISO_STOREFRONT_CSS + risoGrainCss(d) : ""}
  `;
  const customCss = d.customCss ? `\n/* Custom CSS */\n${d.customCss}` : '';

  // Optional checkout/cart-only cosmetic overrides. Purely additive: the rule
  // only exists when a merchant has actually set one of these three tokens, and
  // it only ever touches colors/border-radius — never layout, totals, or any
  // payment logic. Appended after the [data-fm-store] block above so, for the
  // same element (checkout/cart roots carry both data-fm-store and
  // data-fm-checkout), this later same-specificity rule wins in source order.
  const hasCheckoutOverrides = Boolean(
    d.checkoutAccentColor || d.checkoutBgColor || d.checkoutInputRadius != null
  );
  // Checkout fonts + field colours (Studio › Style › Checkout & cart drawer). The autofill rule
  // keeps the browser's own tint (a navy box in Chrome) from overriding the field colour.
  const fieldBg = d.checkoutFieldBg || "var(--surface, #0a0a0a)";
  const fieldText = d.checkoutFieldText || "inherit";
  const checkoutTypeCss = `
    [data-fm-checkout] select option {
      background-color:${fieldBg} !important;
      color:${d.checkoutFieldText || "rgb(var(--fg-rgb))"} !important;
    }
    ${d.checkoutFont ? `[data-fm-checkout]{ font-family:${fontStack(d.checkoutFont)} !important; }` : ''}
    ${d.checkoutHeadingFont ? `[data-fm-checkout] h1, [data-fm-checkout] h2, [data-fm-checkout] h3 { font-family:${fontStack(d.checkoutHeadingFont)} !important; }` : ''}
    ${d.checkoutFieldFont ? `[data-fm-checkout] input, [data-fm-checkout] select, [data-fm-checkout] textarea, [data-fm-checkout] .fm-address-suggest { font-family:${fontStack(d.checkoutFieldFont)} !important; }` : ''}
    ${d.checkoutFieldBg ? `[data-fm-checkout] input, [data-fm-checkout] select, [data-fm-checkout] textarea { background-color:${d.checkoutFieldBg} !important; }` : ''}
    ${d.checkoutFieldText ? `[data-fm-checkout] input, [data-fm-checkout] select, [data-fm-checkout] textarea { color:${d.checkoutFieldText} !important; }` : ''}
    ${/* :not(#fm-studio) lifts specificity above the Riso field outline (themeTokens), so the Studio colour wins; focus keeps its ring. */ ""}
    ${d.checkoutFieldBorder ? `[data-fm-checkout] :is(input,select,textarea):not(#fm-studio):not(:focus-visible) { border-color:${d.checkoutFieldBorder} !important; }` : ''}
    [data-fm-checkout] input:-webkit-autofill, [data-fm-checkout] input:-webkit-autofill:hover, [data-fm-checkout] input:-webkit-autofill:focus {
      -webkit-box-shadow: 0 0 0 1000px ${fieldBg} inset !important;
      -webkit-text-fill-color: ${fieldText === "inherit" ? "currentColor" : fieldText} !important;
      caret-color: currentColor;
      transition: background-color 9999s ease-out 0s;
    }
  `;
  // The shopping bag shares the checkout's hook; its own Cart drawer › background (or colour scheme) must win there.
  const bagHasOwnBackground = Boolean(d.cartDrawerBg || d.elementSchemes?.cartDrawer);
  const checkoutCss = hasCheckoutOverrides
    ? `
    [data-fm-checkout]{
      ${d.checkoutAccentColor ? `--accent:${d.checkoutAccentColor};--accent-rgb:${hexToRgbTriplet(d.checkoutAccentColor)};` : ''}
    }
    ${d.checkoutBgColor ? `${bagHasOwnBackground ? '[data-fm-checkout]:not(.fm-bag)' : '[data-fm-checkout]'}{background-color:${d.checkoutBgColor} !important;}` : ''}
    ${d.checkoutInputRadius != null ? `[data-fm-checkout] :is(input,select):not(#fm-studio) { border-radius: ${d.checkoutInputRadius}px !important; }` : ''}
  `
    : '';

  // The token layer maps `bg-white` to the theme foreground (right for dark themes). Checkout uses
  // `bg-white` as literal paper, so on LIGHT themes (dark foreground) restore paper inside checkout.
  const fg = (d.textColor || "#ffffff").toString();
  const m = /^#?([0-9a-f]{6})$/i.exec(fg.trim());
  const lum = m ? (parseInt(m[1].slice(0, 2), 16) * 0.299 + parseInt(m[1].slice(2, 4), 16) * 0.587 + parseInt(m[1].slice(4, 6), 16) * 0.114) / 255 : 1;
  const lightThemePaperCss = lum < 0.5
    ? `[data-fm-checkout] .bg-white{background-color:${d.surfaceRaisedColor || "#ffffff"} !important;}`
    : "";

  // Any dark canvas: turn the conventional white checkout markup into the theme's colours, so its
  // greys follow the storefront tokens (which re-point them) instead of staying on white paper.
  const darkCheckoutCss = lum >= 0.5 ? RISO_CHECKOUT_DARK_CSS : "";

  // Merchant overrides for book-card title/price and the tiny "small print" text. They come after the
  // token layer so they win, and only exist when a Studio control has been set.
  const fontNames = Array.from(new Set([d.headingFont, d.font || d.bodyFont, d.navFont, d.wordmarkFont, d.checkoutFont, d.checkoutHeadingFont, d.checkoutFieldFont, ...storefrontOverridesFontNames(d)].filter(Boolean).map(String)));
  const overridesCss = storefrontOverridesCss(d);
  return (
    <>
      {fontNames.map(n => <link key={n} rel="stylesheet" href={googleFontHref(n)} />)}
      <style>{css}{overridesCss}{customCss}{checkoutCss}{lightThemePaperCss}{darkCheckoutCss}{checkoutTypeCss}</style>
    </>
  );
}
