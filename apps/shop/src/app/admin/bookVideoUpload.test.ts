import { describe, expect, it } from "vitest";
import { MAX_BOOK_VIDEO_BYTES, bookVideoPath, isVideoFile, storagePathOf, videoContentType, videoProblem } from "./bookVideoUpload";
import { galleryPhotos, isVideoItem, stillPhotos } from "../features/site/bookVideo";

describe("book video files", () => {
  it("accepts MP4, WebM and MOV, by extension or type", () => {
    expect(videoContentType({ name: "trailer.MP4" })).toBe("video/mp4");
    expect(videoContentType({ name: "clip.mov", type: "" })).toBe("video/quicktime");
    expect(videoContentType({ name: "blob", type: "video/webm" })).toBe("video/webm");
    expect(videoContentType({ name: "clip.avi", type: "video/x-msvideo" })).toBe("");
    expect(isVideoFile({ name: "clip.avi", type: "video/x-msvideo" })).toBe(true);
    expect(isVideoFile({ name: "cover.jpg", type: "image/jpeg" })).toBe(false);
  });

  it("refuses unplayable formats and files over the cap, in plain words", () => {
    expect(videoProblem({ name: "a.mp4", type: "video/mp4", size: MAX_BOOK_VIDEO_BYTES })).toBe("");
    expect(videoProblem({ name: "a.mp4", type: "video/mp4", size: MAX_BOOK_VIDEO_BYTES + 1 })).toMatch(/up to 50 MB/);
    expect(videoProblem({ name: "a.avi", type: "video/x-msvideo", size: 10 })).toMatch(/isn't an MP4/);
  });

  it("stores videos under products/videos with a safe name", () => {
    expect(bookVideoPath(1700, "My trailer (final).mp4")).toBe("products/videos/1700-My-trailer-final-.mp4");
  });

  it("reads the storage path back from a download URL", () => {
    expect(storagePathOf("https://firebasestorage.googleapis.com/v0/b/x.app/o/products%2F17-a-960w.webp?alt=media&token=t")).toBe("products/17-a-960w.webp");
    expect(storagePathOf("https://example.com/a.jpg")).toBe("");
  });
});

describe("videos in the photo list", () => {
  const photo = { url: "https://x/a.jpg" };
  const video = { url: "https://x/still.jpg", videoUrl: "https://x/v.mp4" };
  it("only https video URLs count", () => {
    expect(isVideoItem(video)).toBe(true);
    expect(isVideoItem({ url: "x", videoUrl: "javascript:alert(1)" })).toBe(false);
    expect(isVideoItem(photo)).toBe(false);
    expect(isVideoItem(undefined)).toBe(false);
  });
  it("Studio's switch leaves videos out of the gallery", () => {
    expect(galleryPhotos([photo, video], true)).toEqual([photo, video]);
    expect(galleryPhotos([photo, video], false)).toEqual([photo]);
    expect(stillPhotos([video, photo])).toEqual([photo]);
  });
});

describe("muteVideo", () => {
  it("starts a book video without sound", async () => {
    const { muteVideo } = await import("../features/site/bookVideo");
    const el = { muted: false, defaultMuted: false } as unknown as HTMLVideoElement;
    muteVideo(el);
    expect(el.muted).toBe(true);
    expect(el.defaultMuted).toBe(true);
    expect(() => muteVideo(null)).not.toThrow();
  });
});
