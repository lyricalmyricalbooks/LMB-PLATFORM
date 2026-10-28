// Products beyond books (plan 10.2, 10.20, 28 October 2026): a product's kind and its options (size, colour, material).
//
// The rule: a books shop works exactly as before. A product with no `kind` is a printed book, and a product with no
// `options` keeps today's one list of editions (each `variants[]` entry with its own name). Only a product saved with
// `options` gets option buttons, and then each variant carries its picks (`variants[].options`, { Size: "M" }) and its
// `name` is the picks joined ("M / Black"). Everything that already works per variant (price, stock holds, the bag,
// orders, emails, the stockroom link) keeps reading `variants[].id` and `variants[].name`, so it needs no change.
//
// Pure: the shop imports this file and the Functions run its generated copy (functions/shared/productOptions.js).

/** What a product is. A product saved before kinds existed is a printed book. */
export const PRODUCT_KINDS = ["book", "ebook", "clothing", "shoes", "jewelry", "art", "music", "other"] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

/** At most three options per product (size, colour, material), as most shop systems allow. */
export const MAX_OPTIONS = 3;
/** At most this many combinations per product, so the editor and the product page stay usable. */
export const MAX_VARIANTS = 100;
/** Longest option name or value kept. */
const MAX_WORD = 40;

export type ProductOption = { name: string; values: string[] };
export type OptionPicks = Record<string, string>;
export type OptionVariant = { id: string; name?: string; options?: OptionPicks; [key: string]: any };

/** The product's kind: its own when it is one of PRODUCT_KINDS, else a printed book. */
export function productKind(product: any): ProductKind {
  const kind = typeof product?.kind === "string" ? product.kind.trim().toLowerCase() : "";
  return (PRODUCT_KINDS as readonly string[]).includes(kind) ? (kind as ProductKind) : "book";
}

/** True for the kinds that are books (printed or e-book): only these show the book fields. */
export function isBookKind(kind: ProductKind): boolean {
  return kind === "book" || kind === "ebook";
}

const word = (value: unknown): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, MAX_WORD) : "");
const sameWord = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

/**
 * The product's options, tidied: names and values trimmed, blanks and repeats (any case) dropped, at most
 * MAX_OPTIONS options, an option with no values dropped. A product with none gets [] (today's editions list).
 */
export function productOptions(product: any): ProductOption[] {
  const raw = Array.isArray(product?.options) ? product.options : [];
  const out: ProductOption[] = [];
  for (const option of raw) {
    const name = word(option?.name);
    if (!name || out.some((o) => sameWord(o.name, name))) continue;
    const values: string[] = [];
    for (const v of Array.isArray(option?.values) ? option.values : []) {
      const value = word(v);
      if (value && !values.some((x) => sameWord(x, value))) values.push(value);
    }
    if (values.length) out.push({ name, values });
    if (out.length === MAX_OPTIONS) break;
  }
  return out;
}

/** The variant's picks in the product's option order, or null when it doesn't carry one known value per option. */
export function variantPicks(variant: OptionVariant | null | undefined, options: ProductOption[]): OptionPicks | null {
  if (!variant || !options.length || !variant.options || typeof variant.options !== "object") return null;
  const picks: OptionPicks = {};
  for (const option of options) {
    const own = word((variant.options as any)[option.name]);
    const value = option.values.find((v) => sameWord(v, own));
    if (!value) return null;
    picks[option.name] = value;
  }
  return picks;
}

/**
 * True when the product page shows option buttons: the product has options and every variant carries a pick for
 * each of them. Anything else (a book with editions, a half-saved product) keeps today's editions list.
 */
export function usesOptionPicker(product: any): boolean {
  const options = productOptions(product);
  const variants: OptionVariant[] = Array.isArray(product?.variants) ? product.variants : [];
  return options.length > 0 && variants.length > 0 && variants.every((v) => variantPicks(v, options) !== null);
}

