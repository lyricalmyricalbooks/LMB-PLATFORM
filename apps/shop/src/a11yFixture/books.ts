// Sample books for the accessibility fixture (plan 8.8): one plain book on sale, one with editions and an add-on, one
// sold out, so the home page, a book page and the bag show their usual parts. Photos are drawn in the page (data
// addresses), so nothing is fetched.
const cover = (fill: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="${fill}"/></svg>`)}`;
const photo = (n: number, fill: string) => [{ id: `p${n}`, url: cover(fill), alt: "Book cover" }];

export const A11Y_BOOKS: any[] = [
  { id: "b1", slug: "salt-hours", title: "Salt Hours", authorName: "Zoe Moss", retailPrice: 30, salePrice: 20, isOnSale: true, stockLevel: 5, status: "published", isFeatured: true, featured: true, categories: ["Publications"], photos: photo(1, "#7a8b99"), description: "<p>Poems about tides.</p>", format: "Paperback", pageCount: 120, weight: 300 },
  { id: "b2", slug: "night-songs", title: "Night Songs", authorName: "A. Poet", retailPrice: 25, stockLevel: 3, status: "published", isFeatured: true, featured: true, categories: ["Zines"], photos: photo(2, "#4b3b5c"), description: "<p>Songs for the late shift.</p>", variants: [{ id: "v1", name: "Paperback", price: 25, stockLevel: 3 }, { id: "v2", name: "Hardcover", price: 45, stockLevel: 2 }], addOns: [{ id: "a1", label: "Signed copy", price: 5, kind: "option" }], weight: 250 },
  { id: "b3", slug: "paper-weather", title: "Paper Weather", authorName: "R. Lane", retailPrice: 18, stockLevel: 0, status: "published", categories: ["Publications"], photos: photo(3, "#c9b28a"), description: "<p>A sold-out first printing.</p>", weight: 200 },
];

// `?books=goods`: a general shop's products with sizes, colours and scents, to see the shop's option filters.
const tee = (n: number, title: string, fill: string, sizes: string[], colours: string[]) => ({
  id: `g${n}`, slug: title.toLowerCase().replace(/ /g, "-"), title, retailPrice: 30 + n, stockLevel: 6, status: "published", kind: "clothing", typeId: "tops",
  categories: ["Clothing"], photos: photo(10 + n, fill), description: "<p>Printed in the studio.</p>",
  options: [{ name: "Size", values: sizes }, { name: "Colour", values: colours }],
  variants: sizes.flatMap((s) => colours.map((c) => ({ id: `${n}-${s}-${c}`, name: `${s} / ${c}`, options: { Size: s, Colour: c }, price: 30 + n, stockLevel: 2 }))),
});
const candle = (n: number, title: string, fill: string, scents: string[]) => ({
  id: `c${n}`, slug: title.toLowerCase().replace(/ /g, "-"), title, retailPrice: 22, stockLevel: 6, status: "published", kind: "other", typeId: "candles",
  categories: ["Home"], photos: photo(20 + n, fill), description: "<p>Hand-poured soy wax.</p>",
  options: [{ name: "Scent", values: scents }],
  variants: scents.map((s) => ({ id: `${n}-${s}`, name: s, options: { Scent: s }, price: 22, stockLevel: 3 })),
});
export const A11Y_GOODS: any[] = [
  tee(1, "Moth Tee", "#5d6b4f", ["S", "M", "L"], ["Black", "Bone"]),
  tee(2, "Press Hoodie", "#8a4f3d", ["M", "L", "XL"], ["Black"]),
  candle(1, "Fig Candle", "#c9a27a", ["Fig", "Cedar"]),
  candle(2, "Night Candle", "#3d3a4f", ["Cedar", "Smoke"]),
];
