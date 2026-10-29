import { describe, expect, it } from "vitest";
import { firstWeekIntro, firstWeekSteps, guideParts, openBlockers, progressToSave, SELLING_TODAY, shippingStarterWords, showFirstWeek, type FirstWeekFacts } from "./firstWeek";
import type { ReadinessItem } from "./launchReadiness";

const ok = (id: string): ReadinessItem => ({ id, label: "", detail: "", status: "ok", tab: id, action: "" });
const warn = (id: string): ReadinessItem => ({ ...ok(id), status: "warn" });
const block = (id: string): ReadinessItem => ({ ...ok(id), status: "block", label: `${id} blocks` });
const privateShop = { design: { showUnderConstruction: true } };
const none: FirstWeekFacts = { books: [], readiness: [], settings: privateShop, orders: [] };
const ids = (answer: string | null) => firstWeekSteps({ sellingToday: answer }, none).map(s => s.id);
const doneOf = (facts: FirstWeekFacts, doc = {}) => Object.fromEntries(firstWeekSteps(doc, facts).map(s => [s.id, s.done]));

describe("Set up your shop: eight steps, ordered by the sign-up answer (plan 6.9)", () => {
  it("every answer gets the same eight steps, with Open your shop last and the practice order just before it", () => {
    for (const answer of [...SELLING_TODAY, null]) {
      const list = ids(answer);
      expect(list).toHaveLength(8);
      expect(list.slice(-2)).toEqual(["practice", "open"]);
      for (const step of ["logo", "look", "shipping", "payments", "address"]) expect(list).toContain(step);
    }
  });
  it("the first-book step follows the answer: bring your shop, import the spreadsheet, or add a book", () => {
    expect(ids("online")[0]).toBe("bring-books");
    expect(ids("spreadsheet")[0]).toBe("import-spreadsheet");
    expect(ids("fairs").slice(0, 2)).toEqual(["add-books", "payments"]);
    expect(ids(null).slice(0, 3)).toEqual(["logo", "look", "add-books"]);
    expect(ids("something-else")).toEqual(ids(null));
    expect(firstWeekSteps({ sellingToday: "online" }, none)[0].title).toBe("Bring your shop with you");
  });
  it("Gmail is never a step: platform email works from the start", () => {
    for (const answer of SELLING_TODAY) expect(firstWeekSteps({ sellingToday: answer }, none).map(s => `${s.title} ${s.why}`).join(" ")).not.toMatch(/gmail|app password/i);
  });
  it("the shipping step names the starter for the press's country", () => {
    expect(shippingStarterWords("CA")).toContain("filled in");
    const why = (country: string) => firstWeekSteps({ country }, none).find(s => s.id === "shipping")!.why;
    expect(why("US")).toContain("United States");
    expect(why("GB")).toContain("where you send books from");
  });
  it("Get paid speaks of the card company's own page, and of Square for a Square shop", () => {
    const why = (platform: "stripe" | "square" | null) => firstWeekSteps({}, { ...none, platform }).find(s => s.id === "payments")!;
    expect(why("stripe").title).toBe("Get paid");
    expect(why("stripe").why).toContain("own secure page");
    expect(why("square").why).toContain("Square");
  });
});

