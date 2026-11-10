// Create my shop (code plan 18.8, polished): what the review before creating shows, worked out from the press's setup
// record. Pure, so every line a press reads here is tested without a browser.
//
// Two moments, two words. "Create my shop" (here, in setup) starts the plan and makes the press's real shop, which starts
// private. "Open my shop" (in the shop's own admin, after the final check) lets shoppers in. Help, emails and the
// shop's guide already call the second one "Open your shop", so setup never uses "open" for the first.
import type { Making, PlanList, SetupPress } from "./door";
import { DESIGN_PAGE, GENERAL_PAGE, IMPORT_PAGE, PAYMENTS_PAGE, PLAN_PAGE } from "./pages";
import { cardProviderName, chosenCardProvider } from "./cardChoice";

/** One line of "What goes into your shop". `needed` lines stop Create my shop until they're filled in. */
export interface CreateRow {
  id: "plan" | "details" | "look" | "cards" | "domain" | "books";
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
  return price ? `${name} · ${price} a month + running cost` : name;
}

/** The review's lines, in the order the setup guide asks for them. Written in book words; the page shows the shop's own. */
export function createChecklist(given: SetupPress, plans: PlanList | null, names: CreateNames): CreateRow[] {
  // Every shop gets the website and the stockroom (10 November 2026), whatever an older record names.
  const press: SetupPress = { ...given, plan: "both" };
  const sells = names.sells.find((s) => s.id === press.sells)?.label ?? "";
  const country = names.countries[press.country]?.name ?? "";
  const details = [press.pressName, sells, country].filter(Boolean).join(" · ");
  const missing = [!press.pressName && "your press's name", !press.country && "your country"].filter(Boolean) as string[];
  const rows: CreateRow[] = [
    // One plan for every shop (10 November 2026): always set, nothing to choose.
    { id: "plan", label: "Plan", value: planLine(press, plans), state: "done", page: PLAN_PAGE, change: "See plan" },
    missing.length
      ? { id: "details", label: "Your brand", value: `Add ${missing.join(" and ")}.`, state: "needed", page: GENERAL_PAGE, change: "Add details" }
      : { id: "details", label: "Your brand", value: details, state: "done", page: GENERAL_PAGE, change: "Change" },
  ];
  if (press.plan !== "stockroom") {
    rows.push(press.look
      ? { id: "look", label: "Website look", value: names.lookName || "Chosen", state: "done", page: DESIGN_PAGE, change: "Change" }
      : { id: "look", label: "Website look", value: "Not chosen yet", state: "later", page: DESIGN_PAGE, change: "Choose a look" });
    // Stripe or Square (cardChoice.ts): never "needed", since a press that doesn't choose starts on Stripe.
    const cards = cardProviderName(chosenCardProvider(press));
    rows.push(press.cardProvider
      ? { id: "cards", label: "Card payments", value: cards, state: "done", page: PAYMENTS_PAGE, change: "Change" }
      : { id: "cards", label: "Card payments", value: `${cards} (default)`, state: "later", page: PAYMENTS_PAGE, change: "Choose" });
  }
  if (press.plan !== "stockroom") {
    const free = press.freeAddress || "Free address";
    rows.push(press.domain
      ? { id: "domain", label: "Web address", value: press.domain, state: "done", page: GENERAL_PAGE, change: "Change" }
      : { id: "domain", label: "Web address", value: free, state: "later", page: GENERAL_PAGE, change: "Add a domain" });
  }
  const file = press.stagedImport;
  rows.push(file
    ? { id: "books", label: "Your books", value: `${file.rows} ${file.rows === 1 ? "book" : "books"} from ${file.name}, brought in as drafts for you to check.`, state: "done", page: IMPORT_PAGE, change: "Change" }
    : { id: "books", label: "Your books", value: "None yet", state: "later", page: IMPORT_PAGE, change: "Bring a file" });
  return rows;
}

/** True when nothing the shop needs is missing: the plan, the press's name and its country (as the platform asks). */
export const canCreate = (rows: CreateRow[]): boolean => rows.every((r) => r.state !== "needed");

