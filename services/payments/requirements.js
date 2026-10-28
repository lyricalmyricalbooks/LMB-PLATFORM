// What Stripe still needs from a press, in plain words (code plan 7.9). Stripe lists each missing detail as a field
// path in the account's `requirements` (https://docs.stripe.com/connect/embedded-onboarding): `currently_due` must be
// in by `current_deadline`, and what passes the deadline moves to `past_due`, where Stripe switches cards or payouts off.
// The words go to the press's admin and to the one past-due email, so they are written once, here.

// Most specific first: the first pattern that matches a field gives its words.
const WORDS = [
  [/^external_account$/, "your bank details"],
  [/^tos_acceptance\./, "your agreement to Stripe's terms"],
  [/^company\.verification\./, "a document showing your business is registered"],
  [/(^|\.)verification\.(additional_)?document$/, "a photo of your ID"],
  [/(^|\.)dob\./, "your date of birth"],
  [/(^|\.)(ssn_last_4|id_number)$/, "your ID number"],
  [/^company\.tax_id$/, "your business number"],
  [/^company\.(address|name|phone|structure)/, "your business details"],
  [/^business_profile\.url$/, "your shop's web address"],
  [/^business_profile\.(mcc|product_description)$/, "what you sell"],
  [/^business_profile\.support_/, "how shoppers can reach you"],
  [/^business_type$/, "what kind of business you are"],
  [/^settings\.payments\.statement_descriptor/, "the name on shoppers' card statements"],
  [/^(owners|directors|executives)(\.|$)/, "details about the press's owners"],
  [/(^|\.)address\./, "your home address"],
  [/(^|\.)(first_name|last_name)$/, "your name"],
  [/(^|\.)email$/, "your email address"],
  [/(^|\.)phone$/, "your phone number"],
  [/(^|\.)relationship\./, "your role at the press"],
];

/** Plain words for one of Stripe's requirement fields ("individual.dob.day" -> "your date of birth"). */
export function requirementWords(field) {
  const path = String(field ?? "")
    // A person on a company account: "person_1AbC.dob.day" reads like the owner's own details.
    .replace(/^person_[A-Za-z0-9]+\./, "individual.")
    .replace(/^(individual|representative)\./, "individual.");
  for (const [pattern, words] of WORDS) if (pattern.test(path)) return words;
  return "a few more details";
}

const list = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === "string" && item) : []);

/**
 * The account's requirements, as the admin shows them: each thing still needed once (past due first), whether it is
 * past due, and the deadline for the rest (ISO, or null when Stripe gave none).
 */
export function accountNeeds(account) {
  const requirements = account?.requirements ?? {};
  const pastDue = list(requirements.past_due);
  const currentlyDue = list(requirements.currently_due);
  const seen = new Map();
  for (const field of pastDue) if (!seen.has(requirementWords(field))) seen.set(requirementWords(field), true);
  for (const field of currentlyDue) if (!seen.has(requirementWords(field))) seen.set(requirementWords(field), false);
  const deadline = Number.isFinite(requirements.current_deadline) && requirements.current_deadline > 0
    ? new Date(requirements.current_deadline * 1000).toISOString()
    : null;
  return {
    needs: [...seen].map(([words, isPastDue]) => ({ words, pastDue: isPastDue })),
    deadline,
    pastDue: pastDue.length > 0,
    disabledReason: typeof requirements.disabled_reason === "string" ? requirements.disabled_reason : null,
  };
}

