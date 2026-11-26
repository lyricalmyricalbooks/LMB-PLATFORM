import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { STARTER_SITES } from "./lookGallery";
import { stylesFor } from "./studio/starterStyles";
import {
  currentWebsite, ownSavedDesigns, STARTER_BLURB, startersForKind, starterTheme, switchBackEntry, switchBackOffer,
  SWITCH_BACK_ID, thumbUrl, withSwitchBack,
} from "./websiteChoice";

const ALL = { known: STARTER_SITES } as any;

describe("website picker", () => {
  it("has a real screenshot and a plain line for every starter in every colour", () => {
    for (const id of STARTER_SITES) {
      expect(STARTER_BLURB[id], id).toBeTruthy();
      expect(STARTER_BLURB[id].length, id).toBeLessThanOrEqual(110);
      for (const s of stylesFor(id)) {
        const url = thumbUrl(id, s.id, "/");
        expect(existsSync(join(__dirname, "../../../public", url)), url).toBe(true);
      }
    }
  });

  it("lists the starters made for the shop's kind first", () => {
    const services = startersForKind("services", ALL);
    expect(services.slice(0, 3).sort()).toEqual(["starter-commission", "starter-salon", "starter-workshop"]);
    const products = startersForKind("products", ALL);
    expect(products.indexOf("starter-salon")).toBeGreaterThan(products.indexOf("aurel-editorial"));
    expect(new Set(products)).toEqual(new Set(services));
  });

  it("names the website a design is built on", () => {
    const theme = starterTheme("starter-gallery", null);
    expect(currentWebsite({ themeBase: { id: "starter-gallery", name: theme.name, style: "nope" } }))
      .toEqual({ id: "starter-gallery", style: stylesFor("starter-gallery")[0].id, name: theme.name });
    expect(currentWebsite({ themeBase: { id: "old-look", name: "Riso" } })).toEqual({ id: null, style: null, name: "Riso" });
    expect(currentWebsite(undefined).name).toBe("Your own design");
  });

  it("offers switching back for 30 days, keeping one copy only", () => {
    const t0 = new Date("2026-11-26T12:00:00Z");
    const first = switchBackEntry({ a: 1 }, "Gallery", "Larder", t0);
    const list = withSwitchBack([{ id: "mine", name: "Mine", savedAt: t0.toISOString(), design: {} } as any], first);
    const again = withSwitchBack(list, switchBackEntry({ a: 2 }, "Larder", "Salon", t0));
    expect(again.filter((t) => t.id === SWITCH_BACK_ID)).toHaveLength(1);
    expect(ownSavedDesigns(again).map((t) => t.id)).toEqual(["mine"]);
    expect(switchBackOffer(again, new Date("2026-12-20T12:00:00Z"))?.from).toBe("Larder");
    expect(switchBackOffer(again, new Date("2026-12-27T12:00:00Z"))).toBeNull();
  });
});
