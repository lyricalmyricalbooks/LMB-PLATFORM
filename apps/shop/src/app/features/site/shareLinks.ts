// Share links on product pages (code plan 27.7), like the share buttons Shopify's themes put on a product: Facebook,
// Pinterest, X, WhatsApp and email, each opening that site's own share page with the product's address. Each address
// says where the visit came from (utm_source), so the Overview's visit sources count shares. Pure and tested.

export type ShareTarget = "facebook" | "pinterest" | "x" | "whatsapp" | "email";
/** The order the menu lists them, and the Text & labels word for each. */
export const SHARE_TARGETS: { id: ShareTarget; copyKey: string }[] = [
  { id: "facebook", copyKey: "bookShareFacebook" },
  { id: "pinterest", copyKey: "bookSharePinterest" },
  { id: "x", copyKey: "bookShareX" },
  { id: "whatsapp", copyKey: "bookShareWhatsApp" },
  { id: "email", copyKey: "bookShareEmail" },
];

/** The page's address marked as a share from `source` (any earlier marks replaced, the #fragment dropped). */
export function sharedUrl(pageUrl: string, source: string): string {
  try {
    const url = new URL(pageUrl);
    url.hash = "";
    for (const k of [...url.searchParams.keys()]) if (k.startsWith("utm_")) url.searchParams.delete(k);
    url.searchParams.set("utm_source", source);
    url.searchParams.set("utm_medium", "share");
    return url.toString();
  } catch {
    return pageUrl;
  }
}

/** The share page on each site for this product. `image` is used by Pinterest (a pin needs a picture). */
export function shareHref(target: ShareTarget, { url, title, image }: { url: string; title: string; image?: string }): string {
  const e = encodeURIComponent;
  const link = sharedUrl(url, target);
  switch (target) {
    case "facebook": return `https://www.facebook.com/sharer/sharer.php?u=${e(link)}`;
    case "pinterest": return `https://www.pinterest.com/pin/create/button/?url=${e(link)}${image && /^https:\/\//.test(image) ? `&media=${e(image)}` : ""}&description=${e(title)}`;
    case "x": return `https://x.com/intent/tweet?url=${e(link)}&text=${e(title)}`;
    case "whatsapp": return `https://wa.me/?text=${e(`${title} ${link}`)}`;
    case "email": return `mailto:?subject=${e(title)}&body=${e(`${title}\n\n${link}`)}`;
  }
}
