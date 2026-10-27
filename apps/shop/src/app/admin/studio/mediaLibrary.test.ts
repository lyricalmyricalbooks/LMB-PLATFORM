import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mediaWidthsFor } from "../prepareImage";
import {
  applyMediaChange, budgetFor, collectStrings, describeUsage, filterMedia, formatBytes, isOverBudget, mainUrl, mediaRefOf,
  missingAlt, pickPatch, snapshotUses, thumbUrl, usagePaths, usagePlaces, type MediaItem,
} from "./mediaLibrary";
import { responsiveSource } from "../../features/site/mediaRef";
import { uploadIntoField } from "./mediaPicker";

const url = (id: string, stamp: number, w: number) => `https://cdn.test/assets%2Fmedia%2F${id}%2F${stamp}-${w}w.webp?alt=media`;
function item(over: Partial<MediaItem> = {}, stamp = 1): MediaItem {
  const id = over.id || "m1";
  return {
    id, name: "banner.jpg", alt: "", focalX: 50, focalY: 50, width: 2400, height: 1600, type: "image/webp", bytes: 0, widths: [480, 960, 1600],
    variants: [480, 960, 1600].map(w => ({ w, h: Math.round(w * 2 / 3), url: url(id, stamp, w), path: `assets/media/${id}/${stamp}-${w}w.webp`, bytes: w * 50 })),
    createdAt: "2026-10-09T00:00:00.000Z", updatedAt: "2026-10-09T00:00:00.000Z", ...over,
  };
}
const names = { surface: (id: string) => ({ heroPage: "Home", globalSections: "Every page" } as any)[id] || id, section: (s: any) => s.label || s.type };

describe("resized copies", () => {
  it("makes 480/960/1600/2400 px copies and never enlarges a small picture", () => {
    expect(mediaWidthsFor(4000)).toEqual([480, 960, 1600, 2400]);
    expect(mediaWidthsFor(1600)).toEqual([480, 960, 1600]);
    expect(mediaWidthsFor(1200)).toEqual([480, 960, 1200]);
    expect(mediaWidthsFor(300)).toEqual([300]);
    expect(mediaWidthsFor(0)).toEqual([]);
  });
});

describe("library filters", () => {
  it("flags copies over the page-weight budget (thumb 50 KB, content 150 KB, hero 200 KB)", () => {
    expect([budgetFor(480), budgetFor(960), budgetFor(1600), budgetFor(2400), budgetFor(0)]).toEqual([50_000, 150_000, 200_000, 450_000, 200_000]);
    expect(isOverBudget(item())).toBe(false);
    const heavy = item();
    heavy.variants[0].bytes = 60_000;
    expect(isOverBudget(heavy)).toBe(true);
  });

  it("filters by search, unused, over budget and missing description", () => {
    const a = item({ id: "a", name: "summer.jpg", alt: "Stack of books" });
    const b = item({ id: "b", name: "winter.png", alt: "" });
    b.variants[2].bytes = 900_000;
    const used = (m: MediaItem) => m.id === "a";
    expect(filterMedia([a, b], "books", "all", used).map(m => m.id)).toEqual(["a"]);
    expect(filterMedia([a, b], "", "unused", used).map(m => m.id)).toEqual(["b"]);
    expect(filterMedia([a, b], "", "over", used).map(m => m.id)).toEqual(["b"]);
    expect(filterMedia([a, b], "", "noalt", used).map(m => m.id)).toEqual(["b"]);
    expect(missingAlt(item({ alt: "  " }))).toBe(true);
    expect(formatBytes(41_000)).toBe("41 KB");
    expect(formatBytes(2_400_000)).toBe("2.4 MB");
  });
});

describe("placing a picture", () => {
  it("writes the largest copy's URL plus a public srcset record", () => {
    const m = item({ alt: "Riso print" });
    expect(mainUrl(m)).toBe(url("m1", 1, 1600));
    expect(thumbUrl(m)).toBe(url("m1", 1, 480));
    const patch = pickPatch("imageUrl", m, {});
    expect(patch.imageUrl).toBe(mainUrl(m));
    expect(patch.imageUrl__media).toEqual(mediaRefOf(m));
    expect(responsiveSource(patch.imageUrl, patch.imageUrl__media)).toEqual({
      srcSet: `${url("m1", 1, 480)} 480w, ${url("m1", 1, 960)} 960w, ${url("m1", 1, 1600)} 1600w`, width: 2400, height: 1600, alt: "Riso print",
    });
    // No focal point copied for the centre, nor over a field's own.
    expect(Object.keys(patch)).toEqual(["imageUrl", "imageUrl__media"]);
    expect(pickPatch("imageUrl", { ...m, focalX: 20, focalY: 70 }, {})).toMatchObject({ imageUrl__focalX: 20, imageUrl__focalY: 70 });
    expect(pickPatch("imageUrl", { ...m, focalX: 20, focalY: 70 }, { imageUrl__focalX: 90 })).not.toHaveProperty("imageUrl__focalY");
  });

  it("ignores a stale record once the field holds another URL", () => {
    const ref = mediaRefOf(item());
    expect(responsiveSource("https://elsewhere.test/typed.jpg", ref)).toBeNull();
    expect(responsiveSource(ref.src, { ...ref, srcset: [] })).toBeNull();
    expect(responsiveSource(ref.src, null)).toBeNull();
    expect(responsiveSource(ref.src, "nonsense")).toBeNull();
  });
});

