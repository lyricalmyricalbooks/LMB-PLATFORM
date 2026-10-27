import { describe, expect, it } from "vitest";
import { normalizeDesign } from "./studioModel";
import { resolveSaveConflict, applyPageStyle, buildPreviewState, createSnapshotWriter, deliverPreviewState, parseRecovery, previewRoute, samePreviewPage, updateBlocks, withDraftPage, mergeDesigns, newestRecovery } from "./studioWorkflow";

describe("Studio workflow", () => {
  it("normalization is idempotent and never nests page surfaces inside one another", () => {
    const initial = { primaryColor: "red", productPage: { sections: [] }, heroPage: { sections: [] } };
    const once = normalizeDesign(initial);
    expect(normalizeDesign(once)).toEqual(once);
    expect(once.heroPage).not.toHaveProperty("productPage");
  });
  it("gives legacy hidden and visible blocks stable identity across normalization", () => {
    const input = { heroPage: { sections: [{ id: "faq", type: "FAQSection", settings: { items: [{ hidden: true, question: "Hidden" }, { question: "Visible" }] } }] } };
    const a = normalizeDesign(input);
    const b = normalizeDesign(input);
    const blocks = a.heroPage.sections[0].settings.items;
    expect(blocks[0].id).toBeTruthy();
    expect(blocks[1].id).toBeTruthy();
    expect(blocks[1].id).not.toBe(blocks[0].id);
    expect(b.heroPage.sections).toEqual(a.heroPage.sections);
    expect(input.heroPage.sections[0].settings.items[0]).not.toHaveProperty("id");
  });
  it("edits a legacy blocks array without losing it or affecting siblings", () => {
    const section = { id: "s", type: "FAQSection", settings: { blocks: [{ id: "a", question: "A" }, { id: "b", question: "B" }] } };
    const next = updateBlocks(section, "items", blocks => blocks.map(b => b.id === "b" ? { ...b, question: "Edited" } : b));
    expect(next.items.map((b: any) => b.question)).toEqual(["A", "Edited"]);
    expect(section.settings.blocks[1].question).toBe("B");
  });
  it("page overrides preserve global values, other pages and section stacks", () => {
    const d = { primaryColor: "red", heroPage: { sections: [1] }, storefront: { primaryColor: "blue" } };
    const n = applyPageStyle(d, "heroPage", "primaryColor", "green");
    expect(n.primaryColor).toBe("red");
    expect(n.heroPage).toEqual({ sections: [1], primaryColor: "green" });
    expect(n.storefront).toEqual({ primaryColor: "blue" });
    expect(applyPageStyle(n, "heroPage", "primaryColor", undefined).heroPage).toEqual({ sections: [1] });
  });
  it("saves the captured snapshot and excludes edits made while awaiting persistence", async () => {
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    const writer = createSnapshotWriter();
    const design = { title: "Before" };
    let stored: any;
    const first = writer.run(design, async snapshot => { await pending; stored = snapshot; });
    design.title = "After";
    expect(await writer.run(design, async () => { throw new Error("must not run"); })).toBeNull();
    finish();
    expect(await first).toEqual({ title: "Before" });
    expect(stored).toEqual({ title: "Before" });
    expect(await writer.run(design, async () => {})).toEqual({ title: "After" });
  });
  it("unlocks after failed persistence so the draft can be retried", async () => {
    const writer = createSnapshotWriter();
    await expect(writer.run({ a: 1 }, async () => { throw new Error("offline"); })).rejects.toThrow("offline");
    expect(await writer.run({ a: 2 }, async () => {})).toEqual({ a: 2 });
  });
  it("rejects malformed recovery and recognizes a changed server baseline", () => {
    expect(parseRecovery("{broken", { title: "Live" })).toBeNull();
    expect(parseRecovery(JSON.stringify({ version: 1, design: "bad" }), {})).toBeNull();
    const recovery = JSON.stringify({ version: 1, design: { title: "Local" }, base: JSON.stringify({ title: "Old" }), savedAt: 1 });
    expect(parseRecovery(recovery, { title: "New" })?.conflict).toBe(true);
    expect(parseRecovery(recovery, { title: "Local" })).toBeNull();
  });
  it("maps preview navigation under the deployed subpath", () => {
    expect(previewRoute("/LyricalmyricalWebsiteTrial/books/poems?preview=true", "/LyricalmyricalWebsiteTrial/")).toEqual({ templateId: "productPage", product: "poems" });
    expect(previewRoute("/LyricalmyricalWebsiteTrial/?catalog=true", "/LyricalmyricalWebsiteTrial/")).toEqual({ templateId: "storefront" });
    expect(previewRoute("/LyricalmyricalWebsiteTrial/page/about", "/LyricalmyricalWebsiteTrial/")).toEqual({ templateId: "page:about" });
    expect(previewRoute("/outside", "/LyricalmyricalWebsiteTrial/")).toBeNull();
    expect(previewRoute("/LyricalmyricalWebsiteTrial/wishlist", "/LyricalmyricalWebsiteTrial/")).toEqual({ templateId: "wishlistPage" });
    expect(previewRoute("/LyricalmyricalWebsiteTrial/account/orders", "/LyricalmyricalWebsiteTrial/")).toEqual({ templateId: "accountPage" });
    expect(previewRoute("/LyricalmyricalWebsiteTrial/track", "/LyricalmyricalWebsiteTrial/")).toEqual({ templateId: "trackingPage" });
    expect(previewRoute("/LyricalmyricalWebsiteTrial/studio-missing-page", "/LyricalmyricalWebsiteTrial/")).toEqual({ templateId: "page404" });
  });
  it("follows the shop's own choices for links that name no template", () => {
    // Show a Home page off: "/" is the catalog.
    expect(previewRoute("/?preview=true", "/", { showHero: false })).toEqual({ templateId: "storefront" });
    expect(previewRoute("/?preview=true", "/", { showHero: true })).toEqual({ templateId: "heroPage" });
    // A book link without ?template= shows the book's own alternate; an explicit template wins.
    const bookTemplate = (slug: string) => (slug === "poems" ? "productPage~poetry" : "productPage");
    expect(previewRoute("/books/poems?preview=true", "/", { bookTemplate })).toEqual({ templateId: "productPage~poetry", product: "poems" });
    expect(previewRoute("/books/poems?template=default&preview=true", "/", { bookTemplate })).toEqual({ templateId: "productPage", product: "poems" });
    expect(previewRoute("/books/other", "/", { bookTemplate })).toEqual({ templateId: "productPage", product: "other" });
  });
  it("recognises the page Studio asked the preview for", () => {
    expect(samePreviewPage("/books/poems?template=default&preview=true", "https://shop.example/books/poems?template=default&preview=true")).toBe(true);
    expect(samePreviewPage("/?preview=true", "https://shop.example/?preview=true")).toBe(true);
    expect(samePreviewPage("/page/about/?preview=true", "https://shop.example/page/about?preview=true")).toBe(true);
    expect(samePreviewPage("/books/poems?preview=true", "https://shop.example/books/poems?template=default&preview=true")).toBe(false);
    expect(samePreviewPage("/page/faq?preview=true", "https://shop.example/page/about?preview=true")).toBe(false);
  });
  it("sends a complete draft snapshot and excludes pages shoppers cannot see", () => {
    const design = { primaryColor: "#f00" };
    const books = [{ id: "book-1" }];
    const state = buildPreviewState(
      { design: { primaryColor: "#000" }, payments: { stripe: { connected: true } } },
      design,
      [{ id: "live", status: "published" }, { id: "draft", status: "draft" }],
      books,
    );
    expect(state).toMatchObject({
      type: "STUDIO_PREVIEW_STATE",
      design,
      settings: { design, draftDesign: design, payments: { stripe: { connected: true } } },
      pages: [{ id: "live", status: "published" }],
      books,
    });
  });
  it("overlays the unsaved Studio › Pages edit onto the preview's page list only", () => {
    const pages = [{ id: "a", slug: "about", title: "About", status: "published" }];
    expect(withDraftPage(pages, null)).toBe(pages);
    expect(withDraftPage(pages, { id: "a", slug: "about", title: "About us" })[0].title).toBe("About us");
    expect(pages[0].title).toBe("About");
    const added = withDraftPage(pages, { slug: "journal", title: "Journal", status: "published" });
    expect(added.map((p: any) => p.slug)).toEqual(["about", "journal"]);
    expect(withDraftPage(pages, { title: "No slug yet" })).toBe(pages);
  });
  it("strips live Firestore snapshots so the preview message can be cloned", () => {
    // Admin book lists carry `_lastDoc` (a Firestore DocumentSnapshot with functions); postMessage
    // throws DataCloneError on it, which silently stopped every preview update once books loaded.
    const books = [{ id: "b1", title: "Altrove", _lastDoc: { ref: () => null } }];
    const pages = [{ id: "p1", status: "published", _lastDoc: { get: () => null } }];
    expect(() => structuredClone(books)).toThrow();
    const state = buildPreviewState({}, { productTitleColor: "#3245D2" }, pages, books);
    expect(() => structuredClone(state)).not.toThrow();
    expect(state.books).toEqual([{ id: "b1", title: "Altrove" }]);
    expect(state.pages).toEqual([{ id: "p1", status: "published" }]);
  });
  it("still dispatches the same-origin fallback when postMessage throws", () => {
    const origin = "https://shop.example";
    let dispatched = 0;
    const frame = {
      location: { origin },
      postMessage: () => { throw new Error("DataCloneError"); },
      dispatchEvent: () => { dispatched += 1; return true; },
    } as unknown as Window;
    deliverPreviewState(frame, buildPreviewState({}, {}, [], []), origin);
    expect(dispatched).toBe(1);
  });
  it("delivers the unsaved snapshot through postMessage and a same-origin fallback", () => {
    const origin = "https://shop.example";
    const state = buildPreviewState({}, { primaryColor: "#f00" }, [], []);
    const received: MessageEvent[] = [];
    const frame = {
      location: { origin },
      postMessage: (data: any, origin: string) => received.push(new MessageEvent("message", { data, origin })),
      dispatchEvent: (event: MessageEvent) => { received.push(event); return true; },
    } as unknown as Window;
    deliverPreviewState(frame, state, origin);
    expect(received).toHaveLength(2);
    expect(received.every((event) => event.data.design.primaryColor === "#f00")).toBe(true);
  });
  it("does not directly dispatch into a cross-origin preview", () => {
    let posts = 0, dispatches = 0;
    const frame = {
      location: { origin: "https://other.example" },
      postMessage: () => { posts += 1; },
      dispatchEvent: () => { dispatches += 1; return true; },
    } as unknown as Window;
    deliverPreviewState(frame, buildPreviewState({}, {}, [], []), "https://shop.example");
    expect(posts).toBe(1);
    expect(dispatches).toBe(0);
  });
});

