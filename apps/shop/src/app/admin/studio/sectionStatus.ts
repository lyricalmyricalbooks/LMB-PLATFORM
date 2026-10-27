import { shopInstant } from "../../features/site/shopTime";

/**
 * Why a visible section is still missing from the preview (outline note): outside its Show from / Show until
 * window (the same Toronto-time rule as `sectionInWindow` in sectionRender), or hidden at the previewed size
 * (`hideOnMobile` hides below 768px; `hideOnDesktop` hides from 768px, so tablets too). "" = it shows.
 */
export function sectionPreviewNote(section: any, device: string, now = Date.now(), templateId = ""): string {
  const s = section?.settings || {};
  // The sticky bar shows the current book; on any other page it has nothing to show.
  if (section?.type === "StickyAddToBagSection" && templateId && !templateId.startsWith("productPage")) return "Shows only on book pages";
  if (s.showFrom && now < shopInstant(s.showFrom)) return "Scheduled, not shown yet";
  if (s.showUntil && now > shopInstant(s.showUntil)) return "Schedule ended, not shown";
  if (device === "mobile" && s.hideOnMobile) return "Hidden on phones";
  if (device === "tablet" && (s.hideOnTablet || s.hideOnDesktop)) return "Hidden on tablets";
  if (device === "desktop" && s.hideOnDesktop) return "Hidden on desktop";
  return "";
}
