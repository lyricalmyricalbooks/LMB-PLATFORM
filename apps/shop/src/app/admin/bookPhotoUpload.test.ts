import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminApi } from "./api";
import { mediaApi } from "./mediaApi";
import { uploadBookPhoto } from "./bookPhotoUpload";

const original = { uploadFile: adminApi.uploadFile, removeFiles: mediaApi.removeFiles };
let uploads: string[], removed: string[][];
beforeEach(() => {
  uploads = []; removed = [];
  (adminApi as any).uploadFile = async (_file: File, path: string) => { uploads.push(path); return `https://cdn.test/${path}`; };
  mediaApi.removeFiles = async (paths: string[]) => { removed.push(paths); };
});
afterEach(() => {
  (adminApi as any).uploadFile = original.uploadFile;
  mediaApi.removeFiles = original.removeFiles;
  vi.unstubAllGlobals();
});

function fakeBrowser(width: number, height: number, qualities: number[] = []) {
  vi.stubGlobal("createImageBitmap", async () => ({ width, height, close() {} }));
  vi.stubGlobal("document", {
    createElement: () => {
      const canvas: any = { getContext: () => ({ drawImage() {} }), toBlob: (done: (b: Blob) => void, _type: string, q: number) => { qualities.push(q); done(new Blob(["x"], { type: "image/webp" })); } };
      return canvas;
    },
  });
}

describe("uploadBookPhoto", () => {
  it("stores 480–3200 px copies (lighter card sizes, sharp product-page sizes), keeps the largest as the URL and keeps the original file", async () => {
    const qualities: number[] = [];
    fakeBrowser(4000, 6000, qualities);
    const photo = await uploadBookPhoto(new File(["x"], "My Cover.jpg", { type: "image/jpeg" }), 1700000000000);
    expect(uploads).toEqual([
      ...[480, 640, 960, 1600, 2400, 3200].map(w => `products/1700000000000-My-Cover-${w}w.webp`),
      "products/1700000000000-My-Cover-original.jpg",
    ]);
    expect(photo.url).toBe("https://cdn.test/products/1700000000000-My-Cover-3200w.webp");
    expect(photo.srcset?.map(s => s.w)).toEqual([480, 640, 960, 1600, 2400, 3200]);
    expect(photo.originalUrl).toBe("https://cdn.test/products/1700000000000-My-Cover-original.jpg");
    expect([photo.width, photo.height]).toEqual([4000, 6000]);
    expect(qualities).toEqual([0.9, 0.9, 0.9, 0.95, 0.95, 0.95]);
  });

  it("never enlarges a small photo: its own width is the top copy", async () => {
    fakeBrowser(1800, 2700);
    const photo = await uploadBookPhoto(new File(["x"], "c.png", { type: "image/png" }), 3);
    expect(photo.srcset?.map(s => s.w)).toEqual([480, 640, 960, 1600, 1800]);
    expect(photo.originalUrl).toBe("https://cdn.test/products/3-c-original.png");
  });

  it("removes every copy when storing the original fails", async () => {
    fakeBrowser(1000, 1500);
    (adminApi as any).uploadFile = async (_f: File, path: string) => { if (path.includes("original")) throw new Error("offline"); uploads.push(path); return path; };
    await expect(uploadBookPhoto(new File(["x"], "c.jpg", { type: "image/jpeg" }), 4)).rejects.toThrow("offline");
    expect(removed).toEqual([["products/4-c-480w.webp", "products/4-c-640w.webp", "products/4-c-960w.webp", "products/4-c-1000w.webp"]]);
  });

  it("uploads GIFs as one plain file", async () => {
    const photo = await uploadBookPhoto(new File(["x"], "anim.gif", { type: "image/gif" }), 5);
    expect(uploads).toEqual(["products/5-anim.gif"]);
    expect(photo).toEqual({ url: "https://cdn.test/products/5-anim.gif" });
  });

  it("removes copies already stored when one upload fails", async () => {
    fakeBrowser(1200, 1600);
    let n = 0;
    (adminApi as any).uploadFile = async (_f: File, path: string) => { if (++n === 2) throw new Error("offline"); uploads.push(path); return path; };
    await expect(uploadBookPhoto(new File(["x"], "c.png", { type: "image/png" }), 9)).rejects.toThrow("offline");
    expect(removed).toEqual([["products/9-c-480w.webp"]]);
  });
});
