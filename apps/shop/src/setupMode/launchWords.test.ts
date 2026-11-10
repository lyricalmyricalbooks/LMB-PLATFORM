import { describe, expect, it } from "vitest";
import type { PlanList, SetupPress } from "./door";
import { canCreate, createChecklist, freeUntil, makingSteps, openAdminLabel, planLine, priceWords, whatHappensNext } from "./launchWords";

const press = (over: Partial<SetupPress> = {}): SetupPress => ({
  pressId: "press-moth", status: "setup", plan: "both", pressName: "Moth Press", sells: "zines", country: "CA", look: "press-riso", adminLook: "", stagedImport: null, ...over,
});
const plans: PlanList = { trialDays: 14, plusTax: true, termsVersion: "v1", plans: [
  { plan: "both", name: "Shop and stockroom", priceText: "$5.00", foundingPriceText: "$3.75" },
] };
const names = { countries: { CA: { name: "Canada" } }, sells: [{ id: "zines", label: "Zines" }], lookName: "Riso" };

describe("Create my shop's review", () => {
  it("shows the card provider the press picked, which never stops Create my shop", () => {
    const square = createChecklist(press({ cardProvider: "square" }), plans, names).find((r) => r.id === "cards")!;
    expect([square.state, square.value, square.page]).toEqual(["done", "Square", "settings/payments"]);
    expect(createChecklist(press({ cardProvider: "stripe" }), plans, names).find((r) => r.id === "cards")!.value).toBe("Stripe");
  });

  it("lists the plan with its founding price, the press, the look and the books", () => {
    const rows = createChecklist(press(), plans, names);
    expect(rows.map((r) => [r.id, r.state, r.value])).toEqual([
      ["plan", "done", "Shop and stockroom · $3.75 a month + running cost"],
      ["details", "done", "Moth Press · Zines · Canada"],
      ["look", "done", "Riso"],
      ["cards", "later", "Stripe (default)"],
      ["domain", "later", "Free address"],
      ["books", "later", "None yet"],
    ]);
    expect(canCreate(rows)).toBe(true);
  });

  it("needs only what the platform needs: the press's name and its country (the plan is always set)", () => {
    const rows = createChecklist(press({ plan: "", pressName: "", country: "", look: "", sells: "" }), plans, names);
    expect(rows.filter((r) => r.state === "needed").map((r) => r.id)).toEqual(["details"]);
    expect(rows.find((r) => r.id === "details")!.value).toBe("Add your press's name and your country.");
    expect(rows.find((r) => r.id === "look")!.state).toBe("later");
    expect(canCreate(rows)).toBe(false);
    expect(canCreate(createChecklist(press({ look: "", sells: "" }), plans, names))).toBe(true);
  });

  it("gives an older stockroom-only record the website's rows too, and says one book in the singular", () => {
    const rows = createChecklist(press({ plan: "stockroom", stagedImport: { name: "a.csv", size: 1, rows: 1, at: "" } }), plans, names);
    expect(rows.map((r) => r.id)).toContain("look");
    expect(rows.map((r) => r.id)).toContain("cards");
    expect(rows.find((r) => r.id === "books")!.value).toMatch(/^1 book from a.csv/);
  });

  it("shows the web address: the press's own domain and where it was bought, or the free address it starts at", () => {
    const own = createChecklist(press({ domain: "mothpress.example", domainSeller: "GoDaddy", freeAddress: "moth-press.shops.example" }), plans, names).find((r) => r.id === "domain")!;
    expect(own).toMatchObject({ state: "done", value: "mothpress.example" });
    const free = createChecklist(press({ freeAddress: "moth-press.shops.example" }), plans, names).find((r) => r.id === "domain")!;
    expect(free.value).toBe("moth-press.shops.example");
    expect(createChecklist(press({ plan: "stockroom" }), plans, names).map((r) => r.id)).toContain("domain");
  });

  it("names the plan even before the prices load", () => {
    expect(planLine(press({ plan: "both" }), null)).toBe("Shop and stockroom");
  });
});

describe("the price beside the button", () => {
  it("says nothing is charged today, the free days and the monthly price", () => {
    expect(priceWords(press(), plans)).toBe("Nothing is charged today. Your first shop is free for 14 days, then $3.75 a month plus running cost plus tax.");
    expect(priceWords(press({ plan: "stockroom" }), { ...plans, trialDays: 0, plusTax: false })).toBe("Nothing is charged today. Then $3.75 a month plus running cost.");
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

  it("follows the making in plain words, and once ready points to the next thing to do (code plan 18.9)", () => {
    const making = makingSteps("both", { making: { status: "making", done: 7, total: 20, now: "putting your shop's pages online", message: "" } });
    expect(making[1]).toMatchObject({ title: "Making your website and your stockroom", detail: "Now putting your shop's pages online. 7 of 20 steps done.", progress: { done: 7, total: 20 } });
    const help = makingSteps("shop", { making: { status: "needs-help", done: 9, total: 20, now: "", message: "It needs a hand from us." } });
    expect(help[1]).toMatchObject({ title: "We're finishing it by hand", detail: "It needs a hand from us." });
    const ready = makingSteps("both", { ready: true, email: "owner@example.com" });
    expect(ready.map((s) => [s.id, s.state])).toEqual([["plan", "done"], ["make", "done"], ["email", "done"], ["open", "now"]]);
    expect(ready[1].title).toBe("Your website and your stockroom are made");
    expect(makingSteps("stockroom", { ready: true }).map((s) => s.id)).toEqual(["plan", "make", "email"]);
    expect([openAdminLabel("stockroom"), openAdminLabel("both")]).toEqual(["Open my stockroom", "Open my shop's admin"]);
    // A press that waited in line follows the making once it starts, not the line's old words.
    const started = makingSteps("shop", { waiting: "You're next in line.", making: { status: "making", done: 2, total: 20, now: "setting up your shop's sign-in", message: "" } });
    expect(started[1].title).toBe("Making your website");
    expect(makingSteps("shop", { waiting: "You're next in line.", making: { status: "in-line", done: 0, total: 20, now: "", message: "" } })[1].title).toBe("Waiting for your turn");
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
