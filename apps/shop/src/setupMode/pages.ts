// What setup mode shows (code plan 18.6): the real admin's menu, with the pages that work before a shop exists and
// every other page locked until the shop opens. Pure, so the menu and the locks are tested without a browser.
import { HelpCircle, Wallet } from "lucide-react";
import type { NavEntry } from "../app/admin/riso/components";
import { NAV, SETTINGS_ITEM_PREFIX, sidebarItems } from "../app/admin/riso/nav";
import type { SetupPress } from "./door";

export const PLAN_PAGE = SETTINGS_ITEM_PREFIX + "plan";
export const GENERAL_PAGE = SETTINGS_ITEM_PREFIX + "general";
export const DESIGN_PAGE = SETTINGS_ITEM_PREFIX + "designer";
export const HELP_PAGE = "help";
export const HOME_PAGE = "overview";

/** The pages that work in setup mode. Everything else in the menu opens "Opens with your shop". */
export const SETUP_PAGES: ReadonlySet<string> = new Set([HOME_PAGE, DESIGN_PAGE, GENERAL_PAGE, PLAN_PAGE, HELP_PAGE]);

export const setupLocked = (page: string): boolean => !SETUP_PAGES.has(page);

/**
 * The menu: the admin's own five items, with Plan and billing and Help as items of their own (Plan moves out of
 * Settings). The admin a press meets in setup is the one it keeps.
 */
export function setupMenu(nav: NavEntry[] = NAV): NavEntry[] {
  const items = sidebarItems(nav).map((item) => (item.children
    ? { ...item, children: item.children.filter((c) => c.id !== PLAN_PAGE) }
    : item));
  return [
    ...items,
    { id: PLAN_PAGE, label: "Plan and billing", icon: Wallet },
    { id: HELP_PAGE, label: "Help", icon: HelpCircle },
  ];
}

/** The menu item that holds a page (a Settings page sits under Settings' first page). */
export function setupMenuItemFor(page: string, menu: NavEntry[] = setupMenu()): string {
  return menu.find((item) => item.id === page || item.children?.some((c) => c.id === page))?.id ?? page;
}

/** A page's name, for the locked page and the page title. */
export function setupPageLabel(page: string, menu: NavEntry[] = setupMenu()): string {
  for (const item of menu) {
    if (item.id === page && !item.children) return item.label;
    const child = item.children?.find((c) => c.id === page);
    if (child) return child.label;
    if (item.id === page) return item.label;
  }
  return "This page";
}

/** One step of the setup guide. */
export interface GuideStep { id: string; title: string; done: boolean; page: string; action: string; locked?: boolean }

/** The setup guide's steps from the press's record, in order. A stockroom-only press has no website look to pick. */
export function guideSteps(press: SetupPress): GuideStep[] {
  const website = press.plan !== "stockroom";
  return [
    { id: "plan", title: "Pick what you want to set up", done: !!press.plan, page: PLAN_PAGE, action: "Choose" },
    { id: "details", title: "Tell us about your press", done: !!(press.pressName && press.sells && press.country), page: GENERAL_PAGE, action: "Add details" },
    ...(website ? [{ id: "look", title: "Choose your website's look", done: !!press.look, page: DESIGN_PAGE, action: "Choose a look" }] : []),
    { id: "products", title: "Add your first products", done: false, page: "catalog", action: "Opens with your shop", locked: true },
    { id: "open", title: "Open your shop", done: press.status !== "setup", page: PLAN_PAGE, action: "See how" },
  ];
}

/** "2 of 5 done", counting only the steps that can be done in setup. */
export function guideProgress(steps: GuideStep[]): { done: number; total: number } {
  const counted = steps.filter((s) => !s.locked);
  return { done: counted.filter((s) => s.done).length, total: counted.length };
}

/** The page in the address (`#settings/general`), or Home. */
export function pageFromHash(hash: string, menu: NavEntry[] = setupMenu()): string {
  const page = decodeURIComponent(hash.replace(/^#/, "").split("?")[0]);
  if (!page) return HOME_PAGE;
  const known = menu.some((item) => item.id === page || item.children?.some((c) => c.id === page));
  return known ? page : HOME_PAGE;
}
