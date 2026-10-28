import { describe, expect, it } from "vitest";
import { firstWeekIntro, firstWeekSteps, SELLING_TODAY, showFirstWeek } from "./firstWeek";
import type { ReadinessItem } from "./launchReadiness";

const ok = (id: string): ReadinessItem => ({ id, label: "", detail: "", status: "ok", tab: id, action: "" });
const warn = (id: string): ReadinessItem => ({ ...ok(id), status: "warn" });
const none = { books: [], readiness: [] };
const ids = (answer: string | null) => firstWeekSteps({ sellingToday: answer }, none).map(s => s.id);

describe("first week steps follow the sign-up answer", () => {
  it("moving from another online shop starts by bringing the shop over and ends with the address", () => {
    expect(ids("online")).toEqual(["bring-books", "bring-customers", "photos", "look", "shipping", "payments", "publish", "address"]);
  });
  it("each answer has its own first step, and no answer (or an unknown one) gets the general list", () => {
    expect(ids("spreadsheet")[0]).toBe("import-spreadsheet");
    expect(ids("shops")).toContain("isbn");
    expect(ids("fairs")).toContain("fair");
    expect(ids("starting")).toEqual(ids(null));
    expect(ids("something-else")).toEqual(ids(null));
    for (const answer of SELLING_TODAY) expect(ids(answer).length).toBeLessThanOrEqual(8);
  });
  it("the fair step only sends the owner to the stockroom when it is in their plan", () => {
    const why = (plan: string) => firstWeekSteps({ sellingToday: "fairs", plan }, none).find(s => s.id === "fair")!.why;
    expect(why("both")).toContain("stockroom");
    expect(why("shop")).not.toContain("stockroom");
  });
});

describe("done", () => {
  it("steps the shop can check tick themselves from books and the launch checks", () => {
    const books = [
      { id: "a", status: "published", photos: [{ url: "x" }], isbn: "978-0-306-40615-7" },
      { id: "b", status: "draft", photos: [{ url: "y" }], isbn: "0306406152" },
    ];
    const steps = firstWeekSteps({ sellingToday: "shops" }, { books, readiness: [ok("shipping"), ok("payments")] });
    const done = Object.fromEntries(steps.map(s => [s.id, s.done]));
    expect(done).toMatchObject({ "add-books": true, isbn: true, photos: true, shipping: true, payments: true, publish: true, share: false });
    expect(steps.find(s => s.id === "share")!.kind).toBe("manual");
  });
  it("a missing photo, a draft-only catalogue or a warning keeps the step open", () => {
    const steps = firstWeekSteps({}, { books: [{ status: "draft" }], readiness: [warn("shipping"), ok("payments"), warn("stripe-secret")] });
    const done = Object.fromEntries(steps.map(s => [s.id, s.done]));
    expect(done).toMatchObject({ "add-books": true, photos: false, publish: false, shipping: false, payments: false });
  });
  it("the owner's ticks count for the steps the shop can't check", () => {
    const steps = firstWeekSteps({ sellingToday: "online", done: { "bring-customers": "2026-10-28", address: "2026-10-29" } }, none);
    expect(steps.filter(s => s.done).map(s => s.id)).toEqual(["bring-customers", "address"]);
  });
});

describe("showing the list", () => {
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
