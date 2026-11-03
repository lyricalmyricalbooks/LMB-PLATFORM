import { describe, expect, it } from "vitest";
import { planShopMove } from "./shopMove";
import { brokenPhotos, fileWithoutPhotos, MAX_CHECKED, photoCheckLine, photoUrlsOf, withoutBrokenPhotos } from "./photoLinks";

const GONE = "https://old.example/gone.jpg";
const FINE = "https://old.example/fine.jpg";
const handleFile = [
  "Handle,Title,Variant Price,Image Src,Image Position",
  `moth-songs,Moth Songs,20,${FINE},1`,
  `moth-songs,,,${GONE},2`,
  `salt,Salt Zine,8,${GONE},1`,
].join("\n") + "\n";
const plainFile = `Title,Price,Image URL,Extra image URLs\nRiver,8,${FINE},${GONE}|https://old.example/gone.jpg.webp\n`;
const load = async (url: string) => url !== GONE;

describe("photo links in an import preview (plan 23.3)", () => {
  it("finds each new photo once and tries it, a few at a time and no more than the cap", async () => {
    const { plan } = planShopMove(handleFile, []);
    expect(photoUrlsOf(plan)).toEqual([FINE, GONE]);
    expect([...(await brokenPhotos(photoUrlsOf(plan), load))]).toEqual([GONE]);
    const many = Array.from({ length: MAX_CHECKED + 20 }, (_, i) => `https://old.example/${i}.jpg`);
    const tried: string[] = [];
    await brokenPhotos(many, async (u) => { tried.push(u); return true; });
    expect(tried).toHaveLength(MAX_CHECKED);
    // A check that throws counts as fine: only a real failure to load is reported.
    expect((await brokenPhotos([GONE], async () => { throw new Error("x"); })).size).toBe(0);
  });

  it("leaves broken photos out of what is saved, and each book says so", async () => {
    const { plan } = planShopMove(handleFile, []);
    const next = withoutBrokenPhotos(plan, new Set([GONE]));
    const [songs, salt] = next.rows;
    expect(songs.patch.photos.map((p: any) => p.url)).toEqual([FINE]);
    expect(salt.patch.photos).toEqual([]);
    expect(salt.warnings.at(-1)).toBe("A photo couldn't be loaded from the old shop, so it was left out. Add it in the book editor.");
    expect(withoutBrokenPhotos(plan, new Set())).toBe(plan);
  });

  it("setup's kept file loses the broken address only where it stands whole, and still reads", () => {
    const shopify = fileWithoutPhotos(handleFile, new Set([GONE]));
    expect(shopify).not.toContain(GONE);
    expect(planShopMove(shopify, []).plan.rows.map(r => [r.title, r.action, (r.patch.photos || []).length])).toEqual([["Moth Songs", "create", 1], ["Salt Zine", "create", 0]]);
    const plain = fileWithoutPhotos(plainFile, new Set([GONE]));
    expect(plain).toContain("|https://old.example/gone.jpg.webp");
    expect(planShopMove(plain, []).plan.rows[0].patch.photos.map((p: any) => p.url)).toEqual([FINE, "https://old.example/gone.jpg.webp"]);
  });

  it("one plain line while checking and after", () => {
    expect(photoCheckLine({ checking: true, broken: new Set() })).toMatch(/Checking/);
    expect(photoCheckLine({ checking: false, broken: new Set() })).toBe("");
    expect(photoCheckLine({ checking: false, broken: new Set([GONE, FINE]) })).toBe("2 photos couldn't be loaded from the old shop, so they are left out. The books affected say so below.");
  });
});
