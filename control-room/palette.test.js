import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GROUPS, PLACES, findResults } from "./palette.js";

const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");

test("the find bar reaches every page of the control room", () => {
  const pages = [...page.matchAll(/data-page="([^"]+)"/g)].map((m) => m[1]);
  for (const id of pages) assert.ok(PLACES.some((p) => p.go === id), `the find bar goes to #${id}`);
  for (const place of PLACES) assert.ok(page.includes(`data-page="${place.go}"`) || page.includes(`id="${place.go}"`), `#${place.go} is on the page`);
});

test("shops come first when something is typed, matched on name, email or tag", () => {
  const shops = [
    { shopId: "fable", pressName: "Fable & Ink", ownerEmail: "press@fable.example" },
    { shopId: "quill", pressName: "Quill & Spine", ownerEmail: "hi@quill.example" },
  ];
  const found = findResults("fable", { shops });
  assert.equal(found[0].kind, "shop");
  assert.equal(found[0].shopId, "fable");
  assert.equal(findResults("zines", { shops, tags: { quill: ["zines"] } })[0].shopId, "quill");
  assert.deepEqual(findResults("", { shops }).filter((r) => r.kind === "shop"), [], "no shops until something is typed");
  assert.equal(findResults("", { shops, mode: "shops" }).length, 2, "Act as a shop lists the shops");
});

test("pages and actions match every word typed", () => {
  assert.ok(findResults("failed pay").some((r) => r.go === "failed-payments"));
  assert.ok(findResults("invite").some((r) => r.kind === "action" && r.go === "invite-form"));
  assert.ok(findResults("inbox").some((r) => r.go === "support"), "a group's name finds its pages");
  assert.deepEqual(findResults("nothing matches this"), []);
});

test("every page sits in exactly one of the five groups, and each tab is one of its group's pages", () => {
  const pages = [...page.matchAll(/data-page="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(GROUPS.length, 5);
  for (const id of pages) assert.equal(GROUPS.filter((g) => g.pages.includes(id)).length, 1, `#${id} is in one group`);
  for (const group of GROUPS) {
    for (const id of group.pages) assert.ok(pages.includes(id), `${group.name}: #${id} is a page`);
    for (const [id] of group.tabs ?? []) assert.ok(group.pages.includes(id), `${group.name} tab #${id}`);
    assert.match(page, new RegExp(`href="#${group.id}" data-nav="${group.id}"`), `${group.name} is in the menu`);
  }
});

test("the find bar opens either test shop by what it is: book test shop or general test shop", () => {
  const shops = [
    { shopId: "test-press", pressName: "Test Press", testShop: true, sells: { books: true } },
    { shopId: "test-goods", pressName: "Test Goods", testShop: true, sells: { books: false } },
    { shopId: "fable", pressName: "Fable & Ink", sells: { books: true } },
  ];
  const shopsFor = (typed) => findResults(typed, { shops }).filter((r) => r.kind === "shop").map((r) => r.shopId);
  assert.deepEqual(shopsFor("general test shop"), ["test-goods"]);
  assert.deepEqual(shopsFor("book test shop"), ["test-press"]);
  assert.deepEqual(shopsFor("test shop"), ["test-press", "test-goods"]);
});
