import { describe, expect, it } from "vitest";
import { deriveOnHand } from "@stockroom/inventory.js";
import { stitchState } from "@stockroom/merge-state.js";

import { partTextsOf, planSave, UnreadablePartError, type BookState } from "./planSave";

const book = { id: "b1", title: "B1", maxPrint: 100 };
const sale = (n: number, extra: object = {}) => ({ num: `O${n}`, chan: "Website", qty: 1, price: 20, date: `2026-11-0${n}`, notes: "", sheetsId: `web-${n}`, ...extra });
const stateOf = (hist: object[], extra: BookState = {}): BookState => ({ ...stitchState({ metadata: { stock: 100 - hist.length, ...extra } }), hist });
const text = (state: BookState) => partTextsOf(state);

describe("planSave", () => {
  it("writes only what changed and sets the on-hand count from the rows, leaving the caller's copy alone", () => {
    const base = stateOf([sale(1)]);
    const local = stateOf([sale(2), sale(1)]);
    const frozen = JSON.stringify(local);
    const plan = planSave({ base: text(base), remote: text(base), local, book });
    expect(plan.merged).toBe(false);
    expect(Object.keys(plan.writes).sort()).toEqual(["hist", "metadata"]);
    expect((plan.state.hist as unknown[]).length).toBe(2);
    expect(plan.state.stock).toBe(deriveOnHand(plan.state, book));
    expect(plan.state.stock).toBe(98);
    expect(JSON.stringify(local)).toBe(frozen);
  });

  it("keeps both devices' sales when each added one, and counts the stock from both", () => {
    const base = stateOf([sale(1)]);
    const remote = stateOf([sale(3), sale(1)]);
    const local = stateOf([sale(2), sale(1)]);
    const plan = planSave({ base: text(base), remote: text(remote), local, book });
    expect(plan.merged).toBe(true);
    expect(plan.conflicts).toEqual([]);
    expect((plan.state.hist as Array<{ num: string }>).map((r) => r.num).sort()).toEqual(["O1", "O2", "O3"]);
    expect(plan.state.stock).toBe(97);
    expect(JSON.parse(plan.writes.hist)).toHaveLength(3);
  });

  it("keeps a void made here when the other device adds a sale, and the voided copy is not counted", () => {
    const base = stateOf([sale(1), sale(2)]);
    const local = stateOf([sale(1), sale(2, { voided: true })]);
    const remote = stateOf([sale(3), sale(1), sale(2)]);
    const plan = planSave({ base: text(base), remote: text(remote), local, book });
    const rows = plan.state.hist as Array<{ num: string; voided?: boolean }>;
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.num === "O2")?.voided).toBe(true);
    expect(rows.find((r) => r.num === "O3")?.voided).toBeUndefined();
    expect(plan.state.stock).toBe(98);
  });

  it("keeps a void here and a corrected note there on the same sale", () => {
    const base = stateOf([sale(1)]);
    const local = stateOf([sale(1, { voided: true })]);
    const remote = stateOf([sale(1, { notes: "customer called" })]);
    const plan = planSave({ base: text(base), remote: text(remote), local, book });
    const row = (plan.state.hist as Array<Record<string, unknown>>)[0];
    expect(row.voided).toBe(true);
    expect(row.notes).toBe("customer called");
    expect(plan.conflicts).toEqual([]);
    expect(plan.state.stock).toBe(100);
  });

  it("reports a row both devices changed the same way apart, keeps this device's, and hands over the other version", () => {
    const base = stateOf([sale(1)]);
    const local = stateOf([sale(1, { notes: "mine" })]);
    const remote = stateOf([sale(1, { notes: "theirs" })]);
    const plan = planSave({ base: text(base), remote: text(remote), local, book });
    expect((plan.state.hist as Array<{ notes: string }>)[0].notes).toBe("mine");
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0].part).toBe("hist");
    expect(plan.conflicts[0].remote).toMatchObject({ notes: "theirs" });
  });

  it("takes in another device's rows for a part this page did not change, so the count adds up", () => {
    const base = stateOf([sale(1)], { note: "a" });
    const local = stateOf([sale(1)], { note: "b" }); // only the book's own details changed
    const remote = stateOf([sale(2), sale(1)], { note: "a" }); // the other device sold a copy
    const plan = planSave({ base: text(base), remote: text(remote), local, book });
    expect((plan.state.hist as unknown[]).length).toBe(2);
    expect(plan.state.note).toBe("b");
    expect(plan.state.stock).toBe(98);
    // the page never edited sales, yet the stored copy is what the cloud holds plus the new count; nothing is lost
    expect(plan.merged).toBe(true);
  });

  it("merges id-keyed lists (expenses) added on both devices", () => {
    const base = stateOf([]);
    const local = { ...base, expenses: [{ id: 1, amount: 5 }] };
    const remote = { ...base, expenses: [{ id: 2, amount: 7 }] };
    const plan = planSave({ base: text(base), remote: text(remote), local, book });
    expect((plan.state.expenses as Array<{ id: number }>).map((e) => e.id).sort()).toEqual([1, 2]);
  });

  it("writes nothing when the cloud already holds exactly this", () => {
    const base = stateOf([sale(1)]);
    const plan = planSave({ base: text(base), remote: text(base), local: base, book });
    expect(plan.writes).toEqual({});
    expect(plan.merged).toBe(false);
  });

  it("with no known base, unions the rows instead of dropping or doubling them", () => {
    const remote = stateOf([sale(1), sale(2)]);
    const local = stateOf([sale(1), sale(3)]);
    const plan = planSave({ base: {}, remote: text(remote), local, book });
    expect((plan.state.hist as Array<{ num: string }>).map((r) => r.num).sort()).toEqual(["O1", "O2", "O3"]);
  });

  it("refuses a stored part it cannot read rather than treating it as empty", () => {
    const base = stateOf([sale(1)]);
    const remote = { ...text(base), hist: "{not json" };
    expect(() => planSave({ base: text(base), remote, local: stateOf([sale(2), sale(1)]), book })).toThrow(UnreadablePartError);
  });

  it("leaves the count alone for an item with no print run", () => {
    const plain = { id: "x", title: "X" };
    const base = stateOf([sale(1)]);
    const local = { ...stateOf([sale(2), sale(1)]), stock: 55 };
    const plan = planSave({ base: text(base), remote: text(base), local, book: plain });
    expect(plan.state.stock).toBe(55);
  });
});
