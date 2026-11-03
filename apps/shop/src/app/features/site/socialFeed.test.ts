// Instagram, Facebook and Pinterest product file (code plan 24.7): the Google feed's items as the CSV Meta Commerce
// Manager and Pinterest catalogs read, with their availability words.
import { describe, expect, it } from "vitest";
// @ts-ignore - plain ESM shared with the build script
import { merchantFeedItems, socialFeedCsv, SOCIAL_FEED_FILE } from "./merchantFeed.mjs";

const now = new Date("2026-10-08T16:00:00Z");
const photo = (n: string) => [{ url: `https://img.test/${n}.jpg` }, { url: `https://img.test/${n}-back.jpg` }, { url: `https://img.test/${n}-side.jpg` }];
const catalog: any[] = [
  { id: "a", title: "Salt, Hours", subtitle: "Zoe \"Z\" Moss", description: "<p>Poems</p><p>and tides</p>", isbn: "978-0-306-40615-7", retailPrice: 24, trackInventory: true, stockLevel: 3, photos: photo("a") },
  { id: "b", title: "Sold Out", retailPrice: 10, trackInventory: true, stockLevel: 0, photos: photo("b") },
  { id: "c", title: "Backorder", retailPrice: 10, trackInventory: true, allowBackorder: true, stockLevel: 0, photos: photo("c") },
  { id: "d", title: "Sale", retailPrice: 30, isOnSale: true, salePrice: 20, saleStartsAt: "2026-10-01", saleEndsAt: "2026-12-31", photos: photo("d") },
  { id: "e", title: "Pre", retailPrice: 15, preorder: true, publishDate: "2026-11-12", photos: photo("e") },
  { id: "t", title: "Tee", kind: "clothing", retailPrice: 0, photos: photo("t"), variants: [{ id: "m", name: "Medium", price: 30, options: { Size: "M", Colour: "Ink" } }] },
];

function parse(csv: string) {
  // A small CSV reader: quoted fields with doubled quotes, no line breaks inside fields.
  const lines = csv.trimEnd().split("\n");
  const split = (line: string) => {
    const out: string[] = []; let cur = ""; let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') quoted = false; else cur += c; }
      else if (c === '"') quoted = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c;
    }
    out.push(cur); return out;
  };
  const header = split(lines[0]);
  return { header, rows: lines.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [header[i], v]))) };
}

describe("social product file", () => {
  const { items } = merchantFeedItems("https://shop.test", catalog, { shopName: "Moth Press", now });
  const csv = socialFeedCsv(items);
  const { header, rows } = parse(csv);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

  it("is a CSV served next to the Google feed, one row per listing, every row the header's width", () => {
    expect(SOCIAL_FEED_FILE).toBe("social-product-feed.csv");
    expect(header.slice(0, 7)).toEqual(["id", "item_group_id", "title", "description", "availability", "condition", "price"]);
    expect(rows.map((r) => r.id)).toEqual(items.map((i: any) => i.id));
    for (const r of rows) expect(Object.keys(r)).toHaveLength(header.length);
  });
  it("uses the words Facebook and Pinterest accept; ships-later items are pre-orders", () => {
    expect(byId.a.availability).toBe("in stock");
    expect(byId.b.availability).toBe("out of stock");
    expect(byId.c.availability).toBe("preorder");
    expect(byId.e.availability).toBe("preorder");
  });
  it("keeps the Google feed's price, sale, photos and options", () => {
    expect(byId.d.price).toBe("30.00 CAD");
    expect(byId.d.sale_price).toBe("20.00 CAD");
    expect(byId.d.sale_price_effective_date).toMatch(/^2026-10-01T00:00-04:00\/2026-12-31T23:59-05:00$/);
    expect(byId.a.image_link).toBe("https://img.test/a.jpg");
    expect(byId.a.additional_image_link).toBe("https://img.test/a-back.jpg,https://img.test/a-side.jpg");
    expect(byId.a.gtin).toBe("9780306406157");
    expect(byId.t_m).toMatchObject({ item_group_id: "t", size: "M", color: "Ink", gender: "unisex", age_group: "adult", price: "30.00 CAD" });
  });
  it("quotes commas and quotes, and never breaks a row", () => {
    expect(byId.a.title).toBe('Salt, Hours by Zoe "Z" Moss');
    expect(byId.a.description).toBe("Poems and tides");
    expect(csv.split("\n").length).toBe(rows.length + 2);
  });
});
