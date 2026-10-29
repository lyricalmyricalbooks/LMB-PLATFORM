// The sample press the demo shop shows shoppers: Moth Press, a made-up small press with books, zines, prints and merch,
// so the storefront, the product pages, the bag, checkout and the admin look the way a real press's would. The
// platform's own test products (setup/test-catalogue.js) stay in the shop, hidden from shoppers, for the release checks.
//
// The shapes follow the shop (apps/shop/src/app/features/site/types.ts `Book`, the reviews rules in firestore.rules).
// Every name, person, review and price here is made up.
import { backArt, coverArt, pinArt, posterArt, shirtArt, toteArt } from "./sampleArt.js";

export const SAMPLE_PRESS = Object.freeze({
  name: "Moth Press",
  description: "A small press for photobooks, zines and poems, printed on a risograph in a back room. Made up for the Colophon walkthrough: no money moves and no email leaves this computer.",
  website: "https://mothpress.example",
  email: "hello@mothpress.example",
});

// The shop's menu: the first shows everything ("PUBLICATIONS" is the shop's own word for all of it).
export const SAMPLE_CATEGORIES = Object.freeze(["PUBLICATIONS", "PHOTOBOOKS", "ZINES", "POETRY & ESSAYS", "PRINTS & MERCH"]);

const INKS = { red: "#e8463a", blue: "#2f5fd0", yellow: "#f2c230", green: "#1f9e6e", pink: "#e86fa6", teal: "#2a8c8c", ink: "#14110d" };

const printed = (fields) => ({ status: "published", trackInventory: true, language: "English", publisher: SAMPLE_PRESS.name, ...fields });

/**
 * The products, in the order the shop lists them. Each: `id`, the shop fields, and `art`: the pictures to draw
 * ([{ name, svg }], the first is the main photo).
 */
