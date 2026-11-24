import { describe, expect, it } from "vitest";
import { SECTION_REGISTRY, getBlocksKey } from "../ThemeEditorExtensions";
import { currentDesignId, designsToTry, kindOf, withDesign } from "./sectionDesigns";

const reg = SECTION_REGISTRY as any[];
const meta = (type: string) => reg.find(m => m.type === type)!;
const section = (type: string, settings: Record<string, any> = {}) => ({ id: "s1", type, visible: true, settings: { ...meta(type).defaults, ...settings } });

describe("Try another design", () => {
  it("offers only designs of the same kind, never a pop-up for a page band", () => {
    const list = designsToTry(section("ImageBannerSection"), reg);
    expect(list.length).toBeGreaterThan(2);
    expect(list.every(d => kindOf(d.type) === "opening")).toBe(true);
    expect(designsToTry(section("NewsletterSection"), reg).some(d => d.type === "NewsletterPopupSection")).toBe(false);
    expect(designsToTry(section("PageContentSection"), reg)).toEqual([]);
  });
  it("keeps the owner's words, photo and link across section types", () => {
    const before = section("ImageBannerSection", { title: "Autumn pottery", body: "Small batches, fired by hand.", ctaText: "See the mugs", ctaUrl: "/collections/mugs", imageUrl: "https://example.com/a.jpg" });
    const after = withDesign(before, "SplitOpeningSection", reg, getBlocksKey);
    expect(after.type).toBe("SplitOpeningSection");
    expect(after.settings.title).toBe("Autumn pottery");
    expect(after.settings.body).toBe("Small batches, fired by hand.");
    expect(after.settings.ctaText).toBe("See the mugs");
    expect(after.settings.ctaUrl).toBe("/collections/mugs");
    const video = withDesign(before, "VideoHeroSection", reg, getBlocksKey);
    expect(video.settings.headline).toBe("Autumn pottery");
    expect(video.settings.subheadline).toBe("Small batches, fired by hand.");
    expect(video.settings.ctaLink).toBe("/collections/mugs");
  });
  it("leaves placeholders behind so the new design shows its own", () => {
    const after = withDesign(section("ImageBannerSection"), "SplitOpeningSection", reg, getBlocksKey);
    expect(after.settings.title).toBe(meta("SplitOpeningSection").defaults.title);
  });
  it("switching within one type keeps everything and back again returns the plain design", () => {
    const extra = designsToTry(section("RowSection"), reg);
    expect(extra).toEqual([]); // Build your own has no switcher
    const plain = section("ClientReviewsSection", { title: "Kind words" });
    const three = withDesign(plain, "ClientReviewsSection~three", reg, getBlocksKey);
    expect(three.id).toBe("s1");
    expect(three.settings.title).toBe("Kind words");
    expect(currentDesignId(three)).toBe("ClientReviewsSection~three");
    const back = withDesign(three, "ClientReviewsSection", reg, getBlocksKey);
    expect(currentDesignId(back)).toBe("ClientReviewsSection");
    expect(back.settings.title).toBe("Kind words");
  });
  it("drops the sample mark once the owner changes the design", () => {
    const after = withDesign({ ...section("ImageBannerSection"), sample: true } as any, "SplitOpeningSection", reg, getBlocksKey);
    expect("sample" in after).toBe(false);
  });
});
