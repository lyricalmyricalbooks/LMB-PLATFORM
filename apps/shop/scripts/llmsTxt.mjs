// /llms.txt (https://llmstxt.org): a plain summary of the shop for AI assistants and AI search, built from the same
// published catalog as the sitemap. Facts only (who made each book, format, pages, year, language, ISBN), never prices
// or stock, which change between builds.
import { creatorNames, cut, isLive, plain } from '../src/app/features/site/merchantFeed.mjs';
import { resolveProductRoutes } from '../src/app/features/site/productRouteData.mjs';
import { safeSlug } from './routeSafety.mjs';

const POLICY_TITLES = { shipping: 'Shipping policy', returns: 'Returns policy', privacy: 'Privacy policy', terms: 'Terms of service' };
const line = value => plain(value).replace(/\s+/g, ' ').trim();
// Markdown link text must not close the bracket early.
const linkText = value => line(value).replace(/[[\]]/g, '');

function bookFacts(book) {
  const creators = creatorNames(book);
  const pages = Math.floor(Number(book.pageCount));
  const year = String(book.publishDate || '').match(/^\d{4}/)?.[0] || '';
  return [
    creators.length ? `by ${creators.join(', ')}` : '',
    line(book.format),
    pages > 0 ? `${pages} pages` : '',
    year ? `published ${year}` : '',
    line(book.language) ? `in ${line(book.language)}` : '',
    line(book.isbn) ? `ISBN ${line(book.isbn)}` : '',
  ].filter(Boolean).join(' · ');
}

export function llmsTxt(siteUrl, books, pages, settings = {}, { now = new Date(), shopName = 'Lyricalmyrical Books' } = {}) {
  const base = siteUrl.replace(/\/$/, '');
  const info = settings?.info || {};
  const location = settings?.location || {};
  const name = line(info.name) || shopName;
  const out = [`# ${name}`, ''];
  const summary = line(info.description);
  if (summary) out.push(`> ${summary}`, '');
  const where = [location.city, location.state, location.country].map(line).filter(Boolean).join(', ');
  const about = [where ? `Based in ${where}.` : '', line(info.email) ? `Contact: ${line(info.email)}.` : ''].filter(Boolean).join(' ');
  if (about) out.push(about, '');

  const live = books.filter(book => isLive(book, now) && book.productType !== 'giftCard');
  const listed = resolveProductRoutes(live).filter(book => book.seoNoindex !== true && safeSlug(book.slug));
  if (listed.length) {
    out.push('## Books', '');
    for (const book of listed) {
      const facts = bookFacts(book);
      const about = cut(line(book.metaDescription) || line(book.description), 300);
      out.push(`- [${linkText(book.title) || 'Untitled'}](${base}/books/${encodeURIComponent(book.slug)})${facts ? `: ${facts}.` : ''}${about ? ` ${about}` : ''}`);
    }
    out.push('');
  }

  const pageLinks = (pages || [])
    .filter(page => page?.status === 'published' && page.slug && safeSlug(page.slug))
    .map(page => {
      const about = cut(line(page.metaDescription), 200);
      return `- [${linkText(page.title) || page.slug}](${base}/page/${encodeURIComponent(page.slug)})${about ? `: ${about}` : ''}`;
    });
  if (pageLinks.length) out.push('## About the press', '', ...pageLinks, '');

  const policies = Object.entries(POLICY_TITLES)
    .filter(([key]) => typeof settings?.policies?.[key] === 'string' && settings.policies[key].trim())
    .map(([key, title]) => `- [${title}](${base}/page/policy-${key})`);
  out.push('## Optional', '', `- [Every page (sitemap)](${base}/sitemap.xml)`, ...policies, '');
  return out.join('\n');
}
