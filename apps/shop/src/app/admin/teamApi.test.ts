import { describe, expect, it } from "vitest";
import { endOfToday, roleChangeProblem, selfDemotion, signInWords, teamMemberProblem } from "./teamApi";
import { rememberShopOwner } from "../lib/ownerDevice";

const SHOP_OWNER_EMAIL = "hello@moth.example";
rememberShopOwner(SHOP_OWNER_EMAIL, "sam@press.test");

describe("Team entries", () => {
  it("accepts a new person with a role, whatever the capitals", () => {
    expect(teamMemberProblem(" Sam@Press.test ", "staff")).toBeNull();
    expect(teamMemberProblem("ana@press.test", "author")).toBeNull();
  });
  it("refuses a bad address, the owner, a missing role and a repeat", () => {
    expect(teamMemberProblem("sam", "staff")).toMatch(/email/);
    expect(teamMemberProblem(SHOP_OWNER_EMAIL, "staff")).toMatch(/owner/);
    expect(teamMemberProblem("sam@press.test", "boss")).toMatch(/role/);
    expect(teamMemberProblem("SAM@press.test", "staff", [{ email: "sam@press.test", role: "staff" }])).toMatch(/already/i);
    // Someone already on the Team gets a new role in the list, not a second invite.
    expect(teamMemberProblem("sam@press.test", "owner", [{ email: "sam@press.test", role: "staff" }])).toMatch(/Already on the Team/);
  });
});

describe("a fair helper added just for today", () => {
  it("ends at the close of the day the owner added them", () => {
    const end = endOfToday(new Date(2026, 10, 3, 9, 30));
    expect([end.getFullYear(), end.getMonth(), end.getDate(), end.getHours(), end.getMinutes()]).toEqual([2026, 10, 3, 23, 59]);
  });
});

describe("changing someone already on the Team", () => {
  it("never changes the account holder, who always owns the shop", () => {
    expect(roleChangeProblem({ email: SHOP_OWNER_EMAIL, role: "owner" }, "staff")).toMatch(/always owns/);
    expect(roleChangeProblem({ email: "sam@press.test", role: "staff" }, "owner")).toBeNull();
    expect(roleChangeProblem({ email: "sam@press.test", role: "staff" }, "boss")).toMatch(/role/);
  });
  it("asks first when a co-owner would take away their own power over the Team", () => {
    expect(selfDemotion({ email: "co@press.test", role: "owner" }, "staff", "Co@Press.test")).toBe(true);
    expect(selfDemotion({ email: "co@press.test", role: "owner" }, "owner", "co@press.test")).toBe(false);
    expect(selfDemotion({ email: "sam@press.test", role: "owner" }, "staff", "co@press.test")).toBe(false);
  });
});

describe("whether someone has signed in yet", () => {
  const now = new Date(2026, 10, 12, 18, 0);
  it("says Invited until the first sign-in, then when they last signed in", () => {
    expect(signInWords({}, now)).toMatch(/^Invited/);
    expect(signInWords({ joinedAt: new Date(2026, 10, 12, 9).toISOString(), lastSignInAt: new Date(2026, 10, 12, 9).toISOString() }, now)).toBe("Signed in today");
    expect(signInWords({ lastSignInAt: new Date(2026, 10, 5, 9).toISOString() }, now)).toMatch(/^Signed in Nov 5$/);
  });
});
