import { describe, expect, it } from "vitest";
import { productSample, sampleFileKind, sampleProblem, SAMPLE_ACCEPT, MAX_SAMPLE_BYTES } from "./sample";

describe("free samples (Digital D3b)", () => {
  it("knows which files shoppers can open in the page", () => {
    expect(sampleFileKind("chapter-1.MP3")).toEqual({ kind: "audio", contentType: "audio/mpeg" });
    expect(sampleFileKind("trailer.mp4")?.kind).toBe("video");
    expect(sampleFileKind("first-pages.pdf")?.kind).toBe("read");
    expect(sampleFileKind("pattern.zip")).toBeNull();
    expect(sampleFileKind("book.epub")).toBeNull();
    expect(SAMPLE_ACCEPT).toContain(".pdf");
  });
  it("refuses other kinds and big files in plain words", () => {
    expect(sampleProblem({ name: "a.zip", size: 10 })).toMatch(/can't be a sample/);
    expect(sampleProblem({ name: "a.mp3", size: MAX_SAMPLE_BYTES + 1 })).toMatch(/up to 50 MB/);
    expect(sampleProblem({ name: "a.mp3", size: 1000 })).toBe("");
  });
  it("reads only a usable sample off the product", () => {
    expect(productSample({ sample: { url: "https://x/s.mp3", kind: "audio", name: "Chapter 1", size: 5 } })).toEqual({ url: "https://x/s.mp3", kind: "audio", name: "Chapter 1", size: 5 });
    expect(productSample({ sample: { url: "http://x/s.mp3", kind: "audio" } })).toBeNull();
    expect(productSample({ sample: { url: "https://x/s.mp3", kind: "zip" } })).toBeNull();
    expect(productSample({})).toBeNull();
    expect(productSample(null)).toBeNull();
  });
});
