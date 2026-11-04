import { describe, expect, it } from "vitest";
import type { PlanList, SetupPress } from "./door";
import { canCreate, createChecklist, freeUntil, makingSteps, planLine, priceWords, whatHappensNext } from "./launchWords";

const press = (over: Partial<SetupPress> = {}): SetupPress => ({
  pressId: "press-moth", status: "setup", plan: "shop", pressName: "Moth Press", sells: "zines", country: "CA", look: "press-riso", adminLook: "", stagedImport: null, ...over,
});
const plans: PlanList = { trialDays: 14, plusTax: true, termsVersion: "v1", plans: [
  { plan: "shop", name: "Shop", priceText: "$29.00", foundingPriceText: "$21.75" },
  { plan: "stockroom", name: "Stockroom", priceText: "$19.00" },
] };
const names = { countries: { CA: { name: "Canada" } }, sells: [{ id: "zines", label: "Zines" }], lookName: "Riso" };

describe("Create my shop's review", () => {
  it("lists the plan with its founding price, the press, the look and the books", () => {
    const rows = createChecklist(press(), plans, names);
    expect(rows.map((r) => [r.id, r.state, r.value])).toEqual([
      ["plan", "done", "Shop · $21.75 a month"],
      ["details", "done", "Moth Press · Zines · Canada"],
      ["look", "done", "Riso"],
      ["domain", "later", "Free address"],
      ["books", "later", "None yet"],
    ]);
    expect(canCreate(rows)).toBe(true);
  });

  it("needs only what the platform needs: a plan, the press's name and its country", () => {
    const rows = createChecklist(press({ plan: "", pressName: "", country: "", look: "", sells: "" }), plans, names);
    expect(rows.filter((r) => r.state === "needed").map((r) => r.id)).toEqual(["plan", "details"]);
    expect(rows.find((r) => r.id === "details")!.value).toBe("Add your press's name and your country.");
    expect(rows.find((r) => r.id === "look")!.state).toBe("later");
    expect(canCreate(rows)).toBe(false);
    expect(canCreate(createChecklist(press({ look: "", sells: "" }), plans, names))).toBe(true);
  });

  it("has no website look for a stockroom on its own, and says one book in the singular", () => {
    const rows = createChecklist(press({ plan: "stockroom", stagedImport: { name: "a.csv", size: 1, rows: 1, at: "" } }), plans, names);
    expect(rows.map((r) => r.id)).not.toContain("look");
    expect(rows.find((r) => r.id === "books")!.value).toMatch(/^1 book from a.csv/);
  });

  it("shows the web address: the press's own domain and where it was bought, or the free address it starts at", () => {
    const own = createChecklist(press({ domain: "mothpress.example", domainSeller: "GoDaddy", freeAddress: "moth-press.shops.example" }), plans, names).find((r) => r.id === "domain")!;
    expect(own).toMatchObject({ state: "done", value: "mothpress.example" });
    const free = createChecklist(press({ freeAddress: "moth-press.shops.example" }), plans, names).find((r) => r.id === "domain")!;
    expect(free.value).toBe("moth-press.shops.example");
    expect(createChecklist(press({ plan: "stockroom" }), plans, names).map((r) => r.id)).not.toContain("domain");
  });

  it("names the plan even before the prices load", () => {
    expect(planLine(press({ plan: "both" }), null)).toBe("Shop and stockroom");
  });
});

describe("the price beside the button", () => {
  it("says nothing is charged today, the free days and the monthly price", () => {
    expect(priceWords(press(), plans)).toBe("Nothing is charged today. Your first shop is free for 14 days, then $21.75 a month plus tax.");
    expect(priceWords(press({ plan: "stockroom" }), { ...plans, trialDays: 0, plusTax: false })).toBe("Nothing is charged today. Then $19.00 a month.");
    expect(priceWords(press(), null)).toBe("Nothing is charged today.");
  });
});

describe("what happens next", () => {
  it("tells a website press, in two lines, that its shop stays private until opened", () => {
    const lines = whatHappensNext("both");
    expect(lines[0]).toContain("We make your website and your stockroom");
    expect(lines[1]).toBe("It stays private until you open it.");
    expect(lines).toHaveLength(2);
  });

  it("has no opening step for a stockroom on its own", () => {
    expect(whatHappensNext("stockroom").join(" ")).not.toMatch(/shoppers/);
    expect(makingSteps("stockroom", {}).map((s) => s.id)).toEqual(["plan", "make", "email"]);
  });

  it("shows the free days' end, and why a shop waits its turn", () => {
    const steps = makingSteps("shop", { trialEnd: "2026-11-17T23:30:00Z", email: "owner@example.com" });
    expect(steps.map((s) => s.state)).toEqual(["done", "now", "next", "next"]);
    expect(steps[0].detail).toBe("It's free until 17 November.");
    expect(steps[2].detail).toContain("owner@example.com");
    const waiting = makingSteps("shop", { waiting: "You're next in line." });
    expect(waiting[1]).toMatchObject({ title: "Waiting for your turn", detail: "You're next in line." });
    expect(freeUntil("not a date")).toBe("");
  });
});
