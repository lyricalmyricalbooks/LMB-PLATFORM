import { describe, expect, it } from "vitest";
import { cleanFilters, groupNameProblem, matchingGroup, MAX_GROUPS, readGroups, removeGroup, saveGroup } from "./customerGroups";

const vipToronto = { seg: "vip", q: "toronto", consent: "subscribed", tag: "", country: "Canada", sort: "recent" } as const;
let n = 0;
const id = () => `g${++n}`;

describe("saved customer groups", () => {
  it("saves filters under a name, and the same name updates in place", () => {
    const one = saveGroup([], " Toronto VIPs ", vipToronto, id);
    expect(one).toEqual([{ id: one[0].id, name: "Toronto VIPs", ...vipToronto }]);
    const again = saveGroup(one, "toronto vips", { ...vipToronto, sort: "spent" }, id);
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({ id: one[0].id, name: "toronto vips", sort: "spent" });
    expect(removeGroup(again, one[0].id)).toEqual([]);
  });

  it("finds the group the page is showing", () => {
    const groups = saveGroup([], "Toronto VIPs", vipToronto, id);
    expect(matchingGroup(groups, { ...vipToronto })?.name).toBe("Toronto VIPs");
    expect(matchingGroup(groups, { ...vipToronto, tag: "fair" })).toBeNull();
  });

  it("reads back only well-formed groups and cleans odd values", () => {
    const raw = JSON.stringify([{ id: "a", name: "A", seg: "nope", sort: "spent" }, { name: "no id" }, { id: "a", name: "dupe" }, "x"]);
    expect(readGroups(raw)).toEqual([{ id: "a", name: "A", ...cleanFilters({}) }]);
    expect(readGroups("not json")).toEqual([]);
    expect(readGroups(null)).toEqual([]);
  });

  it("asks for a name and keeps the list to a sensible size", () => {
    expect(groupNameProblem("  ", [])).toBe("Give the group a name.");
    expect(groupNameProblem("x".repeat(61), [])).toMatch(/under 60/);
    const full = Array.from({ length: MAX_GROUPS }, (_, i) => ({ id: `g${i}`, name: `G${i}`, ...cleanFilters({}) }));
    expect(groupNameProblem("New one", full)).toMatch(/up to 30/);
    expect(groupNameProblem("g3", full)).toBeNull();
  });
});