/** The variant's name from its picks, in option order: "M / Black". */
export function variantLabel(options: ProductOption[], picks: OptionPicks): string {
  return options.map((o) => picks[o.name]).filter(Boolean).join(" / ");
}

/** Every combination of the options' values, first option slowest ("S / Black", "S / White", "M / Black", ...). */
export function optionCombinations(options: ProductOption[]): OptionPicks[] {
  let out: OptionPicks[] = [{}];
  for (const option of options) {
    const next: OptionPicks[] = [];
    for (const picks of out) for (const value of option.values) next.push({ ...picks, [option.name]: value });
    out = next;
  }
  return options.length ? out : [];
}

/** Plain-words problems with a set of options, empty when it can be saved. */
export function optionProblems(options: ProductOption[]): string[] {
  const problems: string[] = [];
  if (options.length > MAX_OPTIONS) problems.push(`A product can have at most ${MAX_OPTIONS} options.`);
  for (const option of options) if (!option.values.length) problems.push(`Add at least one choice to ${option.name || "the option"}.`);
  const count = options.reduce((n, o) => n * Math.max(1, o.values.length), options.length ? 1 : 0);
  if (count > MAX_VARIANTS) problems.push(`That makes ${count} combinations; a product can have at most ${MAX_VARIANTS}.`);
  return problems;
}

/**
 * The variants for a set of options: one per combination, in combination order. A combination that already had a
 * variant keeps it (its id, price, stock, SKU, photo), with its name brought up to date. `fresh(picks)` makes the
 * fields of a new one (id included). `removed` lists the variants whose combination is gone, so the editor can say so
 * before saving (their stock leaves the product).
 */
export function variantsForOptions(
  options: ProductOption[],
  existing: OptionVariant[],
  fresh: (picks: OptionPicks) => OptionVariant,
): { variants: OptionVariant[]; removed: OptionVariant[] } {
  const combos = optionCombinations(options);
  const used = new Set<OptionVariant>();
  const variants = combos.map((picks) => {
    const match = (existing || []).find((v) => !used.has(v) && sameCombo(variantPicks(v, options), picks));
    if (match) used.add(match);
    const base = match || fresh(picks);
    return { ...base, options: picks, name: variantLabel(options, picks) };
  });
  return { variants, removed: (existing || []).filter((v) => !used.has(v)) };
}

const sameCombo = (a: OptionPicks | null, b: OptionPicks) => !!a && Object.keys(b).every((k) => a[k] === b[k]);

/** The variant matching every pick, or null while a pick is missing or no variant has that combination. */
export function findVariant<V extends OptionVariant>(product: { variants?: V[] } & Record<string, any>, picks: OptionPicks): V | null {
  const options = productOptions(product);
  if (!options.length || options.some((o) => !picks[o.name])) return null;
  return (product.variants || []).find((v) => sameCombo(variantPicks(v, options), picks)) || null;
}

/** True when some variant agrees with every pick made so far (picks for options it doesn't have are ignored). */
export function picksPossible(product: { variants?: OptionVariant[] } & Record<string, any>, picks: OptionPicks): boolean {
  const options = productOptions(product);
  return (product.variants || []).some((v) => {
    const own = variantPicks(v, options);
    return !!own && options.every((o) => !picks[o.name] || own[o.name] === picks[o.name]);
  });
}

/**
 * Whether choosing `value` for `optionName` (with the shopper's other picks so far) can still lead to a variant
 * `canBuy` accepts. The product page crosses out the values that can't, so a sold-out size reads as sold out.
 */
export function valueAvailable<V extends OptionVariant>(
  product: { variants?: V[] } & Record<string, any>,
  picks: OptionPicks,
  optionName: string,
  value: string,
  canBuy: (variant: V) => boolean,
): boolean {
  const options = productOptions(product);
  return (product.variants || []).some((v) => {
    const own = variantPicks(v, options);
    if (!own || own[optionName] !== value) return false;
    return options.every((o) => o.name === optionName || !picks[o.name] || own[o.name] === picks[o.name]) && canBuy(v);
  });
}
