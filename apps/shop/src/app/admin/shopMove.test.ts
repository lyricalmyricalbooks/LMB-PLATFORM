import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findRedirect, MAX_REDIRECTS } from "../features/site/redirects";
import { usesOptionPicker } from "../../shared/productOptions";
import {
  htmlToDescription, importRedirects, MOVED_MARK, movedBooksCsv, newsletterJoiners, planCustomerNotes, planShopMove, readCustomerExport,
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
    expect(text.split("\n")[0]).toBe("Title,Description,ISBN,Barcode / UPC,SKU,Price,Sale price,Stock,Categories,Tags,Weight,Image URL,Extra image URLs,SEO title,SEO description");
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

  it("a product the old shop didn't count comes over without stock counting, not as sold out", () => {
    const file = csv([
      ["Product ID [Non Editable]", "Variant ID [Non Editable]", "Product Page", "Product URL", "Title", "SKU", "Option Name 1", "Option Value 1", "Price", "On Sale", "Stock"],
      ["p1", "v1", "shop", "poster", "Poster", "PO", "", "", "30", "No", "Unlimited"],
      ["p2", "v2", "shop", "prints", "Prints", "PR-S", "Size", "Small", "15", "No", "Unlimited"],
      ["p2", "v3", "", "", "", "PR-L", "", "Large", "25", "No", "Unlimited"],
      ["p3", "v4", "shop", "tide", "Tide", "TI-S", "Size", "Small", "15", "No", "4"],
      ["p3", "v5", "", "", "", "TI-L", "", "Large", "25", "No", "Unlimited"],
      ["p4", "v6", "shop", "salt", "Salt", "SA", "", "", "18", "No", "7"],
    ]);
    const { plan } = planShopMove(file, []);
    const row = (t: string) => plan.rows.find(r => r.title === t)!;
    expect(row("Poster").patch.trackInventory).toBe(false);
    expect(row("Prints").patch.trackInventory).toBe(false);
    expect(row("Poster").warnings.join(" ")).toMatch(/didn't count/);
    // Some versions counted: stock counting stays on, and the owner is told which version starts at 0.
    expect(row("Tide").patch.trackInventory).toBe(true);
    expect(row("Tide").warnings.join(" ")).toMatch(/Large/);
    expect(row("Salt").patch).toMatchObject({ trackInventory: true, stockLevel: 7 });
    expect(row("Salt").warnings.join(" ")).not.toMatch(/count/);
    // A one-line-per-edition file (also what reading an old shop's address writes) leaves a count blank when it isn't
    // shown publicly: those books keep stock counting on, as before.
    const fromAddress = planShopMove(csv([["Handle", "Title", "Variant Price", "Variant Inventory Qty"], ["poster", "Poster", "30", ""]]), []);
    expect(fromAddress.plan.rows[0].patch.trackInventory).toBe(true);
    expect(fromAddress.plan.rows[0].warnings.join(" ")).not.toMatch(/didn't count/);
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

  it("today's headings and the older ones give the same plan for the same three-edition book (plan 7.2)", () => {
    // The same book, exported under the older headings and under the ones product exports use today.
    const OLD = csv([
      ["Handle", "Title", "Body (HTML)", "Type", "Tags", "Option1 Name", "Option1 Value", "Variant SKU", "Variant Grams", "Variant Inventory Qty", "Variant Price", "Variant Compare At Price", "Variant Barcode", "Image Src", "Image Position", "Variant Image", "SEO Title", "SEO Description"],
      ["fern-atlas", "Fern Atlas", "<p>Plants, <em>pressed</em>.</p>", "Book", "plants, art", "Edition", "Paperback", "FA-PB", "450", "10", "30.00", "", "", "https://cdn.example/fern-1.jpg", "1", "", "Fern Atlas, a pressed-plant book", "Ferns from three islands."],
      ["fern-atlas", "", "", "", "", "", "Hardcover", "FA-HC", "700", "4", "50.00", "60.00", "", "https://cdn.example/fern-2.jpg", "2", "https://cdn.example/fern-hc.jpg", "", ""],
      ["fern-atlas", "", "", "", "", "", "Signed", "FA-SG", "700", "0", "80.00", "", "", "", "", "", "", ""],
    ]);
    const NEW = csv([
      ["Title", "URL handle", "Description", "Vendor", "Product category", "Type", "Tags", "Published on online store", "Status", "SKU", "Barcodes", "Option1 name", "Option1 value", "Price", "Compare-at price", "Inventory quantity", "Weight value (grams)", "Weight unit for display", "Product image URL", "Image position", "Variant image URL", "SEO title", "SEO description"],
      ["Fern Atlas", "fern-atlas", "<p>Plants, <em>pressed</em>.</p>", "Moth Press", "Media > Books", "Book", "plants, art", "TRUE", "Active", "FA-PB", "", "Edition", "Paperback", "30.00", "", "10", "450", "g", "https://cdn.example/fern-1.jpg", "1", "", "Fern Atlas, a pressed-plant book", "Ferns from three islands."],
      ["", "fern-atlas", "", "", "", "", "", "", "", "FA-HC", "", "", "Hardcover", "50.00", "60.00", "4", "700", "g", "https://cdn.example/fern-2.jpg", "2", "https://cdn.example/fern-hc.jpg", "", ""],
      ["", "fern-atlas", "", "", "", "", "", "", "", "FA-SG", "", "", "Signed", "80.00", "", "0", "700", "g", "", "", "", "", ""],
    ]);
    const head = (text: string) => text.split("\n")[0].split(",");
    expect(recognizeExport(head(NEW))).toBe("handle-rows");
    const plain = (move: ReturnType<typeof planShopMove>) => ({
      ...move,
      plan: { ...move.plan, rows: move.plan.rows.map(r => ({ ...r, patch: { ...r.patch, variants: r.patch.variants?.map(({ id: _id, ...v }: any) => v), photos: r.patch.photos?.map(({ id: _id, ...p }: any) => p) } })) },
    });
    const before = plain(planShopMove(OLD, []));
    const after = plain(planShopMove(NEW, []));
    expect(after).toEqual(before);
    const fern = after.plan.rows[0];
    expect(fern.action).toBe("create");
    expect(fern.patch.variants.map((v: any) => [v.name, v.price, v.stock, v.sku, v.weight, v.photoUrl])).toEqual([
      ["Paperback", 30, 10, "FA-PB", "450 g", ""], ["Hardcover", 60, 4, "FA-HC", "700 g", "https://cdn.example/fern-hc.jpg"], ["Signed", 80, 0, "FA-SG", "700 g", ""],
    ]);
    expect(fern.patch).toMatchObject({ title: "Fern Atlas", description: "Plants, *pressed*.", tags: ["plants", "art"], metaTitle: "Fern Atlas, a pressed-plant book", metaDescription: "Ferns from three islands." });
    expect(fern.patch.photos.map((p: any) => p.url)).toEqual(["https://cdn.example/fern-1.jpg", "https://cdn.example/fern-2.jpg", "https://cdn.example/fern-hc.jpg"]);
    expect(after.oldPaths.get(2)).toEqual(["/products/fern-atlas"]);
  });

  it("a file with both Barcode and Barcodes reads Barcodes", () => {
    const both = csv([
      ["URL handle", "Title", "Price", "Barcode", "Barcodes"],
      ["salt", "Salt", "18.00", "9780306406157", "9781861972712"],
    ]);
    expect(readProductExport(both)!.books[0].cells.ISBN).toBe("9781861972712");
  });

  it("any other spreadsheet goes to the plain import unchanged", () => {
    const { plan, moved } = planShopMove("Title,Price\nA book,12\n", []);
    expect(moved).toBeNull();
    expect(plan.counts.create).toBe(1);
  });
});

describe("old shop links (plan 3.2)", () => {
  it("each imported book's old addresses lead to its page by id, which survives a title change", () => {
    const { oldPaths } = planShopMove(HANDLE_ROWS, []);
    const { items, added, skipped } = importRedirects([], [{ oldPaths: oldPaths.get(2)!, bookId: "abc123" }]);
    expect(added).toEqual([{ from: "/products/moth-songs", to: "/books/abc123" }]);
    expect(items).toEqual(added);
    expect(skipped).toEqual([]);
    expect(findRedirect(items, "/products/Moth-Songs/?variant=1")).toBe("/books/abc123");
  });

  it("keeps the owner's own redirects, and a second import adds nothing", () => {
    const mine = [{ from: "/products/moth-songs", to: "/page/moths" }];
    const first = importRedirects(mine, [{ oldPaths: ["/products/moth-songs", "/products/salt"], bookId: "b1" }]);
    expect(first.items[0]).toEqual(mine[0]);
    expect(first.added).toEqual([{ from: "/products/salt", to: "/books/b1" }]);
    expect(first.skipped).toEqual([{ from: "/products/moth-songs", why: "It already leads to /page/moths." }]);
    const again = importRedirects(first.items, [{ oldPaths: ["/products/salt"], bookId: "b1" }]);
    expect(again.added).toEqual([]);
    expect(again.skipped).toEqual([]);
  });

  it("both of a product page's possible addresses are covered, and the shop's own routes are never claimed", () => {
    const { oldPaths } = planShopMove(PRODUCT_ID_ROWS, []);
    expect(importRedirects([], [{ oldPaths: oldPaths.get(2)!, bookId: "t" }]).added.map(r => r.from)).toEqual(["/shop/p/tide-tables", "/shop/tide-tables"]);
    expect(importRedirects([], [{ oldPaths: ["/checkout/x"], bookId: "t" }]).skipped).toHaveLength(1);
  });

  it("stops at the redirect list's limit instead of failing the save", () => {
    const full = Array.from({ length: MAX_REDIRECTS }, (_, i) => ({ from: `/old/${i}`, to: "/" + i }));
    const next = importRedirects(full, [{ oldPaths: ["/products/one-more"], bookId: "b" }]);
    expect(next.added).toEqual([]);
    expect(next.skipped[0].why).toContain(MAX_REDIRECTS.toLocaleString("en"));
    expect(next.full).toBe(1);
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
    expect(first[0]).toMatchObject({ name: "Ada Moth", place: "Toronto, ON, CA" });
    const after = new Map(first.map(w => [w.email, { note: w.note, tags: w.tags, name: w.name, place: w.place }]));
    expect(planCustomerNotes(customers, after, "2026-11-01").every(w => w.action === "unchanged")).toBe(true);
    // Brought over before names were kept: a second import adds the name and place, and leaves the note alone.
    const older = new Map(first.map(w => [w.email, { note: w.note, tags: w.tags }]));
    const again = planCustomerNotes(customers, older, "2026-11-01");
    expect(again[0]).toMatchObject({ action: "update", note: first[0].note, name: "Ada Moth" });
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

describe("sizes and colours (plan 10.6)", () => {
  const H = ["Handle", "Title", "Option1 Name", "Option1 Value", "Option2 Name", "Option2 Value", "Variant SKU", "Variant Inventory Qty", "Variant Price"];
  const TEES = csv([H,
    ["moth-tee", "Moth Tee", "Size", "S", "Colour", "Black", "TEE-S-B", "4", "30.00"],
    ["moth-tee", "", "", "M", "", "Black", "TEE-M-B", "2", "30.00"],
    ["moth-tee", "", "", "S", "", "White", "TEE-S-W", "5", "30.00"],
    ["moth-tee", "", "", "M", "", "White", "TEE-M-W", "0", "32.00"],
  ]);

  it("a shop that doesn't sell books gets the old shop's options and each version's choices", () => {
    const moved = readProductExport(TEES)!;
    expect(moved.books[0].options).toEqual([{ name: "Size", values: ["S", "M"] }, { name: "Colour", values: ["Black", "White"] }]);
    const patch = planShopMove(TEES, [], [], {}, { keepOptions: true }).plan.rows[0].patch as any;
    expect(patch.options).toEqual([{ name: "Size", values: ["S", "M"] }, { name: "Colour", values: ["Black", "White"] }]);
    expect(patch.variants.map((v: any) => [v.name, v.sku, v.options])).toEqual([
      ["S / Black", "TEE-S-B", { Size: "S", Colour: "Black" }], ["M / Black", "TEE-M-B", { Size: "M", Colour: "Black" }],
      ["S / White", "TEE-S-W", { Size: "S", Colour: "White" }], ["M / White", "TEE-M-W", { Size: "M", Colour: "White" }],
    ]);
    expect(usesOptionPicker(patch)).toBe(true);
  });

  it("a books shop keeps today's editions list, with no options", () => {
    const patch = planShopMove(TEES, []).plan.rows[0].patch as any;
    expect(patch.options).toBeUndefined();
    expect(patch.variants.every((v: any) => v.options === undefined)).toBe(true);
    expect(patch.variants.map((v: any) => v.name)).toEqual(["S / Black", "M / Black", "S / White", "M / White"]);
  });

  it("no options when two versions pick the same values, or one leaves a choice out", () => {
    const twice = csv([H, ["t", "T", "Size", "S", "", "", "A", "1", "5"], ["t", "", "", "S", "", "", "B", "1", "5"]]);
    expect(readProductExport(twice)!.books[0].options).toEqual([]);
    const gap = csv([H, ["t", "T", "Size", "S", "Colour", "Red", "A", "1", "5"], ["t", "", "", "M", "", "", "B", "1", "5"]]);
    expect(readProductExport(gap)!.books[0].options).toEqual([]);
  });

  it("product-line files and variation files name their options too", () => {
    const productLines = csv([
      ["Product ID [Non Editable]", "Variant ID [Non Editable]", "Title", "Option Name 1", "Option Value 1", "Price", "Stock", "SKU"],
      ["p1", "v1", "Ring", "Size", "6", "80", "1", "R-6"],
      ["p1", "v2", "", "", "7", "80", "2", "R-7"],
    ]);
    expect(readProductExport(productLines)!.books[0].options).toEqual([{ name: "Size", values: ["6", "7"] }]);
    const variations = csv([
      ["ID", "Type", "Parent", "Name", "SKU", "Regular price", "Stock", "Attribute 1 name", "Attribute 1 value(s)"],
      ["10", "variable", "", "Cap", "CAP", "", "", "Colour", "Red, Blue"],
      ["11", "variation", "id:10", "Cap - Red", "CAP-R", "25", "3", "Colour", "Red"],
      ["12", "variation", "id:10", "Cap - Blue", "CAP-B", "25", "1", "Colour", "Blue"],
    ]);
    expect(readProductExport(variations)!.books[0].options).toEqual([{ name: "Colour", values: ["Red", "Blue"] }]);
  });
});

describe("more export layouts (plan 23.1)", () => {
  // A line marked Product, then its versions marked Variant under the same handleId.
  const FIELD_TYPE_ROWS = csv([
    ["handleId", "fieldType", "name", "description", "productImageUrl", "collection", "sku", "ribbon", "price", "surcharge", "visible", "discountMode", "discountValue", "inventory", "weight", "cost", "productOptionName1", "productOptionType1", "productOptionDescription1", "productOptionName2", "productOptionType2", "productOptionDescription2"],
    ["p_1", "Product", "Moth Tee", "<p>Soft <em>cotton</em>.</p>", "https://img.example/tee1.jpg;https://img.example/tee2.jpg", "Shirts;Merch", "TEE", "", "30", "", "true", "PERCENT", "10", "", "0.2", "", "Size", "DROP_DOWN", "S;M", "Colour", "COLOR", "Black;White"],
    ["p_1", "Variant", "", "", "", "", "TEE-S-B", "", "", "0", "", "", "", "4", "", "", "", "", "S", "", "", "Black"],
    ["p_1", "Variant", "", "", "", "", "TEE-M-B", "", "", "2", "", "", "", "OutOfStock", "", "", "", "", "M", "", "", "Black"],
    ["p_1", "Variant", "", "", "", "", "TEE-S-W", "", "", "0", "", "", "", "InStock", "", "", "", "", "S", "", "", "White"],
    ["p_1", "Variant", "", "", "", "", "TEE-M-W", "", "", "2", "", "", "", "5", "", "", "", "", "M", "", "", "White"],
    ["p_2", "Product", "Salt Zine", "Plain.", "", "", "SALT", "", "8", "", "false", "AMOUNT", "2", "7", "", "", "", "", "", "", "", ""],
    ["p_9", "Variant", "", "", "", "", "LOST", "", "", "", "", "", "", "1", "", "", "", "", "S", "", "", ""],
  ]);

  // One line per variation, grouped by Item Name, stock per place.
  const VARIATION_NAME_ROWS = csv([
    ["Token", "Item Name", "Variation Name", "SKU", "Description", "Categories", "SEO Title", "GTIN", "Price", "Online Sale Price", "Archived", "Option Name 1", "Option Value 1", "Current Quantity Main Shop", "Current Quantity Fair Stall", "New Quantity Main Shop"],
    ["T1", "Moth Songs", "Paperback", "MS-PB", "Poems.", "Poetry", "Moth Songs, poems", "", "20.00", "", "N", "Format", "Paperback", "10", "2", ""],
    ["T2", "Moth Songs", "Signed", "MS-SG", "", "", "", "", "35.00", "30.00", "N", "Format", "Signed", "3", "", ""],
    ["T3", "River Zine", "Regular", "RZ", "", "Zines, Art", "", "9780306406157", "8.00", "", "N", "", "", "40", "1", ""],
    ["T4", "Old Thing", "Regular", "OLD", "", "", "", "", "5.00", "", "Y", "", "", "1", "", ""],
  ]);

  it("tells both new layouts apart by their headings", () => {
    const head = (text: string) => text.split("\n")[0].split(",");
    expect(recognizeExport(head(FIELD_TYPE_ROWS))).toBe("field-type-rows");
    expect(recognizeExport(head(VARIATION_NAME_ROWS))).toBe("variation-name-rows");
  });

  it("product and version lines: surcharges on the price, the discount, stock words, options, photos and the old address", () => {
    const moved = readProductExport(FIELD_TYPE_ROWS)!;
    expect(moved.books.map(b => b.cells.Title)).toEqual(["Moth Tee", "Salt Zine"]);
    const [tee, salt] = moved.books;
    expect(tee.editions.map(e => [e.name, e.price, e.salePrice, e.stock, e.sku])).toEqual([
      ["S / Black", 30, 27, 4, "TEE-S-B"], ["M / Black", 32, 28.8, 0, "TEE-M-B"], ["S / White", 30, 27, null, "TEE-S-W"], ["M / White", 32, 28.8, 5, "TEE-M-W"],
    ]);
    expect(tee.options).toEqual([{ name: "Size", values: ["S", "M"] }, { name: "Colour", values: ["Black", "White"] }]);
    expect(tee.cells).toMatchObject({ Description: "Soft *cotton*.", Categories: "Shirts;Merch", Weight: "0.2 kg", "Image URL": "https://img.example/tee1.jpg", "Extra image URLs": "https://img.example/tee2.jpg" });
    expect(tee.oldPaths).toEqual(["/product-page/moth-tee"]);
    expect(salt.cells).toMatchObject({ Price: "8", "Sale price": "6", Stock: "7", SKU: "SALT" });
    expect(salt.notes).toEqual(["This product was hidden in your old shop."]);
    expect(moved.notices.join(" ")).toContain("1 version line belonged to no product");
  });

  it("variation lines: grouped by name, stock added up across places, sale prices, ISBN, archived lines left out", () => {
    const moved = readProductExport(VARIATION_NAME_ROWS)!;
    expect(moved.books.map(b => b.cells.Title)).toEqual(["Moth Songs", "River Zine"]);
    const [moth, river] = moved.books;
    expect(moth.editions.map(e => [e.name, e.price, e.salePrice, e.stock])).toEqual([["Paperback", 20, 0, 12], ["Signed", 35, 30, 3]]);
    expect(moth.options).toEqual([{ name: "Format", values: ["Paperback", "Signed"] }]);
    expect(moth.cells).toMatchObject({ Description: "Poems.", Categories: "Poetry", "SEO title": "Moth Songs, poems", Stock: "15" });
    expect(river.editions).toEqual([]);
    expect(river.cells).toMatchObject({ Price: "8", Stock: "41", SKU: "RZ", ISBN: "9780306406157", Categories: "Zines;Art" });
    expect(moved.notices).toEqual(["1 archived line was left out."]);
  });

  it("both go through the same preview: new products are drafts with their versions", () => {
    for (const file of [FIELD_TYPE_ROWS, VARIATION_NAME_ROWS]) {
      const { plan, moved } = planShopMove(file, [], [], {}, { keepOptions: true });
      expect(moved).not.toBeNull();
      expect(plan.problems).toEqual([]);
      expect(plan.rows.every(r => r.action === "create")).toBe(true);
      expect((plan.rows[0].patch as any).variants.length).toBeGreaterThan(1);
    }
  });
});

describe("the other big shop builders' files (plan 23.10)", () => {
  // An Item column: a Product line, then its Variant and Image lines.
  const ITEM_ROWS = csv([
    ["Item", "ID", "Name", "Type", "SKU", "Options", "Inventory Tracking", "Current Stock", "Price", "Retail Price", "Sale Price", "Categories", "Description", "Page Title", "Product URL", "Meta Description", "Global Trade Number", "Is Visible", "Variant Image URL", "Internal Image URL (Export)", "Image is Thumbnail"],
    ["Product", "111", "Moth Tee", "physical", "TEE", "", "variant", "", "30.00", "", "", "18;24", "<p>Soft <b>cotton</b>.</p>", "Moth Tee | Press", "/moth-tee/", "A soft tee.", "", "TRUE", "", "", ""],
    ["Variant", "", "", "", "TEE-S", "Type=Rectangle|Name=Size|Value=S", "", "4", "", "", "", "", "", "", "", "", "", "", "https://img.example/tee-s.jpg", "", ""],
    ["Variant", "", "", "", "TEE-M", "Type=Rectangle|Name=Size|Value=M", "", "0", "32.00", "", "28.00", "", "", "", "", "", "", "", "", "", ""],
    ["Image", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "https://img.example/back.jpg", "FALSE"],
    ["Image", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "https://img.example/front.jpg", "TRUE"],
    ["Product", "112", "Salt Zine", "physical", "SALT", "", "product", "7", "8.00", "10.00", "", "", "Plain.", "", "/salt-zine/", "", "9780306406157", "FALSE", "", "", ""],
  ]);

  // An Item Type column: a Product line, then its SKU lines (choices in the name) and Rule lines (price changes).
  const SKU_ROWS = csv([
    ["Item Type", "Product ID", "Product Name", "Product Type", "Product Code/SKU", "Product Description", "Price", "Sale Price", "Retail Price", "Current Stock Level", "Category", "Product URL", "Product Visible", "Track Inventory", "Product Image URL - 1", "Product Image URL - 2"],
    ["Product", "1", "Moth Songs", "P", "MS", "<p>Poems.</p>", "20.00", "", "", "0", "Shop All/Poetry;Shop All/New", "/moth-songs/", "Y", "by option", "https://img.example/ms.jpg", "https://img.example/ms2.jpg"],
    ["  SKU", "", "[RB]Format=Paperback", "", "MS-PB", "", "", "", "", "10", "", "", "", "", "", ""],
    ["  SKU", "", "[RB]Format=Signed", "", "MS-SG", "", "", "", "", "3", "", "", "", "", "", ""],
    ["  Rule", "", "[RB]Format=Signed", "", "", "", "[ADD]15", "", "", "", "", "", "", "", "", ""],
    ["Product", "2", "River Zine", "P", "RZ", "", "8.00", "6.00", "", "40", "Zines", "/river-zine/", "N", "by product", "", ""],
  ]);

  // A type column: product lines and product_variation lines that point at their product by id.
  const TYPED_ROWS = csv([
    ["type", "product_internal_id", "product_sku", "product_name", "product_price", "product_compare_to_price", "product_is_inventory_tracked", "product_quantity", "product_description", "product_media_main_image_url", "product_media_gallery_image_url_1", "product_is_available", "product_category_1", "url", "product_variation_option_Size", "product_variation_sku"],
    ["product", "501", "BAG", "Tote Bag", "15", "18", "true", "", "<p>Canvas.</p>", "https://img.example/bag.jpg", "https://img.example/bag2.jpg", "true", "Merch", "https://oldshop.example/Tote-Bag-p501", "", ""],
    ["product_option", "501", "BAG", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["product_variation", "501", "BAG", "", "", "", "", "5", "", "", "", "", "", "", "Small", "BAG-S"],
    ["product_variation", "501", "BAG", "", "17", "", "", "2", "", "", "", "", "", "", "Large", "BAG-L"],
    ["product", "502", "PIN", "Moth Pin", "4", "", "false", "", "", "", "", "false", "", "", "", ""],
    ["product_variation", "999", "NOPE", "", "", "", "", "1", "", "", "", "", "", "", "Small", "X"],
  ]);

  it("tells the three layouts apart by their headings, without taking anyone else's", () => {
    const head = (text: string) => text.split("\n")[0].split(",");
    expect(recognizeExport(head(ITEM_ROWS))).toBe("item-rows");
    expect(recognizeExport(head(SKU_ROWS))).toBe("sku-rows");
    expect(recognizeExport(head(TYPED_ROWS))).toBe("typed-rows");
    expect(recognizeExport(["Title", "Price", "Stock", "Type"])).toBeNull();
  });

  it("Product, Variant and Image lines: choices, sale and was prices, stock, photos thumbnail first, the old address", () => {
    const moved = readProductExport(ITEM_ROWS)!;
    const [tee, salt] = moved.books;
    expect(tee.editions.map(e => [e.name, e.price, e.salePrice, e.stock, e.sku, e.photoUrl])).toEqual([
      ["S", 30, 0, 4, "TEE-S", "https://img.example/tee-s.jpg"], ["M", 32, 28, 0, "TEE-M", ""],
    ]);
    expect(tee.options).toEqual([{ name: "Size", values: ["S", "M"] }]);
    expect(tee.cells).toMatchObject({ Title: "Moth Tee", Description: "Soft **cotton**.", "SEO title": "Moth Tee | Press", "SEO description": "A soft tee.", "Image URL": "https://img.example/front.jpg", "Extra image URLs": "https://img.example/back.jpg" });
    expect(tee.cells.Categories).toBeUndefined();
    expect(tee.oldPaths).toEqual(["/moth-tee/"]);
    expect(salt.cells).toMatchObject({ Price: "10", "Sale price": "8", Stock: "7", SKU: "SALT", ISBN: "9780306406157" });
    expect(salt.notes).toEqual(["This product was hidden in your old shop."]);
  });

  it("Product, SKU and Rule lines: choices from the name, a price rule, stock per version, category names", () => {
    const moved = readProductExport(SKU_ROWS)!;
    const [songs, river] = moved.books;
    expect(songs.editions.map(e => [e.name, e.price, e.stock, e.sku])).toEqual([["Paperback", 20, 10, "MS-PB"], ["Signed", 35, 3, "MS-SG"]]);
    expect(songs.options).toEqual([{ name: "Format", values: ["Paperback", "Signed"] }]);
    expect(songs.cells).toMatchObject({ Description: "Poems.", Categories: "Poetry;New", "Image URL": "https://img.example/ms.jpg", "Extra image URLs": "https://img.example/ms2.jpg" });
    expect(songs.oldPaths).toEqual(["/moth-songs/"]);
    expect(river.cells).toMatchObject({ Price: "8", "Sale price": "6", Stock: "40", Categories: "Zines" });
    expect(river.notes).toEqual(["This product was hidden in your old shop."]);
  });

  it("product and product_variation lines: versions found by id, compare-to as the was price, untracked stock left blank", () => {
    const moved = readProductExport(TYPED_ROWS)!;
    const [bag, pin] = moved.books;
    expect(moved.books).toHaveLength(2);
    expect(bag.editions.map(e => [e.name, e.price, e.salePrice, e.stock, e.sku])).toEqual([["Small", 18, 15, 5, "BAG-S"], ["Large", 18, 17, 2, "BAG-L"]]);
    expect(bag.options).toEqual([{ name: "Size", values: ["Small", "Large"] }]);
    expect(bag.cells).toMatchObject({ Description: "Canvas.", Categories: "Merch", "Image URL": "https://img.example/bag.jpg", "Extra image URLs": "https://img.example/bag2.jpg" });
    expect(bag.oldPaths).toEqual(["/Tote-Bag-p501"]);
    expect(pin.cells).toMatchObject({ Title: "Moth Pin", Price: "4", SKU: "PIN" });
    expect(pin.cells.Stock).toBeUndefined();
    expect(pin.notes).toEqual(["This product was hidden in your old shop."]);
    expect(moved.notices.join(" ")).toContain("1 version line belonged to no product");
  });

  it("each layout goes through to a preview of new drafts with redirects", () => {
    for (const file of [ITEM_ROWS, SKU_ROWS, TYPED_ROWS]) {
      const { plan, oldPaths } = planShopMove(file, [], [], {}, { keepOptions: true });
      expect(plan.problems).toEqual([]);
      expect(plan.rows.every(r => r.action === "create")).toBe(true);
      expect(oldPaths.size).toBeGreaterThan(0);
    }
  });
});

describe("a file made from an old shop's address (plan 23.2)", () => {
  it("reads through the same preview, with versions and each product's own old page address", async () => {
    // @ts-expect-error plain ES module from the platform, no types
    const { productsCsv, fromPermalinkList } = await import("../../../../../services/moving/oldShop.js");
    const csvText = productsCsv(fromPermalinkList([
      { name: "Tide Tables", permalink: "tide-tables", url: "/product/tide-tables", price: 15, images: [{ url: "https://img.example/t.jpg" }],
        options: [{ name: "Small", price: 15, sold_out: false }, { name: "Large", price: 25, sold_out: true }] },
    ], "https://zines.example"));
    const { plan, moved, oldPaths } = planShopMove(csvText, []);
    expect(moved?.shape).toBe("handle-rows");
    expect(plan.rows[0].action).toBe("create");
    expect((plan.rows[0].patch as any).variants.map((v: any) => [v.name, v.price, v.stock])).toEqual([["Small", 15, 0], ["Large", 25, 0]]);
    expect([...oldPaths.values()]).toEqual([["/product/tide-tables"]]);
  });
});

describe("a mailing list on its own (plan 23.4)", () => {
  it("a Status column says who is still subscribed", () => {
    const list = csv([["Email Address", "First Name", "Status"], ["ada@example.com", "Ada", "subscribed"], ["ben@example.com", "Ben", "unsubscribed"], ["cy@example.com", "Cy", "cleaned"]]);
    expect(readCustomerExport(list).customers.map(c => [c.email, c.acceptsEmail])).toEqual([["ada@example.com", true], ["ben@example.com", false], ["cy@example.com", false]]);
  });

  it("a list of sign-ups: being on it is the agreement, unless the line was unsubscribed or cleaned off", () => {
    const list = csv([["Email Address", "First Name", "OPTIN_TIME", "UNSUB_TIME"], ["ada@example.com", "Ada", "2025-01-02", ""], ["ben@example.com", "Ben", "2025-01-02", "2025-06-01"]]);
    const customers = readCustomerExport(list).customers;
    expect(customers.map(c => [c.email, c.acceptsEmail])).toEqual([["ada@example.com", true], ["ben@example.com", false]]);
    expect(newsletterJoiners(customers, new Set(), () => false).map(c => c.email)).toEqual(["ada@example.com"]);
  });

  it("a plain list of addresses still says nothing about agreement", () => {
    expect(readCustomerExport(csv([["Email"], ["ada@example.com"]])).customers[0].acceptsEmail).toBeNull();
  });
});

describe("opted-out check when the opt-out list couldn't be read", () => {
  it("counts everyone as opted out, so no one who unsubscribed is added back", async () => {
    const { optedOutBy, newsletterJoiners } = await import("./shopMove");
    const people = [{ email: "a@example.com", acceptsEmail: true }, { email: "b@example.com", acceptsEmail: true }] as any;
    expect(newsletterJoiners(people, new Set(), optedOutBy(null, e => e))).toEqual([]);
    expect(newsletterJoiners(people, new Set(), optedOutBy(new Set(["a@example.com"]), e => e)).map((c: any) => c.email)).toEqual(["b@example.com"]);
  });
});
