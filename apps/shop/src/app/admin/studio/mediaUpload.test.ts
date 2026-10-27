import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminApi } from "../api";
import { mediaApi } from "../mediaApi";
import { prepareMediaVariants } from "../prepareImage";
import { uploadMediaImage } from "./mediaUpload";

// The library's upload pipeline: resized copies → assets/media/<id>/ → one admin-only media/{id} record.

const original = { uploadFile: adminApi.uploadFile, save: mediaApi.save, removeFiles: mediaApi.removeFiles };
let uploads: string[], saved: any[], removed: string[][];
beforeEach(() => {
  uploads = []; saved = []; removed = [];
  (adminApi as any).uploadFile = async (_file: File, path: string) => { uploads.push(path); return `https://cdn.test/${path}`; };
  mediaApi.save = async (item: any) => { saved.push(item); };
  mediaApi.removeFiles = async (paths: string[]) => { removed.push(paths); };
});
afterEach(() => {
  (adminApi as any).uploadFile = original.uploadFile;
  mediaApi.save = original.save;
  mediaApi.removeFiles = original.removeFiles;
  vi.unstubAllGlobals();
});

/** A pretend browser: decodes to `width`×`height` and encodes `encodes` (WebP, or PNG when WebP isn't supported). */
function fakeBrowser(width: number, height: number, encodes = "image/webp") {
  vi.stubGlobal("createImageBitmap", async () => ({ width, height, close() {} }));
  vi.stubGlobal("document", {
    createElement: () => {
      const canvas: any = {
        getContext: () => ({ drawImage() {} }),
        toBlob: (done: (b: Blob) => void, type: string) => done(new Blob(["x".repeat(canvas.width)], { type: type === "image/jpeg" ? type : encodes })),
      };
      return canvas;
    },
  });
}

describe("prepareMediaVariants", () => {
  it("makes WebP copies 480/960/1600/2400 px wide, keeping the proportions", async () => {
    fakeBrowser(3000, 2000);
    const out = await prepareMediaVariants(new File(["x"], "Summer.JPG", { type: "image/jpeg" }));
    expect(out.resized).toBe(true);
    expect([out.width, out.height]).toEqual([3000, 2000]);
    expect(out.variants.map(v => [v.width, v.height, v.file.name, v.file.type])).toEqual([
      [480, 320, "Summer-480w.webp", "image/webp"], [960, 640, "Summer-960w.webp", "image/webp"], [1600, 1067, "Summer-1600w.webp", "image/webp"],
      [2400, 1600, "Summer-2400w.webp", "image/webp"],
    ]);
  });

  it("uses JPEG where the browser can't write WebP, and keeps GIFs as they are", async () => {
    fakeBrowser(800, 800, "image/png");
    const photo = await prepareMediaVariants(new File(["x"], "a.jpg", { type: "image/jpeg" }));
    expect(photo.variants.map(v => v.file.name)).toEqual(["a-480w.jpg", "a-800w.jpg"]);
    const gif = new File(["x"], "anim.gif", { type: "image/gif" });
    expect(await prepareMediaVariants(gif)).toMatchObject({ resized: false, variants: [{ width: 0, file: gif }] });
  });
});

describe("uploadMediaImage", () => {
  it("uploads every copy under assets/media/<id>/ and saves one record", async () => {
    fakeBrowser(2000, 1000);
    const item = await uploadMediaImage(new File(["x"], "banner.png", { type: "image/png" }), undefined, 1700000000000);
    expect(uploads).toEqual([480, 960, 1600, 2000].map(w => `assets/media/${item.id}/1700000000000-${w}w.webp`));
    expect(saved).toEqual([item]);
    expect(item).toMatchObject({ name: "banner.png", alt: "", focalX: 50, focalY: 50, width: 2000, height: 1000, widths: [480, 960, 1600, 2000] });
    expect(item.bytes).toBe(480 + 960 + 1600 + 2000);
    expect(item.variants[2].url).toBe(`https://cdn.test/assets/media/${item.id}/1700000000000-1600w.webp`);
  });

  it("Replace keeps the id, description and focal point and remembers the old files", async () => {
    fakeBrowser(1000, 1000);
    const first = await uploadMediaImage(new File(["x"], "a.jpg", { type: "image/jpeg" }), undefined, 1);
    const described = { ...first, alt: "Riso print", focalX: 30 };
    const next = await uploadMediaImage(new File(["x"], "b.jpg", { type: "image/jpeg" }), described, 2);
    expect(next).toMatchObject({ id: first.id, alt: "Riso print", focalX: 30, name: "b.jpg", createdAt: first.createdAt });
    expect(next.previous).toEqual(first.variants.map(v => ({ url: v.url, path: v.path })));
    expect(next.variants.every(v => v.path.includes(`/${first.id}/2-`))).toBe(true);
  });

  it("removes the copies already stored when the record can't be saved (rules not deployed)", async () => {
    fakeBrowser(1000, 500);
    mediaApi.save = async () => { throw Object.assign(new Error("denied"), { code: "permission-denied" }); };
    await expect(uploadMediaImage(new File(["x"], "a.jpg", { type: "image/jpeg" }))).rejects.toMatchObject({ code: "permission-denied" });
    expect(removed).toEqual([uploads]);
    expect(uploads).toHaveLength(3); // 480, 960 and the 1000 px original width
  });
});
