// Set up your shop (plan 6.9, which replaced Your first week, 3.3): one eight-step guide on the Overview, ordered by
// the one question a press answered at sign-up ("How do you sell today?", signup/form.js). Setup writes the answer
// once, in `firstWeek/start`; a shop that has no such document (made before this, or by hand) never shows the guide.
// Pure: the card hands in what the Overview already read (books, orders, settings, launch checks) and this works out
// each step. The steps are logo, look, first book (or bring your shop), shipping, get paid, web address, a practice
// order, open your shop. Gmail is not a step: platform email works from the start and Gmail stays in Settings.

import type { ReadinessItem } from "./launchReadiness";
import { firstProductWords } from "./sells";
import { wordsFor } from "../../shared/shopSells";

/** The sign-up answers (signup/form.js QUESTION.options). Anything else, or none, gets the general order. */
export type SellingToday = "starting" | "fairs" | "online" | "shops" | "spreadsheet";
export const SELLING_TODAY: readonly SellingToday[] = ["starting", "fairs", "online", "shops", "spreadsheet"];

/** What the welcome (Choose your look, plan 6.3) recorded once it was done. */
export interface WelcomeDone {
  /** The theme applied (THEME_LIBRARY id). */
  theme: string;
  at: string;
  /** True when the owner pressed Skip, which takes the first suggestion. */
  skipped?: boolean;
}

export interface FirstWeekDoc {
  sellingToday?: string | null;
  /** "What do you sell?" from sign-up (plans 6.2 and 10.1, sells.ts SELLS); null when skipped. */
  publishes?: string | null;
  /** The country the press signed up from (two letters), for the shipping starter. */
  country?: string | null;
  plan?: string;
  /** Steps the owner ticked by hand: step id → when. */
  done?: Record<string, string>;
  /** Set when the owner hides the guide. */
  hiddenAt?: string;
  /** Set once Get started's press details are saved (plan 17.2), before the look. */
  details?: { at: string };
  /** Set once Choose your look is done (plan 6.3): it never shows again. */
  welcome?: WelcomeDone;
  /** The guide's progress as the admin last worked it out, read by the platform's trial emails (plan 6.10). */
  progress?: GuideProgress;
}

export interface GuideProgress {
  /** Every step of the guide, in order. */
  steps: StepId[];
  /** The ones done. */
  done: StepId[];
  at: string;
}

export type StepId =
  | "logo" | "look" | "add-books" | "bring-books" | "import-spreadsheet" | "shipping" | "payments" | "address"
  | "practice" | "open";

export interface FirstWeekStep {
  id: StepId;
  title: string;
  why: string;
  /** Admin page the step's button opens (riso/nav.ts ids), or none. */
  tab?: string;
  action?: string;
  /** "auto": worked out from the shop; "manual": the owner ticks it. */
  kind: "auto" | "manual";
  done: boolean;
}

type StepWords = Omit<FirstWeekStep, "done" | "kind" | "id">;

const WORDS: Record<StepId, StepWords> = {
  logo: { title: "Add your logo", why: "Your logo goes in the shop's header, on your emails and when someone shares a link to your shop.", tab: "designer", action: "Open Design" },
  look: { title: "Choose your look", why: "Pick a look for the shop, then press Publish in Design so shoppers see it.", tab: "designer", action: "Open Design" },
  "add-books": { title: "Add your first book", why: "A title, a price and a photo are enough to start. You can fill in the rest later.", tab: "catalog", action: "Open Books" },
  "bring-books": { title: "Bring your shop with you", why: "Export your products from your old shop and choose that file in Import CSV. Photos, prices and editions come over as drafts, and old links keep working.", tab: "catalog", action: "Open Books" },
  "import-spreadsheet": { title: "Import your spreadsheet", why: "Save your list of books as a CSV file and choose it in Import CSV. You see every book before anything is saved.", tab: "catalog", action: "Open Books" },
  shipping: { title: "Set your shipping prices", why: "Make a shipping profile from the starter and check its prices, so shoppers see the cost of delivery before they pay.", tab: "shipping", action: "Open Shipping" },
  payments: { title: "Get paid", why: "Tell the card company where to send your money. Their own secure page asks for your bank details, and you come straight back here.", tab: "payments", action: "Open Payments" },
  address: { title: "Choose your web address", why: "Your shop already has a free address. Connect a name you own, or keep the free one and mark this done.", tab: "general", action: "Open General settings" },
  practice: { title: "Place a practice order", why: "While the shop is private, press Try a practice order in Payments and buy a book with the practice card. No money moves.", tab: "payments", action: "Open Payments" },
  open: { title: "Open your shop", why: "Your shop is private until you open it. We check it's ready to sell first, then shoppers can buy.", action: "Open your shop" },
};

