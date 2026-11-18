// The Membership page and the account's membership card inside Studio's preview: two sample plans and a sample member,
// so an owner can design both before anyone joins, whether or not Memberships is switched on. Only a real Studio preview
// gets these (bookTimePreview.ts `isBookingPreview`); no card page opens and nothing is saved.

const PLANS = (currency: string) => [
  { id: "sample-friends", name: "Friends of the press", description: "Help us print more. Sample plan: yours show here once you add them under Members.",
    perks: ["A new print each season", "Early news of new releases"], interval: "month", priceMinor: 1000, trialDays: 14, memberPercent: 10, currency },
  { id: "sample-patron", name: "Patron", description: "Everything in Friends, and a print each season.",
    perks: ["Everything in Friends", "A signed print each season", "Your name in our books"], interval: "year", priceMinor: 12000, trialDays: 0, currency },
];

let state: "trial" | "active" | "ending" = "active";
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

function sampleMember(currency: string) {
  return {
    id: "sample-membership", state, plan: { name: "Friends of the press", interval: "month", priceMinor: 1000, trialDays: 14, currency },
    periodEnd: inDays(18), trialEnd: "", card: { brand: "visa", last4: "4242" }, startedAt: inDays(-40), endedAt: "", test: true, cardPending: false,
  };
}

export function previewMembershipAnswer(action: string, _body: Record<string, unknown> = {}, currency = "CAD"): Record<string, any> {
  if (action === "membershipInfo") return { on: true, currency, ready: true, plans: PLANS(currency) };
  if (action === "membershipMine") return { memberships: [sampleMember(currency)], currency };
  if (action === "membershipCancel") { state = "ending"; return { membership: sampleMember(currency) }; }
  if (action === "membershipResume") { state = "active"; return { membership: sampleMember(currency) }; }
  // A members-only page in the designer: shown as a member sees it (Studio reads the page itself).
  if (action === "membershipPage") return { locked: true, signedIn: false, page: { id: "sample", slug: String(_body.slug || ""), title: "" } };
  // Join and New card would open a card page: the preview stays put.
  return { preview: true };
}
