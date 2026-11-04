// Create my shop (code plan 18.8, polished): what the review before creating shows, worked out from the press's setup
// record. Pure, so every line a press reads here is tested without a browser.
//
// Two moments, two words. "Create my shop" (here, in setup) starts the plan and makes the press's real shop, which starts
// private. "Open my shop" (in the shop's own admin, after the final check) lets shoppers in. Help, emails and the
// shop's guide already call the second one "Open your shop", so setup never uses "open" for the first.
import type { PlanList, SetupPress } from "./door";
import { DESIGN_PAGE, GENERAL_PAGE, IMPORT_PAGE, PAYMENTS_PAGE, PLAN_PAGE } from "./pages";
import { cardProviderName, chosenCardProvider } from "./cardChoice";

/** One line of "What goes into your shop". `needed` lines stop Create my shop until they're filled in. */
export interface CreateRow {
  id: "plan" | "details" | "look" | "cards" | "books";
  label: string;
  value: string;
  state: "done" | "needed" | "later";
  page: string;
  change: string;
}

/** The names the review shows: the platform's lists (signup/form.js) and the chosen look's name. */
export interface CreateNames {
  countries: Record<string, { name: string }>;
  sells: Array<{ id: string; label: string }>;
  lookName: string;
}

const PLAN_NAMES: Record<string, string> = { both: "Shop and stockroom", shop: "Shop", stockroom: "Stockroom" };

/** What Create my shop makes, for each plan. */
export const PLAN_MAKES: Record<string, string> = { both: "your website and your stockroom", shop: "your website", stockroom: "your stockroom" };

/** The plan's name and monthly price, as the platform lists them (founding price first when there is one). */
export function planLine(press: SetupPress, plans: PlanList | null): string {
  const offer = plans?.plans.find((p) => p.plan === press.plan);
  const name = offer?.name ?? PLAN_NAMES[press.plan] ?? "";
  const price = offer ? offer.foundingPriceText ?? offer.priceText : "";
  return price ? `${name} · ${price} a month` : name;
}

/** The review's lines, in the order the setup guide asks for them. Written in book words; the page shows the shop's own. */
export function createChecklist(press: SetupPress, plans: PlanList | null, names: CreateNames): CreateRow[] {
  const sells = names.sells.find((s) => s.id === press.sells)?.label ?? "";
  const country = names.countries[press.country]?.name ?? "";
  const details = [press.pressName, sells, country].filter(Boolean).join(" · ");
  const missing = [!press.pressName && "your press's name", !press.country && "your country"].filter(Boolean) as string[];
  const rows: CreateRow[] = [
    press.plan
      ? { id: "plan", label: "Plan", value: planLine(press, plans), state: "done", page: PLAN_PAGE, change: "Change" }
      : { id: "plan", label: "Plan", value: "Pick a plan above.", state: "needed", page: PLAN_PAGE, change: "Choose" },
    missing.length
      ? { id: "details", label: "Your press", value: `Add ${missing.join(" and ")}.`, state: "needed", page: GENERAL_PAGE, change: "Add details" }
      : { id: "details", label: "Your press", value: details, state: "done", page: GENERAL_PAGE, change: "Change" },
  ];
  if (press.plan !== "stockroom") {
    rows.push(press.look
      ? { id: "look", label: "Website look", value: names.lookName || "Chosen", state: "done", page: DESIGN_PAGE, change: "Change" }
      : { id: "look", label: "Website look", value: "Not chosen yet. You can pick one now, or in Design once your shop is made.", state: "later", page: DESIGN_PAGE, change: "Choose a look" });
    // Stripe or Square (cardChoice.ts): never "needed", since a press that doesn't choose starts on Stripe.
    const cards = cardProviderName(chosenCardProvider(press));
    rows.push(press.cardProvider
      ? { id: "cards", label: "Card payments", value: `${cards}. You connect your account once your shop is made.`, state: "done", page: PAYMENTS_PAGE, change: "Change" }
      : { id: "cards", label: "Card payments", value: `${cards}, unless you pick Square instead. You connect your account once your shop is made.`, state: "later", page: PAYMENTS_PAGE, change: "Choose" });
  }
  const file = press.stagedImport;
  rows.push(file
    ? { id: "books", label: "Your books", value: `${file.rows} ${file.rows === 1 ? "book" : "books"} from ${file.name}, brought in as drafts for you to check.`, state: "done", page: IMPORT_PAGE, change: "Change" }
    : { id: "books", label: "Your books", value: "None brought over. You can add them, or bring a file, once your shop is made.", state: "later", page: IMPORT_PAGE, change: "Bring a file" });
  return rows;
}

/** True when nothing the shop needs is missing: the plan, the press's name and its country (as the platform asks). */
export const canCreate = (rows: CreateRow[]): boolean => rows.every((r) => r.state !== "needed");

/** The price and free days, beside the button. No days are promised when the platform didn't say how many. */
export function priceWords(press: SetupPress, plans: PlanList | null): string {
  const offer = plans?.plans.find((p) => p.plan === press.plan);
  if (!plans || !offer) return "Nothing is charged today.";
  const price = offer.foundingPriceText ?? offer.priceText;
  const tax = plans.plusTax ? " plus tax" : "";
  // Billing gives one free trial per account, so a second press may get none: "your first shop".
  return plans.trialDays > 0
    ? `Nothing is charged today. Your first shop is free for ${plans.trialDays} days, then ${price} a month${tax}.`
    : `Nothing is charged today. Then ${price} a month${tax}.`;
}

/** What happens after pressing Create my shop, in order. A stockroom on its own has no website to open to shoppers. */
export function whatHappensNext(plan: SetupPress["plan"]): string[] {
  const makes = PLAN_MAKES[plan] ?? "your shop";
  if (plan === "stockroom") {
    return [
      `We make ${makes}. It takes a few minutes, and we email you when it's ready.`,
      "Everything you set up here is already in it, and you can start counting stock straight away.",
    ];
  }
  return [
    `We make ${makes}. It takes a few minutes, and we email you when it's ready.`,
    "Your website starts private. Only you can see it while you add payments, shipping and your shop's policies.",
    "When everything's ready, you open it to shoppers from your shop's Home page. A last check makes sure nothing is missing.",
  ];
}

/** The timeline once Create my shop has started: done, now, then next. `waiting` is the platform's reason a shop waits its turn. */
export function makingSteps(plan: SetupPress["plan"], { trialEnd, waiting, email }: { trialEnd?: string | null; waiting?: string; email?: string }) {
  const makes = PLAN_MAKES[plan] ?? "your shop";
  const until = trialEnd ? freeUntil(trialEnd) : "";
  const steps: Array<{ id: string; title: string; detail: string; state: "done" | "now" | "next" }> = [
    { id: "plan", title: "Your plan has started", detail: until ? `It's free until ${until}.` : "Nothing is charged today.", state: "done" },
    waiting
      ? { id: "make", title: "Waiting for your turn", detail: waiting, state: "now" }
      : { id: "make", title: `Making ${makes}`, detail: "With everything you set up here. It takes a few minutes.", state: "now" },
    { id: "email", title: "We email you when it's ready", detail: email ? `To ${email}, with a button that opens your shop's admin.` : "With a button that opens your shop's admin.", state: "next" },
  ];
  if (plan !== "stockroom") steps.push({ id: "open", title: "Then open it to shoppers", detail: "Add payments and shipping, run the last check, and press Open my shop.", state: "next" });
  return steps;
}

/** "17 November" for a trial's end; "" when it can't be read. */
export function freeUntil(at: string): string {
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return "";
  return when.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}
