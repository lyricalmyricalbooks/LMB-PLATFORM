// The billing hub's calls to the platform (code plan 22.3): Settings › Plan and Settings › Billing ask the platform
// directly, signed in as the admin, at the address the shop's plan document carries (`hub`, platformPlan.ts). The
// platform checks the sign-in came from this shop's own admin and that it is the shop's owner (accounts/
// shopBillingDoor.js in the platform repo); nothing here decides who may do what. Pure parts are tested
// (platformBilling.test.ts). Admin-only words.
import { auth } from "../../lib/firebase";
import type { PlatformPlan } from "./platformPlan";

export type PlanId = "shop" | "stockroom" | "both";

export type BillingStatus = {
  plan: PlanId | null; planName: string; price: string; plusTax: boolean; status: string; access: string;
  trialEnd: string | null; trialDaysLeft: number | null; currentPeriodEnd: string | null; nextPaymentAt: string | null;
  cancelAtPeriodEnd: boolean; hasCard: boolean;
  /** The day a cancel (asked for, or asked for now) closes the shop; a press paying as they sell leaves at its month's end. */
  cancelEndsAt?: string | null;
  card: { brand: string; last4: string; expMonth: number | null; expYear: number | null; words: string } | null;
  appsClosing: { apps: string[]; at: string; downloadUntil: string } | null;
  /** Apps a plan change closed: their records can be downloaded until `downloadUntil`, then they are deleted. */
  closedApps?: Record<string, { closedAt?: string; downloadUntil?: string; deletedAt?: string }>;
  plans: Array<{ plan: PlanId; name: string; price: string; apps: string[] }>;
  paymentWay: "monthly" | "payAsYouSell";
  founding: { percentOff: number | null; price: string } | null;
  paymentProblem: { kind: "declined" | "confirm"; at: string; amount: string; nextTry: string | null; pageUrl: string | null } | null;
  canPayNow: boolean;
  /** The paying card runs out within a month, or already has (the platform's cardRunningOut). */
  cardRunsOut?: { ends: string; expired: boolean } | null;
  /** Pay what you use: the flat fee, last month's running cost (added to the next bill) and the heads-up amount. */
  usage?: { fee: string; lastMonth: { month: string; monthWords: string; cents: number; text: string } | null; alert: { cents: number; text: string } };
  /** The language of the platform's emails: the choice, and what "auto" comes to ("fr+en" for a Quebec address). */
  emailLanguage?: { choice: "auto" | "fr" | "en"; sends: "fr" | "en" | "fr+en" };
};
export type StatusAnswer = { billing: BillingStatus | null; accountPage: string; changesNeedTwoStep: boolean };
export type PlanPreview = { plan: PlanId; planName: string; price: string; from: PlanId | null; adds: string[]; closes: string[]; immediate: boolean; closesAt: string | null; downloadUntil: string | null; prorate: boolean; prorated: { amount: number; text: string } | null };
export type SavedCard = { id: string; words: string; brand: string; last4: string; expMonth: number | null; expYear: number | null; primary: boolean; expired: boolean };
export type BillingDetails = { name: string; email: string; address: { line1: string; line2: string; city: string; state: string; postalCode: string; country: string } | null; taxNumber: string; taxLabel: string; plusTax: boolean; currency?: string; country?: string };
export type UpcomingBill = { date: string | null; lines: Array<{ words: string; amount: string }>; subtotal: string; discount: string; tax: string; total: string };
/** What a bill says, for the printed copy in the Colophon look (services/billing billPaper); every amount is Stripe's. */
export type BillPaper = {
  from: { name: string; address: string; taxNumbers: string[] };
  to: { name: string; email: string; address: string[]; taxNumbers: string[] };
  currency: string; lines: Array<{ words: string; amount: string }>; subtotal: string; discount: string;
  taxes: Array<{ words: string; amount: string }>; total: string; paid: string; due: string; paidAt: string | null;
};
export type Bill = { id: string; number: string; date: string | null; covers?: { from: string | null; to: string | null } | null; amount: string; tax: string; status: string; pdfUrl: string | null; pageUrl: string | null; paper?: BillPaper | null };
export type PaymentWayView = { way: string | null; title: string; lines: string[]; button: { label: string; to: string } | null; note: string };