/** The price and free days, beside the button. No days are promised when the platform didn't say how many. */
export function priceWords(press: SetupPress, plans: PlanList | null): string {
  // One plan for every shop (10 November 2026): its fee, plus what the shop costs to run.
  const offer = plans?.plans.find((p) => p.plan === "both");
  if (!plans || !offer) return "Nothing is charged today.";
  const price = offer.foundingPriceText ?? offer.priceText;
  const tax = plans.plusTax ? " plus tax" : "";
  // Billing gives one free trial per account, so a second press may get none: "your first shop".
  return plans.trialDays > 0
    ? `Nothing is charged today. Your first shop is free for ${plans.trialDays} days, then ${price} a month plus running cost${tax}.`
    : `Nothing is charged today. Then ${price} a month plus running cost${tax}.`;
}

/** What happens after pressing Create my shop, in order. A stockroom on its own has no website to open to shoppers. */
export function whatHappensNext(plan: SetupPress["plan"]): string[] {
  const makes = PLAN_MAKES[plan] ?? "your shop";
  if (plan === "stockroom") {
    return [
      `We make ${makes} in a few minutes and email you.`,
    ];
  }
  return [
    `We make ${makes} in a few minutes and email you.`,
    "It stays private until you open it.",
  ];
}

/** One step of the timeline. `progress` is how many of the making's steps are done, shown as a bar while it runs. */
export interface MakingStep { id: string; title: string; detail: string; state: "done" | "now" | "next"; progress?: { done: number; total: number } }

/**
 * The timeline once Create my shop has started: done, now, then next. `waiting` is the platform's reason a shop waits
 * its turn; `making` is how far the shop maker has got (code plan 18.9); `ready` once the shop is made.
 */
export function makingSteps(plan: SetupPress["plan"], { trialEnd, waiting, email, making = null, ready = false }: {
  trialEnd?: string | null; waiting?: string; email?: string; making?: Making | null; ready?: boolean;
}): MakingStep[] {
  const makes = PLAN_MAKES[plan] ?? "your shop";
  const until = trialEnd ? freeUntil(trialEnd) : "";
  const withButton = email ? `To ${email}, with a button that opens your shop's admin.` : "With a button that opens your shop's admin.";
  const steps: MakingStep[] = [{ id: "plan", title: "Your plan has started", detail: until ? `It's free until ${until}.` : "Nothing is charged today.", state: "done" }];
  if (ready) {
    steps.push(
      { id: "make", title: `${capital(makes)} ${plan === "both" ? "are" : "is"} made`, detail: "With everything you set up here.", state: "done" },
      { id: "email", title: "We've emailed you the way in", detail: withButton, state: "done" },
    );
    if (plan !== "stockroom") steps.push({ id: "open", title: "Now open it to shoppers", detail: "Add payments and shipping, run the last check, and press Open my shop.", state: "now" });
    return steps;
  }
  const counted = making && making.total > 0 ? { done: Math.min(making.done, making.total), total: making.total } : undefined;
  // The line's words hold only until the making starts (the record keeps them from the day it joined the line).
  if (waiting && (!making || making.status === "in-line" || making.status === "later")) steps.push({ id: "make", title: "Waiting for your turn", detail: waiting, state: "now" });
  else if (making?.status === "needs-help") steps.push({ id: "make", title: "We're finishing it by hand", detail: making.message || "It needs a hand from us. We've been told, and we'll email you when it's done.", state: "now", progress: counted });
  else if (making?.status === "waiting") steps.push({ id: "make", title: `Making ${makes}`, detail: making.message || "Still working on it. We'll carry on in a minute.", state: "now", progress: counted });
  else if (making?.status === "making") {
    const now = making.now ? `Now ${making.now}. ` : "";
    steps.push({ id: "make", title: `Making ${makes}`, detail: `${now}${counted ? `${counted.done} of ${counted.total} steps done.` : "It takes a few minutes."}`, state: "now", progress: counted });
  } else steps.push({ id: "make", title: `Making ${makes}`, detail: "With everything you set up here. It takes a few minutes.", state: "now" });
  steps.push({ id: "email", title: "We email you when it's ready", detail: withButton, state: "next" });
  if (plan !== "stockroom") steps.push({ id: "open", title: "Then open it to shoppers", detail: "Add payments and shipping, run the last check, and press Open my shop.", state: "next" });
  return steps;
}

/** The ready card's button: the admin the press goes into next. */
export const openAdminLabel = (plan: SetupPress["plan"]) => (plan === "stockroom" ? "Open my stockroom" : "Open my shop's admin");

const capital = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);

/** "17 November" for a trial's end; "" when it can't be read. */
export function freeUntil(at: string): string {
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return "";
  return when.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}
