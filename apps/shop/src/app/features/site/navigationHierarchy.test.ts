import { describe, expect, it } from "vitest";
import { splitNavigation } from "./navItems";
describe("navigation hierarchy", () => {
  const items: any[] = [{ key: "cat:books", kind: "category", label: "Books" }, { key: "page:history", kind: "page", label: "History" }, { key: "page:contact", kind: "page", label: "Contact" }];
  it("keeps shopping primary and initially groups publisher history", () => {
    const groups = splitNavigation(items, {});
    expect(groups.primary.map(i => i.key)).toEqual(["cat:books", "page:contact"]);
    expect(groups.secondary.map(i => i.key)).toEqual(["page:history"]);
  });
  it("recognizes the published publisher page names and slugs", () => {
    const pages: any[] = [
      { key: "page:submissions", kind: "page", label: "PROJECT SUBMISSIONS", page: { slug: "submissions" } },
      { key: "page:history", kind: "page", label: "HISTORY OF LYRICALMYRICAL", page: { slug: "history-of-lyricalmyrical" } },
      { key: "page:open-call", kind: "page", label: "OPEN CALL - COLLECTIVE BOOK", page: { slug: "open-call" } },
    ];
    expect(splitNavigation(pages, {}).secondary).toEqual(pages);
  });
  it("honors an explicit Studio selection including restoring every link to primary", () => {
    expect(splitNavigation(items, { secondaryNavKeys: [] }).primary).toEqual(items);
    expect(splitNavigation(items, { secondaryNavKeys: ["page:contact", "cat:books"] }).secondary.map(i => i.key)).toEqual(["page:contact"]);
  });
});
