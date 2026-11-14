import { test } from "node:test";
import assert from "node:assert/strict";
import { stale, COPIES, PAGE_FOLDERS } from "./sync.mjs";

test("both apps' copies of the admin look match the shared source", () => {
  assert.deepEqual(stale(), [], "run: node shared/admin-look/sync.mjs");
});

test("the shop and the stockroom each get every shared file", () => {
  for (const { to, pagesOnly } of COPIES) {
    if (pagesOnly) continue;
    assert.ok(to.some((t) => t.startsWith("apps/shop/")));
    assert.ok(to.some((t) => t.startsWith("apps/stockroom/")));
  }
});

test("every platform page folder gets the whole look", () => {
  for (const folder of PAGE_FOLDERS) {
    for (const from of ["adminThemes.css", "pressroom.css", "colophon.css", "platform-pages.css", "platform-look.js"]) {
      assert.ok(COPIES.some((copy) => copy.from === from && copy.to.includes(`${folder}/look/${from}`)), `${folder}/look/${from}`);
    }
  }
});

test("the platform pages layer names no colour of its own", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("./platform-pages.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.deepEqual(css.match(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/gi) ?? [], []);
});

test("a drawer's long content scrolls inside it instead of stretching it past the screen", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("./pressroom.css", import.meta.url), "utf8");
  const rule = css.split("\n").find((line) => line.startsWith('.rp-dialog-root[data-variant="drawer"] {'));
  assert.ok(rule, "the drawer root rule exists");
  // Without a fixed row, the grid grows to the content's height and the body never scrolls (the shop record was unreachable below "The record").
  assert.match(rule, /grid-template-rows:\s*minmax\(0,\s*1fr\)/);
});