/** A refusal from the platform, in its own words; `twoStep` when it needs the account page's two-step sign-in. */
export class BillingCallError extends Error {
  twoStep: boolean;
  accountPage: string | null;
  constructor(message: string, { twoStep = false, accountPage = null }: { twoStep?: boolean; accountPage?: string | null } = {}) {
    super(message);
    this.twoStep = twoStep;
    this.accountPage = accountPage;
  }
}

type Fetch = typeof fetch;
type TokenSource = () => Promise<string | null>;
// The admin fixture (dev only) signs nothing in: its `__fixtureIdToken` stands in, as for oldShopApi.
const currentToken: TokenSource = async () => (auth.currentUser ? auth.currentUser.getIdToken() : (import.meta.env.DEV ? (globalThis as any).__fixtureIdToken ?? null : null));

/** The call's address: the hub plus the call's name, only ever on https. */
export function callAddress(hub: string, call: string): string {
  if (!/^https:\/\//.test(hub)) throw new BillingCallError("Billing can't be reached from here.");
  if (!/^[a-z-]+(\/[a-z-]+)?$/.test(call)) throw new BillingCallError("That isn't a billing call.");
  return `${hub.replace(/\/+$/, "")}/${call}`;
}

/** One call: POST { shopId, ...body } with the admin's sign-in. Throws BillingCallError with the platform's words. */
export async function billingCall<T = any>(plan: Pick<PlatformPlan, "hub" | "shopId">, call: string, body: Record<string, unknown> = {}, deps: { fetch?: Fetch; token?: TokenSource } = {}): Promise<T> {
  if (!plan.hub || !plan.shopId) throw new BillingCallError("Your plan's details haven't reached this admin yet. Try again in a minute.");
  const token = await (deps.token ?? currentToken)();
  if (!token) throw new BillingCallError("Sign in again to see your billing.");
  let response: Response;
  try {
    response = await (deps.fetch ?? fetch)(callAddress(plan.hub, call), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...body, shopId: plan.shopId }),
    });
  } catch {
    throw new BillingCallError("We couldn't reach billing. Check your connection and try again.");
  }
  const answer = await response.json().catch(() => null);
  if (!response.ok || !answer || answer.ok === false) {
    throw new BillingCallError(typeof answer?.message === "string" && answer.message ? answer.message : "Something went wrong. Try again in a minute.", { twoStep: answer?.twoStep === true, accountPage: typeof answer?.accountPage === "string" && /^https:\/\//.test(answer.accountPage) ? answer.accountPage : null });
  }
  return answer as T;
}

/** "Free trial", "Paid and open"… the badge on the plan card, from billing's own status. */
export function statusBadge(status: Pick<BillingStatus, "status" | "cancelAtPeriodEnd" | "paymentWay"> & { access?: string }): { tone: "info" | "success" | "warning" | "danger"; word: string } {
  // The shop's access when the platform gives it: a press paying as they sell is open with Stripe's plan ended.
  const closed = status.access ? status.access === "closed" : ["canceled", "incomplete_expired"].includes(status.status);
  const open = status.access ? status.access === "open" : !closed && status.status !== "paused";
  // "Ending" is the press's own cancel: the platform never says so for the cancel that is a switch to pay as you sell.
  if (status.cancelAtPeriodEnd && !closed) return { tone: "warning", word: "Ending" };
  if (status.paymentWay === "payAsYouSell" && open) return { tone: "success", word: "Paying as you sell" };
  if (closed) return { tone: "danger", word: "Closed" };
  switch (status.status) {
    case "trialing": return { tone: "info", word: "Free trial" };
    case "active": return { tone: "success", word: "Paid and open" };
    case "past_due": return { tone: "danger", word: "Payment declined" };
    case "paused": case "unpaid": case "incomplete": return { tone: "warning", word: "Paused" };
    default: return { tone: "danger", word: "Closed" };
  }
}

const APP_WORDS: Record<string, string> = { shop: "the website", stockroom: "the stockroom" };
export const appsInWords = (apps: string[]) => apps.map((app) => APP_WORDS[app] ?? app).join(" and ");

/** What a plan change does, in sentences, from the platform's preview. */
export function previewWords(preview: PlanPreview, date: (iso: string | null) => string): string[] {
  const lines: string[] = [];
  if (preview.adds.length) lines.push(`${appsInWords(preview.adds).replace(/^./, (c) => c.toUpperCase())} ${preview.adds.length > 1 ? "open" : "opens"} right away.`);
  if (preview.closes.length) {
    lines.push(preview.immediate
      ? `${appsInWords(preview.closes).replace(/^./, (c) => c.toUpperCase())} ${preview.closes.length > 1 ? "close" : "closes"} now. You can download everything in it until ${date(preview.downloadUntil)}.`
      : `${appsInWords(preview.closes).replace(/^./, (c) => c.toUpperCase())} stays open until ${date(preview.closesAt)}, the end of the month you've paid for. You can download everything in it until ${date(preview.downloadUntil)}.`);
  }
  if (preview.prorated && preview.prorate) lines.push(`You pay ${preview.prorated.text} today for the rest of this month. After that it's ${preview.price} a month.`);
  else lines.push(preview.immediate ? `The new price, ${preview.price} a month, applies from your first payment.` : `The new price, ${preview.price} a month, starts with your next payment.`);
  return lines;
}

/** The reasons offered when a press cancels (the platform's LEAVING_REASONS, services/billing/leaving.js). */
export const LEAVING_CHOICES: Array<{ value: string; label: string }> = [
  { value: "", label: "Rather not say" },
  { value: "price", label: "It costs too much" },
  { value: "missing-feature", label: "Something I need is missing" },
  { value: "closed-press", label: "My press is closing" },
  { value: "moving", label: "I'm moving to another service" },
  { value: "other", label: "Something else" },
];

/** Closed apps whose records can still be downloaded (not back on the plan, not deleted, before the last day). */
export function downloadableClosedApps(billing: BillingStatus, now = Date.now()): Array<{ app: string; downloadUntil: string }> {
  const open = billing.plans.find((p) => p.plan === billing.plan)?.apps ?? [];
  return Object.entries(billing.closedApps ?? {})
    .filter(([app, c]) => !open.includes(app) && !c?.deletedAt && Boolean(c?.downloadUntil) && Date.parse(c!.downloadUntil!) > now)
    .map(([app, c]) => ({ app, downloadUntil: c!.downloadUntil! }));
}

/** The plan that puts a closed app back next to the apps open now, or null when no plan has exactly those apps. */
export function planAddingBack(billing: BillingStatus, app: string): PlanId | null {
  const open = billing.plans.find((p) => p.plan === billing.plan)?.apps ?? [];
  const want = new Set([...open, app]);
  return billing.plans.find((p) => p.apps.length === want.size && p.apps.every((a) => want.has(a)))?.plan ?? null;
}

/** The reasons offered when a plan change drops an app (the platform's DROP_REASONS, services/billing/closedApps.js). */
export const DROP_CHOICES: Array<{ value: string; label: string }> = [
  { value: "", label: "Rather not say" },
  { value: "not-using", label: "We weren't using it" },
  { value: "price", label: "To pay less" },
  { value: "other-tool", label: "We use something else for it" },
  { value: "too-hard", label: "It was hard to use" },
  { value: "other", label: "Something else" },
];

/** Canada's provinces and territories, for the billing address. */
export const PROVINCES: Array<[string, string]> = [
  ["AB", "Alberta"], ["BC", "British Columbia"], ["MB", "Manitoba"], ["NB", "New Brunswick"], ["NL", "Newfoundland and Labrador"], ["NS", "Nova Scotia"],
  ["NT", "Northwest Territories"], ["NU", "Nunavut"], ["ON", "Ontario"], ["PE", "Prince Edward Island"], ["QC", "Quebec"], ["SK", "Saskatchewan"], ["YT", "Yukon"],
];

/** The US states, Washington DC and Puerto Rico, for a US billing address (the tax on the bill depends on it). */
export const US_STATES: Array<[string, string]> = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"],
  ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"],
  ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"],
  ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"],
  ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["PR", "Puerto Rico"],
  ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"],
  ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
];

