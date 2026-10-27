import { describe, expect, it } from "vitest";
import { buildStudioIndex, normalizeSearchText, paletteGroups, planQuery, searchStudio, suggestSearches } from "./studioSearch";
import { STYLE_GROUPS } from "./styleSchema";
import { EXTRA_STYLE_CATEGORIES } from "./settingsMap";
import { COPY_SCHEMA } from "../../features/site/storeCopy";

// The same inputs the editor gives the index: every Style group plus the Studio-only categories, every page template.
const index = buildStudioIndex({
  styleGroups: [...STYLE_GROUPS, ...Object.entries(EXTRA_STYLE_CATEGORIES).map(([id, c]) => ({ id, title: c.title, hint: c.blurb, fields: [] }))],
  copySchema: COPY_SCHEMA,
  templates: [{ id: "heroPage", label: "Home" }, { id: "productPage", label: "Product page" }, { id: "page:about", label: "About", pageSlug: "about" }],
  pages: [{ slug: "about", title: "About us", status: "published" }, { slug: "about", title: "dupe" }],
  sectionsByTemplate: {
    heroPage: [{ id: "s1", type: "HeroSection", visible: true, settings: { title: "Spring list" } }, { id: "s2", type: "NewsletterSection", visible: true, settings: {} }],
    __global: [{ id: "g1", type: "AnnouncementBar", visible: false, settings: {} }],
  },
  sectionLabel: (t) => (t === "HeroSection" ? "Hero Banner" : t === "NewsletterSection" ? "Newsletter" : t),
});

describe("normalizeSearchText", () => {
  it("splits camelCase keys and unifies spellings", () => {
    expect(normalizeSearchText("pdpCardBg")).toBe("pdp card bg");
    expect(normalizeSearchText("Page Colour")).toBe("page color");
  });
});

describe("searchStudio", () => {
  it("returns shortcuts for an empty query", () => {
    const r = searchStudio(index, "");
    expect(r.length).toBeGreaterThan(5);
    expect(r.every((e) => ["action", "area", "page"].includes(e.kind))).toBe(true);
  });

  it("finds actions by their on-screen name and by plain words", () => {
    expect(searchStudio(index, "publish")[0].target).toEqual({ type: "action", id: "publish" });
    expect(searchStudio(index, "go live").some((e) => e.target.type === "action" && e.target.id === "publish")).toBe(true);
  });

  it("requires every typed word to match when asked to be strict", () => {
    expect(searchStudio(index, "publish zzzqqq", { strict: true })).toEqual([]);
  });

  it("finds Style controls through British spelling and synonyms", () => {
    const r = searchStudio(index, "background colour");
    expect(r.some((e) => e.target.type === "style" && e.target.key === "backgroundColor")).toBe(true);
    // "phone" finds phone-sized settings via the mobile synonym
    expect(searchStudio(index, "phone").some((e) => e.target.type === "action" && e.target.id === "device-mobile")).toBe(true);
  });

  it("finds shopper text by its label and its current default wording", () => {
    const sample = COPY_SCHEMA[0].fields[0];
    const hit = searchStudio(index, sample.label).find((e) => e.target.type === "copy" && e.target.key === sample.key);
    expect(hit).toBeTruthy();
    expect(hit!.where).toContain("Text & labels");
  });

  it("lists pages once and the sections on each page", () => {
    expect(searchStudio(index, "about").filter((e) => e.target.type === "page")).toHaveLength(1);
    const sec = searchStudio(index, "spring").find((e) => e.kind === "section");
    expect(sec?.target).toEqual({ type: "section", templateId: "heroPage", sectionId: "s1" });
    expect(searchStudio(index, "announcement").slice(0, 8).some((e) => e.kind === "section" && e.where.includes("hidden"))).toBe(true);
  });

  it("ranks a title that starts with the query above looser hits", () => {
    const r = searchStudio(index, "save draft");
    expect(r[0].title).toBe("Save draft");
  });

  it("caps the number of results", () => {
    expect(searchStudio(index, "color", { limit: 5 }).length).toBeLessThanOrEqual(5);
  });
});

describe("search index size", () => {
  it("indexes each element setting once, not once per screen size, and still finds phone settings", async () => {
    const { buildStudioIndex, searchStudio } = await import("./studioSearch");
    const { STYLE_GROUPS } = await import("./styleSchema");
    const { COPY_SCHEMA } = await import("../../features/site/storeCopy");
    const index = buildStudioIndex({ templates: [], pages: [], sectionsByTemplate: {}, sectionLabel: (t: string) => t, styleGroups: STYLE_GROUPS, copySchema: COPY_SCHEMA } as any);
    const all = STYLE_GROUPS.reduce((n, g) => n + g.fields.length, 0);
    const styleEntries = index.filter(e => e.kind === "style").length;
    expect(styleEntries).toBeLessThan(all / 2);
    expect(index.some(e => /Mobile|Tablet/.test(e.id) && e.id.startsWith("style:") && e.id.includes("regions."))).toBe(false);
    expect(searchStudio(index, "newsletter button phone padding", { limit: 10 }).some(r => r.id.includes("regions.newsletterButton"))).toBe(true);
  });
});

