import { StoreFooter } from "./StoreFooter";
import { NotFoundContent } from "./NotFoundPage";
import { useMissingRedirect } from "./useMissingRedirect";
import { ga4PageNotFound } from "../../lib/ga4";
import { StoreChrome } from "./StoreChrome";
import { useEffect } from "react";
import { useParams } from "react-router";
import { useSiteData } from "./useSiteData";
import { StorefrontThemeStyle } from "./StorefrontThemeStyle";
import { TemplateSections, GlobalSections } from "../../components/sectionRender";
import { SectionPageContext } from "../../components/sectionCopy";
import { CurrentPageContext, PageContentSection } from "../../components/SectionComponents";
import { policyPageFor } from "./policyPages";
import { getCopy } from "./storeCopy";
import { StoreHeader } from "./StoreHeader";
import { googleFontHref } from "./fonts";
import { useSEO } from "../../lib/seo";
import { breadcrumbData } from "../../lib/bookSeo";
import { firstBodyImage } from "./pageBody";
import { contentMaxWidth, isFullWidth } from "./headerNav";


/**
 * The site-wide custom-page look (Studio › Style › Custom pages). Every "Page content" section
 * follows it unless switched to its own style, so all custom pages match. Values after `||`
 * are only first-run fallbacks.
 */
export function sitePageStyle(design: any, eyebrow: string): Record<string, any> {
  const d = design || {};
  return {
    showEyebrow: d.pageShowEyebrow === true,
    eyebrow,
    titleSize: d.pageTitleSize || "md",
    titleUppercase: d.pageTitleUppercase !== false,
    bodySize: d.pageBodySize || "md",
    align: d.pageAlign || "left",
    maxWidth: d.pageWidth || "header",
    textColor: d.pageTextColor || undefined,
    headingColor: d.pageTitleColor || undefined,
    // Option D "Ruled": title lined up with the header, a line under it, readable text column.
    titleFont: d.pageTitleFont || undefined,
    titleSizePx: d.pageTitleSizePx ?? undefined,
    titleSizePxMobile: d.pageTitleSizePxMobile ?? undefined,
    titleWeight: d.pageTitleWeight || undefined,
    showRule: d.pageShowRule !== false,
    ruleColor: d.pageRuleColor || undefined,
    ruleWidth: d.pageRuleWidth ?? undefined,
    ruleSpacing: d.pageRuleSpacing ?? undefined,
    textMeasure: d.pageTextMeasure || "readable",
    textWidthPx: d.pageTextWidthPx ?? undefined,
    topSpacing: d.pageTopSpacing ?? undefined,
    // Same width as the storefront header row (StoreHeader), so the title lines up with the logo.
    // "full" while Style › Layout & spacing › Use the full screen width is on (isFullWidth).
    headerWidth: isFullWidth(d) ? "full" : contentMaxWidth(d),
  };
}

const isStudioPreview = () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "true";

