import { createContext, useContext, type ReactNode } from "react";
import { layerDesign } from "./designModel";
import { StoreFooter } from "./StoreFooter";
import { StoreHeader } from "./StoreHeader";
import { useSiteData } from "./useSiteData";

/** Pages that had their own small title bar and no shop header before Studio 2.0 · 2.1. */
export type UtilitySurface = "wishlistPage" | "accountPage" | "trackingPage" | "page404";

const InStoreChrome = createContext(false);

/**
 * True inside <StoreChrome> with the shop header showing. A page's own title bar then renders as a
 * plain row instead of a second `<header>`, so there is one banner landmark and Studio's page structure
 * lists it under Page, not Header.
 */
export const useInStoreChrome = () => useContext(InStoreChrome);

/**
 * Style › Header & announcement bar › "Show the shop header & footer on wishlist, account, order
 * tracking and missing pages" (`showStoreChromeOnUtilityPages`, on by default). A value on the
 * page's own canvas (design[surface]) wins over the root, like other page settings.
 */
export function storeChromeVisible(design: any, surface: UtilitySurface): boolean {
  if (!design) return false;
  return layerDesign(design, design[surface]).showStoreChromeOnUtilityPages !== false;
}

/**
 * The one storefront header and footer around the wishlist, account, order-tracking and 404 pages.
 * The wrapper element is always rendered (as `display: contents` while hidden or loading), so the page
 * inside never remounts when the setting or the site data changes.
 */
export function StoreChrome({ surface, children }: { surface: UtilitySurface; children: ReactNode }) {
  const { settings, pages, books, loading } = useSiteData();
  const design = settings?.design;
  const visible = !loading && storeChromeVisible(design, surface);
  return (
    <div data-fm-store={visible ? true : undefined} data-store-chrome={surface} className={visible ? "fm-page flex min-h-screen flex-col" : "contents"}>
      {visible && <StoreHeader design={design} pages={pages || []} books={books || []} />}
      <InStoreChrome.Provider value={visible}>{children}</InStoreChrome.Provider>
      {visible && <StoreFooter settings={settings} pages={pages || []} />}
    </div>
  );
}
