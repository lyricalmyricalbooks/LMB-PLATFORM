import { describe, expect, it } from "vitest";
import { firstWeekIntro, firstWeekSteps, guideGroups, nextStep, openBlockers, progressToSave, SELLING_TODAY, shippingStarterWords, showFirstWeek, type FirstWeekFacts } from "./firstWeek";
import type { ReadinessItem } from "./launchReadiness";

const ok = (id: string): ReadinessItem => ({ id, label: "", detail: "", status: "ok", tab: id, action: "" });
const warn = (id: string): ReadinessItem => ({ ...ok(id), status: "warn" });
const block = (id: string): ReadinessItem => ({ ...ok(id), status: "block", label: `${id} blocks` });
const privateShop = { design: { showUnderConstruction: true } };
const none: FirstWeekFacts = { books: [], readiness: [], settings: privateShop, orders: [] };
const ids = (answer: string | null) => firstWeekSteps({ sellingToday: answer }, none).map(s => s.id);
const doneOf = (facts: FirstWeekFacts, doc = {}) => Object.fromEntries(firstWeekSteps(doc, facts).map(s => [s.id, s.done]));

describe("Set up your shop: one order, in three parts, the way a shop is built (plans 6.9 and 28)", () => {
  it("every answer gets the same steps: your shop, ready to sell, launch, then reach more shoppers", () => {
    for (const answer of [...SELLING_TODAY, null]) {
      // A press moving from another online shop has one more: the move itself, once its new shop is open (plan 23.8).
      const list = answer === "online" ? ids(answer).filter(id => id !== "switch") : ids(answer);
      expect(list.slice(1)).toEqual(["logo", "look", "shipping", "taxes", "payments", "policies", "address", "practice", "open", "google", "channels"]);
    }
    expect(guideGroups(firstWeekSteps({}, none)).map(g => [g.title, g.steps.map(s => s.id)])).toEqual([
      ["Your shop", ["add-books", "logo", "look"]],
      ["Ready to sell", ["shipping", "taxes", "payments", "policies"]],
      ["Launch", ["address", "practice", "open"]],
      ["Reach more shoppers", ["google", "channels"]],
    ]);
  });
  it("every check that stops Open your shop is a step before it", () => {
    // Ready to sell's blocks (launchReadiness.ts): books, shipping, payments or the card account, and policies.
    const steps = firstWeekSteps({}, none).map(s => s.id);
    for (const step of ["add-books", "shipping", "payments", "policies"]) expect(steps.indexOf(step)).toBeLessThan(steps.indexOf("open"));
  });
  it("a press moving from another online shop moves right after opening, ticked by hand (plan 23.8)", () => {
    const list = ids("online");
    expect(list.indexOf("switch")).toBe(list.indexOf("open") + 1);
    const step = firstWeekSteps({ sellingToday: "online" }, none).find(s => s.id === "switch")!;
    expect(step).toMatchObject({ id: "switch", kind: "manual", done: false, tab: "general", action: "Check your old links", group: "launch" });
    expect(firstWeekSteps({ sellingToday: "online", done: { switch: "2026-11-03" } }, none).find(s => s.id === "switch")!.done).toBe(true);
    for (const answer of SELLING_TODAY.filter((a) => a !== "online")) expect(ids(answer)).not.toContain("switch");
  });
  it("the first-book step follows the answer, and always comes first: bring your shop, import the spreadsheet, or add a book", () => {
    expect(ids("online")[0]).toBe("bring-books");
    expect(ids("spreadsheet")[0]).toBe("import-spreadsheet");
    expect(ids("fairs")[0]).toBe("add-books");
    expect(ids(null)[0]).toBe("add-books");
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
  it("books, logo, look, shipping, taxes, payments, policies, address, practice order and opening", () => {
    const facts: FirstWeekFacts = {
      books: [{ id: "a", status: "draft" }],
      readiness: [ok("shipping"), ok("tax"), ok("card-account"), ok("policies")],
      orders: [{ isTest: true, paymentStatus: "refunded" }],
      settings: { design: { logoUrl: "https://x.example/logo.png", themeBase: { id: "press-zine" }, showUnderConstruction: true }, domain: { custom: "press.example" } },
      platform: "stripe",
    };
    expect(doneOf(facts, { google: { at: "t", connected: true } })).toEqual({ "add-books": true, logo: true, look: true, shipping: true, taxes: true, payments: true, policies: true, address: true, practice: true, open: false, google: true, channels: false });
    expect(doneOf({ ...facts, settings: { ...facts.settings, design: { ...facts.settings.design, showUnderConstruction: false } } }).open).toBe(true);
  });
  it("nothing is done for a brand-new private shop, and a warning keeps a step open", () => {
    const done = doneOf({ ...none, readiness: [warn("shipping"), warn("tax"), warn("card-account"), block("policies")], platform: "stripe" });
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
  it("the owner can tick the web address, sales tax (not registered yet) and social media, and nothing a sale needs", () => {
    const steps = firstWeekSteps({ done: { address: "t", taxes: "t", channels: "t", logo: "t", policies: "t" } }, none);
    expect(steps.filter(s => s.done).map(s => s.id)).toEqual(["taxes", "address", "channels"]);
    expect(steps.filter(s => s.kind === "manual").map(s => [s.id, s.tickLabel])).toEqual([["taxes", "I don't collect tax yet"], ["address", "Keep the free address"], ["channels", undefined]]);
  });
  it("tax rates set (or tax switched off) tick the tax step by themselves", () => {
    expect(firstWeekSteps({}, { ...none, readiness: [ok("tax")] }).find(s => s.id === "taxes")).toMatchObject({ kind: "auto", done: true });
  });
  it("the policies and web address steps open right at their card on General's Store details tab", () => {
    const steps = firstWeekSteps({}, none);
    expect(steps.find(s => s.id === "policies")).toMatchObject({ hash: "#settings/general/details", anchor: "gs-policies", action: "Write your policies" });
    expect(steps.find(s => s.id === "address")).toMatchObject({ hash: "#settings/general/details", anchor: "gs-domain" });
    expect(steps.find(s => s.id === "google")).toMatchObject({ hash: "#settings/google" });
  });
  it("Google says it's coming while Google approves the sign-in", () => {
    expect(firstWeekSteps({ google: { at: "t", coming: true } }, none).find(s => s.id === "google")!.why).toMatch(/^Coming soon/);
  });
});

describe("the next step opens; parts count their own steps", () => {
  it("the next step is the first open one that isn't optional", () => {
    const steps = firstWeekSteps({}, { ...none, books: [{ id: "a" }], settings: { design: { logoUrl: "x", themeBase: { id: "t" }, showUnderConstruction: true } } });
    expect(nextStep(steps)?.id).toBe("shipping");
    const onlyAddress = steps.map(s => ({ ...s, done: s.id !== "address" }));
    expect(nextStep(onlyAddress)?.id).toBe("address");
    expect(nextStep(steps.map(s => ({ ...s, done: true })))).toBeNull();
    expect(guideGroups(steps).map(g => g.done)).toEqual([3, 0, 0, 0]);
  });
  it("the web address, Google and social media are optional", () => {
    expect(firstWeekSteps({}, none).filter(s => s.optional).map(s => s.id)).toEqual(["address", "google", "channels"]);
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
    expect(first.steps).toHaveLength(12);
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
    // Optional steps left over never keep the guide on Home.
    expect(showFirstWeek(doc, firstWeekSteps(doc, none).map(s => ({ ...s, done: !s.optional })))).toBe(false);
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
