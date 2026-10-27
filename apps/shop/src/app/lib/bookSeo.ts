import { preorderActive, releaseDateOf } from '../features/site/preorder';
import { comingSoonActive } from '../features/site/comingSoon';
import type { Book } from '../features/site/types';
import { formatKey } from '../features/site/CatalogControls';
import { descriptionPlainText } from '../features/site/descriptionLinks';
import { describedAlt } from '../features/site/photoAlt';
import { canonicalUrl } from './canonicalUrl';

/** Search descriptions are plain text, even when catalog descriptions are rich HTML. */
export function searchText(value = ''): string {
  return value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/gi, (_, entity) => {
      const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
      if (entity[0] !== '#') return named[entity.toLowerCase()] ?? '';
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }).replace(/\s+/g, ' ').trim();
}

export { canonicalUrl };

/** Shortens a search snippet at a word boundary (with an ellipsis) instead of mid-word. */
export function snippet(text: string, max = 160): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s.,;:!?\-–—]+$/, '') + '…';
}

/** The opening whole sentences of `text` that fit in `max` characters; one long first sentence is
 *  cut on a word instead. Used by the search-listing auto-fill (pages and books). */
export function leadSentences(text: string, max = 160): string {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  let out = '';
  for (const sentence of clean.split(/(?<=[.!?])\s+/)) {
    const next = out ? `${out} ${sentence}` : sentence;
    if (next.length > max) break;
    out = next;
  }
  return out || snippet(clean, max);
}

/** The first of `candidates` whose finished tab title (`format`) fits in `max`; else the last (shortest)
 *  one, cut on a word only if it alone is longer than `max` (a title is never chopped just to fit the shop name). */
export function fittingTitle(candidates: string[], format: (title: string) => string = t => t, max = 60): string {
  const options = [...new Set(candidates.map(c => c.replace(/\s+/g, ' ').trim()).filter(Boolean))];
  const fit = options.find(c => format(c).length <= max);
  if (fit) return fit;
  return snippet(options[options.length - 1] || '', max);
}

/** A credit that names no single creator: "Various artists", "AA.VV.", "Autori vari", "Magazine x Press". */
const GROUP_CREDIT = /^(various|vari[eo]?\b|aa\.?\s*vv\.?|autori vari|artisti vari|multiple|anthology)|\s[x×]\s/i;

/** The people credited on a book, from the editor's "Author / contributors" box (`subtitle`), else the
 *  legacy `authorName`. Group credits ("Various artists", "A x B") name no person, so they give none. */
export function bookCreators(book: Partial<Book> & Record<string, any>): string[] {
  const credit = searchText(book.subtitle) || searchText(book.authorName);
  if (!credit || GROUP_CREDIT.test(credit)) return [];
  return [...new Set(credit.split(/\s*(?:,|;|&|\s\+\s|\sand\s)\s*/i).map(name => name.trim()).filter(name => name.length > 1))].slice(0, 10);
}

export type CreatorLink = { name: string; url: string };

/** Books › edit › Search (SEO) › Artist links: the official website (or other profile) of each person credited.
 *  Only http(s) addresses with a name are kept, at most 10. */
export function creatorLinks(book: Partial<Book> & Record<string, any>): CreatorLink[] {
  const raw = Array.isArray(book?.creatorLinks) ? book.creatorLinks : [];
  const out: CreatorLink[] = [];
  for (const item of raw) {
    const name = searchText(item?.name);
    const href = typeof item?.url === 'string' ? item.url.trim() : '';
    if (!name || !/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(href)) continue;
    try { out.push({ name, url: new URL(href).href }); } catch { /* not an address */ }
    if (out.length >= 10) break;
  }
  return out;
}

const sameName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' }) === 0;

/** Schema.org people for a book: each credited creator, with their own website as `url`/`sameAs` so Google can
 *  tie the book to the person it already knows. Links naming nobody in the credit become contributors. */
export function creatorPeople(book: Partial<Book> & Record<string, any>) {
  const links = creatorLinks(book);
  const names = searchText(book.authorName) ? [searchText(book.authorName)] : bookCreators(book);
  const person = (name: string) => {
    const urls = [...new Set(links.filter(l => sameName(l.name, name)).map(l => l.url))];
    return { '@type': 'Person', name, ...(urls.length ? { url: urls[0], sameAs: urls } : {}) };
  };
  const others = [...new Set(links.filter(l => !names.some(n => sameName(n, l.name))).map(l => l.name))];
  return { authors: names.map(person), contributors: others.map(person) };
}

