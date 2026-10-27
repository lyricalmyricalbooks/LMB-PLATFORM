// One order search for the Orders desk and the Orders table view. Pure, tested.
// Matches the order number (typed with "#" or spaces), customer name, email,
// phone, postal code, tracking number, and each line's book title, edition name,
// ISBN and SKU. ISBNs/SKUs saved only on the catalog come from an optional index
// (buildCatalogSearchIndex) keyed by book id and book id + edition id.

export type CatalogSearchIndex = Map<string, string>;

const lower = (v: any) => String(v ?? "").toLowerCase();
// Letters and digits only, so "#ABCD 123", "978-1-…", "M5V 2T6" and "(416) 555-0100" match however they're typed.
const compact = (v: any) => lower(v).replace(/[^\p{L}\p{N}]+/gu, "");

const identifiers = (x: any) => [x?.isbn, x?.isbn13, x?.isbn10, x?.sku, x?.ean];

/** Book id → ISBN/SKU text, and book id::edition id → that edition's name, ISBN and SKU. */
export function buildCatalogSearchIndex(books: any[]): CatalogSearchIndex {
  const index: CatalogSearchIndex = new Map();
  for (const b of books || []) {
    if (!b?.id) continue;
    index.set(String(b.id), identifiers(b).filter(Boolean).join(" "));
    for (const v of Array.isArray(b.variants) ? b.variants : []) {
      if (!v?.id) continue;
      index.set(`${b.id}::${v.id}`, [v.name, ...identifiers(v)].filter(Boolean).join(" "));
    }
  }
  return index;
}

function lineFields(i: any, catalog?: CatalogSearchIndex | null): any[] {
  const bookId = i?.id || i?.bookId;
  const variantId = i?.variantId;
  return [
    i?.title, i?.variantName, typeof i?.variant === "string" ? i.variant : "", ...identifiers(i),
    catalog && bookId ? catalog.get(String(bookId)) : "",
    catalog && bookId && variantId ? catalog.get(`${bookId}::${variantId}`) : "",
    ...(Array.isArray(i?.components) ? i.components.flatMap((c: any) => lineFields(c, catalog)) : []),
  ];
}

/** Every searchable value on an order, one entry per field (so matches never span two fields). */
export function orderSearchFields(o: any, catalog?: CatalogSearchIndex | null): string[] {
  const c = o?.customer || {};
  const a = c.address || {};
  const ship = o?.shippingAddress || {};
  return [
    o?.orderId, o?.id, c.name, c.email, c.phone, o?.phone, a.zip, a.postalCode, ship.zip, ship.postalCode, o?.trackingNumber,
    ...(o?.items || []).flatMap((i: any) => lineFields(i, catalog)),
  ].filter((v) => v !== undefined && v !== null && v !== "").map(String);
}

const cache = new WeakMap<object, { catalog: CatalogSearchIndex | null | undefined; raw: string; tight: string }>();

function haystack(o: any, catalog?: CatalogSearchIndex | null) {
  const hit = o && typeof o === "object" ? cache.get(o) : undefined;
  if (hit && hit.catalog === catalog) return hit;
  const fields = orderSearchFields(o, catalog);
  const entry = { catalog, raw: fields.map(lower).join("\n"), tight: fields.map(compact).join("\n") };
  if (o && typeof o === "object") cache.set(o, entry);
  return entry;
}

function termMatches(h: { raw: string; tight: string }, term: string) {
  const t = term.replace(/^#+/, "");
  if (!t) return true;
  if (h.raw.includes(t)) return true;
  const tight = compact(t);
  return tight.length > 0 && h.tight.includes(tight);
}

/** True when the order matches what the owner typed (blank = everything). */
export function orderMatches(o: any, query: string, catalog?: CatalogSearchIndex | null): boolean {
  const q = lower(query).trim();
  if (!q) return true;
  const h = haystack(o, catalog);
  // The whole query (an order number or phone typed with spaces), else every word somewhere.
  return termMatches(h, q) || q.split(/\s+/).every((w) => termMatches(h, w));
}
