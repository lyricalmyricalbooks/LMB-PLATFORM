// Sample sets for starter websites (plan "Rethinking starter websites and Studio", step 1, 24 November 2026).
//
// A starter is a design; a sample set is the content that fills it: photos for the page bands, example products or
// example services, all in neutral words. Any starter can be shown with any sample set that suits the shop, so one new
// design serves a ceramics shop, a bookshop and a studio. A new kind of shop only needs a new set here.
//
// Rules: every photo lives in public/samples/<set>/ and is listed with its licence in public/samples/LICENSE.md
// (`starterSamples.test.ts` checks both). Words stay neutral: "Example …" names, no made-up makers, stories or reviews.
// Pure data, so the gallery, the sign-up preview, the example products and the tests share it.

import { shopKind, type ShopKind } from "../../shared/shopSells";

export type SampleSetId = "home" | "clothing" | "books" | "studio" | "food" | "beauty" | "made";

/** The photos a starter's page bands use: the opening banner, a story band, the about page and a wide banner. */
export type SamplePhotoRole = "opening" | "story" | "about" | "banner";

export type SampleProduct = {
  /** File name in public/samples/<set>/, without ".webp". */
  photo: string;
  title: string;
  /** Whole currency units, an example price only. */
  price: number;
  alt: string;
};

export type SampleService = {
  photo: string;
  name: string;
  minutes: number;
  /** Whole currency units, an example price only. */
  price: number;
  /** More than one place makes it a class. */
  places: number;
  alt: string;
};

export type SampleSet = {
  id: SampleSetId;
  /** What the owner sees in the gallery's "Show with" picker. */
  label: string;
  /** The kinds of shop this set suits (sign-up's Bookshop / Product shop / Services). */
  suits: ShopKind[];
  photos: Record<SamplePhotoRole, { photo: string; alt: string }>;
  products: SampleProduct[];
  services: SampleService[];
};

