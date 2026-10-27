import { layerDesign } from "./designModel";

/** The tab icon chosen in Studio › Style › Favicon (the shop's "All pages" value, else the catalog page's). */
export function faviconFor(design: any): string {
  const url = layerDesign(design || {}, design?.storefront)?.faviconUrl;
  return typeof url === "string" ? url.trim() : "";
}

const CUSTOM_ATTR = "data-fm-favicon";
/** index.html's built-in icons (public/favicon*), taken off the page while a Studio picture is shown. */
const builtIn = new WeakMap<Document, HTMLLinkElement[]>();

/**
 * Puts the shop's favicon on the current document. Every storefront page calls this (through
 * useSiteData, and Checkout), so a page opened directly — e.g. Track order from an email link —
 * shows the icon too, not only the home page.
 *
 * index.html ships sized icons drawn for tabs (16/32px PNG + favicon.ico). A Studio picture replaces
 * all of them (a browser would otherwise keep picking the best-sized built-in one); clearing the
 * Studio picture puts them back. The home-screen icon (apple-touch-icon, manifest) stays built in.
 */
export function applyFavicon(design: any, doc: Document | undefined = typeof document === "undefined" ? undefined : document) {
  if (!doc) return;
  const url = faviconFor(design);
  let link = doc.querySelector(`link[${CUSTOM_ATTR}]`) as HTMLLinkElement | null;
  if (!url) {
    if (!link) return;
    link.remove();
    const icons = builtIn.get(doc) || [];
    builtIn.delete(doc);
    // A page prerendered while a Studio picture was set has no built-in icons to put back.
    if (!icons.length) {
      const icon = doc.createElement("link");
      icon.rel = "icon";
      icon.href = `${import.meta.env?.BASE_URL || "/"}favicon.ico`;
      icons.push(icon);
    }
    for (const icon of icons) doc.head.appendChild(icon);
    return;
  }
  if (!link) {
    const icons = Array.from(doc.querySelectorAll("link[rel~='icon']")) as HTMLLinkElement[];
    icons.forEach(icon => icon.remove());
    builtIn.set(doc, icons);
    link = doc.createElement("link");
    link.rel = "icon";
    link.setAttribute(CUSTOM_ATTR, "");
    doc.head.appendChild(link);
  }
  if (link.getAttribute("href") !== url) link.setAttribute("href", url);
}
