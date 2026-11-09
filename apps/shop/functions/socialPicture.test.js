// Code plan 27.11: a post's square picture is the photo whole on a 1080 square JPEG, in the shop's own bucket.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const { squarePicture, SIDE } = require("./socialPicture.js");

function fakeBucket(files) {
  const saved = {};
  return {
    name: "moth-press.firebasestorage.app",
    saved,
    file: (path) => ({
      download: async () => { if (!files[path]) throw new Error("No such object"); return [files[path]]; },
      save: async (buffer, options) => { saved[path] = { buffer, options }; },
    }),
  };
}

describe("square picture for a social post", () => {
  test("a tall PNG cover becomes a 1080 square JPEG, uncropped, saved once under the post", async () => {
    const cover = await sharp({ create: { width: 600, height: 900, channels: 3, background: { r: 200, g: 40, b: 40 } } }).png().toBuffer();
    const bucket = fakeBucket({ "books/nm/cover.png": cover });
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent("books/nm/cover.png")}?alt=media&token=t`;
    const made = await squarePicture({ bucket, sharp, imageUrl: url, postId: "post1" });
    expect(made).toMatch(/\/o\/social%2Fpost1\.jpg\?alt=media&token=/);
    const out = bucket.saved["social/post1.jpg"];
    expect(out.options.contentType).toBe("image/jpeg");
    const meta = await sharp(out.buffer).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", SIDE, SIDE]);
    // The border is the cover's own colour, so nothing reads as a white frame.
    const { dominant } = await sharp(out.buffer).stats();
    expect(dominant.r).toBeGreaterThan(150);
  });

  test("a photo from anywhere else, or an odd post id, is left as it is", async () => {
    const bucket = fakeBucket({});
    expect(await squarePicture({ bucket, sharp, imageUrl: "https://img.example/cover.jpg", postId: "post1" })).toBeNull();
    const own = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/a.png?alt=media`;
    expect(await squarePicture({ bucket, sharp, imageUrl: own, postId: "../x" })).toBeNull();
  });
});
