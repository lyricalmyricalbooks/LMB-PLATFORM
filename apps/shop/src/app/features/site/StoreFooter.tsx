import { Link } from "react-router";
import { Mail, Music2 } from "lucide-react";
import { Facebook, Instagram, Twitter } from "./socialIcons";
import { POLICY_KEYS, policySlug, policyTitle } from "./policyPages";
import { DEFAULT_SOCIAL } from "./constants";
import { contentMaxWidth } from "./headerNav";
import { getCopy, shopCopyFallback } from "./storeCopy";
import { resolveFooterBadges } from "./paymentBadges";
import { PAYMENT_ICONS } from "./paymentIcons";
import { regionProps } from "./storefrontRegions";
import { GroupedFooterNavigation } from "../../components/GroupedFooterNavigation";
import { FooterMenu } from "../../components/StoreMenu";
import { wordmarkSecondaryStyle } from "../../components/LogoMark";
import { footerLinksAlign, footerStyleCss } from "./footerStyle";
import { pageInFooter } from "./footerNavigation";
import { elementScheme } from "./colorSchemes";
import { BackToTop } from "./extras/footer-back-to-top/BackToTop";
import { FooterCurrency, footerCurrencyOn } from "./extras/footer-currency/FooterCurrency";

// ──────────────────────────────
// The one storefront footer (Studio 2.0 · 2.1): home, catalog, collections, product, custom pages,
// wishlist, account, tracking and 404. Checkout keeps its own short policy row.
// ──────────────────────────────
export function StoreFooter({ settings, pages }: { settings: any; pages: any[] }) {
  const navPages = (pages || []).filter(pageInFooter);
  const rawDesign = settings?.design || {};
  // Never configured → the house default; cleared on purpose in Studio → hidden.
  const social = settings?.design?.social ?? DEFAULT_SOCIAL;
  const instagramUrl: string = social.instagram || "";
  // Theme settings › Footer & social links › Facebook / X / TikTok: shown beside Instagram once filled in.
  const otherSocial = ([
    ["facebook", Facebook, "footerLinkFacebook", "footerFacebookAria"],
    ["twitter", Twitter, "footerLinkTwitter", "footerTwitterAria"],
    ["tiktok", Music2, "footerLinkTiktok", "footerTiktokAria"],
  ] as const).map(([key, Icon, linkKey, ariaKey]) => ({ key, Icon, linkKey, ariaKey, url: String(social?.[key] || "").trim() }))
    .filter((s) => /^https?:\/\//i.test(s.url));
  const d = rawDesign;
  const grouped = d.footerNavigationLayout !== "columns";
  const policyKeys = POLICY_KEYS.filter(k => (settings?.policies as any)?.[k]?.trim());
  const fourCol = d?.footerLayout === "4col";
  // "Multi-column footer" off → the columns stack into one.
  const multiColumn = d?.footerColumns !== false;
  // Typography › Logo wordmark font, like the header's logo (LogoMark); empty = the heading font.
  const wordmarkFontFamily = (d?.wordmarkFont || d?.headingFont) ? `'${d.wordmarkFont || d.headingFont}', serif` : undefined;
  // Footer logo picture: "image" (instead of the name) or "both" (above it); empty = the name only, as before.
  const footerLogoMode: string = d.footerLogo === "image" || d.footerLogo === "both" ? d.footerLogo : "";
  const footerLogoSrc: string = footerLogoMode ? String(d.footerLogoUrl || d.logoUrl || "").trim() : "";
  const footerLogoWidth = Math.min(320, Math.max(40, Number(d.footerLogoWidth) || 120));
  const linksAlign = footerLinksAlign(d);
  const groupedGrid = linksAlign === "spread" ? "md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
    : linksAlign === "start" ? "md:grid-cols-[auto_minmax(0,1fr)]" : "md:grid-cols-[minmax(0,1fr)_auto]";
  const groupsLayout = linksAlign === "spread" ? "grid grid-cols-2"
    : `grid grid-cols-2 sm:flex sm:flex-wrap ${linksAlign === "start" ? "md:justify-self-start" : "md:justify-self-end"}`;
  const email = settings?.info?.email || "lyricalmyricalbooks@gmail.com";
  const footerAbout: string = String((settings?.design?.copy?.footerAbout != null ? getCopy(settings?.design, "footerAbout") : shopCopyFallback(settings, "footerAbout") || getCopy(settings?.design, "footerAbout")) ?? "");
  const footerLocation: string = String(getCopy(d, "footerLocation") ?? "");
  const badges = d?.showPaymentBadges !== false ? resolveFooterBadges(d, settings) : [];
  return (
    <footer {...regionProps("footerPanel")} data-fm-footer=""
      data-studio-target="style:footer|style:catalogElements|copy:Footer" data-studio-label="Footer"
      className="border-t-2 border-white/30 bg-black/40"
      style={elementScheme(d, "footer") ? { backgroundColor: "var(--bg-color)", color: "var(--text-color)" } : d?.footerBg ? { backgroundColor: d.footerBg } : undefined}
    >
      <style>{footerStyleCss(d)}</style>
      {/* One padded column: the top band, legal row and bottom bar share the same left/right edge, and the
          divider lines start and end exactly where the text does. */}
      <div style={{ maxWidth: contentMaxWidth(d) }} className="mx-auto px-6">
      <div className={`fm-footer-main fm-footer-text grid grid-cols-1 ${!multiColumn ? "" : grouped ? groupedGrid : fourCol ? "md:grid-cols-4" : "md:grid-cols-3"} gap-10 md:gap-x-16 text-[11px] text-white/70`}>
        {/* Col 1: Brand */}
        <div {...regionProps("footerBrand")} className="fm-footer-brand space-y-4 min-w-0 max-w-sm" data-studio-target="copy:Footer|style:logo|style:catalogElements" data-studio-label="Footer brand">
          {/* Style › Footer › Footer logo: a picture instead of (or above) the shop name; blank picture = the header logo */}
          {footerLogoSrc && (
            <img
              loading="lazy"
              src={footerLogoSrc}
              alt={getCopy(d, "logoAlt")}
              decoding="async"
              className="block h-auto object-contain"
              style={{ width: footerLogoWidth, maxWidth: "100%" }}
            />
          )}
          {footerLogoSrc && footerLogoMode === "image" ? null : d?.wordmarkStyle === "two-part" ? (
            <p className="text-white text-xl" style={{ fontFamily: wordmarkFontFamily, fontWeight: d?.wordmarkWeight ?? 600, letterSpacing: "-0.01em" }}>
              <span data-studio-style-text="wordmarkPrimary">{d.wordmarkPrimary ?? "Lyricalmyrical"}</span> <span data-studio-style-text="wordmarkSecondary" style={wordmarkSecondaryStyle(d)}>{d.wordmarkSecondary ?? "Books"}</span>
            </p>
          ) : (
            <p className="text-white font-bold tracking-widest text-xs"><span data-studio-copy="footerWordmark">{getCopy(settings?.design, "footerWordmark")}</span></p>
          )}
          {/* A blank line is hidden (data-empty) so it can't push a centred logo off centre. */}
          <p className="leading-relaxed max-w-xs" data-empty={footerAbout.trim() ? undefined : ""}>
            <span data-studio-copy="footerAbout">{footerAbout}</span>
          </p>
          {grouped && d.showFooterLocation !== false && <p data-studio-target="copy:Footer|style:footer" data-studio-label="Footer location" data-empty={footerLocation.trim() ? undefined : ""}><span data-studio-copy="footerLocation">{footerLocation}</span></p>}
        </div>

        {grouped ? <div {...regionProps("footerLinks")} data-studio-target="menus:footer|copy:Footer|style:footer|style:catalogElements" data-studio-label="Footer link groups"
          className={`fm-footer-groups min-w-0 gap-y-0 sm:gap-y-10 ${groupsLayout}`}>
          <GroupedFooterNavigation settings={settings} pages={pages} />
        </div> : <>
        {/* Col 2: Navigation */}
        <div className="space-y-3" data-studio-target="menus:footer|copy:Footer|pages" data-studio-label="Footer links">
          <p className="fm-footer-heading text-white/55 text-[9px] uppercase tracking-[0.4em] mb-4"><span data-studio-copy="footerNavHeading">{getCopy(settings?.design, "footerNavHeading")}</span></p>
          {settings?.design?.menus?.footer?.length > 0 ? (
            <FooterMenu items={settings.design.menus.footer} />
          ) : (
            <>
              <Link to="/" className="block hover:text-white transition-colors"><span data-studio-copy="footerLinkShop">{getCopy(settings?.design, "footerLinkShop")}</span></Link>
              <Link to="/track" className="block hover:text-white transition-colors"><span data-studio-copy="footerLinkTrack">{getCopy(settings?.design, "footerLinkTrack")}</span></Link>
              {navPages.map(page => (
                <Link
                  key={page.id}
                  to={`/page/${page.slug}`}
                  className="block hover:text-white transition-colors"
                >
                  {page.title}
                </Link>
              ))}
              {d?.showSocialInFooter !== false && instagramUrl && <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="block hover:text-white transition-colors"><span data-studio-copy="footerLinkInstagram">{getCopy(settings?.design, "footerLinkInstagram")}</span></a>}
              {d?.showSocialInFooter !== false && otherSocial.map((s) => <a key={s.key} href={s.url} target="_blank" rel="noopener noreferrer" className="block hover:text-white transition-colors"><span data-studio-copy={s.linkKey}>{getCopy(settings?.design, s.linkKey)}</span></a>)}
              <a
                href={`mailto:${settings?.info?.email || "lyricalmyricalbooks@gmail.com"}`}
                className="block hover:text-white transition-colors"
              >
                <span data-studio-copy="footerLinkContact">{getCopy(settings?.design, "footerLinkContact")}</span>
              </a>
            </>
          )}
        </div>

        {/* Col 3: Policies / Info */}
        <div className="space-y-3" data-studio-target="copy:Footer|style:footer" data-studio-label="Footer legal & location">
          {d.showFooterLegalHeading !== false && <p className="fm-footer-heading text-white/55 text-[9px] uppercase tracking-[0.4em] mb-4"><span data-studio-copy="footerLegalHeading">{getCopy(settings?.design, "footerLegalHeading")}</span></p>}
          {POLICY_KEYS.filter((k) => (settings?.policies as any)?.[k]?.trim()).map((k) => (
            <p key={k}><Link to={`/page/${policySlug(k)}`} className="hover:text-white transition-colors">{policyTitle(settings?.design, k)}</Link></p>
          ))}
          {!fourCol && d.showFooterLocation !== false && <p className="mt-6"><span data-studio-copy="footerLocation">{getCopy(settings?.design, "footerLocation")}</span></p>}
        </div>

        {/* Col 4: Location (4-column layout only) */}
        {fourCol && d.showFooterLocation !== false && (
          <div className="space-y-3" data-studio-target="copy:Footer|style:footer" data-studio-label="Footer location">
            <p className="fm-footer-heading text-white/55 text-[9px] uppercase tracking-[0.4em] mb-4"><span data-studio-copy="footerLocationHeading">{getCopy(settings?.design, "footerLocationHeading")}</span></p>
            <p><span data-studio-copy="footerLocation">{getCopy(settings?.design, "footerLocation")}</span></p>
            <a
              href={`mailto:${settings?.info?.email || "lyricalmyricalbooks@gmail.com"}`}
              className="block hover:text-white transition-colors"
            >
              {settings?.info?.email || "lyricalmyricalbooks@gmail.com"}
            </a>
          </div>
        )}
        </>}
      </div>

      {/* No policies written yet → no lone "Legal" heading or empty ruled strip. */}
      {grouped && policyKeys.length > 0 && <div {...regionProps("footerLegal")} className="fm-footer-legal fm-footer-rule fm-footer-text fm-footer-bar border-t border-white/20 flex flex-wrap items-baseline gap-x-6 gap-y-3 text-[11px] text-white/70" data-studio-target="copy:Footer|style:footer|style:catalogElements" data-studio-label="Footer legal links">
        {d.showFooterLegalHeading !== false && <span className="fm-footer-heading text-[9px] uppercase tracking-[0.3em] text-white/55" data-studio-copy="footerLegalHeading">{getCopy(d, "footerLegalHeading")}</span>}
        {policyKeys.map(k => <Link key={k} to={"/page/" + policySlug(k)} className="hover:text-white transition-colors">{policyTitle(d, k)}</Link>)}
      </div>}

      {/* Bottom bar: copyright on the left; payment icons, social icons and the Admin link on the right. */}
      <div {...regionProps("footerBottom")} data-studio-target="copy:Footer|style:footer|style:catalogElements" data-studio-label="Footer bottom bar"
        className="fm-footer-rule fm-footer-bar border-t border-white/20 flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
        <p className="text-[9px] tracking-widest text-white/55 uppercase">
          <span data-studio-copy="footerCopyright">{getCopy(settings?.design, "footerCopyright")}</span>
        </p>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {/* Style › Footer & social links › Currency picker in the footer (off by default). */}
          {footerCurrencyOn(d) && <FooterCurrency design={d} />}
          {badges.length > 0 && (
            <div className="fm-footer-pay-icons flex items-center gap-4 text-white/55 select-none" data-studio-target="style:paymentIcons|style:footer" data-studio-label="Payment icons">
              {badges.map((badgeId: string) => {
                const icon = PAYMENT_ICONS[badgeId];
                if (!icon) return null;
                return (
                  <div key={badgeId} className="fm-footer-pay-icon opacity-30 hover:opacity-100 transition-opacity duration-300">
                    {icon}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-2.5">
            {d.showSocialInFooter !== false && instagramUrl && (
            <a
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={getCopy(d, "footerInstagramAria")}
              className="fm-footer-icon fm-footer-icon-box text-white/55 hover:text-white transition-colors"
            >
              <Instagram size={14} aria-hidden="true" />
            </a>
            )}
            {d.showSocialInFooter !== false && otherSocial.map(({ key, Icon, ariaKey, url }) => (
              <a key={key} href={url} target="_blank" rel="noopener noreferrer" aria-label={getCopy(d, ariaKey)}
                className="fm-footer-icon fm-footer-icon-box text-white/55 hover:text-white transition-colors">
                <Icon size={14} aria-hidden="true" />
              </a>
            ))}
            <a
              href={`mailto:${email}`}
              aria-label={getCopy(d, "footerEmailAria")}
              className="fm-footer-icon fm-footer-icon-box text-white/55 hover:text-white transition-colors"
            >
              <Mail size={14} aria-hidden="true" />
            </a>
          </div>

          {/* Style › Footer & social links › Show “Admin” link; words in Text & labels › Footer. */}
          {d.showFooterAdminLink !== false && (
            <Link to="/admin" rel="nofollow" {...regionProps("footerAdmin")} data-studio-target="copy:Footer|style:footer|style:catalogElements" data-studio-label="Footer admin link"
              className="fm-footer-icon text-[9px] uppercase tracking-[0.3em] text-white/55 hover:text-white transition-colors">
              <span data-studio-copy="footerAdmin">{getCopy(d, "footerAdmin")}</span>
            </Link>
          )}
        </div>
      </div>
      </div>
      {/* Style › Footer & social links › Back to top button (off by default); fixed to a bottom corner. */}
      <BackToTop design={d} />
    </footer>
  );
}
