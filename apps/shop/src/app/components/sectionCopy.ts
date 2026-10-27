import { createContext, useContext } from "react";
import { getCopy } from "../features/site/storeCopy";
import type { DynamicContext } from "../features/site/dynamicSources";

// Section renderers are pure (no data hooks), so the page's design travels down by context:
// SectionList provides it, renderers read the shopper-facing helper words (image placeholders,
// screen-reader labels) through getCopy → Studio › Text & labels › Sections.
export const SectionDesignContext = createContext<any>(null);

/** The page design (or null) — e.g. the shop's categories for a "Which books: category" source. */
export function useSectionDesign(): any {
  return useContext(SectionDesignContext);
}

export function useSectionCopy() {
  const design = useContext(SectionDesignContext);
  return (key: string, vars?: Record<string, string | number>) => getCopy(design, key, vars);
}

/**
 * What page the sections are on: the book on a book page (BookDetail), the open category on a collection (MainSite),
 * the custom page (PageView). Book spotlight and the sticky add-to-bag bar use the book; connected fields (Studio 2.7
 * dynamic sources, `features/site/dynamicSources.ts`) read all three. Elsewhere it is empty.
 */
export const SectionPageContext = createContext<DynamicContext>({});
export function useSectionPage() {
  return useContext(SectionPageContext);
}