export const SAMPLE_SETS: Record<SampleSetId, SampleSet> = {
  home: {
    id: "home",
    label: "Home goods",
    suits: ["products"],
    photos: {
      opening: { photo: "opening", alt: "Stoneware bowls and a jug with lavender" },
      story: { photo: "story", alt: "Hands shaping a clay pot" },
      about: { photo: "about", alt: "Unglazed cups drying on wooden boards" },
      banner: { photo: "banner", alt: "Folded linen on a wooden stool" },
    },
    products: [
      { photo: "mug", title: "Example stoneware mug", price: 28, alt: "Glazed stoneware mugs on a shelf" },
      { photo: "cups", title: "Example cup set", price: 42, alt: "Speckled and white ceramic cups" },
      { photo: "plates", title: "Example dinner set", price: 120, alt: "A green plate, bowls and two pink cups" },
      { photo: "bowls", title: "Example small bowls", price: 36, alt: "Small glazed bowls on a pink table" },
      { photo: "pillar-candle", title: "Example pillar candle", price: 22, alt: "A hand holding a white pillar candle" },
      { photo: "candle-tins", title: "Example candle", price: 26, alt: "Lit candles in glass jars" },
      { photo: "napkins", title: "Example linen napkins", price: 32, alt: "A stack of folded linen napkins" },
      { photo: "towels", title: "Example cotton towels", price: 38, alt: "Folded towels with fringed edges" },
    ],
    services: [],
  },
  clothing: {
    id: "clothing",
    label: "Clothing",
    suits: ["products"],
    photos: {
      opening: { photo: "opening", alt: "Jackets on a clothes rail" },
      story: { photo: "story", alt: "Knitwear hanging in soft light" },
      about: { photo: "about", alt: "A bright shop with clothes rails" },
      banner: { photo: "banner", alt: "A rail of jackets and a hat" },
    },
    products: [
      { photo: "sweater", title: "Example wool sweater", price: 120, alt: "A stack of folded knit sweaters" },
      { photo: "ribbed-knit", title: "Example ribbed knit", price: 95, alt: "Folded knits in cream, tan and mustard" },
      { photo: "crew", title: "Example crew neck", price: 85, alt: "Folded sweaters in grey and tan" },
      { photo: "sweatshirt", title: "Example sweatshirt", price: 68, alt: "A white sweatshirt laid flat" },
      { photo: "cardigan", title: "Example crochet cardigan", price: 160, alt: "A crochet cardigan on a hanger" },
      { photo: "green-knit", title: "Example green knit", price: 110, alt: "A green knit with a ball of yarn" },
      { photo: "chunky-knit", title: "Example chunky knit", price: 130, alt: "A white chunky knit sweater" },
      { photo: "striped-tee", title: "Example striped tee", price: 38, alt: "A striped tee and jeans laid flat" },
    ],
    services: [],
  },
  books: {
    id: "books",
    label: "Books and prints",
    suits: ["books", "products"],
    photos: {
      opening: { photo: "opening", alt: "Bookshelves beside a window and a chair" },
      story: { photo: "story", alt: "A lino print with brushes" },
      about: { photo: "about", alt: "A bright room of bookshelves" },
      banner: { photo: "banner", alt: "Stacks of books in sunlight" },
    },
    products: [
      { photo: "novel", title: "Example clothbound book", price: 34, alt: "A stack of old clothbound books" },
      { photo: "essays", title: "Example hardcover", price: 28, alt: "Grey hardcover books against a brick wall" },
      { photo: "paperbacks", title: "Example paperback", price: 18, alt: "A tall stack of paperbacks" },
      { photo: "poetry", title: "Example small book", price: 16, alt: "A stack of pink books" },
      { photo: "notebook", title: "Example notebook", price: 14, alt: "Two plain notebooks" },
      { photo: "botanical-print", title: "Example art print", price: 45, alt: "A flower drawing with pens and paints" },
      { photo: "rose-print", title: "Example botanical print", price: 40, alt: "A painted rose print" },
      { photo: "cards", title: "Example card set", price: 18, alt: "Illustrated cards on a cloth" },
    ],
    services: [],
  },
  studio: {
    id: "studio",
    label: "Studio and classes",
    suits: ["services"],
    photos: {
      opening: { photo: "opening", alt: "Shelves of pots in a studio" },
      story: { photo: "story", alt: "Hands throwing a pot on a wheel" },
      about: { photo: "about", alt: "Shaping a vase on a pottery wheel" },
      banner: { photo: "banner", alt: "A row of glazed cups in sunlight" },
    },
    products: [],
    services: [
      { photo: "wheel-lesson", name: "Example one-to-one session", minutes: 60, price: 75, places: 1, alt: "Hands centring clay on a wheel" },
      { photo: "group-class", name: "Example group class", minutes: 120, price: 55, places: 8, alt: "People working at a long table in a studio" },
      { photo: "hand-building", name: "Example workshop", minutes: 180, price: 90, places: 6, alt: "Shaping a clay bowl by hand" },
      { photo: "glazing", name: "Example short visit", minutes: 30, price: 25, places: 1, alt: "Painting glaze onto a bowl" },
    ],
  },
  // Round three (25 November 2026): sets for the food and drink, appointments and enquiries starters.
  food: {
    id: "food",
    label: "Food and drink",
    suits: ["products"],
    photos: {
      opening: { photo: "opening", alt: "Fresh loaves of bread on a bakery counter" },
      story: { photo: "story", alt: "Hands kneading dough on a wooden table" },
      about: { photo: "about", alt: "A small café with shelves of jars and coffee" },
      banner: { photo: "banner", alt: "Plates of food on a wooden table, seen from above" },
    },
    products: [
      { photo: "sourdough", title: "Example sourdough loaf", price: 9, alt: "A sliced sourdough loaf on a wooden board" },
      { photo: "coffee", title: "Example coffee beans", price: 19, alt: "Roasted coffee beans beside a cup of coffee" },
      { photo: "olive-oil", title: "Example olive oil", price: 24, alt: "A glass bottle of olive oil with olives" },
      { photo: "jam", title: "Example strawberry jam", price: 11, alt: "A jar of strawberry jam in a basket of strawberries" },
      { photo: "loose-tea", title: "Example loose tea", price: 14, alt: "Spoons of loose-leaf tea on marble" },
      { photo: "chocolate", title: "Example dark chocolate", price: 8, alt: "Pieces of dark chocolate" },
      { photo: "country-loaf", title: "Example country loaf", price: 10, alt: "A halved country loaf on a dark board" },
      { photo: "baking-chocolate", title: "Example baking chocolate", price: 12, alt: "Chopped dark chocolate in a glass bowl" },
    ],
    services: [],
  },
  beauty: {
    id: "beauty",
    label: "Salon and beauty",
    suits: ["services"],
    photos: {
      opening: { photo: "opening", alt: "An empty salon with chairs and tall mirrors" },
      story: { photo: "story", alt: "Hands holding brushes, scissors and a tint brush" },
      about: { photo: "about", alt: "A styling chair in front of a lit mirror" },
      banner: { photo: "banner", alt: "A hand with soft pink nails" },
    },
    products: [],
    services: [
      { photo: "cut-and-style", name: "Example cut and style", minutes: 60, price: 65, places: 1, alt: "A stylist pinning up a client's hair" },
      { photo: "colour", name: "Example colour", minutes: 120, price: 140, places: 1, alt: "A stylist with a client in a cape" },
      { photo: "facial", name: "Example facial", minutes: 45, price: 80, places: 1, alt: "A clay mask brushed on during a facial" },
      { photo: "manicure", name: "Example manicure", minutes: 40, price: 45, places: 1, alt: "A hand with neat pink nails" },
    ],
  },
  made: {
    id: "made",
    label: "Made to order",
    suits: ["products", "services"],
    photos: {
      opening: { photo: "opening", alt: "A long wooden dining table with woven chairs" },
      story: { photo: "story", alt: "Hands carving wood with a chisel" },
      about: { photo: "about", alt: "A sunlit workbench with offcuts and tools" },
      banner: { photo: "banner", alt: "Wooden hand planes hung on a dark wall" },
    },
    products: [
      { photo: "round-table", title: "Example round table", price: 1400, alt: "A round wooden table with cane chairs by a window" },
      { photo: "chair", title: "Example oak chair", price: 420, alt: "A pale wooden chair on a plain background" },
      { photo: "bench", title: "Example bench", price: 380, alt: "A small wooden bench on a wooden floor" },
      { photo: "wall-shelf", title: "Example wall shelf", price: 160, alt: "Two wooden shelves with plants and pictures" },
      { photo: "spindle-chair", title: "Example spindle chair", price: 360, alt: "A spindle-back wooden chair" },
      { photo: "stool", title: "Example stool", price: 220, alt: "A round wooden stool beside a tall mirror" },
      { photo: "pedestal-table", title: "Example pedestal table", price: 980, alt: "A round pedestal table in a bright room" },
    ],
    services: [],
  },
};

