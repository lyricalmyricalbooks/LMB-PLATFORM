// What search engines and link previews see on the platform's public pages. The build (build.js) adds, to every page
// Google may list: one canonical address (the front page is published at / and /waitlist/, so both point at /), a share
// preview (title, description, picture) and, on the front page, the business label Google reads. It also writes
// robots.txt and sitemap.xml from the same list, so a new public page is listed without anyone remembering to.
//
// SITE_URL is the platform's one public address. When Colophon moves to its own domain, change it here.

export const SITE_URL = "https://lmb-platform-prod.web.app";
/** The share picture, published at the site's root (site/share.png, 1200 x 630). */
export const SHARE_IMAGE = "/share.png";

/** Addresses never listed in the map: signed-in pages, sign-up, the control room, setup mode and the designer. */
export const PRIVATE_PATHS = Object.freeze(["/account/", "/accounts/", "/control/", "/app/", "/design/", "/join/", "/signup/"]);
/**
 * Addresses Google shouldn't crawl at all: the app shells, which have nothing to read. Pages that say noindex
 * (sign-up, account) stay crawlable, or Google couldn't read that they say noindex and might list the bare address.
 */
export const NO_CRAWL_PATHS = Object.freeze(["/control/", "/app/", "/design/"]);

/** A published page's one real address: index.html is its folder, the front page's second copy is the front page. */
export function canonicalPath(published) {
  if (published === "/waitlist/index.html") return "/";
  if (published === "/waitlist/pricing.html" || published === "/pricing.html") return "/pricing";
  if (published === "/waitlist/services.html" || published === "/services.html") return "/services";
  return published.replace(/index\.html$/, "");
}

/** Pages Google may list: an .html page that doesn't say noindex, isn't the not-found page and isn't private. */
export function isListed(published, html) {
  if (!published.endsWith(".html") || published === "/404.html") return false;
  if (/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html)) return false;
  return !PRIVATE_PATHS.some((p) => canonicalPath(published).startsWith(p));
}

const attr = (text) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const decode = (text) => text.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** The front page's business label (schema.org), as Google's rich results read it. */
export function businessLabel(base = SITE_URL) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${base}/#org`, name: "Colophon", url: `${base}/`, logo: `${base}${SHARE_IMAGE}`, description: "Shop and stockroom for independent brands." },
      { "@type": "WebSite", "@id": `${base}/#site`, name: "Colophon", url: `${base}/`, publisher: { "@id": `${base}/#org` } },
      {
        "@type": "SoftwareApplication", name: "Colophon", applicationCategory: "BusinessApplication", operatingSystem: "Web",
        url: `${base}/`, publisher: { "@id": `${base}/#org` },
        description: "An online shop, in-person selling and a stockroom that share one count of stock.",
      },
    ],
  };
}

/** The tags added to a listed page's <head>. Pages keep their own title and description; this repeats them for previews. */
export function headTags(published, html, base = SITE_URL) {
  const path = canonicalPath(published);
  const url = `${base}${path}`;
  const title = decode(html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() ?? "Colophon");
  const description = decode(html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)?.[1] ?? "");
  const tags = [
    `<link rel="canonical" href="${attr(url)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Colophon">`,
    `<meta property="og:title" content="${attr(title)}">`,
    ...(description ? [`<meta property="og:description" content="${attr(description)}">`] : []),
    `<meta property="og:url" content="${attr(url)}">`,
    `<meta property="og:image" content="${base}${SHARE_IMAGE}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="Colophon: one home for everything you sell.">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ];
  if (path === "/") tags.push(`<script type="application/ld+json">${JSON.stringify(businessLabel(base)).replace(/</g, "\\u003c")}</script>`);
  return tags;
}

/** The page with its search and preview tags, or unchanged when Google shouldn't list it (or it already has them). */
export function withSeo(published, html, base = SITE_URL) {
  if (!isListed(published, html) || /rel=["']canonical["']/i.test(html)) return html;
  return html.replace(/<\/head>/i, `${headTags(published, html, base).join("\n")}\n</head>`);
}

export function robotsTxt(base = SITE_URL) {
  return ["User-agent: *", ...NO_CRAWL_PATHS.map((p) => `Disallow: ${p}`), "", `Sitemap: ${base}/sitemap.xml`, ""].join("\n");
}

/** sitemap.xml for the listed pages' real addresses (each once, the front page first). */
export function sitemapXml(paths, base = SITE_URL) {
  const unique = [...new Set(paths)].sort((a, b) => (a === "/" ? -1 : b === "/" ? 1 : a.localeCompare(b)));
  const urls = unique.map((p) => `  <url><loc>${attr(`${base}${p}`)}</loc></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}
