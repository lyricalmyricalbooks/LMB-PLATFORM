import { describe, expect, it } from "vitest";
import { freeDownloadNewsShown } from "./freeDownloadNews";

describe("newsletter tick on free downloads", () => {
  it("shows for a free bag of downloads only", () => {
    expect(freeDownloadNewsShown(0, true, [{ physical: false }])).toBe(true);
    expect(freeDownloadNewsShown(0, true, [])).toBe(true);
  });
  it("stays away when anything is paid, nothing downloads, or something ships", () => {
    expect(freeDownloadNewsShown(5, true, [{ physical: false }])).toBe(false);
    expect(freeDownloadNewsShown(0, false, [])).toBe(false);
    expect(freeDownloadNewsShown(0, true, [{ physical: false }, { physical: true }])).toBe(false);
    expect(freeDownloadNewsShown(0, true, null)).toBe(true);
  });
});
