// What setup mode shows (code plan 18.6): the real admin's menu, with the pages that work before a shop exists and
// every other page locked until the shop opens. Pure, so the menu and the locks are tested without a browser.
import { sellsBooks } from "../shared/shopSells";
import type { NavEntry } from "../app/admin/riso/components";
import { NAV, SETTINGS_ITEM_PREFIX, sidebarItems } from "../app/admin/riso/nav";
import type { SetupPress } from "./door";

export const PLAN_PAGE = SETTINGS_ITEM_PREFIX + "plan";
export const GENERAL_PAGE = SETTINGS_ITEM_PREFIX + "general";
export const DESIGN_PAGE = SETTINGS_ITEM_PREFIX + "designer";
export const HELP_PAGE = "help";
export const HOME_PAGE = "overview";
/** Books (the catalog): in setup, the place to bring a product file over and see what it holds (18.7). */
export const IMPORT_PAGE = "catalog";

/** The pages that work in setup mode. Everything else in the menu opens "Opens with your shop". */
export const SETUP_PAGES: ReadonlySet<string> = new Set([HOME_PAGE, DESIGN_PAGE, GENERAL_PAGE, PLAN_PAGE, HELP_PAGE, IMPORT_PAGE]);

export const setupLocked = (page: string): boolean => !SETUP_PAGES.has(page);

/**
 * The menu: exactly the admin's own (Plan sits under Settings, as it does once the shop opens), so the admin a press
 * meets in setup is the one it keeps. Help is in the sidebar's footer, not the menu.
 */
export function setupMenu(nav: NavEntry[] = NAV): NavEntry[] {
  return sidebarItems(nav);
}

/** Pages that are not in the menu but can be opened (Help, from the sidebar's footer). */
const EXTRA_PAGES: Record<string, string> = { [HELP_PAGE]: "Help" };

/** The menu item that holds a page (a Settings page sits under Settings' first page). */
export function setupMenuItemFor(page: string, menu: NavEntry[] = setupMenu()): string {
  if (EXTRA_PAGES[page]) return "";
  return menu.find((item) => item.id === page || item.children?.some((c) => c.id === page))?.id ?? page;
}

/** A page's name, for the locked page and the page title. */
export function setupPageLabel(page: string, menu: NavEntry[] = setupMenu()): string {
  if (EXTRA_PAGES[page]) return EXTRA_PAGES[page];
  for (const item of menu) {
    if (item.id === page && !item.children) return item.label;
    const child = item.children?.find((c) => c.id === page);
    if (child) return child.label;
    if (item.id === page) return item.label;
  }
  return "This page";
}

/** One step of the setup guide. */
export interface GuideStep {
  id: string; title: string; done: boolean; page: string; action: string; locked?: boolean;
  /** A step a press may leave undone (nothing to bring over): counted only once it is done. */
  optional?: boolean;
}

/** The setup guide's steps from the press's record, in order. A stockroom-only press has no website look to pick. */
export function guideSteps(press: SetupPress): GuideStep[] {
  const website = press.plan !== "stockroom";
  // Written in book words; the guide shows them in the shop's own (sells.ts).
  const books: GuideStep = { id: "books", title: "Bring your books over from your old shop", done: !!press.stagedImport, page: IMPORT_PAGE, action: "Bring a file", optional: true };
  const look: GuideStep[] = website ? [{ id: "look", title: "Choose your website's look", done: !!press.look, page: DESIGN_PAGE, action: "Choose a look" }] : [];
  // A press that may be moving brings its books before picking a look, so the look previews can show them (23.0);
  // one starting fresh has it last, as an optional step.
  const fresh = press.moving === "fresh";
  return [
    { id: "plan", title: "Pick what you want to set up", done: !!press.plan, page: PLAN_PAGE, action: "Choose" },
    { id: "details", title: "Tell us about your press", done: !!(press.pressName && press.sells && press.country), page: GENERAL_PAGE, action: "Add details" },
    ...(fresh ? [...look, books] : [books, ...look]),
    // Your web address: bring a domain, buy one, or keep the free address for now. Answered is done; a press gone to
    // buy one is done once it comes back with the domain. Optional: the free address always works.
    ...(website ? [{ id: "domain", title: "Choose your web address", done: press.domainChoice === "free" || (press.domainChoice === "own" && !!press.domain),
      page: GENERAL_PAGE, action: "Choose", optional: true }] : []),
    // "Create", not "open": the shop is made private, and the press opens it to shoppers from its own admin later.
    { id: "open", title: "Create your shop", done: press.status === "opening" || press.status === "open", page: PLAN_PAGE, action: "Create my shop" },
  ];
}

/**
 * Home's "Selling somewhere already?" card (23.0): shown above the setup guide while the press is in setup, has kept no
 * product file and hasn't said it is starting fresh.
 */
export const showMoveIn = (press: SetupPress): boolean => press.status === "setup" && !press.stagedImport && press.moving !== "fresh";

/**
 * The step to do next: the first one not done that isn't optional, else the first one not done at all. A press bringing
 * its shop over (`moving: "yes"`, 23.0) is pointed at its books too, since they come before the look for it.
 */
