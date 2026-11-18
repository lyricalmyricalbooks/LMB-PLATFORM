import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import * as shop from "./typeApproval";

const server = createRequire(import.meta.url)("../../functions/shared/typeApproval.js") as typeof shop;

describe.each([["shop", shop], ["server", server]])("types that need a check (%s copy)", (_name, rules) => {
  it("lists alcohol, supplements and CBD, and never drinks or groceries", () => {
    expect(rules.APPROVAL_TYPE_IDS.sort()).toEqual(["alcohol", "cbd", "supplements"]);
  });
  it("a wine may go on sale only once the shop's answer for wine is yes", () => {
    const wine = { typeId: "alcohol" };
    expect(rules.mayPublish(wine, null)).toBe(false);
    expect(rules.mayPublish(wine, { types: { alcohol: { state: "declined" } } })).toBe(false);
    expect(rules.mayPublish(wine, { types: { cbd: { state: "approved" } } })).toBe(false);
    expect(rules.mayPublish(wine, { types: { alcohol: { state: "approved" } } })).toBe(true);
    expect(rules.mayPublish({ typeId: "tops" }, null)).toBe(true);
  });
  it("says where the check stands: ask, waiting, declined with the reason, approved", () => {
    const wine = { typeId: "alcohol" };
    expect(rules.approvalStatus({ typeId: "tops" }, null)).toBeNull();
    expect(rules.approvalStatus(wine, null)?.state).toBe("ask");
    expect(rules.approvalStatus(wine, null, { state: "waiting", askedAt: "2026-11-18T10:00:00Z" })?.state).toBe("waiting");
    const no = { types: { alcohol: { state: "declined", reason: "No licence number", at: "2026-11-18T11:00:00Z" } } };
    expect(rules.approvalStatus(wine, no, { state: "waiting", askedAt: "2026-11-18T10:00:00Z" })).toMatchObject({ state: "declined", reason: "No licence number" });
    expect(rules.approvalStatus(wine, no, { state: "waiting", askedAt: "2026-11-18T12:00:00Z" })?.state).toBe("waiting");
    expect(rules.approvalStatus(wine, { types: { alcohol: { state: "approved" } } })?.state).toBe("approved");
  });
  it("cleans an ask", () => {
    const ask = rules.approvalAsk("alcohol", "Wine", "  licence 12 ".padEnd(900, "x"), "2026-11-18T10:00:00Z");
    expect(ask.note.length).toBe(rules.APPROVAL_NOTE_MAX);
    expect(ask).toMatchObject({ typeId: "alcohol", state: "waiting" });
  });
});

describe("firestore.rules carries the same list", () => {
  const rules = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
  it("in the publish check and the ask rule", () => {
    const lists = [...rules.matchAll(/in \[('alcohol'[^\]]*)\]/g)].map((m) => m[1].replace(/'/g, "").split(/,\s*/).sort());
    expect(lists.length).toBe(2);
    for (const list of lists) expect(list).toEqual([...shop.APPROVAL_TYPE_IDS].sort());
  });
});
