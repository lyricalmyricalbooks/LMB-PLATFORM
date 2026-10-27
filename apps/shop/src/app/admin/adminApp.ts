import { useEffect } from "react";

// The admin as an installable app (Chrome › Install app today, an Android app from Google Play later): while the
// admin is open, the page names public/admin.webmanifest (start /admin, standalone, its own icon) instead of the
// shop's site.webmanifest, and the phone's status bar takes the admin's cream. Leaving the admin puts both back.

export const ADMIN_MANIFEST = "admin.webmanifest";
export const ADMIN_THEME_COLOR = "#faf6ec";

/** The manifest address for this build (the site can be built under a sub-path). */
export const adminManifestHref = (base = "/") => `${base.endsWith("/") ? base : `${base}/`}${ADMIN_MANIFEST}`;

export function useAdminAppManifest() {
  useEffect(() => {
    const head = document.head;
    let link = head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const created = !link;
    const previous = link?.getAttribute("href") ?? null;
    if (!link) { link = document.createElement("link"); link.rel = "manifest"; head.appendChild(link); }
    link.setAttribute("href", adminManifestHref(import.meta.env.BASE_URL));

    let meta = head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const addedMeta = !meta;
    const previousColor = meta?.getAttribute("content") ?? null;
    if (!meta) { meta = document.createElement("meta"); meta.name = "theme-color"; head.appendChild(meta); }
    meta.setAttribute("content", ADMIN_THEME_COLOR);

    return () => {
      if (created) link?.remove(); else if (previous !== null) link?.setAttribute("href", previous);
      if (addedMeta) meta?.remove(); else if (previousColor !== null) meta?.setAttribute("content", previousColor);
    };
  }, []);
}
