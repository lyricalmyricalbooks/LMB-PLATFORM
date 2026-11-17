// Ways to sell (beta): the six ways, the two switches that turn one on, and the shop's own copy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WAYS, WAY_IDS, wayOf, waysAllowed, waysIn, waysOn } from "./ways.js";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("the shop's copy lists the same ways with the same words", () => {
  const shop = read("apps/shop/src/shared/waysToSell.ts");
  const rows = [...shop.matchAll(/\{ id: "([a-z]+)", label: "([^"]+)", line: "([^"]+)" \}/g)].map(([, id, label, line]) => ({ id, label, line }));
  assert.deepEqual(rows, WAYS.map(({ id, label, line }) => ({ id, label, line })));
  assert.match(shop, new RegExp(`export type WayId = ${WAY_IDS.map((id) => `"${id}"`).join(" \\| ")};`));
});

test("the shop's rules let an owner save only these ways", () => {
  const rules = read("apps/shop/firestore.rules");
  assert.ok(rules.includes(`.keys().hasOnly([${WAY_IDS.map((id) => `"${id}"`).join(", ")}])`));
});

test("six ways, each with plain words", () => {
  assert.deepEqual(WAY_IDS, ["events", "classes", "digital", "giving", "memberships", "rentals"]);
  for (const way of WAYS) assert.ok(way.label && way.line.endsWith(".") && typeof way.built === "boolean", way.id);
  assert.equal(wayOf("rentals").label, "Rentals");
  assert.equal(wayOf("books"), null);
});

test("a way is on only when the platform allows it and the owner switched it on", () => {
  assert.deepEqual(waysIn({ rentals: true, events: true, classes: false, other: true, giving: "yes" }), ["events", "rentals"]);
  assert.deepEqual(waysIn(null), []);
  assert.deepEqual(waysAllowed({ bookings: true }), []);
  assert.deepEqual(waysOn({ ways: { events: true, digital: true } }, { ways: { events: true, rentals: true } }), ["events"]);
  assert.deepEqual(waysOn({ ways: { events: true } }, null), []);
  assert.deepEqual(waysOn(null, { ways: { events: true } }), []);
});
