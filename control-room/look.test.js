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
  // The Colophon look (design handoff "Bento redesign"): its tokens, then the room's own layer, on a `.rp.cl` root.
  assert.match(page, /href="\.\/look\/colophon\.css"[\s\S]*href="\.\/room\.css"/);
  assert.match(page, /class="rp cl" id="room"/);
  const room = readFileSync(new URL("./room.css", import.meta.url), "utf8");
  assert.doesNotMatch(room, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, "room.css takes every colour from colophon.css");
  assert.doesNotMatch(room, /outline:\s*(none|0)\b/, "no focus outline is removed");
  const style = page.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
  assert.doesNotMatch(style, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, "colours come from the admin's tokens only");
});
