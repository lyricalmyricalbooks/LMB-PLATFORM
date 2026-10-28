import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  htmlToDescription, MOVED_MARK, movedBooksCsv, newsletterJoiners, planCustomerNotes, planShopMove, readCustomerExport,
  readProductExport, recognizeExport, SHAPE_WORDS,
} from "./shopMove";

const csv = (rows: string[][]) => rows.map(r => r.map(v => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",")).join("\n") + "\n";

// One line per edition, grouped by Handle; photos on their own lines.
const HANDLE_ROWS = csv([
  ["Handle", "Title", "Body (HTML)", "Vendor", "Type", "Tags", "Published", "Option1 Name", "Option1 Value", "Variant SKU", "Variant Grams", "Variant Inventory Qty", "Variant Price", "Variant Compare At Price", "Variant Barcode", "Image Src", "Image Position", "Status"],
  ["moth-songs", "Moth Songs", "<p>Poems for <strong>night</strong> readers.</p><p>See <a href=\"https://example.com/a\">the launch</a>.</p>", "Moth Press", "Book", "poetry, night", "TRUE", "Edition", "Paperback", "MS-PB", "300", "12", "20.00", "", "", "https://cdn.example/moth-1.jpg", "1", "active"],
  ["moth-songs", "", "", "", "", "", "", "", "Signed", "MS-SG", "300", "3", "35.00", "", "", "https://cdn.example/moth-2.jpg", "2", ""],
  ["moth-songs", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "https://cdn.example/moth-3.jpg", "3", ""],
  ["river-zine", "River Zine", "Plain words.", "Moth Press", "Zine", "", "TRUE", "Title", "Default Title", "RZ-1", "80", "40", "8.00", "10.00", "9780306406157", "https://cdn.example/river.jpg", "1", "draft"],
]);

const PRODUCT_ID_ROWS = csv([
  ["Product ID [Non Editable]", "Variant ID [Non Editable]", "Product Type [Non Editable]", "Product Page", "Product URL", "Title", "Description", "SKU", "Option Name 1", "Option Value 1", "Price", "Sale Price", "On Sale", "Stock", "Categories", "Tags", "Weight", "Visible", "Hosted Image URLs"],
  ["p1", "v1", "PHYSICAL", "shop", "tide-tables", "Tide Tables", "<p>Charts.</p>", "TT-S", "Size", "Small", "15", "12", "Yes", "4", "Books, Prints", "sea", "0", "Yes", "https://img.example/t1.jpg https://img.example/t2.jpg"],
  ["p1", "v2", "", "", "", "", "", "TT-L", "", "Large", "25", "", "No", "Unlimited", "", "", "", "", ""],
  ["p2", "v3", "PHYSICAL", "shop", "salt", "Salt", "", "SALT", "", "", "18", "", "No", "7", "", "", "", "Yes", ""],
]);

const PARENT_ROWS = csv([
  ["ID", "Type", "SKU", "Name", "Published", "Short description", "Description", "Weight (kg)", "Stock", "Sale price", "Regular price", "Categories", "Tags", "Images", "Parent", "Attribute 1 name", "Attribute 1 value(s)"],
  ["10", "variable", "FERN", "Fern Atlas", "1", "Short", "Long\\nsecond line", "0.4", "", "", "", "Books > Art books, Prints", "plants", "https://img.example/f1.jpg, https://img.example/f2.jpg", "", "Cover", "Blue, Green"],
  ["11", "variation", "FERN-B", "Fern Atlas - Blue", "1", "", "", "0.4", "5", "", "30", "", "", "", "id:10", "Cover", "Blue"],
  ["12", "variation", "FERN-G", "Fern Atlas - Green", "1", "", "", "0.4", "2", "25", "30", "", "", "", "FERN", "Cover", "Green"],
  ["13", "simple", "LEAF", "Leaf", "1", "", "", "", "9", "", "12", "Zines", "", "", "", "", ""],
  ["14", "variation", "LOST", "Lost one", "1", "", "", "", "1", "", "5", "", "", "", "id:99", "", ""],
]);