describe("where used", () => {
  const m = item();
  const design = {
    heroPage: { sections: [
      { id: "s1", type: "TextSection", settings: { title: "Hi" } },
      { id: "s2", type: "ImageBannerSection", label: "Summer banner", settings: { imageUrl: mainUrl(m), imageUrl__media: mediaRefOf(m), mobileImageUrl: url("m1", 1, 480) } },
    ] },
    globalSections: [{ id: "g1", type: "RichTextSection", settings: { content: `<p><img src="${url("m1", 1, 960)}"></p>` } }],
    logoUrl: "https://cdn.test/logo.png",
  };

  it("finds fields and rich text holding the picture, counting each section once", () => {
    const paths = usagePaths(collectStrings(design), m);
    expect(paths).toEqual([
      ["heroPage", "sections", 1, "settings", "imageUrl"],
      ["heroPage", "sections", 1, "settings", "mobileImageUrl"],
      ["globalSections", 0, "settings", "content"],
    ]);
    expect(usagePlaces(design, paths, names)).toEqual([
      { label: "Home › Summer banner", templateId: "heroPage", sectionId: "s2" },
      { label: "Every page › RichTextSection", templateId: "__global", sectionId: "g1" },
    ]);
    expect(describeUsage(design, ["logoUrl"], names).label).toBe("Theme settings › logo url");
    expect(usagePaths(collectStrings(design), item({ id: "other" }))).toEqual([]);
  });

  it("does not count a leftover __media record as a use", () => {
    const stale = { heroPage: { sections: [{ id: "s", type: "HeroSection", settings: { imageUrl: "https://typed.test/x.jpg", imageUrl__media: mediaRefOf(m) } }] } };
    expect(usagePaths(collectStrings(stale), m)).toEqual([]);
  });

  it("Replace points every use in the draft at the new files and refreshes the record", () => {
    const next = { ...item({}, 2), alt: "New description", previous: m.variants.map(v => ({ url: v.url, path: v.path })) };
    const out = applyMediaChange(design, m, next);
    const banner = out.heroPage.sections[1].settings;
    expect(banner.imageUrl).toBe(mainUrl(next));
    expect(banner.mobileImageUrl).toBe(url("m1", 2, 480));
    expect(banner.imageUrl__media).toEqual(mediaRefOf(next));
    expect(out.globalSections[0].settings.content).toContain(url("m1", 2, 960));
    expect(out.logoUrl).toBe(design.logoUrl);
    expect(out.heroPage.sections[0]).toBe(design.heroPage.sections[0]);
    // Nothing uses another picture → the very same object (no undo step).
    expect(applyMediaChange(design, item({ id: "zz" }), item({ id: "zz" }, 3))).toBe(design);
  });

  it("a new description reaches every placed record", () => {
    const out = applyMediaChange(design, m, { ...m, alt: "Stack of riso books" });
    expect(out.heroPage.sections[1].settings.imageUrl__media.alt).toBe("Stack of riso books");
    expect(out.heroPage.sections[1].settings.imageUrl).toBe(mainUrl(m));
  });
});

describe("saved copies of the design", () => {
  it("count My themes and retained Version history snapshots that still hold the picture", () => {
    const m = item();
    const withIt = { heroPage: { sections: [{ id: "s", type: "HeroSection", settings: { imageUrl: mainUrl(m) } }] } };
    const uses = snapshotUses(m,
      [{ name: "Autumn", design: withIt }, { name: "Plain", design: {} }],
      [{ label: "Published", createdAt: "2026-10-01T00:00:00.000Z", design: withIt }, { label: "Draft", design: {} }]);
    expect(uses).toHaveLength(2);
    expect(uses[0]).toBe("My themes › Autumn");
    expect(uses[1]).toMatch(/^Version history › Published \(/);
    expect(snapshotUses(m, [], [])).toEqual([]);
  });
});

describe("uploadIntoField", () => {
  const lib = (status: any) => ({ status, choose: async () => null, upload: async () => item() });
  it("puts Theme settings uploads (no onPatch) in the library and writes only the URL", async () => {
    const onChange = vi.fn(), uploadFile = vi.fn();
    await uploadIntoField(lib("ready"), new File(["x"], "logo.png"), { fieldKey: "logoUrl", onChange, uploadFile });
    expect(onChange).toHaveBeenCalledWith(mainUrl(item()));
    expect(uploadFile).not.toHaveBeenCalled();
  });
  it("gives section fields the __media record, and falls back to the plain upload when the library is off", async () => {
    const onPatch = vi.fn();
    await uploadIntoField(lib("ready"), new File(["x"], "a.png"), { fieldKey: "imageUrl", onPatch, onChange: vi.fn() });
    expect(onPatch.mock.calls[0][0]).toHaveProperty("imageUrl__media");
    const onChange = vi.fn();
    await uploadIntoField(lib("denied"), new File(["x"], "a.png"), { fieldKey: "imageUrl", onPatch, onChange, uploadFile: async () => "https://plain.test/a.png" });
    expect(onChange).toHaveBeenCalledWith("https://plain.test/a.png");
    expect(onPatch).toHaveBeenCalledTimes(1);
  });
});

describe("firestore.rules", () => {
  it("keeps media records admin-only (read and write)", () => {
    const rules = readFileSync(join(__dirname, "..", "..", "..", "..", "firestore.rules"), "utf8");
    const block = rules.match(/match \/media\/\{mediaId\}\s*\{([^}]*)\}/);
    expect(block, "firestore.rules needs a match /media/{mediaId} block").toBeTruthy();
    const body = block![1].replace(/\/\/.*$/gm, "").trim();
    expect(body).toBe("allow read, write: if isAdmin();");
  });
});
