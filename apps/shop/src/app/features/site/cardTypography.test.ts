import { describe, it, expect } from "vitest";
import { cardTypographyCss } from "./cardTypography";
import { smallPrintCss } from "./smallPrint";

describe("cardTypographyCss", () => {
  it("uses readable phone defaults without adding desktop overrides", () => {
    const css = cardTypographyCss({});
    expect(css).toContain(".fm-card-title{font-size:16px");
    expect(css).toContain(".fm-card-price{font-size:16px");
    expect(css).not.toContain("min-width");
  });

  it("uses readable phone defaults when no custom card type is set", () => {
    const css = cardTypographyCss({});
    expect(css).toContain("(max-width:767px){[data-fm-store] .fm-card-title{font-size:16px");
    expect(css).toContain("(max-width:767px){[data-fm-store] .fm-card-price{font-size:16px");
  });

  it("styles the title and the price amount separately", () => {
    const css = cardTypographyCss({ productTitleColor: "#0f0", cardTitleWeight: "800", productPriceColor: "#00f", cardPriceWeight: "500" });
    expect(css).toContain(".fm-card-title{color:#0f0 !important;font-weight:800 !important;}");
    expect(css).toContain(".fm-card-price-wrap{color:#00f !important;}");
    expect(css).toContain(".fm-card-price{font-weight:500 !important;}");
  });

  it("uses one size everywhere unless a phone size is set", () => {
    const one = cardTypographyCss({ cardTitleSize: 24 });
    expect(one).toContain("(max-width:767px){[data-fm-store] .fm-card-title{font-size:16px");
    expect(one).toContain("(min-width:768px){[data-fm-store] .fm-card-title{font-size:24px");
    const split = cardTypographyCss({ cardTitleSize: 24, cardTitleSizeMobile: 16 });
    expect(split).toContain("(max-width:767px){[data-fm-store] .fm-card-title{font-size:16px");
    expect(split).toContain("(min-width:768px){[data-fm-store] .fm-card-title{font-size:24px");
  });

  it("leaves desktop automatic when only the phone size is set", () => {
    const css = cardTypographyCss({ cardPriceSizeMobile: 12 });
    expect(css).toContain("(max-width:767px)");
    expect(css).not.toContain("min-width");
  });

  it("breaks a title word too wide for the card, without splitting words that fit", () => {
    const css = cardTypographyCss({});
    expect(css).toContain("@media (max-width:767px){[data-fm-store] .fm-card-title{overflow-wrap:break-word;}}");
    expect(css).not.toContain("break-all");
    // With the phone price stack off, nothing asks for overflow-wrap:anywhere (which would split words early in flex rows).
    expect(cardTypographyCss({ cardPriceStackPhone: false })).not.toContain("anywhere");
  });

  it("cannot be used to break out of the rule", () => {
    const css = cardTypographyCss({ productTitleColor: "red;}body{display:none", cardTitleFont: "A';}x{" });
    expect(css).not.toContain("body{display:none");
    expect(css).not.toContain("}x{");
  });
});

describe("smallPrintCss", () => {
  it("emits nothing until a control is set (with the phone floor off)", () => {
    expect(smallPrintCss({ phoneMinTextSize: 0 })).toBe("");
  });

  it("keeps tiny labels at 12px or more on phones by default", () => {
    const css = smallPrintCss({});
    expect(css).toContain("@media (max-width:767px)");
    expect(css).toContain('[class~="text-[11px]"]{font-size:12px');
    expect(css).not.toMatch(/^\[data-fm-store\]/);
  });

  it("styles the optional author, formats and star lines only when set", () => {
    const plain = cardTypographyCss({});
    expect(plain).not.toContain("fm-card-creator");
    expect(plain).not.toContain("fm-card-formats");
    expect(plain).not.toContain("fm-card-rating-stars");
    const css = cardTypographyCss({ cardCreatorColor: "#aa0000", cardCreatorSize: 15, cardFormatsColor: "#00aa00", cardRatingStarColor: "#0000aa" });
    expect(css).toContain("[data-fm-store] .fm-card-creator{color:#aa0000 !important;}");
    expect(css).toContain("@media (min-width:768px){[data-fm-store] .fm-card-creator{font-size:15px !important;}}");
    expect(css).toContain("[data-fm-store] .fm-card-formats{color:#00aa00 !important;}");
    expect(css).toContain("[data-fm-store] .fm-card-rating-stars{color:#0000aa !important;}");
    expect(cardTypographyCss({ cardCreatorSize: 8 })).toContain("@media (max-width:767px){[data-fm-store] .fm-card-creator{font-size:12px !important;}}");
  });

  it("raises phone card title and price below the floor", () => {
    const css = cardTypographyCss({ cardTitleSizeMobile: 2, cardPriceSizeMobile: 9 });
    expect(css).toContain(".fm-card-title{font-size:14px");
    expect(css).toContain(".fm-card-price{font-size:14px");
    expect(cardTypographyCss({ cardTitleSizeMobile: 2, cardTitlePhoneMin: 0 })).toContain(".fm-card-title{font-size:12px");
    expect(cardTypographyCss({ cardTitleSizeMobile: 2, cardTitlePhoneMin: 0, phoneMinTextSize: 0 })).toContain(".fm-card-title{font-size:2px");
  });

  it("only raises sizes below the minimum", () => {
    const css = smallPrintCss({ smallPrintMinSize: 10, phoneMinTextSize: 0 });
    expect(css).toContain('[class~="text-[8px]"]{font-size:10px');
    expect(css).toContain('[class~="text-[9px]"]{font-size:10px');
    expect(css).not.toContain('[class~="text-[10px]"]');
    expect(css).not.toContain('[class~="text-[11px]"]');
  });

  it("keeps buttons and filled chips on their own text colour", () => {
    const css = smallPrintCss({ smallPrintColor: "#ccc" });
    expect(css).toContain(":not(button)");
    expect(css).toContain(':not([class*="bg-"])');
    expect(css).toContain("color:#ccc");
  });
});
