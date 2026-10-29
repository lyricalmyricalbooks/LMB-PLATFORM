// The control room wears the website admin's look (docs/admin-look-plan.md): its copies of the colour tokens and the
// Pressroom styles must stay exactly the website admin's, so a change there is copied here in the same pull request.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SOURCE = new URL("../apps/shop/src/app/admin/riso/", import.meta.url);
const COPY = new URL("./look/", import.meta.url);

test("the control room's look files are exact copies of the website admin's", () => {
  for (const name of ["adminThemes.css", "riso.css"]) {
    assert.equal(readFileSync(new URL(name, COPY), "utf8"), readFileSync(new URL(name, SOURCE), "utf8"),
      `control-room/look/${name} differs from apps/shop/src/app/admin/riso/${name}: copy it again`);
  }
});

test("the page loads the look and names no colour of its own", () => {
  const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /href="\.\/look\/adminThemes\.css"/);
  assert.match(page, /href="\.\/look\/riso\.css"/);
  const style = page.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
  assert.doesNotMatch(style, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, "colours come from the admin's tokens only");
});
