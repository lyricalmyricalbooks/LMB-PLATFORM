// Set up your shop (plan 6.9, which replaced Your first week, 3.3; regrouped 4 November 2026, plan 28): the guide on the
// Overview while the shop is private, in the order a shop is built, the way Shopify's setup guide runs. Three parts:
//   Your shop        first book (or bring your shop, or import a spreadsheet), logo, look
//   Ready to sell    shipping, taxes, get paid, store policies
//   Launch           web address, a practice order, open your shop (and, for a press moving in, the move itself)
// Every check that stops Open your shop (Ready to sell's blocks: books, shipping, payments, policies) is a step before
// it, so the last step never surprises a press with work it wasn't shown. The sign-up answer ("How do you sell
// today?", signup/form.js) picks which first-book step a press gets and the intro line; the order is the same for all.
// Setup writes the answer once, in `firstWeek/start`; a shop that has no such document never shows the guide.
// Pure: the card hands in what the Overview already read (books, orders, settings, launch checks) and this works out
// each step. Gmail is not a step: platform email works from the start and Gmail stays in Settings.

import type { ReadinessItem } from "./launchReadiness";
import type { BringMarker } from "./bringShop";
import type { ShippingMarker } from "./shippingStage";
import type { FinalCheckMarker } from "./finalCheckStage";
import type { GoogleMarker } from "./googleStage";
import type { PaymentsMarker } from "./paymentsStage";
import { currentSells, firstProductWords } from "./sells";
import { wordsFor } from "../../shared/shopSells";

/** The sign-up answers (signup/form.js QUESTION.options). Anything else, or none, gets the general order. */
export type SellingToday = "starting" | "fairs" | "online" | "shops" | "spreadsheet";
export const SELLING_TODAY: readonly SellingToday[] = ["starting", "fairs", "online", "shops", "spreadsheet"];

/** What the welcome (Choose your look, plan 6.3) recorded once it was done. */
export interface WelcomeDone {
  /** The theme applied (THEME_LIBRARY id). */
  theme: string;
  at: string;
  /** The admin look chosen beside the shop theme (riso/adminLook.ts ids); absent on older records. */
  adminLook?: string;
  /** True when the owner pressed Skip, which takes the first suggestion. */
  skipped?: boolean;
}