const LISTING_ROWS = csv([
  ["TITLE", "DESCRIPTION", "PRICE", "CURRENCY_CODE", "QUANTITY", "TAGS", "MATERIALS", "IMAGE1", "IMAGE2", "VARIATION 1 TYPE", "VARIATION 1 NAME", "VARIATION 1 VALUES", "SKU"],
  ["Ink Print", "A print.", "40.00", "CAD", "6", "print,ink", "paper", "https://img.example/i1.jpg", "https://img.example/i2.jpg", "Size", "Size", "A4, A3", "INK"],
]);

describe("recognizing an export", () => {
  it("tells the four shapes apart by their headings, and leaves a plain spreadsheet alone", () => {
    const head = (text: string) => text.split("\n")[0].split(",");
    expect(recognizeExport(head(HANDLE_ROWS))).toBe("handle-rows");
    expect(recognizeExport(head(PRODUCT_ID_ROWS))).toBe("product-id-rows");
    expect(recognizeExport(head(PARENT_ROWS))).toBe("parent-rows");
    expect(recognizeExport(head(LISTING_ROWS))).toBe("listing-rows");
    expect(recognizeExport(["Title", "ISBN", "Price", "Stock"])).toBeNull();
    expect(readProductExport("Title,Price\nA,1\n")).toBeNull();
  });
});

describe("products", () => {
  it("one line per edition: groups by handle, keeps editions, photos in order, sale prices and the old address", () => {
    const moved = readProductExport(HANDLE_ROWS)!;
    expect(moved.books).toHaveLength(2);
    const [moth, river] = moved.books;
    expect(moth.line).toBe(2);
    expect(moth.cells.Title).toBe("Moth Songs");
    expect(moth.cells.Description).toBe("Poems for **night** readers.\n\nSee [the launch](https://example.com/a).");
    expect(moth.cells.Tags).toBe("poetry;night");
    expect(moth.cells.Categories).toBe("Book");
    expect(moth.cells["Image URL"]).toBe("https://cdn.example/moth-1.jpg");
    expect(moth.cells["Extra image URLs"]).toBe("https://cdn.example/moth-2.jpg|https://cdn.example/moth-3.jpg");
    expect(moth.editions.map(e => [e.name, e.price, e.stock, e.sku, e.weight])).toEqual([["Paperback", 20, 12, "MS-PB", "300 g"], ["Signed", 35, 3, "MS-SG", "300 g"]]);
    expect(moth.cells.Price).toBe("20");
    expect(moth.cells.Stock).toBe("15");
    expect(moth.oldPaths).toEqual(["/products/moth-songs"]);
    // One edition called "Default Title" is a plain book: its price, the higher "was" price, ISBN and stock.
    expect(river.editions).toEqual([]);
    expect(river.cells).toMatchObject({ Title: "River Zine", Description: "Plain words.", Price: "10", "Sale price": "8", Stock: "40", SKU: "RZ-1", ISBN: "9780306406157", Weight: "80 g" });
  });

  it("a product line then its options: editions, sale only when on sale, unlimited stock stays blank", () => {
    const moved = readProductExport(PRODUCT_ID_ROWS)!;
    expect(moved.books.map(b => b.cells.Title)).toEqual(["Tide Tables", "Salt"]);
    const [tide, salt] = moved.books;
    expect(tide.editions.map(e => [e.name, e.price, e.salePrice, e.stock])).toEqual([["Small", 15, 12, 4], ["Large", 25, 0, null]]);
    expect(tide.cells.Categories).toBe("Books;Prints");
    expect(tide.cells["Extra image URLs"]).toBe("https://img.example/t2.jpg");
    expect(tide.oldPaths).toEqual(["/shop/p/tide-tables", "/shop/tide-tables"]);
    expect(salt.cells).toMatchObject({ Price: "18", Stock: "7", SKU: "SALT" });
  });

  it("products with variations: matched by parent id or SKU, categories' last level, weights in kg, strays reported", () => {
    const moved = readProductExport(PARENT_ROWS)!;
    expect(moved.books.map(b => b.cells.Title)).toEqual(["Fern Atlas", "Leaf"]);
    const [fern, leaf] = moved.books;
    expect(fern.cells.Description).toBe("Long\nsecond line");
    expect(fern.cells.Categories).toBe("Art books;Prints");
    expect(fern.cells.Weight).toBe("0.4 kg");
    expect(fern.editions.map(e => [e.name, e.price, e.salePrice, e.stock])).toEqual([["Blue", 30, 0, 5], ["Green", 30, 25, 2]]);
    expect(leaf.cells).toMatchObject({ Price: "12", Stock: "9", SKU: "LEAF", Categories: "Zines" });
    expect(moved.notices.join(" ")).toContain("Lost one");
  });

  it("listings: numbered photos, and choices without their own prices become a note, not made-up editions", () => {
    const [ink] = readProductExport(LISTING_ROWS)!.books;
    expect(ink.cells).toMatchObject({ Title: "Ink Print", Price: "40", Stock: "6", SKU: "INK", "Image URL": "https://img.example/i1.jpg", "Extra image URLs": "https://img.example/i2.jpg" });
    expect(ink.editions).toEqual([]);
    expect(ink.notes[0]).toContain("A4, A3");
  });

  it("writes the shop's own import columns", () => {
    const text = movedBooksCsv(readProductExport(HANDLE_ROWS)!.books);
    expect(text.split("\n")[0]).toBe("Title,Description,ISBN,SKU,Price,Sale price,Stock,Categories,Tags,Weight,Image URL,Extra image URLs");
  });
});

