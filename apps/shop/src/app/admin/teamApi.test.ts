import { describe, expect, it } from "vitest";
import { teamMemberProblem } from "./teamApi";
import { SHOP_OWNER_EMAIL } from "../lib/ownerDevice";

describe("Team entries", () => {
  it("accepts a new person with a role, whatever the capitals", () => {
    expect(teamMemberProblem(" Sam@Press.test ", "staff")).toBeNull();
  });
  it("refuses a bad address, the owner, a missing role and a repeat", () => {
    expect(teamMemberProblem("sam", "staff")).toMatch(/email/);
    expect(teamMemberProblem(SHOP_OWNER_EMAIL, "staff")).toMatch(/owner/);
    expect(teamMemberProblem("sam@press.test", "boss")).toMatch(/role/);
    expect(teamMemberProblem("SAM@press.test", "staff", [{ email: "sam@press.test", role: "staff" }])).toMatch(/already/);
    expect(teamMemberProblem("sam@press.test", "owner", [{ email: "sam@press.test", role: "staff" }])).toBeNull();
  });
});