describe("steps tick themselves from the shop", () => {
  it("logo, look, books, shipping, payments, address, practice order and opening", () => {
    const facts: FirstWeekFacts = {
      books: [{ id: "a", status: "draft" }],
      readiness: [ok("shipping"), ok("card-account")],
      orders: [{ isTest: true, paymentStatus: "refunded" }],
      settings: { design: { logoUrl: "https://x.example/logo.png", themeBase: { id: "press-zine" }, showUnderConstruction: true }, domain: { custom: "press.example" } },
      platform: "stripe",
    };
    expect(doneOf(facts)).toEqual({ logo: true, look: true, "add-books": true, shipping: true, payments: true, address: true, practice: true, open: false });
    expect(doneOf({ ...facts, settings: { ...facts.settings, design: { ...facts.settings.design, showUnderConstruction: false } } }).open).toBe(true);
  });
  it("nothing is done for a brand-new private shop, and a warning keeps a step open", () => {
    const done = doneOf({ ...none, readiness: [warn("shipping"), warn("card-account")], platform: "stripe" });
    expect(Object.values(done).every(v => v === false)).toBe(true);
  });
  it("a look still in the draft isn't done: the step says to publish it", () => {
    const step = firstWeekSteps({ welcome: { theme: "press-zine", at: "now" } }, none).find(s => s.id === "look")!;
    expect(step.done).toBe(false);
    expect(step.why).toContain("Publish");
  });
  it("a shop on its own keys counts payments from the payment checks", () => {
    expect(doneOf({ ...none, readiness: [ok("payments"), ok("stripe-secret")] }).payments).toBe(true);
    expect(doneOf({ ...none, readiness: [ok("payments"), warn("stripe-secret")] }).payments).toBe(false);
  });
  it("a paid practice order ticks the practice step; an unpaid one doesn't; an open shop has nothing left to practise", () => {
    expect(doneOf({ ...none, orders: [{ isTest: true, paymentStatus: "pending" }] }).practice).toBe(false);
    expect(doneOf({ ...none, orders: [{ isTest: true, paymentStatus: "paid" }] }).practice).toBe(true);
    expect(doneOf({ ...none, settings: {} }).practice).toBe(true);
  });
  it("the owner can tick the web address (keeping the free one), and only that step", () => {
    const steps = firstWeekSteps({ done: { address: "2026-10-28", logo: "2026-10-28" } }, none);
    expect(steps.filter(s => s.done).map(s => s.id)).toEqual(["address"]);
    expect(steps.filter(s => s.kind === "manual").map(s => s.id)).toEqual(["address"]);
  });
});

describe("three at a time, the rest under Later", () => {
  it("the next three open steps show; the others wait; done ones are listed apart", () => {
    const steps = firstWeekSteps({}, { ...none, settings: { design: { logoUrl: "x", showUnderConstruction: true } } });
    const { now, later, done } = guideParts(steps);
    expect(now.map(s => s.id)).toEqual(["look", "add-books", "shipping"]);
    expect(later.map(s => s.id)).toEqual(["payments", "address", "practice", "open"]);
    expect(done.map(s => s.id)).toEqual(["logo"]);
  });
});

describe("Open your shop runs Ready to sell first", () => {
  it("is blocked while a launch check blocks a sale, and free once none does", () => {
    expect(openBlockers([ok("shipping"), block("books"), warn("tax")]).map(i => i.id)).toEqual(["books"]);
    expect(openBlockers([ok("shipping"), warn("tax")])).toEqual([]);
    expect(openBlockers(null)).toEqual([]);
  });
});

describe("progress for the trial emails (plan 6.10)", () => {
  it("is saved when it changes and not again when it is the same", () => {
    const steps = firstWeekSteps({}, none);
    const first = progressToSave({}, steps, "t1")!;
    expect(first.steps).toHaveLength(8);
    expect(first.done).toEqual([]);
    expect(progressToSave({ progress: first }, steps, "t2")).toBeNull();
    const later = firstWeekSteps({}, { ...none, books: [{ id: "a" }] });
    expect(progressToSave({ progress: first }, later, "t3")!.done).toEqual(["add-books"]);
  });
});

describe("showing the guide", () => {
  it("only with the document, until hidden or every step is done", () => {
    const doc = { sellingToday: "starting" };
    expect(showFirstWeek(null, [])).toBe(false);
    expect(showFirstWeek(doc, firstWeekSteps(doc, none))).toBe(true);
    expect(showFirstWeek({ ...doc, hiddenAt: "now" }, firstWeekSteps(doc, none))).toBe(false);
    const all = firstWeekSteps(doc, none).map(s => ({ ...s, done: true }));
    expect(showFirstWeek(doc, all)).toBe(false);
  });
  it("the intro speaks to the answer", () => {
    expect(firstWeekIntro({ sellingToday: "online" })).toContain("another online shop");
    expect(firstWeekIntro({})).toContain("first sale");
  });
});

describe("setup guide words for a shop that sells something other than books (plan 12.1)", () => {
  const all = (doc: any) => firstWeekSteps(doc, none).map(s => `${s.title} ${s.why}`).join(" ") + " " + firstWeekIntro(doc);
  it("reads product, not book", () => {
    const text = all({ sellingToday: "fairs", publishes: "clothing" });
    expect(text).not.toMatch(/\bbooks?\b|\bauthors?\b/i);
    expect(text).toContain("products");
  });
  it("leaves a books shop, a skipped answer and an unknown answer as they are", () => {
    const books = all({ sellingToday: "fairs", publishes: "books" });
    expect(books).toMatch(/\bbook\b/);
    for (const publishes of [undefined, null, "zines", "mix", "mystery"]) expect(all({ sellingToday: "fairs", publishes })).toBe(books);
  });
});
