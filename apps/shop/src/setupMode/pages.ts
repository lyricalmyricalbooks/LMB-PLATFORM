// What setup mode shows (code plan 18.6): the real admin's menu, with the pages that work before a shop exists and
// every other page locked until the shop opens. Pure, so the menu and the locks are tested without a browser.
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
