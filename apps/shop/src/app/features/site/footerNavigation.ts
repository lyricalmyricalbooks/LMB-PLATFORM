import { getCopy } from "./storeCopy";
import { shopSocialLinks } from "./socialAccounts";
import { type MenuItem } from "./storeMenu";

export type FooterGroup = "explore" | "connect";
export function footerGroup(item: MenuItem): FooterGroup {
  return item.footerGroup ?? (/submission|open[-\s]?call|contact|instagram|mailto:|\/track|\/book$/i.test(`${item.value || ""} ${item.label}`) ? "connect" : "explore");
}

/** A published page linked from the footer: every page in the header menu, plus "footer only" pages
 *  (Studio › Pages › Where the link shows, `showInFooter`). */
export const pageInFooter = (p: any) => !!p && p.status === "published" && !!(p.showInNav || p.showInFooter);

/** Build editable menu records without changing the published page collection. */
export function automaticFooterItems(settings: any, pages: any[]): MenuItem[] {
  const d = settings?.design || {};
  const visible = (pages || []).filter(pageInFooter);
  // A services website (servicesStorefront.ts) has nothing to shop for or track.
  const selling = settings?.servicesStorefront !== true;
  const items: MenuItem[] = [
    ...(selling ? [
      { id: "footer-shop", label: getCopy(d, "footerLinkShop"), type: "home" as const, footerGroup: "explore" as const },
      { id: "footer-track", label: getCopy(d, "footerLinkTrack"), type: "url" as const, value: "/track", footerGroup: "connect" as const },
    ] : []),
    // While the shop takes bookings (the server keeps `bookingsLive` in step with the owner's switch).
    ...(settings?.bookingsLive === true ? [{ id: "footer-book", label: getCopy(d, "bookTimeFooterLink"), type: "url" as const, value: "/book", footerGroup: "connect" as const }] : []),
    // While the shop has events coming up (the server keeps `eventsLive` in step, functions/events.js).
    ...(settings?.eventsLive === true ? [{ id: "footer-events", label: getCopy(d, "eventsFooterLink"), type: "url" as const, value: "/events", footerGroup: "connect" as const }] : []),
    // While the shop has classes on its timetable (the server keeps `classesLive` in step, functions/bookings.js).
    ...(settings?.classesLive === true ? [{ id: "footer-classes", label: getCopy(d, "classesFooterLink"), type: "url" as const, value: "/classes", footerGroup: "connect" as const }] : []),
    // While the shop takes gifts (the server keeps `givingLive` in step, functions/giving.js).
    ...(settings?.givingLive === true ? [{ id: "footer-support", label: getCopy(d, "supportFooterLink"), type: "url" as const, value: "/support", footerGroup: "connect" as const }] : []),
    // While the shop takes new members (the server keeps `membershipsLive` in step, functions/memberships.js).
    ...(settings?.membershipsLive === true ? [{ id: "footer-membership", label: getCopy(d, "membershipFooterLink"), type: "url" as const, value: "/membership", footerGroup: "connect" as const }] : []),
    ...(settings?.rentalsLive === true ? [{ id: "footer-rentals", label: getCopy(d, "rentalsFooterLink"), type: "url" as const, value: "/rentals", footerGroup: "connect" as const }] : []),
    ...visible.map(p => ({ id: `footer-page-${p.id}`, label: p.title, type: "page" as const, value: p.slug })),
  ];
  const instagram = shopSocialLinks(settings).find((l) => l.key === "instagram")?.url;
  if (d.showSocialInFooter !== false && instagram) items.push({ id: "footer-instagram", label: getCopy(d, "footerLinkInstagram"), type: "url", value: instagram, footerGroup: "connect" });
  // A contact page already supplies the contact destination; do not repeat it.
  if (!visible.some(p => /^(contact|contact-us)$/i.test(p.slug))) items.push({ id: "footer-contact", label: getCopy(d, "footerLinkContact"), type: "url", value: `mailto:${settings?.info?.email || "owner@example.com"}`, footerGroup: "connect" });
  return items;
}

export function groupedFooterItems(items: MenuItem[]) {
  const groups: Record<FooterGroup, MenuItem[]> = { explore: [], connect: [] };
  for (const item of items) {
    if (item.hidden) continue;
    groups[footerGroup(item)].push(item);
  }
  return groups;
}
