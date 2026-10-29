import { describe, expect, it } from "vitest";
import { pressDetailsFrom, pressDetailsPatch, pressDetailsProblems, type PressDetails } from "./pressDetails";

const full: PressDetails = {
  name: "Moth Press", email: "hello@mothpress.example", street: "12 Queen Street", city: "Toronto",
  state: "Ontario", zip: "M5H 2N2", country: "Canada",
};

describe("Get started, step 1: the press's details (plan 17.2)", () => {
  it("starts from what the shop already has, and on Canada when the country is blank", () => {
    expect(pressDetailsFrom({ info: { name: "Moth", email: "a@b.example" }, location: { street: "1 Main", city: "Hull" } }))
      .toEqual({ name: "Moth", email: "a@b.example", street: "1 Main", city: "Hull", state: "", zip: "", country: "Canada" });
    expect(pressDetailsFrom(undefined).country).toBe("Canada");
  });

  it("a complete form has no problems", () => {
    expect(pressDetailsProblems(full)).toEqual({});
  });

  it("names each blank required field, in plain words, and leaves the state optional", () => {
    const problems = pressDetailsProblems({ ...full, name: "  ", email: "", street: "", city: "", zip: "", country: "", state: "" });
    expect(Object.keys(problems).sort()).toEqual(["city", "country", "email", "name", "street", "zip"]);
    expect(problems.email).toBe("Add an email address customers can write to.");
    expect(pressDetailsProblems({ ...full, state: "" })).toEqual({});
  });

  it("refuses an email without an @ and a domain, and a press name over 100 characters", () => {
    expect(pressDetailsProblems({ ...full, email: "hello-at-mothpress" }).email).toMatch(/doesn't look right/);
    expect(pressDetailsProblems({ ...full, email: "hello@mothpress" }).email).toMatch(/doesn't look right/);
    expect(pressDetailsProblems({ ...full, name: "x".repeat(101) }).name).toMatch(/100 characters/);
  });

  it("writes into the same info and location fields Settings uses, trimmed, and keeps the rest of them", () => {
    const settings = { info: { name: "Old", email: "old@x.example", hours: "9-5" }, location: { street: "", phone: "416 555 0100" } };
    const patch = pressDetailsPatch(settings, { ...full, name: "  Moth Press  ", street: " 12 Queen Street " });
    expect(patch.info).toEqual({ name: "Moth Press", email: "hello@mothpress.example", hours: "9-5" });
    expect(patch.location).toEqual({ street: "12 Queen Street", city: "Toronto", state: "Ontario", zip: "M5H 2N2", country: "Canada", phone: "416 555 0100" });
  });
});
