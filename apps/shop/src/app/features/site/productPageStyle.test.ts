import { describe, expect, it } from "vitest";
import { extraFieldsCss, phoneThumbsCss, photoViewerCss, productPageCss, productPageFontNames, signupBoxCss, titleFitSize } from "./productPageStyle";
import { STYLE_GROUPS } from "../../admin/studio/styleSchema";

describe("product page (catalogue card) CSS", () => {
  it("Thumbnails on phones: same as computer by default, one line or hidden only below the phone breakpoint", () => {
    expect(phoneThumbsCss({})).toBe("");
    expect(phoneThumbsCss({ pdpThumbsPhone: "" })).toBe("");
    // Unset draws exactly as before: the full CSS carries none of the phone-only thumbnail rules.
    expect(productPageCss({ pdpThumbWrap: true })).toBe(productPageCss({ pdpThumbWrap: true, pdpThumbsPhone: "" }));
    const row = phoneThumbsCss({ pdpThumbsPhone: "row" }, 96, 8);
    expect(row.startsWith("@media (max-width:767px){")).toBe(true);
    expect(row).toContain("flex-wrap:nowrap;max-height:none;overflow-x:auto;");
    expect(row).toContain(".fm-pdp-thumb{flex:none;width:96px;}");
    expect(row).toContain("(var(--thumb-cols) - 1) * 8px");
    const hidden = phoneThumbsCss({ pdpThumbsPhone: "hidden" });
    expect(hidden).toBe("@media (max-width:767px){[data-fm-store] .fm-pdp-media[data-thumbs] .fm-pdp-rail{display:none !important;}}");
    // Comes after the several-rows grid so it wins on phones.
    const css = productPageCss({ pdpThumbWrap: true, pdpThumbsPhone: "row", pdpThumbSize: 96, pdpThumbGap: 8 });
    expect(css.indexOf(row)).toBeGreaterThan(css.indexOf("repeat(auto-fill"));
    const control = STYLE_GROUPS.flatMap((g: any) => g.fields || []).find((f: any) => f.key === "pdpThumbsPhone");
    expect(control?.defaultValue).toBe("");
    expect(control?.options.map((o: any) => o.value)).toEqual(["", "row", "hidden"]);
  });

  it("puts Add to bag, wishlist and share on one line on phones only", () => {
    const css = productPageCss({});
    const at = css.indexOf("@media (max-width:767px){[data-fm-store] .fm-pdp-cta{display:grid;");
    expect(at).toBeGreaterThan(-1);
    expect(css).toContain('.fm-pdp-cta[data-icons="2"]{grid-template-columns:minmax(0,1fr) 52px 52px;}');
    expect(css).toContain(".fm-pdp-cta>.fm-pdp-qty{grid-column:1/-1;justify-self:start;}");
    // Outside the phone query nothing styles the row.
    expect(css.slice(0, at)).not.toContain(".fm-pdp-cta");
  });

  it("keeps the original edition buttons until Edition choices controls are set", () => {
    const css = productPageCss({});
    expect(css).toContain(".fm-pdp-chip{min-height:44px;padding:0 16px;background:transparent;border:2px solid rgba(var(--border-rgb), 0.6);font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);}");
    expect(css).toContain('.fm-pdp-chip[aria-pressed="true"]{background:var(--active-bg);border-color:var(--active-bg);color:var(--active-fg);}');
    expect(css).toContain('.fm-pdp-chip[data-soldout="true"]{text-decoration:line-through;opacity:.55;}');
    const set = productPageCss({ pdpChipTextSize: 14, pdpChipCase: "none", pdpChipTextColor: "#111111", pdpChipBorderColor: "#222222", pdpChipBorderWidth: 1, pdpChipRadius: 999, pdpChipActiveBg: "#333333", pdpChipActiveText: "#444444", pdpChipSoldOutStrike: false });
    expect(set).toContain("border:1px solid #222222;font-size:14px");
    expect(set).toContain("text-transform:none;color:#111111;border-radius:32px;");
    expect(set).toContain('[aria-pressed="true"]{background:#333333;border-color:#333333;color:#444444;}');
    expect(set).toContain('.fm-pdp-chip[data-soldout="true"]{opacity:.55;}');
  });

  it("falls back to theme tokens when no control is set", () => {
    const css = productPageCss({});
    expect(css).toContain("background:var(--surface)");
    expect(css).toContain("box-shadow:8px 8px 0 var(--accent)");
    expect(css).toContain("var(--rp-outline, rgb(var(--fg-rgb)))");
    expect(css).toContain("'DM Mono'");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("applies every buy-card control", () => {
    const css = productPageCss({
      pdpCardBg: "#111111", pdpCardBorderColor: "#222222", pdpCardBorderWidth: 4,
      pdpCardShadowColor: "#333333", pdpCardShadowOffset: 12, pdpCardPadding: 30,
      pdpTitleColor: "#444444", pdpTitleSize: 70, pdpTitleSizeMobile: 40, pdpTitleFont: "Anton", pdpTitleCase: "none",
      pdpPriceColor: "#555555", pdpPriceSize: 50, pdpMetaFont: "Archivo", pdpMetaSize: 13, pdpMetaColor: "#666666",
      pdpTabActiveBg: "#777777", pdpTabActiveText: "#888888", pdpThumbActiveColor: "#999999", pdpStockColor: "#aaaaaa",
      pdpPhotoBorderColor: "#bbbbbb", pdpPhotoBorderWidth: 0, pdpPanelBorderColor: "#cccccc", pdpCardDividerColor: "#dddddd",
    });
    for (const v of ["#111111", "#222222", "4px solid", "12px 12px 0 #333333", "padding:30px", "#444444", "font-size:70px",
      "font-size:40px", "'Anton'", "text-transform:none", "#555555", "font-size:50px", "'Archivo'", "font-size:13px",
      "#666666", "#777777", "#888888", "#999999", "#aaaaaa", "0px solid #bbbbbb", "#cccccc", "#dddddd"]) {
      expect(css, v).toContain(v);
    }
  });

  it("clamps numbers and strips CSS-breaking characters", () => {
    const css = productPageCss({ pdpCardShadowOffset: 999, pdpCardBg: "red;}body{display:none" });
    expect(css).toContain("16px 16px 0");
    expect(css).not.toContain("body{display:none");
  });

  it("lists the chosen fonts for loading", () => {
    expect(productPageFontNames({ pdpTitleFont: "Anton", pdpMetaFont: "DM Mono" })).toEqual(["Anton", "DM Mono"]);
  });

  it("every pdp key it reads has a Studio control", () => {
    const src = productPageCss.toString();
    const keys = new Set([...src.matchAll(/"(pdp[A-Za-z]+)"/g)].map((m) => m[1]));
    const controlled = new Set(STYLE_GROUPS.flatMap((g) => g.fields.map((f) => f.key)));
    expect([...keys].filter((k) => !controlled.has(k))).toEqual([]);
  });
});

describe("signupBoxCss (“Notify me” signup box)", () => {
  it("emits nothing for an untouched design, so the box keeps its built-in look", () => {
    expect(signupBoxCss({})).toBe("");
    expect(productPageCss({})).not.toContain("fm-pdp-alert");
  });

  it("turns each control into a rule on the signup box", () => {
    const css = signupBoxCss({
      pdpAlertBg: "#111111", pdpAlertBorderColor: "#ff0000", pdpAlertBorderWidth: 3, pdpAlertRadius: 12,
      pdpAlertPadding: 24, pdpAlertHeadingColor: "#00ff00", pdpAlertFieldBorderColor: "#0000ff",
      pdpAlertButtonBg: "#ffee00", pdpAlertButtonText: "#000000", pdpAlertButtonBorderColor: "#123456",
    });
    expect(css).toContain("div.fm-pdp-alert.fm-pdp-alert{background:#111111;}");
    expect(css).toContain("border-width:3px");
    expect(css).toContain("border-radius:12px !important");
    expect(css).toContain("padding:24px");
    expect(css).toContain("p.fm-pdp-alert-heading{color:#00ff00;}");
    expect(css).toContain("input.fm-pdp-alert-input{border-color:#0000ff;}");
    expect(css).toContain("button.fm-pdp-alert-btn{background:#ffee00;}");
    expect(css).toContain("button.fm-pdp-alert-btn{color:#000000;}");
    expect(css).toContain("button.fm-pdp-alert-btn{border-color:#123456;}");
    expect(productPageCss({ pdpAlertRadius: 12 })).toContain("border-radius:12px !important");
  });

  it("clamps numbers and strips CSS-breaking characters", () => {
    const css = signupBoxCss({ pdpAlertRadius: 999, pdpAlertBg: "red;}body{x:y" });
    expect(css).toContain("border-radius:32px");
    expect(css).not.toContain("}body{");
  });
});

describe("extraFieldsCss (Extras & gift card fields)", () => {
  it("emits nothing for an untouched design, so the fields keep their built-in look", () => {
    expect(extraFieldsCss({})).toBe("");
    expect(productPageCss({})).not.toContain("fm-pdp-field");
  });

  it("turns each control into a rule on the fields", () => {
    const css = extraFieldsCss({
      pdpFieldBg: "#111111", pdpFieldText: "#eeeeee", pdpFieldBorderColor: "#ff0000",
      pdpFieldBorderWidth: 2, pdpFieldRadius: 6, pdpFieldFocusColor: "#00ff00",
    });
    expect(css).toContain(".fm-pdp-field.fm-pdp-field{background:#111111;}");
    expect(css).toContain(".fm-pdp-field.fm-pdp-field{color:#eeeeee;}");
    expect(css).toContain(".fm-pdp-field.fm-pdp-field{border-color:#ff0000;}");
    expect(css).toContain("border-width:2px");
    expect(css).toContain("border-radius:6px !important");
    expect(css).toContain(".fm-pdp-field.fm-pdp-field:focus{border-color:#00ff00;}");
    expect(productPageCss({ pdpFieldRadius: 6 })).toContain("border-radius:6px !important");
  });

  it("clamps numbers and strips CSS-breaking characters", () => {
    const css = extraFieldsCss({ pdpFieldRadius: 999, pdpFieldBg: "red;}body{x:y" });
    expect(css).toContain("border-radius:24px");
    expect(css).not.toContain("}body{");
  });
});

describe("photoViewerCss (Enlarged photo viewer)", () => {
  it("emits nothing for an untouched design, so the built-in look stays", () => {
    expect(photoViewerCss({})).toBe("");
    expect(photoViewerCss({ pdpViewerButtonShape: "", pdpViewerShowCount: true })).toBe("");
  });
  it("styles the viewer, its buttons and the photo count", () => {
    const css = photoViewerCss({
      pdpViewerShade: "#111", pdpViewerButtonBg: "#fff", pdpViewerButtonIcon: "#000",
      pdpViewerButtonBorderColor: "#f00", pdpViewerButtonShape: "square", pdpViewerCountColor: "#0f0",
    });
    expect(css).toContain(".fm-lightbox.fm-lightbox{background:#111;}");
    expect(css).toContain(".fm-lightbox-btn.fm-lightbox-btn{background:#fff;}");
    expect(css).toContain("color:#000;");
    expect(css).toContain("border-color:#f00;");
    expect(css).toContain("border-radius:0 !important;");
    expect(css).toContain(".fm-lightbox-count.fm-lightbox-count{color:#0f0;}");
    expect(photoViewerCss({ pdpViewerButtonShape: "soft" })).toContain("border-radius:8px");
  });
  it("is part of the product page CSS and strips unsafe characters", () => {
    expect(productPageCss({ pdpViewerShade: "red" })).toContain(".fm-lightbox.fm-lightbox{background:red;}");
    expect(photoViewerCss({ pdpViewerShade: "red;}body{x" })).not.toContain("}body{");
  });
});

describe("thumbnails on several rows (pdpThumbWrap)", () => {
  it("become a grid exactly as wide as the photo, on phones and computers", () => {
    const css = productPageCss({ pdpThumbWrap: true, pdpThumbSize: 120 });
    const grid = "display:grid;grid-template-columns:repeat(auto-fill,minmax(min(120px,100%),1fr));overflow:visible;";
    expect(css).toContain(`.fm-pdp-media[data-thumbs="below"] .fm-pdp-rail{${grid}}`);
    expect(css).toContain('.fm-pdp-media[data-thumbs="below"] .fm-pdp-thumb{width:100%;}');
    expect(css).toMatch(/@media \(max-width:\d+px\)\{[^}]*\.fm-pdp-media\[data-thumbs="side"\] \.fm-pdp-rail\{display:grid;/);
  });
  it("leave the single scrolling row alone when off", () => {
    expect(productPageCss({})).not.toContain("auto-fill");
  });
});

describe("book title on phones", () => {
  it("scales a desktop-only title size down on phones and caps it by the longest word", () => {
    const css = productPageCss({ pdpTitleSize: 49, pdpTitleSizeMobile: 0, pdpPriceSize: 48 });
    expect(css).toContain(".fm-pdp-title{font-size:49px;font-size:min(49px, var(--pdp-title-fit, 100vw));}");
    expect(css).toContain(".fm-pdp-title{font-size:49px;font-size:min(min(49px, 8.5vw), var(--pdp-title-fit, 100vw));}");
    expect(css).toContain(".fm-pdp-price{font-size:48px;font-size:min(48px, 9vw);}");
    expect(css).toContain(".fm-pdp-card-section{container-type:inline-size;}");
  });
  it("keeps an explicit phone size, still capped so words stay whole", () => {
    const css = productPageCss({ pdpTitleSize: 70, pdpTitleSizeMobile: 40 });
    expect(css).toContain(".fm-pdp-title{font-size:40px;font-size:min(40px, var(--pdp-title-fit, 100vw));}");
  });
  it("caps the automatic size too", () => {
    expect(productPageCss({})).toContain("font-size:min(var(--pdp-title-auto, clamp(34px, 4.6vw, 62px)), var(--pdp-title-fit, 100vw))");
  });
  it("works out the cap from the longest word", () => {
    expect(titleFitSize("Lyricalmyrical Collections #1 (Collective Photobook)")).toBe("calc(100cqi / 10.08)");
    expect(titleFitSize("A Book")).toBe("");
    expect(titleFitSize(undefined)).toBe("");
  });
});
