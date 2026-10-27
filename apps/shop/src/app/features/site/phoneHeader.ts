// Studio › Style › Header & announcement bar › "Compact header on phones" (`phoneCompactHeader`, on by default).
// Below the phone breakpoint it turns the announcement into one quiet line, tightens the header row so the
// whole wordmark, search and bag sit on one line, and makes the bag button smaller. Emitted by
// StorefrontOverrides on every storefront surface; the parts opt in with `fm-announce`, `fm-hdr-row`,
// `fm-hdr-cart` (StoreHeader) and `.fm-logo` (LogoMark).
import { PHONE_MAX } from "./breakpoints";

export const phoneCompactHeader = (d: any): boolean => d?.phoneCompactHeader !== false;

export function phoneHeaderCss(design: any): string {
  if (!phoneCompactHeader(design)) return "";
  return `@media (max-width:${PHONE_MAX}px){`
    + `.fm-announce.fm-announce{padding:6px 12px;font-size:11px;letter-spacing:0.12em;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}`
    + `.fm-hdr-row.fm-hdr-row{padding:6px 8px 6px 16px;gap:8px;}`
    + `.fm-hdr-row .fm-logo{font-size:min(22px,5.2vw) !important;white-space:nowrap;}`
    + `.fm-hdr-cart.fm-hdr-cart{padding:8px 12px;gap:6px;}`
    + `}`;
}