export function nextGuideStep(steps: GuideStep[], press?: Pick<SetupPress, "moving">): GuideStep | null {
  const open = steps.filter((s) => !s.done && !s.locked);
  if (press?.moving === "yes") return open[0] ?? null;
  return open.find((s) => !s.optional) ?? open[0] ?? null;
}

/** Everything the shop needs is in place: only Create your shop (and any optional step) is left. */
export const readyToCreate = (steps: GuideStep[]): boolean =>
  steps.every((s) => s.done || s.optional || s.id === "open") && !steps.find((s) => s.id === "open")?.done;

/** "2 of 5 done", counting only the steps that can be done in setup. */
export function guideProgress(steps: GuideStep[]): { done: number; total: number } {
  const counted = steps.filter((s) => !s.locked && (!s.optional || s.done));
  return { done: counted.filter((s) => s.done).length, total: counted.length };
}

/**
 * The page in the address (`#settings/general`): Home for an empty address, and null for an address that names no
 * page (the skip link's `#rp-main`, say), so the page on screen stays put.
 */
export function pageFromHash(hash: string, menu: NavEntry[] = setupMenu()): string | null {
  let page: string;
  try { page = decodeURIComponent(hash.replace(/^#/, "").split("?")[0]); } catch { return null; }
  if (!page) return HOME_PAGE;
  const known = !!EXTRA_PAGES[page] || menu.some((item) => item.id === page || item.children?.some((c) => c.id === page));
  return known ? page : null;
}

/** The help centre's address for this shop: a shop that doesn't sell books gets the answers in its own words (`?sells=`). */
export function helpFor(helpUrl: string, sells?: string | null): string {
  if (!sells || sellsBooks(sells)) return helpUrl;
  return `${helpUrl}${helpUrl.includes("?") ? "&" : "?"}sells=${encodeURIComponent(sells)}`;
}

/**
 * The help answer behind each setup guide step (help/articles.js ids), opened in place from the step as "How this works".
 * The plan step has none (its prices and trial are on Settings › Plan itself), nor has Tell us about your press: the
 * help centre's Your press answer is the open shop's contact details, not setup's three questions.
 */
export const STEP_HELP: Readonly<Record<string, string>> = Object.freeze({
  books: "bring-books",
  look: "look",
  domain: "own-address",
  open: "open-shop",
});

/** The help answers a press in setup asks about most, for Home and the Help page (help/articles.js ids). */
export const SETUP_QUESTIONS: ReadonlyArray<{ id: string; question: string }> = Object.freeze([
  { id: "what-you-sell", question: "Can I change what my shop sells later?" },
  { id: "bring-books", question: "How do I bring my books over from my old shop?" },
  { id: "look", question: "How do I change how my shop looks?" },
  { id: "own-address", question: "Can my shop use my own web address?" },
  { id: "open-shop", question: "How do I open my shop to shoppers?" },
  { id: "trial-ends", question: "What happens when my free trial ends?" },
]);

/**
 * What each page that waits for the shop will do, so a locked page says why it's worth having, not only that it's
 * locked. Written in book words (the page shows the shop's own). Every locked menu page has a line (pages.test.ts).
 */
const LOCKED_LINES: Readonly<Record<string, string>> = Object.freeze({
  orders: "Every order in one list: who bought what, what's paid, and what's left to pack and send.",
  customers: "Everyone who buys from you, what they bought and who comes back.",
  discounts: "Discount codes and sales, set to start and end when you choose.",
  giftCards: "Gift cards shoppers buy from your website, and ones you give away.",
  messages: "Messages people send you from your website's contact form.",
  inventory: "How many copies you have of each book, with a warning before one runs out.",
  reviews: "Reviews from your readers, checked by you before they show on your website.",
  channels: "Sell on Facebook, Instagram, Pinterest and TikTok.",
  socialPosts: "Post your books to your social accounts, now or later.",
  [SETTINGS_ITEM_PREFIX + "shipping"]: "What you charge to send a parcel, by country or by weight, and pickup if you offer it.",
  [SETTINGS_ITEM_PREFIX + "payments"]: "Connect your bank so card payments from your website reach you.",
  [SETTINGS_ITEM_PREFIX + "taxes"]: "The sales tax your shop adds at checkout, worked out from where your shoppers are.",
  [SETTINGS_ITEM_PREFIX + "notifications"]: "The emails your shoppers get: order received, shipped, and the words in each.",
  [SETTINGS_ITEM_PREFIX + "team"]: "Invite someone to help run your shop, with only the pages they need.",
  [SETTINGS_ITEM_PREFIX + "google"]: "Google search, Google Shopping, Maps and visit figures, linked with one Google sign-in.",
  [SETTINGS_ITEM_PREFIX + "apps"]: "What the apps you add change in your shop, after your shop's own checks.",
  [SETTINGS_ITEM_PREFIX + "security"]: "Two-step sign-in and who has signed in to your shop.",
  [SETTINGS_ITEM_PREFIX + "bookkeeping"]: "Your sales and fees, ready for your accountant.",
  [SETTINGS_ITEM_PREFIX + "billing"]: "Your bills for your plan, and the card they're paid with.",
});

/** The line for a locked page: what it will do, or a plain line for a page without one. */
export const lockedPageLine = (page: string): string => LOCKED_LINES[page] ?? "";