/** The billing address's country choices, and the region list, words and first region for each. */
export const ADDRESS_COUNTRIES: Record<string, { name: string; regionLabel: string; regions: Array<[string, string]>; postalLabel: string; first: string }> = {
  CA: { name: "Canada", regionLabel: "Province or territory", regions: PROVINCES, postalLabel: "Postal code", first: "ON" },
  US: { name: "United States", regionLabel: "State", regions: US_STATES, postalLabel: "ZIP code", first: "NY" },
};

/** "Paid", "Waiting for payment"… a bill's state in words. */
export function billState(status: string): { tone: "success" | "warning" | "neutral" | "danger"; word: string } {
  if (status === "paid") return { tone: "success", word: "Paid" };
  if (status === "open") return { tone: "warning", word: "Waiting for payment" };
  if (status === "void") return { tone: "neutral", word: "Cancelled" };
  if (status === "uncollectible") return { tone: "danger", word: "Not paid" };
  return { tone: "neutral", word: status };
}

/**
 * The days a bill pays for, short: "12 Oct – 12 Nov 2026", or "12 Dec 2026 – 12 Jan 2027" across a new year. Empty
 * when the platform didn't say (an older answer, or a bill with no lines).
 */
export function billCoversWords(covers: Bill["covers"]): string {
  if (!covers?.from || !covers?.to) return "";
  const parts = (iso: string) => {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", day: "numeric", month: "short", year: "numeric" }).formatToParts(new Date(iso));
    const part = (type: string) => p.find((x) => x.type === type)?.value.replace(".", "") ?? "";
    return { day: part("day"), month: part("month"), year: part("year") };
  };
  const a = parts(covers.from);
  const b = parts(covers.to);
  return a.year === b.year ? `${a.day} ${a.month} – ${b.day} ${b.month} ${b.year}` : `${a.day} ${a.month} ${a.year} – ${b.day} ${b.month} ${b.year}`;
}

