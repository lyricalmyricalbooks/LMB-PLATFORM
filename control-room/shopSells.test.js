import { test } from "node:test";
import assert from "node:assert/strict";
import { sellsFacts, sellsLine, categoryWords } from "./shopSells.js";

test("a clothing shop filed as clothing matches", () => {
  const facts = sellsFacts("clothing", { provider: "stripe", accountId: "acct_1", mcc: "5651" });
  assert.equal(facts.words, "Clothing");
  assert.equal(facts.mismatch, false);
  assert.equal(sellsLine(facts), "Clothing · Stripe files it as Clothing");
});

test("an answer changed after the account was made is flagged", () => {
  const facts = sellsFacts("jewelry", { provider: "stripe", accountId: "acct_1", mcc: "5942" });
  assert.equal(facts.mismatch, true);
  assert.match(sellsLine(facts), /Stripe files it as Book stores, but this answer fits Jewellery/);
});

test("every books answer and a skipped answer fit book stores", () => {
  for (const answer of ["books", "zines", "comics", "mix", null]) {
    const facts = sellsFacts(answer, { provider: "stripe", mcc: "5942" });
    assert.equal(facts.mismatch, false, String(answer));
    assert.equal(facts.books, true);
  }
  assert.equal(sellsFacts(null, null).words, "Not answered (treated as books)");
});

test("no category known yet, or Square: nothing to compare", () => {
  assert.equal(sellsFacts("shoes", { provider: "stripe", accountId: "acct_1" }).mismatch, false);
  assert.equal(sellsFacts("shoes", { provider: "square", mcc: "5942" }).stripe, null);
  assert.equal(sellsLine(sellsFacts("shoes", null)), "Shoes · a new Stripe account is filed as Shoes");
});

test("every category the platform files under has words", () => {
  for (const answer of ["books", "mixed", "prints", "clothing", "shoes", "jewelry", "music", "other"]) {
    const { expected } = sellsFacts(answer, null);
    assert.doesNotMatch(categoryWords(expected), /^category /, answer);
  }
});