describe("mergeDesigns (two tabs saved the same draft)", () => {
  const base = { primaryColor: "black", heroPage: { sections: [1], primaryColor: "black" }, copy: { cartTitle: "Bag" } };
  it("combines changes made to different settings", () => {
    const local = { ...base, primaryColor: "red" };
    const server = { ...base, copy: { cartTitle: "Basket" } };
    expect(mergeDesigns(base, local, server)).toEqual({ merged: { ...base, primaryColor: "red", copy: { cartTitle: "Basket" } }, conflicts: [] });
  });
  it("combines different settings inside the same page", () => {
    const local = { ...base, heroPage: { ...base.heroPage, sections: [1, 2] } };
    const server = { ...base, heroPage: { ...base.heroPage, primaryColor: "white" } };
    const { merged, conflicts } = mergeDesigns(base, local, server);
    expect(conflicts).toEqual([]);
    expect(merged.heroPage).toEqual({ sections: [1, 2], primaryColor: "white" });
  });
  it("reports the same setting changed differently on both sides, keeping this tab's value", () => {
    const { merged, conflicts } = mergeDesigns(base, { ...base, primaryColor: "red" }, { ...base, primaryColor: "blue" });
    expect(conflicts).toEqual(["primaryColor"]);
    expect(merged.primaryColor).toBe("red");
  });
  it("keeps deletions from either side", () => {
    const { merged } = mergeDesigns(base, base, { heroPage: base.heroPage, copy: base.copy });
    expect(merged.primaryColor).toBeUndefined();
  });
});

