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
      .toEqual({ title: "Reprint our book", story: "Line one\n\nLine two", goalMinor: 300000, endsOn: "2026-12-08", wall: true, rewards: [] });
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

  test("rewards: cleaned, new ones get free ids, the server's count is kept", () => {
    const out = r.cleanRewards([
      { title: "  A thank-you  card ", minMinor: 1000, description: "Signed", when: "January 2027" },
      { title: "Print", minMinor: 5000, limit: "25", ships: true },
    ]);
    expect(out).toEqual([
      { id: "rw1", title: "A thank-you card", description: "Signed", minMinor: 1000, limit: 0, ships: false, when: "January 2027", taken: 0 },
      { id: "rw2", title: "Print", description: "", minMinor: 5000, limit: 25, ships: true, when: "", taken: 0 },
    ]);
    const stored = [{ id: "rw1", title: "Card", description: "", minMinor: 1000, limit: 0, ships: false, when: "", taken: 4 }];
    const again = r.cleanRewards([{ id: "rw1", title: "Card", minMinor: 1500, taken: 999 }, { id: "rwfake", title: "New", minMinor: 700 }], stored);
    expect(again).toMatchObject([{ id: "rw1", taken: 4, minMinor: 1500 }, { id: "rw2", taken: 0 }]);
  });

  test("rewards: what can't be saved", () => {
    const stored = [{ id: "rw1", title: "Card", description: "", minMinor: 1000, limit: 10, ships: false, when: "", taken: 3 }];
    expect(r.cleanRewards([{ title: "x", minMinor: 1000 }])).toMatchObject({ field: "rewards" });
    expect(r.cleanRewards([{ title: "Card", minMinor: 499 }])).toMatchObject({ field: "rewards" });
    expect(r.cleanRewards([{ title: "Card", minMinor: 1000, limit: -1 }])).toMatchObject({ field: "rewards" });
    expect(r.cleanRewards(Array.from({ length: 9 }, () => ({ title: "Card", minMinor: 1000 })))).toMatchObject({ field: "rewards" });
    expect(r.cleanRewards([{ id: "rw1", title: "Card", minMinor: 1000, limit: 2 }], stored)).toMatchObject({ problem: expect.stringContaining("at least 3") });
    expect(r.cleanRewards([], stored)).toMatchObject({ problem: expect.stringContaining("can't be removed") });
    expect(r.cleanRewards([], [{ ...stored[0], taken: 0 }])).toEqual([]);
    expect(r.cleanFundraiser({ title: "Reprint", goalMinor: 300000, endsOn: "2026-12-08", rewards: [{ title: "x" }] }, TODAY)).toMatchObject({ field: "rewards" });
  });

  test("rewards: claiming, gone, the gift too small, counts", () => {
    const rewards = [
      { id: "rw1", title: "Card", description: "", minMinor: 1000, limit: 2, ships: false, when: "", taken: 1 },
      { id: "rw2", title: "Print", description: "", minMinor: 5000, limit: 0, ships: true, when: "", taken: 7 },
    ];
    expect(r.rewardProblem(rewards, "rw1", 1000)).toMatchObject({ reward: { id: "rw1" } });
    expect(r.rewardProblem(rewards, "rw1", 999)).toMatchObject({ code: "reward_min" });
    expect(r.rewardProblem(rewards, "nope", 9999)).toMatchObject({ code: "reward_unknown" });
    const full = r.rewardsWithTaken(rewards, "rw1", 1);
    expect(r.rewardProblem(full, "rw1", 1000)).toMatchObject({ code: "reward_gone" });
    expect(r.rewardsWithTaken(rewards, "rw1", -5)[0].taken).toBe(0);
    const shown = r.publicFundraiser("f1", { title: "T", status: "live", endsOn: TODAY, rewards: full }, TODAY).rewards;
    expect(shown).toEqual([
      { id: "rw1", title: "Card", description: "", minMinor: 1000, ships: false, when: "", left: 0, gone: true },
      { id: "rw2", title: "Print", description: "", minMinor: 5000, ships: true, when: "", left: null, gone: false },
    ]);
  });

  test("rewards: the posting address", () => {
    expect(r.cleanShipTo({ name: "Ada", street: "1 Main St", city: "Toronto", state: "ON", zip: "M6G 3H1", country: "CA" })).toMatchObject({ city: "Toronto", street2: "" });
    expect(r.cleanShipTo({ name: "Ada", street: "1 Main St", city: "Toronto", country: "CA" })).toMatchObject({ code: "address" });
    expect(r.cleanShipTo({ street: "1 Main St", city: "Dublin", country: "IE", zip: "D01" })).toMatchObject({ code: "address" });
  });
});
