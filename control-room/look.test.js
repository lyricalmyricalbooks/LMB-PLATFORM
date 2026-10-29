// The control room wears the admin look (docs/admin-look-plan.md): shared/admin-look/sync.mjs writes its copies into
// look/ and shared/admin-look/admin-look.test.js keeps them matching the source. This checks the page uses them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COPIES } from "../shared/admin-look/sync.mjs";

test("the page loads the shared look and names no colour of its own", () => {
  for (const { to } of COPIES.filter((copy) => !copy.pagesOnly)) assert.ok(to.some((t) => t.startsWith("control-room/look/")), "the control room gets every shared file");
  const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /href="\.\/look\/adminThemes\.css"/);
  assert.match(page, /href="\.\/look\/pressroom\.css"/);
  const style = page.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
  assert.doesNotMatch(style, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, "colours come from the admin's tokens only");
});
