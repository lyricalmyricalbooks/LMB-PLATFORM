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

// Julian, 14 November 2026: field labels and the "What happens next" list still showed a smeared typewriter face.
// Field labels are Archivo (v4 handoff "Field"); DM Mono is never faked bold; dialogs carry no emoji badge.
test("field labels are Archivo, never the mono face, and mono is never faked bold", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("./pressroom.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = css.split("}").filter((rule) => /\.rp-label\b/.test(rule.split("{")[0]) && /\{/.test(rule));
  for (const rule of rules) {
    const [selector, body] = rule.split("{");
    if (selector.includes("studio-editor)") && !selector.includes(":not(.studio-editor)")) continue;
    assert.doesNotMatch(body, /--rp-font-mono/, `mono label rule: ${selector.trim()}`);
  }
  assert.match(css, /:root\[data-admin-look="colophon"\] \.rp \{ font-synthesis-weight: none; \}/);
});

test("no admin dialog wears an emoji badge", async () => {
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const root = new URL("../../apps/shop/src/app/admin/", import.meta.url).pathname;
  const hits = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith(".tsx") && /\sbadge="/.test(readFileSync(path, "utf8"))) hits.push(path);
    }
  };
  walk(root);
  assert.deepEqual(hits, []);
});
