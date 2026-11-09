// What a shop sells, next to what its Stripe account says it sells (code plan 12.18). The sign-up answer is the
// registry's `publishes`; an owner who changes it later in Settings saves it in the shop's own `firstWeek/start.sells`
// (shared/sells/sells.js sellsOf). Stripe's merchant category is set when the account is made and can't be changed from
// here, so a shop whose answer now maps to another category is worth a look in Stripe. The registry keeps the category
// Stripe gave the account (`payments.mcc`, from account creation and every account.updated). Read only.
import { PUBLISHES } from "../signup/form.js";
import { merchantProfile, sellsBooks } from "../shared/sells/sells.js";

/** Stripe's merchant categories the platform files accounts under, in plain words. */
const CATEGORY_WORDS = Object.freeze({
  5942: "Book stores", 5971: "Art dealers and galleries", 5651: "Clothing", 5661: "Shoes", 5944: "Jewellery", 5735: "Record stores", 5999: "Specialty retail",
});

const label = (answer) => PUBLISHES.options.find((option) => option.id === answer)?.label ?? answer;
export const categoryWords = (mcc) => (mcc ? CATEGORY_WORDS[mcc] ?? `category ${mcc}` : null);

/**
 * `answer` the shop's current answer (null when skipped), `payments` its registry payments record. Returns the words for
 * the answer, the category it maps to, the category Stripe holds (null when not known yet or not a Stripe account), and
 * `mismatch` when both are known and differ.
 */
export function sellsFacts(answer, payments) {
  const expected = merchantProfile(answer).mcc;
  const stripe = payments?.provider === "stripe" && typeof payments.mcc === "string" && payments.mcc ? payments.mcc : null;
  return {
    answer: answer ?? null,
    words: answer ? label(answer) : "Not answered (treated as books)",
    books: sellsBooks(answer),
    expected,
    stripe,
    mismatch: Boolean(stripe && stripe !== expected),
  };
}

/** One line for the shop record: the answer, then what Stripe holds or would be given. */
export function sellsLine(facts) {
  if (!facts) return "";
  const kind = facts.stripe
    ? facts.mismatch
      ? `Stripe files it as ${categoryWords(facts.stripe)}, but this answer fits ${categoryWords(facts.expected)}: check the account's business details in Stripe`
      : `Stripe files it as ${categoryWords(facts.stripe)}`
    : `a new Stripe account is filed as ${categoryWords(facts.expected)}`;
  return `${facts.words} · ${kind}`;
}