/** The first-book step for each answer. */
const FIRST_BOOK: Record<SellingToday | "general", StepId> = {
  starting: "add-books", fairs: "add-books", online: "bring-books", shops: "add-books", spreadsheet: "import-spreadsheet", general: "add-books",
};

/** The steps for each answer, in order ("books" stands for that answer's first-book step). Open your shop is last. */
const ORDER: Record<SellingToday | "general", (StepId | "books")[]> = {
  starting: ["logo", "look", "books", "shipping", "payments", "address", "practice", "open"],
  fairs: ["books", "payments", "logo", "look", "shipping", "address", "practice", "open"],
  online: ["books", "look", "logo", "payments", "shipping", "address", "practice", "open"],
  shops: ["books", "logo", "look", "shipping", "payments", "address", "practice", "open"],
  spreadsheet: ["books", "logo", "look", "shipping", "payments", "address", "practice", "open"],
  general: ["logo", "look", "books", "shipping", "payments", "address", "practice", "open"],
};

/** The address step can't always tell (the free address is a fine choice), so the owner can tick it too. */
const MANUAL = new Set<StepId>(["address"]);

export interface FirstWeekFacts {
  books: any[] | null;
  readiness: ReadinessItem[] | null;
  /** settings/website as the admin read it (published design, domain, store status); null while loading. */
  settings?: any;
  orders?: any[] | null;
  /** The card provider the platform takes cards through (lib/shopProfile platformCardsProvider), else null. */
  platform?: "stripe" | "square" | null;
}

/** A practice order (plan 7.6) or, on a shop with its own keys, a test-mode order that went through. */
const practiced = (o: any) => o?.isTest === true && ["paid", "refunded"].includes(o?.paymentStatus);

/** The shop is open: no under-construction wall and checkout not paused (Settings › General › Store status). */
export const shopIsOpen = (settings: any) =>
  !!settings && !settings.design?.showUnderConstruction && !settings.maintenance?.enabled && !settings.maintenanceMode;

/** Whether a step is done from what the shop holds; null when the shop can't tell (the owner ticks it). */
function autoDone(id: StepId, { books, readiness, settings, orders, platform }: FirstWeekFacts): boolean | null {
  const list = books || [];
  const ok = (check: string) => readiness?.find(i => i.id === check)?.status === "ok";
  switch (id) {
    case "logo": return !!(settings?.design?.logoUrl || settings?.draftDesign?.logoUrl);
    // The look counts once shoppers can see it: the published design carries a ready-made look (Studio's themeBase).
    case "look": return !!settings?.design?.themeBase?.id;
    case "bring-books": case "import-spreadsheet": case "add-books": return list.length > 0;
    case "shipping": return ok("shipping");
    // Platform shops: the card account takes cards and pays out (plan 7.9). Own keys: the payment checks pass.
    case "payments": return platform ? ok("card-account") : ok("payments") && !readiness?.some(i => i.id === "stripe-secret" && i.status !== "ok");
    case "address": return settings?.domain?.custom ? true : null;
    // Practice works only while the shop is private, so an open shop has nothing left to practise here.
    case "practice": return (orders || []).some(practiced) || shopIsOpen(settings);
    case "open": return shopIsOpen(settings);
    default: return null;
  }
}

const answerOf = (doc: FirstWeekDoc): SellingToday | "general" =>
  SELLING_TODAY.includes(doc.sellingToday as SellingToday) ? (doc.sellingToday as SellingToday) : "general";

