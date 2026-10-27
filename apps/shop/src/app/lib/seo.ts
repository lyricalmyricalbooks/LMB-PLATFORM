import { useLocation } from "react-router";
import { useEffect, useSyncExternalStore } from "react";
import { getCopy } from "../features/site/storeCopy";
import { inThemePreview } from "../features/site/themePreview";

import { canonicalUrl } from "./canonicalUrl";

type SEO = {
  exactTitle?: boolean;
  noindex?: boolean;
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: "website" | "article" | "product" | "book";
  /** Price/stock tags read by Pinterest rich pins and Facebook product shares. */
  product?: { price: number; currency: string; availability: "in stock" | "out of stock" | "backorder" };
  /** One schema object, or several emitted together as one @graph. */
  jsonLd?: Record<string, any> | Record<string, any>[];
};

// Site identity (name, default title/description, share image) is edited in Studio
// (Text & labels › Site & sharing, Style › Logo & wordmark › Share image). useSiteData
// publishes the loaded design here so every page's tags follow it.
let siteDesign: any = null;
const listeners = new Set<() => void>();
export function setSiteIdentity(design: any) {
  if (design === siteDesign) return;
  siteDesign = design;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getSiteDesign = () => siteDesign;

function setMeta(selector: string, attr: string, value: string) {
  let el = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    if (selector.includes("name=")) {
      el.setAttribute("name", selector.match(/name="([^"]+)"/)![1]);
    } else if (selector.includes("property=")) {
      el.setAttribute("property", selector.match(/property="([^"]+)"/)![1]);
    }
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

function removeMeta(selector: string) {
  document.head.querySelector(selector)?.remove();
}

function setJsonLd(id: string, data: Record<string, any>) {
  let el = document.getElementById(id) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement("script");
    el.id = id;
    el.type = "application/ld+json";
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

/** Several schema objects share the one page script (the prerenderer keeps only that id). */
export function jsonLdDocument(data: Record<string, any> | Record<string, any>[]): Record<string, any> {
  if (!Array.isArray(data)) return data;
  const items = data.filter(Boolean);
  if (items.length === 1) return items[0];
  return { "@context": "https://schema.org", "@graph": items.map(({ "@context": _context, ...rest }) => rest) };
}

function clearJsonLd(id: string) {
  document.getElementById(id)?.remove();
}

export function useSEO(seo: SEO) {
  const location = useLocation();
  const design = useSyncExternalStore(subscribe, getSiteDesign, getSiteDesign);
  useEffect(() => {
    const title = seo.title
      ? (seo.exactTitle ? seo.title : getCopy(design, "siteTitleFormat", { title: seo.title }))
      : getCopy(design, "siteDefaultTitle");
    const description = seo.description || getCopy(design, "siteDefaultDescription");
    const rawImage = seo.image || design?.shareImageUrl || "";
    const image = rawImage ? new URL(rawImage, window.location.href).href : "";
    const url = canonicalUrl(seo.url || window.location.href);
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = url;
    const preview = new URLSearchParams(location.search).get("preview") === "true" || inThemePreview();
    // Large image previews let Google show book covers and spreads full-size in results and Discover.
    setMeta('meta[name="robots"]', "content", seo.noindex || preview || /^\/(admin|checkout|account|wishlist|cart|track)(\/|$)/.test(location.pathname) ? "noindex, follow" : "index, follow, max-image-preview:large");
    // index.html's static shop markup is only for crawlers that never run scripts; the
    // rendered page supplies its own, so two differing shop descriptions never coexist.
    document.getElementById("seo-jsonld-static")?.remove();
    const type = seo.type || "website";

    const verification = getCopy(design, "googleSiteVerification").trim();
    if (verification) setMeta('meta[name="google-site-verification"]', "content", verification);
    else document.head.querySelector('meta[name="google-site-verification"]')?.remove();
    document.title = title;
    setMeta('meta[name="description"]', "content", description);
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", description);
    setMeta('meta[property="og:type"]', "content", type);
    if (url) setMeta('meta[property="og:url"]', "content", url);
    // An empty og:image is an invalid tag; leave it out so platforms pick their own preview.
    if (image) {
      setMeta('meta[property="og:image"]', "content", image);
      setMeta('meta[property="og:image:alt"]', "content", title);
      setMeta('meta[name="twitter:image"]', "content", image);
    } else {
      removeMeta('meta[property="og:image"]');
      removeMeta('meta[property="og:image:alt"]');
      removeMeta('meta[name="twitter:image"]');
    }
    setMeta('meta[name="twitter:card"]', "content", image ? "summary_large_image" : "summary");
    setMeta('meta[property="og:site_name"]', "content", getCopy(design, "siteName"));
    setMeta('meta[name="author"]', "content", getCopy(design, "siteName"));
    setMeta('meta[name="twitter:title"]', "content", title);
    setMeta('meta[name="twitter:description"]', "content", description);

    const product = seo.product && Number.isFinite(seo.product.price) && seo.product.currency ? seo.product : null;
    if (product) {
      setMeta('meta[property="product:price:amount"]', "content", product.price.toFixed(2));
      setMeta('meta[property="product:price:currency"]', "content", product.currency);
      setMeta('meta[property="product:availability"]', "content", product.availability);
    } else {
      ["amount", "currency"].forEach((part) => removeMeta(`meta[property="product:price:${part}"]`));
      removeMeta('meta[property="product:availability"]');
    }

    if (seo.jsonLd) {
      setJsonLd("seo-jsonld-page", jsonLdDocument(seo.jsonLd));
    }

    return () => {
      clearJsonLd("seo-jsonld-page");
    };
  }, [location.pathname, location.search, design, seo.title, seo.exactTitle, seo.noindex, seo.description, seo.image, seo.url, seo.type, JSON.stringify(seo.product || null), JSON.stringify(seo.jsonLd || {})]);
}
