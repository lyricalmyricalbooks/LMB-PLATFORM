import { describe, expect, it } from "vitest";
import { endOfToday, teamMemberProblem } from "./teamApi";
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
    expect(teamMemberProblem("SAM@press.test", "staff", [{ email: "sam@press.test", role: "staff" }])).toMatch(/already/);
    expect(teamMemberProblem("sam@press.test", "owner", [{ email: "sam@press.test", role: "staff" }])).toBeNull();
  });
});

describe("a fair helper added just for today", () => {
  it("ends at the close of the day the owner added them", () => {
    const end = endOfToday(new Date(2026, 10, 3, 9, 30));
    expect([end.getFullYear(), end.getMonth(), end.getDate(), end.getHours(), end.getMinutes()]).toEqual([2026, 10, 3, 23, 59]);
  });
});