/** The shipping starter for the press's country (Settings › Shipping › Create profile, shippingProfileStarters.ts). */
export function shippingStarterWords(country?: string | null): string {
  const c = String(country || "").toUpperCase();
  if (c === "CA") return "Press Create profile and pick “Canada, US & everywhere else”: its prices are filled in for you to check.";
  if (c === "US") return "Press Create profile and pick “Canada, US & everywhere else”, then put your United States price first.";
  return "Press Create profile and pick “Canada, US & everywhere else”, then change the zones and prices to where you send books from.";
}

export function firstWeekSteps(doc: FirstWeekDoc, facts: FirstWeekFacts): FirstWeekStep[] {
  const answer = answerOf(doc);
  return ORDER[answer].map(entry => {
    const id: StepId = entry === "books" ? FIRST_BOOK[answer] : entry;
    const words = { ...WORDS[id] };
    if (id === "add-books") Object.assign(words, firstProductWords(doc.publishes));
    if (id === "shipping") words.why = `${words.why} ${shippingStarterWords(doc.country ?? facts.settings?.country)}`;
    if (id === "payments" && facts.platform === "square") words.why = "Connect your Square account, so card payments go straight to you. Square's own page asks for your details.";
    if (id === "look" && doc.welcome && !facts.settings?.design?.themeBase?.id) words.why = "Your look is saved as a draft. Open Design and press Publish so shoppers see it.";
    const auto = autoDone(id, facts);
    const ticked = !!doc.done?.[id];
    // A shop that doesn't sell books reads product and maker (plan 12.1); a books shop's words are untouched.
    const w = wordsFor(doc.publishes);
    const { tab, action } = words;
    const title = w(words.title), why = w(words.why);
    const kind = MANUAL.has(id) || auto === null ? "manual" : "auto";
    return { id, title, why, ...(tab || action ? { ...(tab ? { tab } : {}), action } : {}), kind, done: auto === true || (kind === "manual" && ticked) };
  });
}

/** Shown while the shop has the document, the owner hasn't hidden it, and something is left to do. */
export function showFirstWeek(doc: FirstWeekDoc | null, steps: FirstWeekStep[]): boolean {
  return !!doc && !doc.hiddenAt && steps.some(s => !s.done);
}

/** How many steps show at a time; the rest wait under Later. */
export const STEPS_AT_A_TIME = 3;

/** The guide in three parts: the next steps to do, the ones under Later, and the ones done. */
export function guideParts(steps: FirstWeekStep[], atATime = STEPS_AT_A_TIME) {
  const open = steps.filter(s => !s.done);
  return { now: open.slice(0, atATime), later: open.slice(atATime), done: steps.filter(s => s.done) };
}

/** What the platform reads for the trial emails, or null when it is what the document already holds. */
export function progressToSave(doc: FirstWeekDoc, steps: FirstWeekStep[], at: string): GuideProgress | null {
  const next = { steps: steps.map(s => s.id), done: steps.filter(s => s.done).map(s => s.id) };
  const before = doc.progress;
  if (before && before.steps?.join() === next.steps.join() && before.done?.join() === next.done.join()) return null;
  return { ...next, at };
}

/** Open your shop runs Ready to sell first: the launch checks that block a sale, or none when it can open. */
export function openBlockers(readiness: ReadinessItem[] | null): ReadinessItem[] {
  return (readiness || []).filter(i => i.status === "block");
}

/** The intro line, in the owner's words. */
export function firstWeekIntro(doc: FirstWeekDoc): string {
  return wordsFor(doc.publishes)(introFor(doc));
}

function introFor(doc: FirstWeekDoc): string {
  switch (doc.sellingToday) {
    case "online": return "You told us you sell through another online shop, so bringing it over comes first.";
    case "fairs": return "You told us you sell at fairs and markets, so your books and getting paid come first.";
    case "shops": return "You told us you sell through bookshops and distributors, so your books come first.";
    case "spreadsheet": return "You told us you keep track in a spreadsheet, so importing it comes first.";
    case "starting": return "You're just starting out, so these steps take you from your logo to your first sale.";
    default: return "Eight steps take you from your logo to your first sale. Your shop stays private until the last one.";
  }
}
