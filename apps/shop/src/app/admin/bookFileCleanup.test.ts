import { describe, expect, it } from "vitest";
import { keepPhotoCopies, removedPhotos, shownUrls, storagePathOfUrl, unusedBookFiles } from "./bookFileCleanup";

const B = "lmb-test-shop.firebasestorage.app";
const u = (path: string) => `https://firebasestorage.googleapis.com/v0/b/${B}/o/${encodeURIComponent(path)}?alt=media&token=t`;
const cover = { url: u("products/1-c-3200w.webp"), originalUrl: u("products/1-c-original.jpg"), srcset: [{ url: u("products/1-c-480w.webp"), w: 480 }, { url: u("products/1-c-3200w.webp"), w: 3200 }] };
const spread = { url: u("products/2-s.jpg") };
const library = { url: u("assets/media/abc/1-1600w.webp") };
const video = { url: u("products/3-still-480w.webp"), videoUrl: u("products/videos/3-clip.mp4") };

describe("bookFileCleanup", () => {
  it("reads only this bucket's download URLs", () => {
    expect(storagePathOfUrl(u("products/a b.jpg"), B)).toBe("products/a b.jpg");
    expect(storagePathOfUrl("https://firebasestorage.googleapis.com/v0/b/other/o/products%2Fa.jpg", B)).toBeNull();
    expect(storagePathOfUrl("https://example.com/a.jpg", B)).toBeNull();
  });

  it("finds the photos a save took off", () => {
    expect(removedPhotos([cover, spread, video], [spread])).toEqual([cover, video]);
    expect(removedPhotos([cover], [{ ...cover, srcset: undefined }])).toEqual([]);
    expect(removedPhotos(undefined, [cover])).toEqual([]);
  });

  it("deletes every file of a removed photo, but never library pictures or files still shown", () => {
    const paths = unusedBookFiles([cover, library, video], [u("products/1-c-480w.webp")], B);
    expect(paths.sort()).toEqual([
      "products/1-c-3200w.webp", "products/1-c-original.jpg", "products/3-still-480w.webp", "products/videos/3-clip.mp4",
    ]);
  });

  it("counts other books, editions, sharing images and order lines as still shown", () => {
    const urls = shownUrls(
      [{ photos: [spread], variants: [{ photoUrl: u("products/v.jpg") }], seoImage: u("products/seo.jpg") }],
      [{ items: [{ photoUrl: u("products/1-c-480w.webp") }] }],
    );
    expect(urls).toEqual(expect.arrayContaining([spread.url, u("products/v.jpg"), u("products/seo.jpg"), u("products/1-c-480w.webp")]));
  });

  it("puts server-made copies back on photos the editor saved without them", () => {
    const live = [{ url: spread.url, srcset: [{ url: u("products/2-s-480w.webp"), w: 480 }], width: 1200, height: 1600 }];
    const next = [{ url: spread.url, altText: "Spread" }, cover];
    expect(keepPhotoCopies(next, live)).toEqual([{ ...live[0], altText: "Spread" }, cover]);
    const same = [cover];
    expect(keepPhotoCopies(same, live)).toBe(same);
  });
});
