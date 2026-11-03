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
  card: { brand: string; last4: string; expMonth: number | null; expYear: number | null; words: string } | null;
  appsClosing: { apps: string[]; at: string; downloadUntil: string } | null;
  plans: Array<{ plan: PlanId; name: string; price: string; apps: string[] }>;
  paymentWay: "monthly" | "payAsYouSell";
  founding: { percentOff: number | null; price: string } | null;
  paymentProblem: { kind: "declined" | "confirm"; at: string; amount: string; nextTry: string | null; pageUrl: string | null } | null;
  canPayNow: boolean;
  /** The paying card runs out within a month, or already has (the platform's cardRunningOut). */
  cardRunsOut?: { ends: string; expired: boolean } | null;
};
export type StatusAnswer = { billing: BillingStatus | null; accountPage: string; changesNeedTwoStep: boolean };
export type PlanPreview = { plan: PlanId; planName: string; price: string; from: PlanId | null; adds: string[]; closes: string[]; immediate: boolean; closesAt: string | null; downloadUntil: string | null; prorate: boolean; prorated: { amount: number; text: string } | null };
export type SavedCard = { id: string; words: string; brand: string; last4: string; expMonth: number | null; expYear: number | null; primary: boolean; expired: boolean };
export type BillingDetails = { name: string; email: string; address: { line1: string; line2: string; city: string; state: string; postalCode: string; country: string } | null; taxNumber: string; taxLabel: string; plusTax: boolean };
export type UpcomingBill = { date: string | null; lines: Array<{ words: string; amount: string }>; subtotal: string; discount: string; tax: string; total: string };
export type Bill = { id: string; number: string; date: string | null; amount: string; tax: string; status: string; pdfUrl: string | null; pageUrl: string | null };
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
const currentToken: TokenSource = async () => (auth.currentUser ? auth.currentUser.getIdToken() : null);

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
export function statusBadge(status: Pick<BillingStatus, "status" | "cancelAtPeriodEnd" | "paymentWay">): { tone: "info" | "success" | "warning" | "danger"; word: string } {
  if (status.paymentWay === "payAsYouSell" && !["paused", "canceled", "incomplete_expired"].includes(status.status)) return { tone: "success", word: "Paying as you sell" };
  if (status.cancelAtPeriodEnd && !["canceled", "incomplete_expired"].includes(status.status)) return { tone: "warning", word: "Ending" };
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

/** Canada's provinces and territories, for the billing address. */
export const PROVINCES: Array<[string, string]> = [
  ["AB", "Alberta"], ["BC", "British Columbia"], ["MB", "Manitoba"], ["NB", "New Brunswick"], ["NL", "Newfoundland and Labrador"], ["NS", "Nova Scotia"],
  ["NT", "Northwest Territories"], ["NU", "Nunavut"], ["ON", "Ontario"], ["PE", "Prince Edward Island"], ["QC", "Quebec"], ["SK", "Saskatchewan"], ["YT", "Yukon"],
];

/** "Paid", "Waiting for payment"… a bill's state in words. */
export function billState(status: string): { tone: "success" | "warning" | "neutral" | "danger"; word: string } {
  if (status === "paid") return { tone: "success", word: "Paid" };
  if (status === "open") return { tone: "warning", word: "Waiting for payment" };
  if (status === "void") return { tone: "neutral", word: "Cancelled" };
  if (status === "uncollectible") return { tone: "danger", word: "Not paid" };
  return { tone: "neutral", word: status };
}
