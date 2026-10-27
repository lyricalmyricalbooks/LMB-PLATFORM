import { describe, expect, it } from "vitest";
import { diffDesigns, groupByArea, restoreItem, sameValue, summariseDiff } from "./designDiff";
import { normalizeDesign } from "./studioModel";
import { THEME_LIBRARY } from "./themeLibrary";
import live from "../../features/site/__fixtures__/liveDesign.json";

const ctx = {
  templates: [{ id: "heroPage", label: "Home page" }, { id: "productPage", label: "Book page" }, { id: "page:about", label: "About" }, { id: "productPage~poetry", label: "Book page · Poetry" }],
  sectionName: (type: string) => ({ Newsletter: "Newsletter", RichText: "Rich text" } as Record<string, string>)[type],
  sectionFields: () => [{ key: "heading", label: "Heading" }, { key: "buttonText", label: "Button text" }],
};
const sec = (id: string, type = "RichText", settings: any = {}) => ({ id, type, settings });
const base = () => ({
  backgroundColor: "#000000",
  copy: { cartTitle: "Shopping Bag" },
  regions: { catalogSearchPadding: 4 },
  menus: { header: [{ label: "Shop" }] },
  heroPage: { sections: [sec("a", "Newsletter", { heading: "Join" }), sec("b"), sec("c")] },
  productPage: { sections: [], accentColor: "#ff0000" },
  "page:about": { sections: [sec("p1")] },
  overlaySections: [sec("pop", "Newsletter")],
});

describe("diffDesigns — readable labels", () => {
  it("labels a Theme settings control, a Text & labels word, a region and menus", () => {
    const b = { ...base(), backgroundColor: "#ffffff", copy: { cartTitle: "Your bag" }, regions: { catalogSearchPadding: 12 }, menus: { header: [] } };
    const items = diffDesigns(base(), b, ctx);
    const bg = items.find(i => i.id === "path:backgroundColor")!;
    expect(bg).toMatchObject({ area: "Theme settings · Colours", label: "Page background", before: "#000000", after: "#ffffff", color: true });
    expect(items.find(i => i.id === "path:copy.cartTitle")).toMatchObject({ area: "Text & labels · Cart", label: "“Cart heading”", before: "Shopping Bag", after: "Your bag" });
    const region = items.find(i => i.id === "path:regions.catalogSearchPadding")!;
    expect(region.label).toMatch(/Catalog search field · Padding/);
    expect(items.find(i => i.id === "path:menus")).toMatchObject({ area: "Navigation", label: "Menus" });
  });

  it("names page-only overrides by their page", () => {
    const b = base(); b.productPage.accentColor = "#00ff00";
    const [item] = diffDesigns(base(), b, ctx);
    expect(item).toMatchObject({ area: "Book page", change: "changed", restore: { kind: "path", path: "productPage.accentColor" } });
    expect(item.label).toMatch(/\(this page only\)$/);
  });

  it("finds added, removed, edited and moved sections on pages, custom pages, alternates and groups", () => {
    const b: any = base();
    b.heroPage.sections = [sec("c"), sec("a", "Newsletter", { heading: "Sign up", buttonText: "Go" }), sec("new")];
    b["page:about"].sections = [];
    b["productPage~poetry"] = { sections: [sec("p1")] };
    b.overlaySections = [];
    const items = diffDesigns(base(), b, ctx);
    const by = (id: string) => items.find(i => i.id === `section:${id}`)!;
    expect(by("a")).toMatchObject({ area: "Home page", change: "changed", before: "Heading, Button text" });
    expect(by("a").label).toBe("Newsletter “Sign up”");
    expect(by("b")).toMatchObject({ change: "removed", area: "Home page" });
    expect(by("new")).toMatchObject({ change: "added" });
    expect(by("c")).toMatchObject({ change: "moved", before: "Position 3", after: "Position 1" });
    expect(by("p1")).toMatchObject({ change: "moved", before: "About", after: "Book page · Poetry" });
    expect(by("pop")).toMatchObject({ change: "removed", area: "Shared sections · Pop-up" });
  });

  it("reports nothing for a design and its normalised copy", () => {
    const d = normalizeDesign((live as any).design);
    expect(diffDesigns(d, normalizeDesign(JSON.parse(JSON.stringify(d))), ctx)).toEqual([]);
    expect(sameValue({ a: 1, b: undefined }, { a: 1 })).toBe(true);
  });

  it("labels every difference between the live design and each theme preset (no raw key paths)", () => {
    const d = normalizeDesign((live as any).design);
    for (const preset of THEME_LIBRARY.slice(0, 3)) {
      const other = normalizeDesign({ ...(live as any).design, ...(preset as any).global });
      for (const item of diffDesigns(d, other, ctx)) {
        expect(item.label).not.toMatch(/^[a-z]+[A-Z.]/);
        expect(item.area).toBeTruthy();
      }
    }
  });
});

describe("restoreItem", () => {
  it("restoring every item gives back the version", () => {
    const version: any = base();
    const draft: any = base();
    draft.backgroundColor = "#fff"; delete draft.copy; draft.newKey = 3;
    draft.heroPage.sections = [sec("c"), sec("a", "Newsletter", { heading: "Changed" }), sec("x")];
    draft["page:about"].sections = [];
    draft.productPage.sections = [sec("p1")];
    draft.productPage.accentColor = "#123456";
    draft.overlaySections = [];
    let next = draft;
    for (const item of diffDesigns(version, draft, ctx)) next = restoreItem(next, version, item);
    expect(diffDesigns(version, next, ctx)).toEqual([]);
    expect(next.heroPage.sections.map((s: any) => s.id)).toEqual(["a", "b", "c"]);
    expect(next.newKey).toBeUndefined();
  });

  it("restores one section without touching the others", () => {
    const version: any = base();
    const draft: any = base();
    draft.heroPage.sections = [sec("a", "Newsletter", { heading: "Changed" }), sec("c")];
    const items = diffDesigns(version, draft, ctx);
    const next = restoreItem(draft, version, items.find(i => i.id === "section:b")!);
    expect(next.heroPage.sections.map((s: any) => s.id)).toEqual(["a", "b", "c"]);
    expect(next.heroPage.sections[0].settings.heading).toBe("Changed");
  });
});

describe("summaries", () => {
  it("groups by area and caps the publish summary", () => {
    const b: any = base(); b.backgroundColor = "#fff"; b.heroPage.sections = [];
    const items = diffDesigns(base(), b, ctx);
    expect(groupByArea(items).map(g => g.area)).toEqual(["Theme settings · Colours", "Home page"]);
    expect(summariseDiff(items, 2)).toEqual(["Theme settings · Colours · Page background changed", "Home page · Newsletter “Join” removed", "…and 2 more"]);
  });
});