/** Does this text name the person, ignoring case and accents? */
export function namesCreator(text: string, name: string): boolean {
  const plain = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
  return !!name && plain(text).includes(plain(name));
}

/** The tab/search title a book gets when the owner wrote none: "Title by Author" while that stays short
 *  (`byline` is Text & labels › Site & sharing › Book page title with author), else just the title. */
export function defaultBookTitle(book: Partial<Book> & Record<string, any>, byline: (title: string, author: string) => string, max = 50): string {
  const title = searchText(book.title);
  const creators = bookCreators(book);
  if (!title || !creators.length) return title;
  const withAuthor = byline(title, creators.join(', ')).replace(/\s+/g, ' ').trim();
  return withAuthor && withAuthor.length <= max ? withAuthor : title;
}

/** Search title + description written from the book's own catalog facts (Books › edit › Search (SEO) ›
 *  Auto-fill from book). A book's custom search title is used exactly, so it carries the shop name itself
 *  when there is room ("Title by Author — Shop"). The description is the book description's opening
 *  sentences, or (with no description) a sentence of real facts: author, format, pages, publisher. */
export function autoBookSeo(book: Partial<Book> & Record<string, any>, siteName = ''): { metaTitle: string; metaDescription: string } {
  const title = searchText(book.title);
  const author = searchText(book.authorName) || bookCreators(book).join(', ');
  const site = searchText(siteName);
  const byline = author ? `${title} by ${author}` : title;
  const metaTitle = !title ? '' : fittingTitle([
    site ? `${byline} — ${site}` : '', byline, site ? `${title} — ${site}` : '', title,
  ]);
  let metaDescription = leadSentences(searchText(descriptionPlainText(book.description)));
  if (!metaDescription && title) {
    const format = searchText(book.edition) || searchText(book.format);
    const pages = Math.floor(Number(book.pageCount));
    const facts = [format, pages > 0 ? `${pages} pages` : ''].filter(Boolean).join(', ');
    metaDescription = leadSentences([
      `${byline}.`,
      facts ? `${facts.charAt(0).toUpperCase()}${facts.slice(1)}.` : '',
      searchText(book.publisher) ? `Published by ${searchText(book.publisher)}.` : '',
    ].filter(Boolean).join(' '));
  }
  return { metaTitle, metaDescription };
}

/** A valid ISBN-13 (978/979, correct check digit) without hyphens, or ''. Never invented. */
export function isbn13(value: unknown): string {
  const digits = String(value ?? '').replace(/[\s-]/g, '');
  if (!/^97[89]\d{10}$/.test(digits)) return '';
  const sum = [...digits.slice(0, 12)].reduce((total, d, i) => total + Number(d) * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(digits[12]) ? digits : '';
}

const BOOK_FORMATS: Record<string, string> = { paperback: 'Paperback', hardcover: 'Hardcover', ebook: 'EBook', audiobook: 'AudiobookFormat' };

/** The edition facts the catalog actually holds, as schema.org Book properties. */
function bookFacts(book: Book & Record<string, any>) {
  const format = BOOK_FORMATS[formatKey(book.format) || ''];
  const pages = Math.floor(Number(book.pageCount));
  const date = typeof book.publishDate === 'string' && /^\d{4}(-\d{2}(-\d{2})?)?/.test(book.publishDate) ? book.publishDate.match(/^\d{4}(-\d{2}(-\d{2})?)?/)![0] : '';
  const gtin = isbn13(book.isbn);
  return {
    ...(format ? { bookFormat: `https://schema.org/${format}` } : {}),
    ...(pages > 0 ? { numberOfPages: pages } : {}),
    ...(date ? { datePublished: date } : {}),
    ...(searchText(book.edition) ? { bookEdition: searchText(book.edition) } : {}),
    ...(gtin ? { gtin13: gtin } : {}),
  };
}

export function bookMetadata(book: Partial<Book>) {
  return {
    title: searchText(book.metaTitle) || searchText(book.title),
    exactTitle: !!searchText(book.metaTitle),
    description: searchText(book.metaDescription) || snippet(searchText(descriptionPlainText(book.description))),
    image: book.seoImage?.trim() || book.photos?.[0]?.url || '',
  };
}

export type SeoReview = { authorName?: string; rating?: number; title?: string; body?: string; createdAt?: string };

const absolute = (value: string, base: string) => { try { return new URL(value, base).href; } catch { return ''; } };

/** Star rating + a few review snippets, only from approved shopper reviews. Never invented. */
export function ratingData(reviews: SeoReview[] = [], summary?: { count: number; average: number } | null) {
  const rated = reviews.filter(r => Number(r.rating) >= 1 && Number(r.rating) <= 5);
  if (!rated.length) return {};
  // The star rating covers every approved review (Firestore's count/average), not just the page of snippets read here.
  const real = summary && summary.count >= rated.length && summary.average >= 1 && summary.average <= 5 ? summary : null;
  const average = real ? real.average : rated.reduce((sum, r) => sum + Number(r.rating), 0) / rated.length;
  const review = rated.filter(r => searchText(r.body) && searchText(r.authorName)).slice(0, 5).map(r => ({
    '@type': 'Review',
    author: { '@type': 'Person', name: searchText(r.authorName) },
    reviewRating: { '@type': 'Rating', ratingValue: Number(r.rating), bestRating: 5, worstRating: 1 },
    ...(searchText(r.title) ? { name: searchText(r.title) } : {}),
    reviewBody: searchText(r.body).slice(0, 1000),
    ...(r.createdAt && /^\d{4}-\d{2}-\d{2}/.test(r.createdAt) ? { datePublished: r.createdAt.slice(0, 10) } : {}),
  }));
  return {
    aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(average.toFixed(1)), reviewCount: real ? real.count : rated.length, bestRating: 5, worstRating: 1 },
    ...(review.length ? { review } : {}),
  };
}