describe("planShopMove", () => {
  it("new books are drafts with their editions, keep the old file's line numbers and their old addresses", () => {
    const { plan, moved, oldPaths } = planShopMove(HANDLE_ROWS, []);
    expect(moved?.shape).toBe("handle-rows");
    expect(plan.counts).toEqual({ create: 2, update: 0, unchanged: 0, error: 0 });
    const moth = plan.rows.find(r => r.title === "Moth Songs")!;
    expect(moth.line).toBe(2);
    expect(moth.patch.status).toBe("draft");
    expect(moth.patch.variants.map((v: any) => [v.name, v.price, v.stock, v.stockLevel, v.sku])).toEqual([["Paperback", 20, 12, 12, "MS-PB"], ["Signed", 35, 3, 3, "MS-SG"]]);
    expect(moth.patch.photos.map((p: any) => p.url)).toHaveLength(3);
    expect(moth.changes.find(c => c.field === "variants")?.to).toBe("Paperback; Signed");
    expect(plan.rows.find(r => r.title === "River Zine")!.line).toBe(5);
    expect(oldPaths.get(2)).toEqual(["/products/moth-songs"]);
  });

  it("a book already in the shop is updated, but its editions are left to the book editor", () => {
    const books = [{ id: "b1", title: "Moth Songs", status: "published", variants: [{ id: "v", name: "Paperback", price: 20, stock: 1 }], photos: [{ url: "https://cdn.example/moth-1.jpg" }] }];
    const { plan } = planShopMove(HANDLE_ROWS, books);
    const moth = plan.rows.find(r => r.bookId === "b1")!;
    expect(moth.patch.variants).toBeUndefined();
    expect(moth.warnings.join(" ")).toContain("weren't added");
  });

  it("running the same export twice adds nothing new once the books exist", () => {
    const first = planShopMove(PRODUCT_ID_ROWS, []).plan;
    const saved = first.rows.map((r, i) => ({ id: `n${i}`, ...r.patch }));
    const again = planShopMove(PRODUCT_ID_ROWS, saved).plan;
    expect(again.counts.create).toBe(0);
    expect(again.counts.error).toBe(0);
  });

  it("any other spreadsheet goes to the plain import unchanged", () => {
    const { plan, moved } = planShopMove("Title,Price\nA book,12\n", []);
    expect(moved).toBeNull();
    expect(plan.counts.create).toBe(1);
  });
});

