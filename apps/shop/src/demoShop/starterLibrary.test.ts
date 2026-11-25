import { describe, expect, it } from "vitest";
import { AWAITING_YES, STARTER_SITES } from "../app/admin/lookGallery";
import { filterEntries, LIBRARY_FILTERS, libraryEntries, libraryRoute, liveHref, readOfferedChoice, STARTER_INFO, joinHref } from "./starterLibrary";

const everyone = { order: STARTER_SITES, known: STARTER_SITES };

describe("starter library", () => {
  it("knows what every starter suits, and every filter has starters once all are offered", () => {
    for (const id of STARTER_SITES) expect(STARTER_INFO[id], id).toBeTruthy();
    const all = libraryEntries(everyone, "/demo/");
    expect(all.map((e) => e.id)).toEqual(STARTER_SITES);
    for (const f of LIBRARY_FILTERS) expect(filterEntries(all, f.id).length, f.id).toBeGreaterThan(0);
    for (const e of all) {
      expect(e.styles).toHaveLength(3);
      expect(e.cover, e.id).toMatch(/^\/demo\/(starters|samples)\//);
      expect(e.bestFor.length).toBeGreaterThan(0);
    }
    // Every card shows its own photo.
    expect(new Set(all.map((e) => e.cover)).size).toBe(all.length);
  });

  it("lists only what the control room offers: new starters wait for the yes, hidden styles stay hidden", () => {
    expect(libraryEntries(null).map((e) => e.id)).toEqual(STARTER_SITES.filter((id) => !AWAITING_YES.includes(id)));
    const choice = { ...everyone, hidden: ["juniper-catalogue"], hiddenStyles: ["aurel-editorial/night"] };
    const entries = libraryEntries(choice);
    expect(entries.map((e) => e.id)).not.toContain("juniper-catalogue");
    expect(entries.find((e) => e.id === "aurel-editorial")!.styles.map((s) => s.id)).toEqual(["cobalt", "sand"]);
  });

  it("reads its address: the library, one starter, or a sample shop", () => {
    expect(libraryRoute("/demo/starters/")).toEqual({ page: "library" });
    expect(libraryRoute("/demo/starters")).toEqual({ page: "library" });
    expect(libraryRoute("/demo/starters/starter-larder")).toEqual({ page: "starter", id: "starter-larder" });
    expect(libraryRoute("/demo/starters/nope")).toEqual({ page: "library" });
    expect(libraryRoute("/demo/")).toBeNull();
    expect(libraryRoute("/demo/products/x")).toBeNull();
  });

  it("links to the live sample shop and to sign-up with the starter and style picked", () => {
    const larder = libraryEntries(everyone).find((e) => e.id === "starter-larder")!;
    expect(liveHref(larder, "olive")).toBe("/demo/?starter=starter-larder&style=olive&sells=home");
    expect(joinHref(larder, "olive")).toBe("/join/?starter=starter-larder&style=olive&name=Larder+Olive");
    expect(joinHref(larder, "harvest")).toBe("/join/?starter=starter-larder&style=harvest&name=Larder");
  });

  it("falls back to the ready starters when the record can't be read", async () => {
    expect(await readOfferedChoice((async () => { throw new Error("offline"); }) as any)).toBeNull();
    expect(await readOfferedChoice((async () => ({ ok: false })) as any)).toBeNull();
    expect(await readOfferedChoice((async () => ({ ok: true, json: async () => ({ choice: { known: ["a"] } }) })) as any)).toEqual({ known: ["a"] });
    expect(await readOfferedChoice((() => new Promise(() => {})) as any, 10)).toBeNull();
  });
});
