// Page help (the "?" by every page title): which entry a page gets, in the shop's words, and how a part is found on
// screen. Pure apart from `findPart`, which reads the page it is given. Words live in pageHelpContent.ts.
import { PAGE_HELP, PAGE_HELP_ALIASES, type HelpPart, type PageHelpEntry } from "./pageHelpContent";

export type { HelpPart, PageHelpEntry };

/** The help key for the page on screen: `orders`, `settings/<page>` or `stockroom/<page>`. */
export function pageHelpKey({ activeTab, settingsPage, stockroomPage }: {
  activeTab: string; settingsPage?: string | null; stockroomPage?: string | null;
}): string {
  if (activeTab === "settings" || activeTab === "shipping" || activeTab === "payments") {
    const page = activeTab === "settings" ? settingsPage || "general" : activeTab;
    return `settings/${page}`;
  }
  if (activeTab === "stockroom") return `stockroom/${stockroomPage || "todo"}`;
  return activeTab;
}

/**
 * The help a page gets, in the shop's words (`w`), or null when it has none. Book words replace the plain ones in a
 * shop that sells books; book-only parts go elsewhere.
 */
export function pageHelpFor(key: string, { books, w = (s) => s }: { books: boolean; w?: (s: string) => string }): PageHelpEntry | null {
  const entry = PAGE_HELP[key] ?? PAGE_HELP[PAGE_HELP_ALIASES[key] ?? ""];
  if (!entry) return null;
  const parts = entry.parts
    .filter((p) => books || !p.booksOnly)
    .map((p) => ({ ...p, title: w(p.title), text: w(books && p.books ? p.books : p.text) }));
  return { intro: w(books && entry.books ? entry.books : entry.intro), parts };
}

const norm = (s: string | null | undefined) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

/** Shown and not hidden away (a closed tab's panel, the phone's off-screen drawer). */
function shown(el: Element): el is HTMLElement {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  return !(el as HTMLElement).closest("[hidden], [aria-hidden='true'], .rp-sidebar, .rp-dialog-root, .rp-tour-root");
}

/** The block a heading names (its card or section), when that block fits on screen; else the heading itself. */
const BLOCK = "section, article, fieldset, table, .rp-card, .rp-fk-section, [class*='card'], [class*='tile'], [class*='panel']";
function blockOf(el: HTMLElement, maxHeight: number): HTMLElement {
  if (el.matches("button, a, input, select, [role=tab], [role=tablist], [role=group]")) return el;
  const block = el.parentElement?.closest<HTMLElement>(BLOCK);
  if (!block || block.matches(".rp-page-body, .rp-page-main")) return el;
  const r = block.getBoundingClientRect();
  return r.height <= maxHeight && r.width > 0 ? block : el;
}

/**
 * The element a part points at, inside `roots` (the page's header and body). Each `at` entry is tried in turn: a CSS
 * selector after `$`, or words the page shows (the deepest element whose text is or starts with them; button and tab
 * counts like "Waiting 3" still match). Null when none is on screen.
 */
export function findPart(part: Pick<HelpPart, "at">, roots: Element[], maxHeight = 520): HTMLElement | null {
  for (const at of part.at ?? []) {
    if (at.startsWith("$")) {
      for (const root of roots) {
        const el = [...root.querySelectorAll(at.slice(1))].find(shown);
        if (el) return el;
      }
      continue;
    }
    const want = norm(at);
    for (const root of roots) {
      let best: HTMLElement | null = null;
      for (const el of root.querySelectorAll<HTMLElement>("*")) {
        const text = el.textContent;
        if (!text || text.length > 120 || !norm(text).startsWith(want)) continue;
        // The deepest match: a child that matches too wins over its parent.
        if (best && !best.contains(el)) break;
        if (shown(el)) best = el;
      }
      if (best && shown(best)) return blockOf(best, maxHeight);
    }
  }
  return null;
}