/** The email language choices (the platform's billing `setEmailLanguage`). */
export const EMAIL_LANGUAGES: Array<{ value: "auto" | "fr" | "en"; label: string }> = [
  { value: "auto", label: "Automatic" },
  { value: "fr", label: "Français" },
  { value: "en", label: "English" },
];

/** What the choice means, in words (the same as the account page's, accounts/billingWords.js emailLanguageWords). */
export function emailLanguageWords(emailLanguage: BillingStatus["emailLanguage"]): string {
  const choice = emailLanguage?.choice ?? "auto";
  if (choice === "fr") return "Our emails to you and your team come in French.";
  if (choice === "en") return "Our emails to you and your team come in English.";
  return emailLanguage?.sends === "fr+en"
    ? "Automatic: your billing address is in Quebec, so our emails come in French with the English below."
    : "Automatic: our emails come in English, or in French and English if your billing address is in Quebec.";
}

/** "25" or "25.50" from a typed amount ("$25", "25,50 $"), in cents, or null when it isn't an amount from $0 to $10,000. */
export function alertCents(typed: string): number | null {
  const clean = typed.replace(/[\s$]/g, "").replace(",", ".");
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(clean)) return null;
  const cents = Math.round(Number(clean) * 100);
  return cents <= 1_000_000 ? cents : null;
}

/** The plan's price in words: the fee, and under pay what you use the running cost on top. */
export function priceWords(billing: Pick<BillingStatus, "price" | "plusTax" | "usage">, fee = billing.price): string {
  return `${fee} a month${billing.usage ? " + running cost" : ""}${billing.plusTax ? " plus tax" : ""}`;
}