describe("descriptions", () => {
  it("turns shop HTML into the editor's formatting and leaves plain text alone", () => {
    expect(htmlToDescription("Just text &amp; more")).toBe("Just text & more");
    expect(htmlToDescription("<h2>About</h2><ul><li>One</li><li>Two</li></ul><p>A<br>B</p><hr><em>end</em>")).toBe("## About\n\n- One\n- Two\n\nA\nB\n\n---\n\n*end*");
    expect(htmlToDescription('<a href="javascript:alert(1)">bad</a><script>x()</script>')).toBe("bad");
  });
});

describe("customers", () => {
  const CUSTOMERS = csv([
    ["First Name", "Last Name", "Email", "Accepts Email Marketing", "Default Address City", "Default Address Province Code", "Default Address Country Code", "Total Spent", "Total Orders", "Tags", "Note"],
    ["Ada", "Moth", "ADA@example.com", "yes", "Toronto", "ON", "CA", "120.50", "4", "vip, launch", "Likes signed copies"],
    ["Bo", "", "bo@example.com", "no", "", "", "", "0", "0", "", ""],
    ["", "", "not-an-email", "yes", "", "", "", "", "", "", ""],
    ["Ada", "Again", "ada@example.com", "yes", "", "", "", "", "", "", ""],
  ]);

  it("reads names, places, consent, totals and tags; skips bad and repeated addresses", () => {
    const { customers, skipped, problems } = readCustomerExport(CUSTOMERS);
    expect(problems).toEqual([]);
    expect(customers).toHaveLength(2);
    expect(customers[0]).toMatchObject({ email: "ada@example.com", name: "Ada Moth", place: "Toronto, ON, CA", acceptsEmail: true, orders: 4, spent: 120.5, tags: ["vip", "launch"], note: "Likes signed copies" });
    expect(customers[1].acceptsEmail).toBe(false);
    expect(skipped.map(s => s.line)).toEqual([4, 5]);
  });

  it("needs an Email column", () => {
    expect(readCustomerExport("Name,Phone\nA,1\n").problems[0]).toContain("Email column");
  });

  it("notes keep what the owner wrote, and a second import changes nothing", () => {
    const { customers } = readCustomerExport(CUSTOMERS);
    const existing = new Map([["ada@example.com", { note: "Met at the fair", tags: ["fair"] }]]);
    const first = planCustomerNotes(customers, existing, "2026-10-28");
    expect(first[0].action).toBe("update");
    expect(first[0].note).toBe(`Met at the fair\n\n${MOVED_MARK} on 2026-10-28: Ada Moth · Toronto, ON, CA · 4 orders there · 120.50 spent there\nLikes signed copies`);
    expect(first[0].tags).toEqual(["fair", "vip", "launch"]);
    expect(first[1]).toMatchObject({ action: "create", tags: [] });
    const after = new Map(first.map(w => [w.email, { note: w.note, tags: w.tags }]));
    expect(planCustomerNotes(customers, after, "2026-11-01").every(w => w.action === "unchanged")).toBe(true);
  });

  it("only customers who said yes, aren't subscribed and haven't opted out may join the newsletter", () => {
    const { customers } = readCustomerExport(CUSTOMERS);
    expect(newsletterJoiners(customers, new Set(), () => false).map(c => c.email)).toEqual(["ada@example.com"]);
    expect(newsletterJoiners(customers, new Set(["ada@example.com"]), () => false)).toEqual([]);
    expect(newsletterJoiners(customers, new Set(), e => e === "ada@example.com")).toEqual([]);
  });
});

it("the words a press sees never name another shop system", () => {
  const words = [...Object.values(SHAPE_WORDS), readFileSync(new URL("./ShopMoveDialogs.tsx", import.meta.url), "utf8")].join(" ").toLowerCase();
  for (const name of ["shopify", "squarespace", "woocommerce", "etsy", "big cartel", "bigcartel", "wix", "square online"]) expect(words).not.toContain(name);
});