export const SAMPLE_SET_IDS = Object.keys(SAMPLE_SETS) as SampleSetId[];

/** Where a set's photo is served, under the site's base address. */
export function samplePhotoUrl(set: SampleSetId, photo: string, base = baseUrl()): string {
  return `${base.replace(/\/?$/, "/")}samples/${set}/${photo}.webp`;
}

function baseUrl(): string {
  try {
    return (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL || "/";
  } catch {
    return "/";
  }
}

/**
 * The set a shop sees first, from what it sells (the sign-up answer): clothes, shoes and jewellery get Clothing, books
 * and prints get Books and prints, hair and wellness get Salon and beauty, other services Studio and classes, anything
 * else Home goods.
 */
export function sampleSetFor(sells?: string | null): SampleSetId {
  const answer = String(sells || "");
  const kind = shopKind(answer);
  if (answer === "hair" || answer === "wellness") return "beauty";
  if (kind === "services") return "studio";
  if (kind === "books" || answer === "prints" || answer === "art") return "books";
  if (answer === "clothing" || answer === "shoes" || answer === "jewelry") return "clothing";
  return "home";
}

/** The sets that suit a kind of shop, the shop's own first: what the gallery's "Show with" picker offers. */
export function sampleSetsFor(sells?: string | null): SampleSet[] {
  const kind = shopKind(sells);
  const first = sampleSetFor(sells);
  const fits = SAMPLE_SET_IDS.filter((id) => SAMPLE_SETS[id].suits.includes(kind));
  return [first, ...fits.filter((id) => id !== first)].map((id) => SAMPLE_SETS[id]);
}

/**
 * The photos a starter fills its empty picture spots with, in order: the four band photos (opening, story, about,
 * banner), then the set's product or service photos. Starter sections take them in turn (presetContent.ts).
 */
export function samplePhotosFor(sells?: string | null, base?: string): { url: string; alt: string }[] {
  const set = SAMPLE_SETS[sampleSetFor(sells)];
  const roles: SamplePhotoRole[] = ["opening", "story", "about", "banner"];
  const items = [...set.products, ...set.services];
  return [
    ...roles.map((role) => ({ url: samplePhotoUrl(set.id, set.photos[role].photo, base), alt: set.photos[role].alt })),
    ...items.map((item) => ({ url: samplePhotoUrl(set.id, item.photo, base), alt: item.alt })),
  ];
}

/** Display price for a preview card, in the shop's currency (example prices only). */
export function samplePrice(amount: number, currency = "CAD"): string {
  const prefix = currency === "USD" ? "US$" : currency === "CAD" ? "CA$" : `${currency} `;
  return `${prefix} ${amount.toFixed(2)}`;
}