describe("resolveSaveConflict (the save-conflict dialog)", () => {
  const base = { primaryColor: "black", accent: "gold", copy: { cartTitle: "Bag" }, heroPage: { sections: [1] } };
  it("keeps everything only one side changed, whichever side wins the shared setting", () => {
    const local = { ...base, primaryColor: "red", heroPage: { sections: [1, 2] } };      // mine: colour + Home
    const server = { ...base, primaryColor: "blue", accent: "pink", copy: { cartTitle: "Basket" } }; // theirs: colour (same) + accent + copy
    const { mine, theirs, conflicts } = resolveSaveConflict(base, local, server);
    expect(conflicts).toEqual(["primaryColor"]);
    expect(mine).toEqual({ primaryColor: "red", accent: "pink", copy: { cartTitle: "Basket" }, heroPage: { sections: [1, 2] } });
    expect(theirs).toEqual({ primaryColor: "blue", accent: "pink", copy: { cartTitle: "Basket" }, heroPage: { sections: [1, 2] } });
  });
});

describe("newestRecovery (one record per Studio tab)", () => {
  const fakeStorage = (entries: Record<string, string>) => {
    const map = new Map(Object.entries(entries));
    return { get length() { return map.size; }, key: (i: number) => [...map.keys()][i] ?? null, getItem: (k: string) => map.get(k) ?? null,
      removeItem: (k: string) => { map.delete(k); }, setItem: (k: string, v: string) => { map.set(k, v); }, clear: () => map.clear(), map } as any;
  };
  const record = (design: any, savedAt: number) => JSON.stringify({ version: 1, design, base: JSON.stringify({ a: 0 }), savedAt });
  it("offers the newest unsaved work from any tab and drops very old records", () => {
    const now = Date.UTC(2026, 9, 8);
    const storage = fakeStorage({
      "studio-recovery-v2:/:u:tab1": record({ a: 1 }, now - 1000),
      "studio-recovery-v2:/:u:tab2": record({ a: 2 }, now - 10),
      "studio-recovery-v2:/:u:old": record({ a: 3 }, now - 30 * 24 * 3600 * 1000),
      "studio-recovery-v2:/:other:tab": record({ a: 4 }, now),
    });
    const found = newestRecovery(storage, "studio-recovery-v2:/:u:", { a: 0 }, now);
    expect(found?.design).toEqual({ a: 2 });
    expect(found?.key).toBe("studio-recovery-v2:/:u:tab2");
    expect(storage.map.has("studio-recovery-v2:/:u:old")).toBe(false);
  });
});
