import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/firebase", () => ({ auth: {} }));
vi.mock("../lib/functionsBase", () => ({ functionFetch: vi.fn() }));
const { photoAiUrl } = await import("./aiWriter");

describe("photoAiUrl", () => {
  it("sends the copy nearest 960px, else the photo itself", () => {
    const srcset = [{ url: "a-480", w: 480 }, { url: "a-960", w: 960 }, { url: "a-2400", w: 2400 }];
    expect(photoAiUrl({ url: "a", srcset })).toBe("a-960");
    expect(photoAiUrl({ url: "a", srcset: [{ url: "a-480", w: 480 }, { url: "a-1600", w: 1600 }] })).toBe("a-1600");
    expect(photoAiUrl({ url: "a", srcset: [{ url: "a-480", w: 480 }] })).toBe("a");
    expect(photoAiUrl({ url: "a" })).toBe("a");
    expect(photoAiUrl(null)).toBe("");
  });
});
