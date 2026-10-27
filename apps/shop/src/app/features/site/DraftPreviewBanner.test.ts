import { describe, expect, it } from "vitest";
import { draftBannerKey } from "./DraftPreviewBanner";
import { DEFAULT_COPY } from "./storeCopy";

describe("View website banner", () => {
  it("says what the tab shows: unsaved draft, saved draft, live shop, or the live shop because Studio is closed", () => {
    expect(draftBannerKey("unsaved", false)).toBe("draftPreviewUnsaved");
    expect(draftBannerKey("draft", true)).toBe("draftPreviewSaved");
    expect(draftBannerKey("live", false)).toBe("draftPreviewLive");
    expect(draftBannerKey(undefined, false)).toBeNull();
    expect(draftBannerKey(undefined, true)).toBe("draftPreviewNoStudio");
  });

  it("has editable words for every line", () => {
    for (const key of ["draftPreviewUnsaved", "draftPreviewSaved", "draftPreviewLive", "draftPreviewNoStudio", "draftPreviewHide"]) {
      expect(DEFAULT_COPY[key]).toBeTruthy();
    }
  });
});
