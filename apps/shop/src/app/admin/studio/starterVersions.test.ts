import { describe, expect, it } from "vitest";
import { STARTER_SITES, libraryLook } from "../lookGallery";
import { stylesFor, withStyle } from "./starterStyles";
import { applyLook, lookSignature, starterUpdate, updateLookKeepingEdits, ownEdits } from "./themeSwitch";
import { STARTER_VERSIONS, releasesSince, starterVersion } from "./starterVersions";
import { defaultSettings } from "../defaultSettings";

describe("starter versions", () => {
  it("every starter has releases numbered 1, 2, 3… with a date and a plain note", () => {
    for (const id of STARTER_SITES) {
      const releases = STARTER_VERSIONS[id]?.releases;
      expect(releases?.length, id).toBeGreaterThan(0);
      releases.forEach((r, i) => {
        expect(r.version, id).toBe(i + 1);
        expect(r.date, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(r.note.trim().length, id).toBeGreaterThan(10);
      });
    }
  });

  it("a starter's look changes only with a new release (every shop on it will be offered the update)", () => {
    const now: Record<string, Record<string, string>> = {};
    for (const id of STARTER_SITES) {
      now[id] = Object.fromEntries(stylesFor(id).map((s) => [s.id, lookSignature(withStyle(libraryLook(id), s.id))]));
    }
    const recorded = Object.fromEntries(STARTER_SITES.map((id) => [id, STARTER_VERSIONS[id]?.looks]));
    expect(now, "A starter's look changed. Add a release in starterVersions.ts (the next number, a plain note) and copy these signatures into its `looks`.").toEqual(recorded);
  });

  it("Use this look records the version, and an older version is offered as an update with what changed", () => {
    const defaults = defaultSettings().design;
    const id = "aurel-editorial";
    const sand = withStyle(libraryLook(id), "sand");
    const applied = applyLook(defaults, sand);
    expect(applied.themeBase).toMatchObject({ id, style: "sand", version: starterVersion(id) });
    expect(starterUpdate(applied)).toBeNull();

    // A shop that started from an older look (before versions were recorded): the newer one is offered, in its style.
    const older = { ...applied, themeBase: { ...applied.themeBase, sig: "older", version: undefined } };
    const update = starterUpdate(older)!;
    expect(update.name).toBe("Aurel Sand");
    expect(update.from).toBe(1);
    expect(update.releases.length).toBeGreaterThan(0);

    // Taking it keeps the owner's own change on top and records the newest version.
    const edited = { ...older, buttonRadius: 23 };
    const kept = ownEdits(edited, defaults).length;
    const next = updateLookKeepingEdits(edited, defaults, update.theme);
    expect(next.buttonRadius).toBe(23);
    expect(ownEdits(next, defaults).length).toBe(kept);
    expect(next.themeBase.version).toBe(starterVersion(id));
    expect(starterUpdate(next)).toBeNull();
  });

  it("lists only the releases newer than the shop's, newest first", () => {
    const id = STARTER_SITES[0];
    const latest = starterVersion(id)!;
    expect(releasesSince(id, latest).length).toBe(1); // nothing newer: one plain line, for a look changed some other way
    expect(releasesSince(id, 0).every((r, i, all) => i === 0 || r.version < all[i - 1].version)).toBe(true);
  });
});