export interface FirstWeekDoc {
  sellingToday?: string | null;
  /** "What do you sell?" from sign-up (plans 6.2 and 10.1, sells.ts SELLS); null when skipped. */
  publishes?: string | null;
  /** What the shop sells now, chosen in Settings; reads before `publishes` (sells.ts `currentSells`). */
  sells?: string | null;
  /** The country the press signed up from (two letters), for the shipping starter. */
  country?: string | null;
  plan?: string;
  /** Steps the owner ticked by hand: step id → when. */
  done?: Record<string, string>;
  /** Set when the owner hides the guide. */
  hiddenAt?: string;
  /** Set once Get started's press details are saved (plan 17.2), before the look. */
  details?: { at: string };
  /** Set once Get started's bring-your-shop step is finished or skipped (plan 17.3), before the look. */
  bring?: BringMarker;
  /** Set once Get started's shipping and address step is finished or skipped (plan 17.11), after the look. */
  shipping?: ShippingMarker;
  /** Set once Get started's Google step is done, skipped or waiting for Google's approval (plan 17.9). */
  google?: GoogleMarker;
  /** Set once Get started's Get paid step is done or skipped (plan 17.10). Only for a press whose cards go through the platform. */
  payments?: PaymentsMarker;
  /** Set once Get started's final check is done and the shop opened from it (plan 17.13). */
  finalCheck?: FinalCheckMarker;
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
  | "logo" | "look" | "add-books" | "bring-books" | "import-spreadsheet" | "shipping" | "taxes" | "payments" | "policies"
  | "address" | "practice" | "open" | "switch" | "google" | "channels";

/** The guide's three parts, in order. */
export type StepGroup = "shop" | "sell" | "launch" | "reach";
export const GROUPS: ReadonlyArray<{ id: StepGroup; title: string }> = Object.freeze([
  { id: "shop", title: "Your shop" },
  { id: "sell", title: "Ready to sell" },
  { id: "launch", title: "Launch" },
  { id: "reach", title: "Reach more shoppers" },
]);

export interface FirstWeekStep {
  id: StepId;
  title: string;
  why: string;
  /** Admin page the step's button opens (riso/nav.ts ids), or none. */
  tab?: string;
  /** An address the page switch can't reach (a Settings sub tab, `#settings/general/details`), opened instead of `tab`. */
  hash?: string;
  /** The card to scroll to once the page shows (a SettingsAnchor id). */
  anchor?: string;
  /** The words on the owner's tick for a step it may tick ("Mark done" when none). */
  tickLabel?: string;
  action?: string;
  /** "auto": worked out from the shop; "manual": the owner ticks it. */
  kind: "auto" | "manual";
  done: boolean;
  group: StepGroup;
  /** A step the shop opens without (the free address works): shown, never in the way. */
  optional?: boolean;
}

type StepWords = Omit<FirstWeekStep, "done" | "kind" | "id" | "group" | "optional">;
const DETAILS = "#settings/general/details";

const WORDS: Record<StepId, StepWords> = {
  logo: { title: "Add your logo", why: "Your logo goes in the shop's header, on your emails and when someone shares a link to your shop.", tab: "designer", action: "Open Design" },
  look: { title: "Choose your look", why: "Pick a look for the shop, then press Publish in Design so shoppers see it.", tab: "designer", action: "Open Design" },
  "add-books": { title: "Add your first book", why: "A title, a price and a photo are enough to start. You can fill in the rest later.", tab: "catalog", action: "Open Books" },
  "bring-books": { title: "Bring your shop with you", why: "Export your products from your old shop and choose that file in Import spreadsheet. Photos, prices and editions come over as drafts, and old links keep working.", tab: "catalog", action: "Open Books" },
  "import-spreadsheet": { title: "Import your spreadsheet", why: "Choose your spreadsheet of books in Import spreadsheet: Excel or CSV both work. You see every book before anything is saved.", tab: "catalog", action: "Open Books" },
  shipping: { title: "Set your shipping prices", why: "Make a shipping profile from the starter and check its prices, so shoppers see the cost of delivery before they pay.", tab: "shipping", action: "Open Shipping" },
  taxes: { title: "Set up sales tax", why: "Add the rates you're registered to collect, and checkout adds them. Not registered yet? Say so here: no tax is charged until you add a rate.", tab: "taxes", action: "Add tax rates", tickLabel: "I don't collect tax yet" },
  payments: { title: "Get paid", why: "Tell the card company where to send your money. Their own secure page asks for your bank details, and you come straight back here.", tab: "payments", action: "Open Payments" },
  policies: { title: "Add your store policies", why: "Shipping, returns, privacy and terms. Shoppers read them before they buy, and the law asks for them. Each one starts from our wording.", tab: "general", hash: DETAILS, anchor: "gs-policies", action: "Write your policies" },
  address: { title: "Choose your web address", why: "Your shop already has a free address. Connect a name you own, or keep the free one.", tab: "general", hash: DETAILS, anchor: "gs-domain", action: "Connect a domain", tickLabel: "Keep the free address" },
  practice: { title: "Place a practice order", why: "While the shop is private, press Try a practice order in Payments and buy a book with the practice card. No money moves.", tab: "payments", action: "Open Payments" },
  open: { title: "Open your shop", why: "Your shop is private until you open it. We check it's ready to sell first, then shoppers can buy.", action: "Open your shop" },
  google: { title: "Show up on Google", why: "One Google sign-in puts your books in Google search, Shopping and Maps, and counts your visits.", tab: "google", hash: "#settings/google", action: "Open Google" },
  channels: { title: "Sell on social media", why: "Connect Instagram, Facebook, Pinterest or TikTok, so people can buy from your posts.", tab: "channels", action: "Open Sales channels" },
  switch: { title: "Move over from your old shop", why: "On the day you move: take your last orders in your old shop, check your old links in General settings so none show page not found, point your web address here, then tell your mailing list where to find you. Tick this once you've moved.", tab: "general", action: "Check your old links" },
};

/** The first-book step for each answer. */
const FIRST_BOOK: Record<SellingToday | "general", StepId> = {
  starting: "add-books", fairs: "add-books", online: "bring-books", shops: "add-books", spreadsheet: "import-spreadsheet", general: "add-books",
};

/** The steps in order, with their part ("books" stands for the answer's first-book step). Open your shop is last but for the move. */
const ORDER: ReadonlyArray<[StepId | "books", StepGroup]> = [
  ["books", "shop"], ["logo", "shop"], ["look", "shop"],
  ["shipping", "sell"], ["taxes", "sell"], ["payments", "sell"], ["policies", "sell"],
  ["address", "launch"], ["practice", "launch"], ["open", "launch"],
  ["google", "reach"], ["channels", "reach"],
];
/** A press moving from another online shop finishes with the switch itself (plan 23.8), after its new shop is open. */
const MOVE: [StepId, StepGroup] = ["switch", "launch"];
/** Where the move goes: straight after Open your shop, before the optional steps. */
const withMove = (order: ReadonlyArray<[StepId | "books", StepGroup]>) => {
  const at = order.findIndex(([id]) => id === "open") + 1;
  return [...order.slice(0, at), MOVE, ...order.slice(at)];
};

/** Steps a shop can open without: never in the way, and never what keeps the guide on Home. */
const OPTIONAL = new Set<StepId>(["address", "google", "channels"]);

/** The address step can't always tell (the free address is a fine choice), so the owner can tick it too. */
const MANUAL = new Set<StepId>(["address", "switch", "channels"]);

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
export const practiced = (o: any): boolean => o?.isTest === true && ["paid", "refunded"].includes(o?.paymentStatus);

/** The shop is open: no under-construction wall and checkout not paused (Settings › General › Store status). */
export const shopIsOpen = (settings: any) =>
  !!settings && !settings.design?.showUnderConstruction && !settings.maintenance?.enabled && !settings.maintenanceMode;

/** Whether a step is done from what the shop holds; null when the shop can't tell (the owner ticks it). */
function autoDone(id: StepId, { books, readiness, settings, orders, platform }: FirstWeekFacts, doc?: FirstWeekDoc): boolean | null {
  const list = books || [];
  const ok = (check: string) => readiness?.find(i => i.id === check)?.status === "ok";
  switch (id) {
    case "logo": return !!(settings?.design?.logoUrl || settings?.draftDesign?.logoUrl);
    // The look counts once shoppers can see it: the published design carries a ready-made look (Studio's themeBase).
    case "look": return !!settings?.design?.themeBase?.id;
    case "bring-books": case "import-spreadsheet": case "add-books": return list.length > 0;
    case "shipping": return ok("shipping");
    // Rates set, or collection switched off (a press not registered yet): either is a choice made.
    case "taxes": return ok("tax") ? true : null;
    case "policies": return ok("policies");
    // Platform shops: the card account takes cards and pays out (plan 7.9). Own keys: the payment checks pass.
    case "payments": return platform ? ok("card-account") : ok("payments") && !readiness?.some(i => i.id === "stripe-secret" && i.status !== "ok");
    case "address": return settings?.domain?.custom ? true : null;
    case "google": return !!doc?.google?.connected;
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
  const order = answer === "online" ? withMove(ORDER) : ORDER;
  return order.map(([entry, group]) => {
    const id: StepId = entry === "books" ? FIRST_BOOK[answer] : entry;
    const words = { ...WORDS[id] };
    if (id === "add-books") Object.assign(words, firstProductWords(currentSells(doc)));
    if (id === "shipping") words.why = `${words.why} ${shippingStarterWords(doc.country ?? facts.settings?.country)}`;
    if (id === "payments" && facts.platform === "square") words.why = "Connect your Square account, so card payments go straight to you. Square's own page asks for your details.";
    if (id === "google" && doc.google?.coming) words.why = "Coming soon: Google is still approving the one sign-in for shops here. We'll remind you when it's ready.";
    if (id === "look" && doc.welcome && !facts.settings?.design?.themeBase?.id) words.why = "Your look is saved as a draft. Open Design and press Publish so shoppers see it.";
    const auto = autoDone(id, facts, doc);
    const ticked = !!doc.done?.[id];
    // A shop that doesn't sell books reads product and maker (plan 12.1); a books shop's words are untouched.
    const w = wordsFor(currentSells(doc));
    const { tab, action, hash, anchor, tickLabel } = words;
    const title = w(words.title), why = w(words.why);
    const kind = MANUAL.has(id) || auto === null ? "manual" : "auto";
    return { id, title, why, ...(tab || action ? { ...(tab ? { tab } : {}), action } : {}), ...(hash ? { hash } : {}), ...(anchor ? { anchor } : {}),
      ...(tickLabel ? { tickLabel } : {}), kind, done: auto === true || (kind === "manual" && ticked), group,
      ...(OPTIONAL.has(id) ? { optional: true } : {}) };
  });
}

/**
 * Steps the guide has gained since it last saved its progress, in order: a press who started before sales tax and store
 * policies were steps (plan 28) meets them as new. None for a guide that never saved (every step is new to it).
 */
export function addedSince(doc: FirstWeekDoc, steps: FirstWeekStep[]): StepId[] {
  const before = doc.progress?.steps;
  if (!before?.length) return [];
  return steps.filter(s => !before.includes(s.id)).map(s => s.id);
}

/**
 * Shown while the shop has the document, the owner hasn't hidden it, and a step it needs is left (optional ones never
 * hold it). A hidden guide comes back for a needed step added since it was hidden (`added`, from `addedSince`).
 */
export function showFirstWeek(doc: FirstWeekDoc | null, steps: FirstWeekStep[], added: readonly StepId[] = []): boolean {
  if (!doc) return false;
  const needed = steps.filter(s => !s.done && !s.optional);
  return doc.hiddenAt ? needed.some(s => added.includes(s.id)) : needed.length > 0;
}

/** The step to do next: the first open step that isn't optional, else the first open one. */
export function nextStep(steps: FirstWeekStep[]): FirstWeekStep | null {
  const open = steps.filter(s => !s.done);
  return open.find(s => !s.optional) ?? open[0] ?? null;
}

/** The guide's parts, in order, each with its steps and how many are done. Parts with no steps are left out. */
export function guideGroups(steps: FirstWeekStep[]) {
  return GROUPS.map(g => {
    const list = steps.filter(s => s.group === g.id);
    return { ...g, steps: list, done: list.filter(s => s.done).length, total: list.length };
  }).filter(g => g.steps.length > 0);
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
  return wordsFor(currentSells(doc))(introFor(doc));
}

function introFor(doc: FirstWeekDoc): string {
  switch (doc.sellingToday) {
    case "online": return "You told us you sell through another online shop, so bringing it over comes first.";
    case "fairs": return "You told us you sell at fairs and markets, so your books come first.";
    case "shops": return "You told us you sell through bookshops and distributors, so your books come first.";
    case "spreadsheet": return "You told us you keep track in a spreadsheet, so importing it comes first.";
    case "starting": return "You're just starting out, so these steps take you from your first book to your first sale.";
    default: return "From your first book to your first sale. Your shop stays private until the last step.";
  }
}
