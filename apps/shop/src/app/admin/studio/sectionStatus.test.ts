import { describe, expect, it } from "vitest";
import { sectionPreviewNote } from "./sectionStatus";

const at = Date.parse("2026-10-12T16:00:00Z"); // noon in Toronto

describe("sectionPreviewNote", () => {
  it("names a section outside its schedule", () => {
    expect(sectionPreviewNote({ settings: { showFrom: "2026-10-20" } }, "desktop", at)).toBe("Scheduled, not shown yet");
    expect(sectionPreviewNote({ settings: { showUntil: "2026-10-01" } }, "desktop", at)).toBe("Schedule ended, not shown");
    expect(sectionPreviewNote({ settings: { showFrom: "2026-10-01", showUntil: "2026-10-20" } }, "desktop", at)).toBe("");
  });

  it("follows the storefront's device classes for the previewed size", () => {
    expect(sectionPreviewNote({ settings: { hideOnMobile: true } }, "mobile", at)).toBe("Hidden on phones");
    expect(sectionPreviewNote({ settings: { hideOnMobile: true } }, "tablet", at)).toBe("");
    expect(sectionPreviewNote({ settings: { hideOnTablet: true } }, "tablet", at)).toBe("Hidden on tablets");
    expect(sectionPreviewNote({ settings: { hideOnDesktop: true } }, "tablet", at)).toBe("Hidden on tablets");
    expect(sectionPreviewNote({ settings: { hideOnDesktop: true } }, "desktop", at)).toBe("Hidden on desktop");
    expect(sectionPreviewNote({ settings: { hideOnDesktop: true } }, "mobile", at)).toBe("");
    expect(sectionPreviewNote({ settings: {} }, "mobile", at)).toBe("");
  });

  it("says a sticky add-to-bag bar shows only on book pages", () => {
    const bar = { type: "StickyAddToBagSection", settings: {} };
    expect(sectionPreviewNote(bar, "desktop", at, "heroPage")).toBe("Shows only on book pages");
    expect(sectionPreviewNote(bar, "desktop", at, "productPage")).toBe("");
    expect(sectionPreviewNote(bar, "desktop", at, "productPage~signed")).toBe("");
    expect(sectionPreviewNote(bar, "desktop", at)).toBe("");
  });
});
