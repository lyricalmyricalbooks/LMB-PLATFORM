// The control room's starter choice in the shop: none saved shows every starter in the shop's order; a saved choice
// sets the order, hides what it hides and every starter the owner hasn't seen yet, and New tags only offered starters.
// Choose your look and Studio › Designs list exactly what is offered, after the built looks.
import { describe, expect, it } from "vitest";
import { AWAITING_YES, STARTER_SITES, builtLooks, filterLooks, newStarters, offeredStarters } from "./lookGallery";

describe("platform starters", () => {
  it("shows every starter in the shop's order when nothing was saved or it couldn't be read", () => {
    const ready = STARTER_SITES.filter(id => !AWAITING_YES.includes(id));
    expect(offeredStarters(null)).toEqual(ready);
    expect(offeredStarters(undefined)).toEqual(ready);
    // New starters wait for the platform owner's yes: offered once a saved choice knows them and shows them.
    expect(AWAITING_YES.every(id => STARTER_SITES.includes(id))).toBe(true);
    expect(offeredStarters({ known: STARTER_SITES, order: STARTER_SITES })).toEqual(STARTER_SITES);
    expect(newStarters(null)).toEqual([]);
  });

  it("follows the saved order, hides hidden ones and any starter added since the last save", () => {
    const choice = { order: ["aurel-editorial", "juniper-catalogue", "juniper-slow-season"], hidden: ["juniper-catalogue"], fresh: ["aurel-editorial", "juniper-catalogue"], known: ["aurel-editorial", "juniper-catalogue"] };
    expect(offeredStarters(choice)).toEqual(["aurel-editorial"]);
    expect(newStarters(choice)).toEqual(["aurel-editorial"]);
  });

  it("ignores ids the shop doesn't have and anything that isn't a list", () => {
    expect(offeredStarters({ order: ["gone", "aurel-editorial", "aurel-editorial"], known: [...STARTER_SITES, "gone"], hidden: "x" })).toEqual(["aurel-editorial", ...STARTER_SITES.filter(id => id !== "aurel-editorial")]);
  });

  it("the gallery lists the built looks, then the offered starters in their order", () => {
    const choice = { order: ["juniper-catalogue", "aurel-editorial", "juniper-slow-season"], known: ["juniper-catalogue", "aurel-editorial", "juniper-slow-season"], hidden: ["juniper-slow-season"] };
    const all = builtLooks(choice).map(t => t.id);
    expect(all.slice(-2)).toEqual(["juniper-catalogue", "aurel-editorial"]);
    expect(all).not.toContain("juniper-slow-season");
    expect(builtLooks().length).toBe(all.length + 1);
    expect(filterLooks(builtLooks(choice), "websites").map(t => t.id)).toEqual(["juniper-catalogue", "aurel-editorial"]);
  });
});
