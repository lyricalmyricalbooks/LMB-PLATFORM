import { describe, expect, it } from "vitest";
import { PHOTO_OUTLINES, PHOTO_OUTLINE_OPTIONS, PHOTO_RATIOS, photoOutlineCss } from "./photoShapes";
import { aspectRatioValue } from "./imageAspect";
import { storefrontOverridesCss } from "./StorefrontOverrides";
import { STYLE_GROUPS } from "../../admin/studio/styleSchema";

describe("photo shapes", () => {
  it("every proportion is a valid W:H the storefront can turn into CSS", () => {
    for (const r of PHOTO_RATIOS) expect(aspectRatioValue(r.value, "bad")).not.toBe("bad");
    expect(PHOTO_RATIOS.length).toBeGreaterThanOrEqual(12);
  });

  it("emits nothing until an outline is chosen", () => {
    expect(photoOutlineCss({})).toBe("");
    expect(photoOutlineCss({ photoOutline: "default" })).toBe("");
    expect(photoOutlineCss({ photoOutline: "not-a-shape" })).toBe("");
  });

  it("round shapes use border-radius, polygon shapes use clip-path, and both clip the image", () => {
    expect(photoOutlineCss({ photoOutline: "arch" })).toContain(".fm-photo-frame{border-radius:999px 999px 0 0 !important;overflow:hidden !important;}");
    const hex = photoOutlineCss({ photoOutline: "hexagon" });
    expect(hex).toContain("clip-path:polygon(");
    expect(hex).toContain("border-radius:0 !important");
  });

  it("the product page follows the shop grid unless it has its own outline", () => {
    expect(photoOutlineCss({ photoOutline: "circle" })).toContain(".fm-photo-frame-pdp{border-radius:50%");
    expect(photoOutlineCss({ photoOutline: "circle", productPhotoOutline: "grid" })).toContain(".fm-photo-frame-pdp{border-radius:50%");
    const own = photoOutlineCss({ photoOutline: "circle", productPhotoOutline: "diamond" });
    expect(own).toContain(".fm-photo-frame{border-radius:50%");
    expect(own).toContain(".fm-photo-frame-pdp{clip-path:polygon(50% 0");
    expect(photoOutlineCss({ productPhotoOutline: "pill" })).toBe(".fm-photo-frame-pdp{border-radius:999px !important;overflow:hidden !important;}");
  });

  it("reaches every storefront surface through the shared override layer", () => {
    expect(storefrontOverridesCss({ photoOutline: "pill" })).toContain(".fm-photo-frame{");
  });

  it("offers a Studio control for both outlines, listing every shape", () => {
    const fields = STYLE_GROUPS.flatMap((g) => g.fields);
    const shop = fields.find((f) => f.key === "photoOutline") as any;
    const pdp = fields.find((f) => f.key === "productPhotoOutline") as any;
    expect(shop.options).toEqual(PHOTO_OUTLINE_OPTIONS);
    expect(pdp.options.map((o: any) => o.value)).toEqual(["grid", ...Object.keys(PHOTO_OUTLINES)]);
  });
});