/** Google shows these trails instead of the raw URL in results. */
export function breadcrumbData(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.filter(i => i.name && i.url).map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: canonicalUrl(item.url) })),
  };
}

/** A shop category as a list of the books in it. */
export function collectionStructuredData(options: { name: string; description?: string; url: string; books: { name: string; url: string; image?: string }[] }) {
  const url = canonicalUrl(options.url);
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': url + '#collection',
    url,
    name: options.name,
    ...(options.description ? { description: searchText(options.description) } : {}),
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: Math.min(options.books.length, 30),
      itemListElement: options.books.slice(0, 30).map((book, index) => ({
        '@type': 'ListItem', position: index + 1, url: canonicalUrl(book.url), name: book.name,
        ...(book.image ? { image: absolute(book.image, url) } : {}),
      })),
    },
  };
}

/** The shop itself (brand panel) and the website, linked by @id. */
/** Text & labels › Site & sharing › What the shop publishes: a comma-separated list, trimmed and de-duplicated. */
export function seoTopicList(raw: unknown): string[] {
  const seen = new Set<string>();
  return String(raw ?? '').split(/[,\n]/).map(t => searchText(t)).filter(t => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase())).slice(0, 20);
}

/** Text & labels › Site & sharing › Other places the shop is listed: one https link per line (or comma-separated). */
export function profileLinks(raw: unknown): string[] {
  return [...new Set(String(raw ?? '').split(/[\s,]+/).map(v => v.trim()).filter(v => /^https:\/\/[^/\s]+\.[^/\s]+/i.test(v)))].slice(0, 20);
}

