// Fundraisers (Donations & tips beta, G2): the owner's form, when one runs, the bar and the wall, against the shop's copy and
// the server's generated one.
import { createRequire } from "node:module";
import { describe, expect, test } from "vitest";
import * as shop from "./fundraiserRules";

const server = createRequire(import.meta.url)("../../functions/shared/fundraiserRules.js") as typeof shop;
const TODAY = "2026-11-18";

describe.each([["shop", shop], ["server", server]])("fundraiser rules (%s copy)", (_name, r) => {
  test("a good form comes back cleaned", () => {
    expect(r.cleanFundraiser({ title: "  Reprint   our book ", story: "Line one  \r\n\r\nLine two", goalMinor: 300000, endsOn: "2026-12-08" }, TODAY))
      .toEqual({ title: "Reprint our book", story: "Line one\n\nLine two", goalMinor: 300000, endsOn: "2026-12-08", wall: true });
    expect(r.cleanFundraiser({ title: "Drum", goalMinor: 10000, endsOn: TODAY, wall: false }, TODAY)).toMatchObject({ wall: false });
  });

  test("a bad form names the field", () => {
    const base = { title: "Reprint", goalMinor: 300000, endsOn: "2026-12-08" };
    expect(r.cleanFundraiser({ ...base, title: "ab" }, TODAY)).toMatchObject({ field: "title" });
    expect(r.cleanFundraiser({ ...base, goalMinor: 9999 }, TODAY)).toMatchObject({ field: "goal" });
    expect(r.cleanFundraiser({ ...base, goalMinor: "300000" }, TODAY)).toMatchObject({ field: "goal" });
    expect(r.cleanFundraiser({ ...base, goalMinor: r.MAX_GOAL_MINOR + 1 }, TODAY)).toMatchObject({ field: "goal" });
    expect(r.cleanFundraiser({ ...base, endsOn: "2026-11-17" }, TODAY)).toMatchObject({ field: "endsOn" });
    expect(r.cleanFundraiser({ ...base, endsOn: r.dayAfter(TODAY, r.MAX_DAYS + 1) }, TODAY)).toMatchObject({ field: "endsOn" });
    expect(r.cleanFundraiser({ ...base, endsOn: "soon" }, TODAY)).toMatchObject({ field: "endsOn" });
    expect(r.cleanFundraiser(null, TODAY)).toMatchObject({ field: "title" });
  });

  test("a fundraiser runs to the end of its last day, or until ended", () => {
    expect(r.fundraiserState({ status: "draft", endsOn: "2027-01-01" }, TODAY)).toBe("draft");
    expect(r.fundraiserState({ status: "live", endsOn: TODAY }, TODAY)).toBe("live");
    expect(r.fundraiserState({ status: "live", endsOn: "2026-11-17" }, TODAY)).toBe("ended");
    expect(r.fundraiserState({ status: "ended", endsOn: "2027-01-01" }, TODAY)).toBe("ended");
    expect(r.daysLeft(TODAY, TODAY)).toBe(1);
    expect(r.daysLeft("2026-11-20", TODAY)).toBe(3);
    expect(r.daysLeft("2026-11-01", TODAY)).toBe(0);
  });

  test("the bar stops at full, the words don't", () => {
    expect(r.goalProgress(187500, 300000)).toEqual({ bar: 62, percent: 62 });
    expect(r.goalProgress(450000, 300000)).toEqual({ bar: 100, percent: 150 });
    expect(r.goalProgress(-5, 300000)).toEqual({ bar: 0, percent: 0 });
    expect(r.goalProgress(100, 0)).toEqual({ bar: 0, percent: 0 });
  });

  test("the wall keeps one line per gift, newest first, and never shows gift ids", () => {
    let wall = r.wallWith([], { gift: "g1", name: "Ada", at: "1" });
    wall = r.wallWith(wall, { gift: "g2", name: "Ben", at: "2" });
    wall = r.wallWith(wall, { gift: "g1", name: "Ada", at: "3" });
    expect(wall.map((w) => w.gift)).toEqual(["g1", "g2"]);
    expect(r.wallWithout(wall, "g1").map((w) => w.name)).toEqual(["Ben"]);
    const shown = r.publicFundraiser("f1", { title: "T", goalMinor: 10000, endsOn: TODAY, status: "live", wallEntries: wall, raisedMinor: 5000, supporters: 2 }, TODAY);
    expect(shown.wall).toEqual([{ name: "Ada", at: "3" }, { name: "Ben", at: "2" }]);
    expect(JSON.stringify(shown)).not.toContain("g1");
    expect(r.publicFundraiser("f1", { wall: false, wallEntries: wall }, TODAY).wall).toEqual([]);
  });
});
