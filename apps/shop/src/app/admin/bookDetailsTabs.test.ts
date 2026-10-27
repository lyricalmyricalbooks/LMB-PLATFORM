import { describe, expect, it } from "vitest";
import { DETAILS_FIELD_TAB, detailsSubTabs, shownDetailsSubTab } from "./bookDetailsTabs";

describe("book editor Details sub tabs", () => {
  it("lists Customs only for printed products", () => {
    expect(detailsSubTabs({ customs: true }).map((t) => t.id)).toEqual(["bd-basics", "bd-publishing", "bd-rows", "bd-customs"]);
    expect(detailsSubTabs({ customs: false }).map((t) => t.id)).not.toContain("bd-customs");
  });
  it("ids never clash with the editor's top-level tab ids", () => {
    const top = ["details", "media", "pricing", "inventory", "editions", "addons", "boxset", "organize", "more", "seo"];
    for (const t of detailsSubTabs({ customs: true })) {
      expect(t.id.startsWith("bd-")).toBe(true);
      expect(top).not.toContain(t.id);
    }
  });
  it("shows issue counts only when there are some", () => {
    const tabs = detailsSubTabs({ customs: false, issues: { "bd-basics": 2, "bd-publishing": 0 } });
    expect(tabs[0].count).toBe(2);
    expect(tabs[1].count).toBeUndefined();
  });
  it("falls back to Basics when the chosen sub tab is gone", () => {
    expect(shownDetailsSubTab("bd-customs", detailsSubTabs({ customs: false }))).toBe("bd-basics");
    expect(shownDetailsSubTab("bd-rows", detailsSubTabs({ customs: false }))).toBe("bd-rows");
  });
  it("knows where the fields other parts of the editor jump to live", () => {
    expect(DETAILS_FIELD_TAB.title).toBe("bd-basics");
    expect(DETAILS_FIELD_TAB.description).toBe("bd-basics");
    expect(DETAILS_FIELD_TAB.isbn).toBe("bd-publishing");
    expect(DETAILS_FIELD_TAB.publishDate).toBe("bd-publishing");
  });
});