export function siteStructuredData(options: { name: string; url: string; description?: string; logo?: string; sameAs?: unknown[]; topics?: string[]; email?: string; area?: { city?: string; region?: string; country?: string } }) {
  const url = canonicalUrl(options.url);
  const sameAs = [...new Set((options.sameAs || []).filter((v): v is string => typeof v === 'string' && /^https:\/\//i.test(v.trim())).map(v => v.trim()))];
  const logo = options.logo ? absolute(options.logo, url) : '';
  const email = searchText(options.email);
  // Town, province and country only: the shop's street address is not published to search engines.
  const area = { addressLocality: searchText(options.area?.city), addressRegion: searchText(options.area?.region), addressCountry: searchText(options.area?.country) };
  const hasArea = Object.values(area).some(Boolean);
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'BookStore',
      '@id': url + '#organization',
      name: options.name,
      url,
      ...(options.description ? { description: searchText(options.description) } : {}),
      ...(logo ? { logo, image: logo } : {}),
      ...(sameAs.length ? { sameAs } : {}),
      ...(options.topics?.length ? { knowsAbout: options.topics } : {}),
      ...(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? { email } : {}),
      ...(hasArea ? { address: { '@type': 'PostalAddress', ...Object.fromEntries(Object.entries(area).filter(([, v]) => v)) } } : {}),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': url + '#website',
      name: options.name,
      url,
      publisher: { '@id': url + '#organization' },
    },
  ];
}

function creatorProps(book: Book & Record<string, any>) {
  const { authors, contributors } = creatorPeople(book);
  // A single legacy `authorName` stays one object, as before; the Author / contributors box gives a list.
  return {
    ...(authors.length ? { author: searchText(book.authorName) ? authors[0] : authors } : {}),
    ...(contributors.length ? { contributor: contributors } : {}),
  };
}

/** The shop as a schema.org reference: the same @id as the home page's BookStore, so Google joins book and shop. */
function shopRef(name: string, shopUrl?: string) {
  const url = shopUrl ? canonicalUrl(shopUrl) : '';
  return { '@type': 'Organization', ...(url ? { '@id': url + '#organization', url } : {}), name };
}

/** "Lyricalmyrical Books", "lyricalmyrical", "Lyricalmyrical Books (Toronto)" all name the shop; a co-publisher does not. */
function namesShop(publisher: string, shop: string) {
  const key = (v: string) => v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const p = key(publisher), s = key(shop);
  const core = s.replace(/\s(books|press|editions|publishing)$/, '');
  return !!p && !!core && (p === s || p === core || p.startsWith(s + ' ') || p.startsWith(core + ' '));
}

/** The shop's returns rule for Google's product listings (Text & labels › Site & sharing › returns window):
 *  blank = left out, 0 = no returns, N = N days to send a book back by mail. Needs the shop's two-letter country. */
export function returnPolicyData(days: string | undefined, countryCode: string | undefined) {
  const text = String(days ?? '').trim();
  const country = String(countryCode ?? '').trim().toUpperCase();
  if (!text || !/^[A-Z]{2}$/.test(country) || !/^\d{1,3}$/.test(text)) return null;
  const n = Number(text);
  if (n > 365) return null;
  return n === 0
    ? { '@type': 'MerchantReturnPolicy', applicableCountry: country, returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted' }
    : { '@type': 'MerchantReturnPolicy', applicableCountry: country, returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow', merchantReturnDays: n, returnMethod: 'https://schema.org/ReturnByMail' };
}

/** "1–3", "2 business days", "1" → a day range, or null. */
function dayRange(text: unknown): { min: number; max: number } | null {
  const m = String(text ?? '').match(/^\s*(\d{1,2})\s*(?:[-–—]|to)?\s*(\d{1,2})?\s*(?:business\s+)?(?:days?)?\s*$/i);
  if (!m) return null;
  const min = Number(m[1]), max = Number(m[2] ?? m[1]);
  return max >= min ? { min, max } : null;
}

const dayValue = (r: { min: number; max: number }) => ({ '@type': 'QuantitativeValue', minValue: r.min, maxValue: r.max, unitCode: 'DAY' });

/** What one copy costs to ship within the shop's own country, for Google's product listings: the cheapest
 *  shipping option (not pickup) from Settings › Shipping. Its delivery estimate ("3–7", "3-7 business days",
 *  "5") becomes the transit time when it reads as days;
 *  `handlingDays` (Text & labels › Site & sharing) becomes the handling time. Null when there is no such option. */
export function shippingDetailsData(quote: { price: number; deliveryDays?: string; type?: string } | null | undefined, countryCode: string | undefined, currency = 'CAD', handlingDays?: string) {
  const country = String(countryCode ?? '').trim().toUpperCase();
  if (!quote || quote.type === 'pickup' || !/^[A-Z]{2}$/.test(country) || !Number.isFinite(Number(quote.price)) || Number(quote.price) < 0) return null;
  const transit = dayRange(quote.deliveryDays);
  const handling = dayRange(handlingDays);
  return {
    '@type': 'OfferShippingDetails',
    shippingRate: { '@type': 'MonetaryAmount', value: Number(Number(quote.price).toFixed(2)), currency },
    shippingDestination: { '@type': 'DefinedRegion', addressCountry: country },
    ...(transit || handling ? { deliveryTime: {
      '@type': 'ShippingDeliveryTime',
      ...(handling ? { handlingTime: dayValue(handling) } : {}),
      ...(transit ? { transitTime: dayValue(transit) } : {}),
    } } : {}),
  };
}

export function bookStructuredData(book: Book & Record<string, any>, options: { currency: string; price: number; url: string; reviews?: SeoReview[]; ratingSummary?: { count: number; average: number } | null; seller?: string; shopUrl?: string; returnPolicy?: ReturnType<typeof returnPolicyData>; shipping?: ReturnType<typeof shippingDetailsData> }) {
  const variants = book.variants || [];
  const backorder = book.onBackorder || (variants.length > 0 && variants.every((v: any) => v.onBackorder));
  // Coming soon (Books › Inventory): shown but not for sale yet, so it is honestly out of stock.
  const soon = comingSoonActive(book);
  const available = !soon && (variants.length ? variants.some(v => Number(v.stockLevel ?? v.stock ?? 0) > 0) : Number(book.stockLevel ?? 999) > 0);
  // Pre-order (Books › Inventory): PreOrder availability, starting on the release day when known.
  const preorder = available && preorderActive(book);
  const release = preorder ? releaseDateOf(book) : '';
  return {
    '@context': 'https://schema.org',
    '@type': ['Product', 'Book'],
    '@id': options.url + '#book',
    url: options.url,
    name: book.title,
    description: searchText(descriptionPlainText(book.description)),
    image: [...new Set([...(book.photos || []).map(p => p.url), book.seoImage].filter((url): url is string => !!url?.trim()).map(url => absolute(url.trim(), options.url)).filter(Boolean))],
    ...(book.isbn ? { isbn: String(book.isbn).trim() } : {}),
    ...bookFacts(book),
    ...(book.sku ? { sku: book.sku } : {}),
    ...(book.language ? { inLanguage: book.language } : {}),
    ...creatorProps(book),
    // Google's merchant listings ask for a brand: for a book that is its publisher, else the shop.
    ...(searchText(book.publisher) || options.seller ? { brand: { '@type': 'Brand', name: searchText(book.publisher) || options.seller } } : {}),
    ...(book.publisher ? { publisher: options.seller && namesShop(searchText(book.publisher), options.seller) ? shopRef(searchText(book.publisher), options.shopUrl) : { '@type': 'Organization', name: book.publisher } } : {}),
    offers: {
      '@type': 'Offer', url: options.url,
      priceCurrency: options.currency,
      price: Number(options.price).toFixed(2),
      availability: `https://schema.org/${preorder ? 'PreOrder' : soon ? 'OutOfStock' : backorder ? 'BackOrder' : available ? 'InStock' : 'OutOfStock'}`,
      ...(release ? { availabilityStarts: release } : {}),
      itemCondition: 'https://schema.org/NewCondition',
      ...(options.seller ? { seller: shopRef(options.seller, options.shopUrl) } : {}),
      ...(options.returnPolicy ? { hasMerchantReturnPolicy: options.returnPolicy } : {}),
      ...(options.shipping ? { shippingDetails: options.shipping } : {}),
    },
    ...ratingData(options.reviews, options.ratingSummary),
  };
}

export function seoChecks(book: Partial<Book>, listingTitle = bookMetadata(book).title) {
  const meta = bookMetadata(book);
  return [
    { id: 'title', ok: listingTitle.length > 0 && listingTitle.length <= 60, label: 'Use a clear, unique search title; about 60 characters is a useful guide.' },
    { id: 'description', ok: meta.description.length >= 80 && meta.description.length <= 160, label: 'Write a useful search summary of about 80–160 characters. Google may choose its own snippet.' },
    { id: 'content', ok: searchText(descriptionPlainText(book.description)).length >= 100, label: 'Describe this book’s subject, creator and edition in the book description.' },
    { id: 'cover', ok: !!book.photos?.[0]?.url, label: 'Add a cover photo so product results can include an image.' },
    { id: 'alt', ok: !!book.photos?.length && book.photos.every(p => !!describedAlt(p.altText)), label: 'Describe each book photo in Images (a file name like "IMG_1234" doesn\'t count). Describe with AI can write them.' },
    ...creatorChecks(book, listingTitle, meta.description),
    { id: 'isbn', ok: !!book.isbn?.trim(), label: 'Add the ISBN when this edition has one; do not invent an identifier.' },
    { id: 'published', ok: book.status === 'published', label: 'Publish the book to make its public page available to search engines.' },
  ];
}

/** Searches for an artist's name match pages that say it: the listing should name them, and their own website
 *  linked from the book (Artist links) tells Google which person is meant. Books with no named creator skip both. */
function creatorChecks(book: Partial<Book> & Record<string, any>, listingTitle: string, description: string) {
  const names = searchText(book.authorName) ? [searchText(book.authorName)] : bookCreators(book);
  if (!names.length) return [];
  return [
    { id: 'creator', ok: names.some(name => namesCreator(`${listingTitle} ${description}`, name)), label: `Name the artist (${names[0]}) in the search title or description, so searches for their name can find this book.` },
    { id: 'creatorLink', ok: creatorLinks(book).length > 0, label: 'Add the artist’s official website under Artist links, so Google can connect this book to them.' },
  ];
}
