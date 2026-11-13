// The way out of Colophon (Julian, 12 November 2026): a press must always find how to download its shop, cancel and
// close. The shop's own test (apps/shop/src/app/admin/closeShop.test.tsx) keeps the card on Settings › Billing; this one
// keeps the directions to it: the help answer, the account page's link and the timeline the card promises.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ARTICLES } from "./help/articles.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the help centre answers how to cancel and close, with the way there", () => {
  const article = ARTICLES.find((a) => a.id === "close-shop");
  assert.ok(article, "a close-shop answer");
  assert.match(article.question, /cancel/i);
  assert.ok(article.where.includes("Settings › Billing"));
  assert.match(article.answer.join(" "), /Close your shop/);
  assert.ok(article.steps.some((s) => /Download your shop/.test(s)) && article.steps.some((s) => /Cancel plan/.test(s)));
});

test("the account page leads to the shop's Close your shop steps", () => {
  const app = read("./accounts/app.js");
  assert.match(app, /textContent: "Close this shop"/);
  assert.match(app, /\/admin\/#settings\/billing\/close/);
  assert.match(read("./accounts/billing.html"), /Settings › Billing › Close your shop/);
});

test("the shop's address for the card is one it really opens", () => {
  assert.match(read("./apps/shop/src/app/admin/adminRoute.ts"), /billing: \[\["", "billing"\], \["close", "close-shop"\]\]/);
});

test("the timeline on the card is the closing the platform runs", () => {
  const closing = read("./services/billing/closing.js");
  assert.match(closing, /60 days paused, then 90 days/);
  assert.match(closing, /emails 30 and 7 days before/);
  const card = read("./apps/shop/src/app/admin/closeShop.ts");
  for (const part of ["90 days", "30 and 7 days", "60 days"]) assert.ok(card.includes(part), part);
});
