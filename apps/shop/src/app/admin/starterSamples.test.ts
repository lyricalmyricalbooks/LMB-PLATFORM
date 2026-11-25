import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SAMPLE_SETS, SAMPLE_SET_IDS, sampleSetFor, sampleSetsFor, samplePhotoUrl, samplePrice, samplePhotosFor } from "./starterSamples";

const PUBLIC = join(__dirname, "../../../public/samples");
const LICENSE = readFileSync(join(PUBLIC, "LICENSE.md"), "utf8");

const photosOf = (id: keyof typeof SAMPLE_SETS) => {
  const set = SAMPLE_SETS[id];
  return [...Object.values(set.photos).map((p) => p.photo), ...set.products.map((p) => p.photo), ...set.services.map((s) => s.photo)];
};

describe("starter sample sets", () => {
  it("every photo is a file in public/samples and is listed with its licence", () => {
    for (const id of SAMPLE_SET_IDS) {
      for (const photo of photosOf(id)) {
        const file = join(PUBLIC, id, `${photo}.webp`);
        expect(existsSync(file), file).toBe(true);
        expect(statSync(file).size, file).toBeLessThan(250_000);
        expect(LICENSE, `${id}/${photo}`).toContain(`| ${id}/${photo}.webp | https://images.unsplash.com/photo-`);
      }
    }
  });

  it("every licensed file is used, so nothing unlicensed or unused ships", () => {
    const used = new Set(SAMPLE_SET_IDS.flatMap((id) => photosOf(id).map((p) => `${id}/${p}.webp`)));
    const listed = [...LICENSE.matchAll(/^\| ([a-z]+\/[a-z-]+\.webp) \|/gm)].map((m) => m[1]);
    expect(new Set(listed)).toEqual(used);
  });

  it("words stay neutral: Example names, no made-up makers or stories", () => {
    for (const id of SAMPLE_SET_IDS) {
      const set = SAMPLE_SETS[id];
      for (const p of set.products) expect(p.title, p.title).toMatch(/^Example /);
      for (const s of set.services) expect(s.name, s.name).toMatch(/^Example /);
      for (const p of [...set.products, ...set.services]) {
        expect(p.alt.length).toBeGreaterThan(5);
        expect(p.price).toBeGreaterThan(0);
      }
      expect(set.products.length + set.services.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("every kind of shop has a set that suits it", () => {
    for (const kind of ["books", "products", "services"] as const) {
      expect(SAMPLE_SET_IDS.some((id) => SAMPLE_SETS[id].suits.includes(kind)), kind).toBe(true);
    }
    for (const s of SAMPLE_SETS.studio.services) expect(s.minutes).toBeGreaterThanOrEqual(5);
  });

  it("picks the set from what the shop sells", () => {
    expect(sampleSetFor("books")).toBe("books");
    expect(sampleSetFor(null)).toBe("books");
    expect(sampleSetFor("prints")).toBe("books");
    expect(sampleSetFor("clothing")).toBe("clothing");
    expect(sampleSetFor("jewelry")).toBe("clothing");
    expect(sampleSetFor("other")).toBe("home");
    expect(sampleSetFor("music")).toBe("home");
    expect(sampleSetFor("hair")).toBe("beauty");
    expect(sampleSetFor("wellness")).toBe("beauty");
    expect(sampleSetFor("lessons")).toBe("studio");
    expect(sampleSetFor("studio")).toBe("studio");
  });

  it("offers the shop's own set first, then the others that suit its kind", () => {
    expect(sampleSetsFor("clothing").map((s) => s.id)).toEqual(["clothing", "home", "books", "food", "made"]);
    expect(sampleSetsFor("hair").map((s) => s.id)).toEqual(["beauty", "studio", "made"]);
    expect(sampleSetsFor("lessons").map((s) => s.id)).toEqual(["studio", "beauty", "made"]);
    expect(sampleSetsFor("books")[0].id).toBe("books");
  });

  it("serves photos under the site's base address", () => {
    expect(samplePhotoUrl("home", "mug", "/")).toBe("/samples/home/mug.webp");
    expect(samplePhotoUrl("home", "mug", "/shop/")).toBe("/shop/samples/home/mug.webp");
    expect(samplePhotoUrl("home", "mug", "/shop")).toBe("/shop/samples/home/mug.webp");
    expect(samplePrice(28)).toBe("CA$ 28.00");
    expect(samplePrice(28, "USD")).toBe("US$ 28.00");
  });
});

describe("photos for a starter's pictures", () => {
  it("lists the four band photos first, then the set's own items, all with alt text", () => {
    const photos = samplePhotosFor("clothing", "/");
    expect(photos.slice(0, 4).map((p) => p.url)).toEqual(["opening", "story", "about", "banner"].map((n) => `/samples/clothing/${n}.webp`));
    expect(photos).toHaveLength(12);
    expect(photos.every((p) => p.alt.length > 0)).toBe(true);
    expect(samplePhotosFor("hair", "/")[4].url).toBe("/samples/beauty/cut-and-style.webp");
    expect(samplePhotosFor("lessons", "/")[4].url).toBe("/samples/studio/wheel-lesson.webp");
  });
});
