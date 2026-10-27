import { layerDesign } from "./designModel";
import { describe, expect, it } from "vitest";
import { applyGlobalStyle, STYLE_GROUPS } from "../../admin/studio/styleSchema";
import { getCopy } from "./storeCopy";
import { storefrontRegionCss } from "./storefrontRegions";

describe("designer responsive region editing", () => {
  it("keeps intentionally blank copy across pages and resets it explicitly", () => {
    const original = { copy: { wishlistTitle: "Saved" }, wishlistPage: { copy: { wishlistEmpty: "Your shelf is empty" }, sections: [1] } };
    const blank = applyGlobalStyle(original, "copy.wishlistTitle", "", ["wishlistPage"]);
    expect(getCopy(blank, "wishlistTitle")).toBe("");
    expect(getCopy(layerDesign(blank, blank.wishlistPage), "wishlistTitle")).toBe("");
    expect(blank.wishlistPage.copy.wishlistEmpty).toBe("Your shelf is empty");
    expect(blank.wishlistPage.sections).toEqual([1]);
    const reset = applyGlobalStyle(blank, "copy.wishlistTitle", undefined, ["wishlistPage"]);
    expect(getCopy(reset, "wishlistTitle")).toBe(getCopy({}, "wishlistTitle"));
    expect(original.copy.wishlistTitle).toBe("Saved");
  });

  it("renders tablet and phone spacing and typography in cascading order", () => {
    const css = storefrontRegionCss({ regions: {
      wishlistTitlePadding: 40, wishlistTitlePaddingLeft: 0, wishlistTitleMarginBottom: 24,
      wishlistTitleLineHeight: 1.4, wishlistTitleLetterSpacing: -1,
      wishlistTitleTabletPadding: 20, wishlistTitleTabletSize: 30,
      wishlistTitleMobilePaddingLeft: 4, wishlistTitleMobileSize: 22,
    } });
    expect(css).toContain("padding-left:0px !important;");
    expect(css).toContain("margin-bottom:24px !important;");
    expect(css).toContain("line-height:1.4 !important;");
    expect(css).toContain("letter-spacing:-1px !important;");
    expect(css).toContain("@media(max-width:1023px)");
    expect(css).toContain("font-size:30px !important;");
    expect(css).toContain("padding-left:4px !important;");
    expect(css.indexOf("@media(max-width:767px)")).toBeGreaterThan(css.indexOf("@media(max-width:1023px)"));
    expect(css).not.toContain("NaN");
  });

  it("supports device-specific optional visibility without hiding required forms", () => {
    const css = storefrontRegionCss({ regions: {
      wishlistCountTabletVisible: false, wishlistCountMobileVisible: true,
      checkoutFormTabletVisible: false, checkoutFormMobileVisible: false,
    } });
    expect(css).toContain("display:none !important;");
    // Hiding tablet only retains the original flex/grid display on phones.
    expect(css).toContain("@media(min-width:768px) and (max-width:1023px)");
    expect(css).not.toContain("@media(max-width:767px)");
    expect(css).not.toContain("display:revert");
    expect(css).not.toContain('data-store-region="checkoutForm"');
  });

  it("offers matching editable controls for all responsive properties", () => {
    const fields = STYLE_GROUPS.find(g => g.id === "wishlistLayout")!.fields.map(f => f.key);
    for (const suffix of ["PaddingLeft", "MarginBottom", "LineHeight", "LetterSpacing", "BorderWidth", "TabletSize", "TabletPadding", "MobilePaddingLeft", "MobileGap", "TabletColumns", "MobileVisible"]) {
      const id = suffix.endsWith("Columns") || suffix.endsWith("Gap") ? "wishlistGrid" : "wishlistTitle";
      expect(fields).toContain(`regions.${id}${suffix}`);
    }
  });
});

it("makes cover dimensions and image cropping editable without changing the book data", () => {
  const css = storefrontRegionCss({ regions: { searchPhotoElementWidth: 90, searchPhotoHeight: 120,
    searchPhotoImageFit: "contain", searchPhotoMobileImagePositionX: 25, searchPhotoMobileImagePositionY: 75 } });
  expect(css).toContain("width:90px !important;");
  expect(css).toContain("height:120px !important;");
  expect(css).toContain("object-fit:contain !important;");
  expect(css).toContain("object-position:25% 75% !important;");
});

it("commits inline copy through the same page-aware writer as Text & labels", async () => {
  const { applyInlineText } = await import("../../admin/studio/inlineText");
  const original = { copy: { wishlistTitle: "Saved" }, wishlistPage: { copy: { wishlistTitle: "Old page title", wishlistEmpty: "Empty" } } };
  const next = applyInlineText(original, { kind: "copy", key: "wishlistTitle", value: "" }, {
    sectionFields: () => [], blockFields: () => [], blocksKey: () => "items", copyKeys: ["wishlistTitle"], styleKeys: [],
    applyStyle: (design, path, value) => applyGlobalStyle(design, path, value, ["wishlistPage"]),
  });
  // The stale page title is cleared; the page keeps its other page-only words.
  expect(next.wishlistPage.copy).toEqual({ wishlistEmpty: "Empty" });
  expect(layerDesign(next, next.wishlistPage).copy).toEqual({ wishlistTitle: "", wishlistEmpty: "Empty" });
});

it("keeps border thickness and per-side padding consistent with inherited editor values", async () => {
  const { regionValue } = await import("./storefrontRegions");
  const values = { wishlistTitleBorderWidth: 4, wishlistTitleMobileBorder: "#123456",
    wishlistTitlePaddingLeft: 0, wishlistTitleTabletPadding: 20 };
  expect(regionValue(values, "wishlistTitle", "PaddingLeft", "mobile")).toBe(20);
  const css = storefrontRegionCss({ regions: values });
  expect(css.slice(css.indexOf("@media(max-width:767px)"))).toContain("border-width:4px !important;");
});

it("keeps repeated region labels tied to their own page's fields", async () => {
  const { regionStyleFields } = await import("../../admin/studio/styleSchema");
  for (const [groupId, regionId] of [["accountLayout", "accountDownloads"], ["trackingLayout", "trackingSummary"]]) {
    const fields = regionStyleFields(STYLE_GROUPS.find(g => g.id === groupId)!, regionId, "mobile");
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.every(field => field.key.startsWith(`regions.${regionId}Mobile`))).toBe(true);
  }
});
