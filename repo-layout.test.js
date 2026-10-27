// Keeps the folder map in README.md honest: every listed folder exists and explains itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const readme = readFileSync("README.md", "utf8");
const folders = [...readme.matchAll(/^\| `([^`]+)\/` \|/gm)].map((m) => m[1]);

test("README lists the platform folders", () => {
  assert.ok(folders.length >= 7, `found ${folders.length}`);
});

for (const folder of folders) {
  test(`${folder} has a README or is docs`, () => {
    const file = folder === "docs" ? "docs/decisions.md" : `${folder}/README.md`;
    assert.ok(existsSync(file), `${file} is missing`);
  });
}

test("waitlist page never names a rival platform", () => {
  const page = readFileSync("waitlist/index.html", "utf8").toLowerCase();
  for (const rival of ["big cartel", "bigcartel", "shopify", "squarespace", "etsy", "wix", "woocommerce"]) {
    assert.ok(!page.includes(rival), `waitlist names ${rival}`);
  }
});