export function sampleProducts() {
  return [
    {
      id: "low-tide-almanac",
      author: "Ada Fenwick",
      data: printed({
        title: "Low Tide Almanac", subtitle: "Photographs from a year on the mudflats",
        format: "Hardcover", retailPrice: 48, stockLevel: 14, weight: "900", pageCount: 136, dimensions: "24 × 30 cm", edition: "First edition of 500",
        isbn: "978-0-00-000001-1", publishDate: "2026-04-18", isFeatured: true, categories: ["PHOTOBOOKS"],
        description: "A year of walking the same stretch of shoreline at low tide, twice a day. 96 photographs printed in two inks on uncoated paper, with tide tables for every walk. Thread-sewn and bound in grey cloth.",
        artistBio: "Ada Fenwick is a made-up photographer who lives by the sea and wakes up too early.",
        creatorLinks: [{ name: "Ada Fenwick", url: "https://adafenwick.example" }],
      }),
      art: [
        { name: "cover", svg: coverArt({ style: "horizon", title: "Low Tide Almanac", author: "Ada Fenwick", ink: INKS.blue, ink2: INKS.teal }) },
        { name: "back", svg: backArt({ blurb: "Ninety-six photographs of one shoreline, made at low tide twice a day for a whole year.", ink: INKS.blue }) },
      ],
    },
    {
      id: "night-buses",
      author: "Jun Okafor",
      data: printed({
        title: "Night Buses", subtitle: "A photo zine",
        format: "Zine", retailPrice: 18, stockLevel: 40, weight: "120", pageCount: 40, dimensions: "A5", edition: "Third printing",
        publishDate: "2025-11-02", isFeatured: true, categories: ["ZINES", "PHOTOBOOKS"],
        description: "The city after midnight from the back seat of the last bus home. Risograph printed in blue and yellow, stapled by hand.",
        artistBio: "Jun Okafor is a made-up photographer who never learned to drive.",
      }),
      art: [{ name: "cover", svg: coverArt({ style: "night", title: "Night Buses", author: "Jun Okafor", ink: INKS.yellow }) }],
    },
    {
      id: "the-quiet-field",
      author: "Mira Solano",
      data: printed({
        title: "The Quiet Field", subtitle: "Poems",
        format: "Paperback", retailPrice: 22, stockLevel: 3, weight: "220", pageCount: 88, dimensions: "13 × 20 cm",
        isbn: "978-0-00-000002-8", publishDate: "2026-02-09", isFeatured: true, categories: ["POETRY & ESSAYS"],
        description: "Forty short poems about moths, porch lights and the people who leave them on. Only three copies left of the first printing.",
        artistBio: "Mira Solano is a made-up poet who keeps a notebook by every window.",
      }),
      art: [
        { name: "cover", svg: coverArt({ style: "quiet", title: "The Quiet Field", author: "Mira Solano", ink: INKS.pink }) },
        { name: "back", svg: backArt({ blurb: "Forty short poems about moths, porch lights and the people who leave them on all night.", ink: INKS.pink }) },
      ],
    },
    {
      id: "salt-and-static",
      author: "Theo Marsh",
      data: printed({
        title: "Salt & Static", subtitle: "Essays on radio and the sea",
        format: "Paperback", retailPrice: 26, isOnSale: true, salePrice: 20, stockLevel: 22, weight: "280", pageCount: 164,
        isbn: "978-0-00-000003-5", publishDate: "2025-09-14", categories: ["POETRY & ESSAYS"],
        description: "Eight essays about shipping forecasts, pirate radio and the sound of the sea at night. On sale this month.",
      }),
      art: [{ name: "cover", svg: coverArt({ style: "bands", title: "Salt & Static", author: "Theo Marsh", ink: INKS.red, ink2: INKS.yellow }) }],
    },
    {
      id: "field-guide-to-small-moths",
      author: "Moth Press",
      data: printed({
        title: "A Field Guide to Small Moths",
        format: "Paperback", retailPrice: 34, stockLevel: 0, weight: "340", pageCount: 112, edition: "Sold out, reprinting",
        publishDate: "2024-06-01", categories: ["PHOTOBOOKS"],
        description: "Sixty-four moths drawn life size, with notes on where to find them. Sold out: join the list and the shop emails you when it is back.",
      }),
      art: [{ name: "cover", svg: coverArt({ style: "specimens", title: "Small Moths", author: "A Field Guide", ink: INKS.green, ink2: INKS.red }) }],
    },
    {
      id: "harbour-lights",
      author: "Ada Fenwick",
      data: {
        status: "published", trackInventory: false, preorder: true, publisher: SAMPLE_PRESS.name,
        title: "Harbour Lights", subtitle: "Pre-order: ships in March",
        format: "Hardcover", retailPrice: 42, stockLevel: 50, weight: "850", pageCount: 120,
        publishDate: "2099-03-15", categories: ["PHOTOBOOKS"],
        description: "The next photobook from Ada Fenwick: lighthouses and harbour lamps, photographed at dusk. Order now and it ships the week it is printed.",
      },
      art: [{ name: "cover", svg: coverArt({ style: "horizon", title: "Harbour Lights", author: "Ada Fenwick", ink: INKS.ink, ink2: INKS.yellow }) }],
    },
    {
      id: "paper-weather",
      author: "Mira Solano",
      data: {
        status: "published", trackInventory: false, digital: true, publisher: SAMPLE_PRESS.name,
        title: "Paper Weather", subtitle: "E-book",
        format: "E-book", retailPrice: 12, stockLevel: 0, pageCount: 60, publishDate: "2026-01-20", categories: ["POETRY & ESSAYS"],
        description: "A digital edition of weather poems. You get a download link on the order page and in the confirmation email.",
      },
      art: [{ name: "cover", svg: coverArt({ style: "screen", title: "Paper Weather", author: "Mira Solano", ink: INKS.blue, ink2: INKS.pink }) }],
    },
    {
      id: "moth-tote-bag",
      data: {
        status: "published", trackInventory: true, kind: "other", publisher: SAMPLE_PRESS.name,
        title: "Moth Tote Bag", retailPrice: 24, stockLevel: 18, weight: "180", categories: ["PRINTS & MERCH"],
        description: "A heavy cotton tote with the Moth Press moth printed by hand. Holds about twelve books, or one large photobook and lunch.",
        material: "100% organic cotton canvas, 340 g/m²", care: "Wash cold, inside out. Hang to dry.",
        options: [{ name: "Colour", values: ["Natural", "Black"] }],
        variants: [
          { id: "moth-tote-natural", name: "Natural", options: { Colour: "Natural" }, price: 24, stock: 10, stockLevel: 10, sku: "TOTE-NAT" },
          { id: "moth-tote-black", name: "Black", options: { Colour: "Black" }, price: 24, stock: 8, stockLevel: 8, sku: "TOTE-BLK" },
        ],
      },
      art: [
        { name: "natural", svg: toteArt({ colour: "#e9e0cc", ink: INKS.red, label: "MOTH PRESS" }) },
        { name: "black", svg: toteArt({ colour: "#1b1b1b", ink: INKS.yellow, label: "MOTH PRESS" }) },
      ],
      variantPhotos: { "moth-tote-natural": 0, "moth-tote-black": 1 },
    },
    {
      id: "night-buses-t-shirt",
      data: {
        status: "published", trackInventory: true, kind: "clothing", publisher: SAMPLE_PRESS.name,
        title: "Night Buses T-shirt", retailPrice: 32, stockLevel: 24, weight: "220", categories: ["PRINTS & MERCH"],
        description: "The cover of Night Buses, screen printed on a soft cotton shirt. Unisex fit.",
        material: "100% combed cotton", care: "Wash cold. Don't iron the print.",
        sizeChart: "S: chest 92 cm · M: chest 100 cm · L: chest 108 cm · XL: chest 116 cm",
        options: [{ name: "Size", values: ["S", "M", "L", "XL"] }, { name: "Colour", values: ["Black", "Bone"] }],
        variants: ["S", "M", "L", "XL"].flatMap((size) => ["Black", "Bone"].map((colour) => ({
          id: `night-buses-tee-${size.toLowerCase()}-${colour.toLowerCase()}`,
          name: `${size} / ${colour}`,
          options: { Size: size, Colour: colour },
          price: 32,
          stock: size === "XL" && colour === "Bone" ? 0 : 3,
          stockLevel: size === "XL" && colour === "Bone" ? 0 : 3,
          sku: `TEE-NB-${size}-${colour.toUpperCase()}`,
        }))),
      },
      art: [
        { name: "black", svg: shirtArt({ colour: "#1b1b1b", ink: "#1b1d2b", label: "NIGHT BUSES" }) },
        { name: "bone", svg: shirtArt({ colour: "#ece4d2", ink: "#1b1d2b", label: "NIGHT BUSES" }) },
      ],
      variantPhotos: Object.fromEntries(["s", "m", "l", "xl"].flatMap((size) => [[`night-buses-tee-${size}-black`, 0], [`night-buses-tee-${size}-bone`, 1]])),
    },
    {
      id: "low-tide-print",
      data: {
        status: "published", trackInventory: true, kind: "art", publisher: SAMPLE_PRESS.name,
        title: "Low Tide Risograph Print", retailPrice: 20, stockLevel: 30, weight: "150", categories: ["PRINTS & MERCH"],
        description: "A two-ink risograph print of the cover of Low Tide Almanac, on heavy recycled paper. Signed and numbered. Ships rolled in a tube.",
        options: [{ name: "Size", values: ["A3", "A2"] }],
        variants: [
          { id: "low-tide-print-a3", name: "A3", options: { Size: "A3" }, price: 20, stock: 20, stockLevel: 20, sku: "PRINT-LT-A3" },
          { id: "low-tide-print-a2", name: "A2", options: { Size: "A2" }, price: 35, stock: 10, stockLevel: 10, sku: "PRINT-LT-A2" },
        ],
      },
      art: [{ name: "print", svg: posterArt({ title: "Low Tide", ink: INKS.teal, ink2: INKS.blue }) }],
    },
    {
      // A gift card: the amounts are its versions. Paying for one makes a code and emails it (to the buyer, or to the
      // person it's for), and the code pays at checkout. Never taxed, discounted or counted as stock.
      id: "moth-press-gift-card",
      data: {
        status: "published", productType: "giftCard", digital: true, trackInventory: false, allowBackorder: false, chargeTax: false,
        publisher: SAMPLE_PRESS.name, title: "Moth Press Gift Card", retailPrice: 25, stockLevel: 0, categories: ["PRINTS & MERCH"],
        description: "A gift card for anything in the shop. Choose an amount, and who it's for: they get the code by email.",
        variants: [25, 50, 100].map((amount) => ({ id: `gift-${amount}`, name: `CA$${amount}`, price: amount, digital: true, stock: 0, stockLevel: 0 })),
      },
      art: [{ name: "card", svg: posterArt({ title: "Gift Card", ink: INKS.pink, ink2: INKS.yellow }) }],
    },
    {
      // A box set: two books sold together. It has no stock of its own; it sells while both books are in stock.
      id: "night-and-tide-box-set",
      data: {
        status: "published", trackInventory: false, publisher: SAMPLE_PRESS.name,
        title: "Night and Tide Box Set", subtitle: "Low Tide Almanac and Night Buses", format: "Box set", retailPrice: 60, stockLevel: 0,
        categories: ["PHOTOBOOKS", "ZINES"],
        description: "Low Tide Almanac and Night Buses together in a printed slipcase, for less than the two apart.",
        bundleItems: [{ bookId: "low-tide-almanac", variantId: null, quantity: 1 }, { bookId: "night-buses", variantId: null, quantity: 1 }],
      },
      art: [{ name: "box", svg: coverArt({ style: "horizon", title: "Night and Tide", author: "Box set", ink: INKS.blue, ink2: INKS.yellow }) }],
    },
    {
      id: "moth-enamel-pin",
      data: {
        status: "published", trackInventory: true, kind: "jewelry", publisher: SAMPLE_PRESS.name,
        title: "Moth Enamel Pin", retailPrice: 12, stockLevel: 45, weight: "30", categories: ["PRINTS & MERCH"],
        description: "A hard enamel moth with gold edges, on a printed backing card. Two rubber clutches on the back.",
      },
      art: [{ name: "pin", svg: pinArt({ ink: INKS.red, ink2: INKS.yellow }) }],
    },
  ];
}