describe("command palette 2.0", () => {
  it("offers selection commands first, then recent results, then shortcuts, before typing", async () => {
    const { paletteGroups, contextCommands } = await import("./studioSearch");
    const context = contextCommands({ section: { id: "s1", label: "Hero Banner", visible: true, first: true, last: false } });
    const groups = paletteGroups(index, "", { context, recent: ["section:s1", "missing-id"] });
    expect(groups.map(g => g.title)).toEqual(["For what you selected", "Recent", "Shortcuts"]);
    expect(groups[0].entries.map(e => e.title)).toContain("Duplicate this section");
    // The first section can't move up; the recent list drops results that no longer exist.
    expect(groups[0].entries.some(e => e.title === "Move this section up")).toBe(false);
    expect(groups[1].entries.map(e => e.id)).toEqual(["section:s1"]);
  });

  it("> lists commands only and searches them", async () => {
    const { paletteGroups } = await import("./studioSearch");
    const all = paletteGroups(index, ">").flatMap(g => g.entries);
    expect(all.length).toBeGreaterThan(5);
    expect(all.every(e => e.kind === "action" || e.kind === "area")).toBe(true);
    const pub = paletteGroups(index, "> publish").flatMap(g => g.entries);
    expect(pub[0].title).toBe("Publish to the live shop");
    expect(paletteGroups(index, "> footer color").flatMap(g => g.entries).every(e => e.kind !== "style")).toBe(true);
  });

  it("shows the keyboard shortcut a command shares with the key handler", async () => {
    const { contextCommands } = await import("./studioSearch");
    expect(index.find(e => e.id === "action:save")?.keys).toBe("Ctrl/⌘ S");
    expect(index.find(e => e.id === "action:device-mobile")?.keys).toBe("3");
    const dup = contextCommands({ section: { id: "s", label: "x", visible: true, first: false, last: false } }).find(e => e.title === "Duplicate this section");
    expect(dup?.keys).toBe("Ctrl/⌘ D");
  });

  it("finds page parts and books by name", async () => {
    const { buildStudioIndex, searchStudio } = await import("./studioSearch");
    const idx = buildStudioIndex({ styleGroups: [], copySchema: [], templates: [], pages: [], sectionsByTemplate: {}, sectionLabel: t => t,
      elements: [{ key: "r:buyCard", label: "Buy card", where: "This page › Page" }],
      books: [{ slug: "night-pages", title: "Night Pages", author: "A. Writer" }, { slug: "night-pages", title: "dupe" }] });
    expect(searchStudio(idx, "buy card")[0]).toMatchObject({ kind: "element", target: { type: "element", key: "r:buyCard" } });
    expect(searchStudio(idx, "writer").map(e => e.id)).toEqual(["book:night-pages"]);
  });

  it("reads the screen size a query asks for", async () => {
    const { searchedDevice } = await import("./studioSearch");
    expect(searchedDevice("newsletter button phone padding")).toBe("mobile");
    expect(searchedDevice("Tablet gap")).toBe("tablet");
    expect(searchedDevice("price colour")).toBeNull();
  });

  it("remembers recent picks newest first without repeats", async () => {
    const { pushRecent } = await import("./studioSearch");
    expect(pushRecent(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
    expect(pushRecent(["a", "b"], "z", 2)).toEqual(["z", "a"]);
  });
});

describe("book results use the storefront's collision-safe routes", () => {
  it("lists books with shared or missing slugs under the route the preview resolves", async () => {
    const { buildStudioIndex } = await import("./studioSearch");
    const { resolveProductRoutes } = await import("../../features/site/productRoutes");
    const books = resolveProductRoutes([
      { id: "b1", slug: "night", title: "Night" }, { id: "b2", slug: "night", title: "Night (2nd)" }, { id: "b3", title: "No Slug Yet" },
    ]);
    const idx = buildStudioIndex({ styleGroups: [], copySchema: [], templates: [], pages: [], sectionsByTemplate: {}, sectionLabel: t => t, books });
    expect(idx.filter(e => e.kind === "book").map(e => (e.target as any).slug)).toEqual(["b1", "b2", "no-slug-yet"]);
  });
});

describe("block commands (Block library 3.0)", () => {
  it("offers add, copy and paste only when they apply", async () => {
    const { contextCommands } = await import("./studioSearch");
    const section = { id: "s", label: "Flexible composition", visible: true, first: true, last: true };
    const titles = (blocks: any) => contextCommands({ section, blocks }).map(e => e.title).filter(t => /block/i.test(t));
    expect(titles({ takesBlocks: false, canPaste: false })).toEqual([]);
    expect(titles({ takesBlocks: true, canPaste: false })).toEqual(["Add a block to this section"]);
    expect(titles({ takesBlocks: true, blockLabel: "Text", canPaste: true })).toEqual([
      "Add a block to this section", "Copy the selected block (Text)", "Paste the copied block here",
    ]);
  });
});

// What a shop owner types in plain words, and where the first three results must lead. Each answer is a result id
// (`style-group:` = a Theme settings category, `style:<group>:<key>` = one control, `copy-group:` = a Text & labels
// group); a trailing * accepts any id with that start. A query here that stops working is a real owner who gets lost.
const PLAIN_WORDS: [string, string[]][] = [
  ["logo", ["style-group:logo"]],
  ["change logo size", ["style:header:logoHeight"]],
  ["make the logo bigger", ["style-group:logo", "style:header:logoHeight"]],
  ["make text bigger", ["style-group:type", "style:type:baseFontSize"]],
  ["bigger font", ["style-group:type", "style:type:baseFontSize"]],
  ["font", ["style-group:type"]],
  ["colour of buttons", ["style-group:buttons"]],
  ["button colour", ["style-group:buttons"]],
  ["button color", ["style-group:buttons"]],
  ["round buttons", ["style-group:buttons", "style:buttons:buttonRadius"]],
  ["rounded corners", ["style:buttons:buttonRadius", "style-group:buttons"]],
  ["background", ["style-group:colors"]],
  ["dark mode", ["style-group:colors", "style-group:themeLook"]],
  ["menu", ["menus:links", "style-group:navlinks"]],
  ["add a link to the menu", ["menus:links"]],
  ["categories", ["menus:categories"]],
  ["footer links", ["style-group:footer", "menus:links"]],
  ["announcement", ["style-group:header"]],
  ["banner at top", ["style-group:header"]],
  ["sale badge", ["style:labels:showSaleBadge", "style-group:labels"]],
  ["sold out", ["style:products:soldOutBadgeStyle", "style:products:showSoldOutBadge"]],
  ["out of stock", ["style:products:soldOutBadgeStyle", "style:products:showSoldOutBadge"]],
  ["add to cart", ["style:productPage:*"]],
  ["checkout", ["copy-group:Checkout", "style-group:checkout"]],
  ["price colour", ["style:productCard:pdpPriceColor", "style:products:productPriceColor"]],
  ["book page", ["style-group:productPage", "style-group:productCard", "copy-group:Product page"]],
  ["product page", ["style-group:productPage", "style-group:productCard", "copy-group:Product page"]],
  ["cover size", ["style:productPage:productImageMaxWidth"]],
  ["photo shape", ["style:productPage:productImageAspect", "style:products:imageAspectRatio"]],
  ["home page", ["template:heroPage"]],
  ["hero", ["section:s1"]],
  ["newsletter", ["copy-group:Newsletter", "section:s2"]],
  ["email signup", ["copy-group:Newsletter"]],
  ["pop up", ["style-group:popup"]],
  ["popup", ["style-group:popup"]],
  ["cookie", ["copy-group:Cookie banner", "style:elements:showCookieBanner"]],
  ["instagram", ["style:footer:social.instagram", "style-group:footer"]],
  ["social icons", ["style-group:footer"]],
  ["about page", ["page:about", "style-group:customPages", "howto:new-page"]],
  ["new page", ["howto:new-page"]],
  ["delete section", ["howto:section-tools"]],
  ["move section", ["howto:section-tools"]],
  ["slideshow", ["action:add-section"]],
  ["undo", ["action:undo"]],
  ["publish", ["action:publish"]],
  ["phone", ["action:device-mobile"]],
  ["mobile", ["action:device-mobile"]],
  ["spacing", ["style-group:layout"]],
  ["padding", ["style-group:layout"]],
  ["favicon", ["style:logo:faviconUrl"]],
  ["seo", ["copy-group:Site & sharing"]],
  ["google", ["copy-group:Site & sharing", "howto:site-name"]],
  ["free shipping bar", ["style:cartDrawer:showFreeShipBar"]],
  ["currency", ["style:header:hideCurrencySelector"]],
  // misspelt
  ["annoucement", ["style-group:header"]],
  ["newsleter", ["copy-group:Newsletter"]],
  ["colur", ["style-group:colors"]],
  ["footr links", ["style-group:footer", "menus:links"]],
  // whole sentences
  ["where do i change the logo", ["style-group:logo"]],
  ["I want to make the buttons rounded", ["style-group:buttons", "style:buttons:buttonRadius"]],
];

describe("plain-English searches land in the right place", () => {
  const hit = (id: string, answers: string[]) => answers.some((a) => (a.endsWith("*") ? id.startsWith(a.slice(0, -1)) : id === a));
  for (const [query, answers] of PLAIN_WORDS) {
    it(`“${query}” → ${answers[0]}`, () => {
      const top = searchStudio(index, query, { limit: 3 }).map((e) => e.id);
      expect(top.some((id) => hit(id, answers)), `top 3 for “${query}”: ${top.join(", ")}`).toBe(true);
    });
  }

  it("covers at least 40 different searches", () => {
    expect(PLAIN_WORDS.length).toBeGreaterThanOrEqual(40);
  });

  it("puts a category above its single controls and the fine-tune element controls last", () => {
    const top = searchStudio(index, "padding", { limit: 3 });
    expect(top[0].id).toBe("style-group:layout");
    expect(top.every((e) => !e.id.includes("regions."))).toBe(true);
    const all = searchStudio(index, "padding", { limit: 24 });
    const firstRegion = all.findIndex((e) => e.id.includes("regions."));
    const lastPlain = all.map((e) => !e.id.includes("regions.")).lastIndexOf(true);
    expect(firstRegion === -1 || firstRegion > lastPlain).toBe(true);
  });

  it("treats spellings and compound words alike", () => {
    const ids = (q: string) => searchStudio(index, q, { limit: 5 }).map((e) => e.id);
    expect(ids("button colour")).toEqual(ids("button color"));
    expect(ids("popup")).toEqual(ids("pop-up"));
    expect(ids("popup")).toEqual(ids("pop up"));
    expect(normalizeSearchText("Customise the Catalogue")).toBe("customize the catalog");
  });

  it("ignores filler words and keeps the words that matter", () => {
    expect(planQuery(index, "where do I change the heading").words).toEqual(["heading"]);
    expect(planQuery(index, "add to cart").words).toEqual(["add to bag"]);
    expect(planQuery(index, "out of stock").words).toEqual(["sold out"]);
  });
});

describe("spelling help", () => {
  it("fixes a misspelt word and says what it searched for", () => {
    const groups = paletteGroups(index, "annoucement");
    expect(groups[0].note).toBe("Showing results for “announcement”");
    expect(groups[0].entries[0].id).toBe("style-group:header");
    expect(paletteGroups(index, "announcement")[0].note).toBeUndefined();
  });

  it("never rewrites words it knows or short words", () => {
    expect(planQuery(index, "footer").corrected).toBeNull();
    expect(planQuery(index, "bg").corrected).toBeNull();
    expect(planQuery(index, "colour").corrected).toBeNull();
  });
});

describe("when not every word matches", () => {
  it("drops soft verbs before giving up", () => {
    const top = searchStudio(index, "add a link to the menu", { limit: 3 }).map((e) => e.id);
    expect(top).toContain("menus:links");
  });

  it("offers the closest matches, labelled, instead of a blank list", () => {
    const groups = paletteGroups(index, "publish zzzqqq");
    expect(groups[0].note).toMatch(/^Closest matches/);
    expect(groups[0].entries[0].id).toBe("action:publish");
  });

  it("returns nothing, and suggests searches, for gibberish", () => {
    expect(searchStudio(index, "zzzqqq xxyyzz")).toEqual([]);
    const suggestions = suggestSearches("zzzqqq xxyyzz");
    expect(suggestions).toHaveLength(3);
    for (const s of suggestions) expect(searchStudio(index, s).length).toBeGreaterThan(0);
  });

  it("suggests the search closest to what was typed first", () => {
    expect(suggestSearches("announcment barr")[0]).toBe("announcement bar");
  });
});

describe("spelling correction stays sensible", () => {
  it("never turns a real 4-letter word into a shorter one", () => {
    const plan = planQuery(index, "pink");
    expect(plan.corrected).not.toBe("pin");
    expect(planQuery(index, "fnot").corrected).toBe("font");
  });
});

describe("click paths", () => {
  it("show where a control lives in the words used on screen", () => {
    expect(index.find((e) => e.id === "style:header:logoHeight")?.trail).toBe("Theme settings › Top of every page › Header & announcement bar › Header layout");
    expect(index.find((e) => e.id === "style-group:logo")?.trail).toBe("Theme settings › Top of every page");
    expect(index.find((e) => e.id === "style-group:footer")?.trail).toBe("Theme settings › Bottom of every page");
    expect(index.find((e) => e.id === "copy-group:Newsletter")?.trail).toBe("Text & labels › Across the whole shop");
  });
});