export function PageView() {
  const { slug } = useParams<{ slug: string }>();
  const { settings, books, pages, loading: siteLoading, fresh, loadError, retry } = useSiteData();
  // The shared storefront snapshot already contains full published page bodies.
  // Resolve from it on every slug change instead of clearing the screen for a
  // second Firestore request. Studio snapshots and background refreshes still
  // update this same collection.
  // The Studio preview may show an unpublished page; shoppers only ever receive published ones.
  const page = pages.find(p => p.slug === slug && (p.status === "published" || isStudioPreview()));
  // Store policies (Settings › General) are served as synthetic pages at /page/policy-<key>.
  const policyPage = policyPageFor(slug, (settings as any)?.policies, (settings as any)?.design);

  // Tab title + description follow Text & labels › Site & sharing (title format, site name).
  const seoPage: any = policyPage || page;
  useSEO({
    title: seoPage ? seoPage.seoTitle || seoPage.title : undefined,
    description: seoPage ? seoPage.metaDescription || String(seoPage.body || "").replace(/<[^>]+>/g, " ").replace(/[#*]/g, "").replace(/\s+/g, " ").trim().substring(0, 160) : undefined,
    type: "article",
    // The page's own sharing image, else its first uploaded picture; seo.ts falls back to the shop's share image.
    image: seoPage ? seoPage.seoImage || firstBodyImage(String(seoPage.body || "")) || undefined : undefined,
    jsonLd: seoPage ? (() => {
      const siteBase = new URL(import.meta.env.BASE_URL, window.location.origin).href;
      return breadcrumbData([
        { name: getCopy(settings?.design, "breadcrumbHome"), url: siteBase },
        { name: seoPage.title || seoPage.seoTitle || "", url: new URL(`page/${encodeURIComponent(slug || seoPage.slug || "")}`, siteBase).href },
      ]);
    })() : undefined,
  });

  useEffect(() => {
    // Announce ready for preview updates
    if (typeof window !== 'undefined' && window.location.search.includes('preview=true')) {
      window.parent.postMessage({ type: "PREVIEW_READY" }, "*");
    }
  }, []);

  // Theme resolution. Per-page section stacks live at design["page:<slug>"]
  // (written by the theme editor's per-page template pills); when absent, the
  // shared "Custom Pages" template (design.page.sections) renders as before.
  const rawDesign = (settings as any)?.design || {};
  const perPageSurface = slug ? rawDesign?.[`page:${slug}`] : undefined;
  // Shop look first, then the Custom pages template and this page's own overrides, so
  // Studio's "This page only" edits win (in the preview and live).
  const { sections: _s1, ...pageSurface } = rawDesign?.page || {};
  const { sections: _s2, ...ownSurface } = perPageSurface || {};
  const d = { ...rawDesign, ...(rawDesign.storefront || {}), ...pageSurface, ...ownSurface };
  const surfaceId = perPageSurface?.sections?.length ? `page:${slug}` : "page";
  // Once a "Page content" section is in the stack, it renders the title/text
  // (so it can be moved and styled in Studio) and the fixed body is skipped.
  const hasContentSection = (rawDesign?.[surfaceId]?.sections || []).some((s: any) => s?.type === "PageContentSection");
  const hidePageBody = !!perPageSurface?.hidePageBody || hasContentSection;
  // "theme" chrome renders the page in the storefront's colors/wordmark;
  // default "classic" keeps the original white editorial page.
  const themed = d?.pageChromeStyle === "theme";
  const pageStyle = sitePageStyle(d, getCopy(settings?.design, "pageEyebrow"));
  const themedBg = d?.backgroundColor || "#0a0910";
  const themedText = d?.textColor || "#f3f1ee";

  const shown = page || policyPage;
  const missing = !shown && !loadError && !siteLoading && !!fresh;
  useMissingRedirect(missing);
  // Google Analytics: only once the fresh read confirms the page doesn't exist.
  useEffect(() => { if (missing) ga4PageNotFound(); }, [missing, slug]);
  // A page published after this browser cached the site isn't in that cache yet:
  // keep showing "Loading" until the fresh read, rather than a false 404.
  if (!shown && loadError) {
    // The read failed: an error with Retry, not a false 404.
    return (
      <div data-fm-store data-studio-target="pages|copy:Custom pages & 404" data-studio-label="Page" className="min-h-screen fm-page flex flex-col">
        <StorefrontThemeStyle design={settings?.design} />
        <StoreHeader design={settings?.design} pages={pages} books={books} />
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 text-center">
          <p role="alert">{getCopy(settings?.design, "catalogLoadError")}</p>
          <button type="button" onClick={retry} className="fm-btn px-6 py-3 uppercase tracking-[0.3em] text-[10px]" style={{ border: "1px solid currentColor" }}>{getCopy(settings?.design, "catalogRetry")}</button>
        </div>
      </div>
    );
  }
  if (!shown && (siteLoading || !fresh)) {
    return (
      <div data-fm-store data-studio-target="pages|copy:Custom pages & 404" data-studio-label="Page" className="min-h-screen fm-page flex flex-col">
        <StorefrontThemeStyle design={settings?.design} />
        <StoreHeader design={settings?.design} pages={pages} books={books} />
        <p className="flex-1 flex items-center justify-center text-white/40 text-[10px] tracking-[0.4em] uppercase animate-pulse">
          {getCopy(settings?.design, "pageLoading")}
        </p>
      </div>
    );
  }

  if (!shown) return <StoreChrome surface="page404"><NotFoundContent design={settings?.design} /></StoreChrome>;

  const isHistoryPage = /^(history|history-of-lm)$/.test(slug || "");
  const plainBody = shown.body?.replace(/<[^>]*>/g, "").trim() || "";
  const useHistoryCopy = isHistoryPage && (!plainBody || /^s+$/i.test(plainBody));
  const esc = (t: string) => t.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" } as any)[c]);
  const historyHtml = `<p>${esc(getCopy(settings?.design, "historyBody"))}</p><p>${esc(getCopy(settings?.design, "historySubtext"))}</p>`;

  return (
    <div
      data-seo-page={shown.slug} data-fm-store data-studio-target="pages|style:customPages|copy:Custom pages & 404|style:colors" data-studio-label="Page"
      className={`min-h-screen flex flex-col ${themed ? "" : "bg-white text-neutral-900"}`}
      style={themed ? { backgroundColor: themedBg, color: themedText } : undefined}
    >
      <StorefrontThemeStyle design={settings?.design} />
      <StoreHeader design={settings?.design} pages={pages} books={books} />
      {pageStyle.titleFont && <link rel="stylesheet" href={googleFontHref(String(pageStyle.titleFont))} />}

      <CurrentPageContext.Provider value={{ title: shown.title, body: shown.body, pageStyle }}>
        <SectionPageContext.Provider value={{ page: shown }}>
          <TemplateSections design={settings?.design} templateId={surfaceId} books={books} />
        </SectionPageContext.Provider>
      </CurrentPageContext.Provider>

      {/* Content — the same "Page content" renderer Studio uses, with its
          default settings, so every custom page looks identical whether or
          not it has its own section stack. */}
      {!hidePageBody && (
        <main className="w-full flex-1">
          <CurrentPageContext.Provider value={{ title: shown.title, body: useHistoryCopy ? historyHtml : shown.body, pageStyle }}>
            <PageContentSection settings={{ showTitle: true, showBody: true }} enableAnimations />
          </CurrentPageContext.Provider>
        </main>
      )}

      <GlobalSections design={settings?.design} books={books} />

      {d.showPageFooter !== false && <StoreFooter settings={settings} pages={pages} />}
    </div>
  );
}

export default PageView;