/** Approved reviews shoppers see on the product pages, and one waiting for the owner in Reviews. */
export function sampleReviews(now = new Date()) {
  const daysAgo = (n) => new Date(now.getTime() - n * 86_400_000).toISOString();
  return [
    { id: "sample-review-1", data: { bookId: "low-tide-almanac", authorName: "Priya S.", rating: 5, title: "Worth the wait", body: "The printing is beautiful and the cloth cover feels lovely. I keep it on the kitchen table.", status: "approved", createdAt: daysAgo(12) } },
    { id: "sample-review-2", data: { bookId: "low-tide-almanac", authorName: "Tom R.", rating: 4, title: "Quiet and calm", body: "A slow book in the best way. Arrived well packed.", status: "approved", createdAt: daysAgo(30) } },
    { id: "sample-review-3", data: { bookId: "night-buses", authorName: "Lena K.", rating: 5, title: "Love the colours", body: "Blue and yellow riso on every page. Bought a second copy as a gift.", status: "approved", createdAt: daysAgo(6) } },
    { id: "sample-review-4", data: { bookId: "the-quiet-field", authorName: "Sam W.", rating: 5, title: "Read it in one sitting", body: "Short poems that stay with you. The moth on the cover is perfect.", status: "approved", createdAt: daysAgo(20) } },
    { id: "sample-review-5", data: { bookId: "night-buses-t-shirt", authorName: "Alex P.", rating: 4, title: "Good fit", body: "Size M fits as expected. The print survived the wash.", status: "approved", createdAt: daysAgo(9) } },
    { id: "sample-review-6", data: { bookId: "salt-and-static", authorName: "Jordan B.", rating: 3, title: "Waiting for the owner", body: "A review that waits in Reviews until the owner approves it.", status: "pending", createdAt: daysAgo(1) } },
  ];
}

/** Discount codes the bag and the admin's Discounts page show. */
export function sampleDiscounts() {
  return [
    { id: "WELCOME10", data: {
      code: "WELCOME10", type: "percentage", value: 10, isActive: true, method: "code", appliesTo: "all", usageCount: 3, usageLimit: null,
      onePerCustomer: true, startDate: null, expiryDate: null, minOrderAmount: null, minQuantity: null, maxDiscountAmount: null,
      description: "10% off a first order",
    } },
  ];
}
