// Files to try the shop's importers with in the walkthrough: a plain product spreadsheet, a product export from "your
// old shop" (a hoodie in sizes and colours, so the sizes come over as buttons), a customer list, a gift card list and an
// order list (one order in US dollars, one pending), so a whole move can be tried. The practice
// service serves them at /samples/<name>, and the start page links them. They carry no photo addresses: the importers
// take only https:// ones, and this computer has none, so photos are added in the product editor afterwards.
// Everything in them is made up; the addresses are *.example.

const cell = (value) => {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const csv = (rows) => `${rows.map((row) => row.map(cell).join(",")).join("\r\n")}\r\n`;

/** The files, by name: `{ title, body() }`. */
export const SAMPLE_FILES = Object.freeze({
  // Books › Import: two new products (drafts until published) and a stock count for a book the shop has.
  "new-products.csv": {
    title: "A product spreadsheet",
    body: () => csv([
      ["Title", "Author", "Description", "Format", "SKU", "Price", "Stock", "Categories", "Weight"],
      ["Moth Calendar 2027", "Moth Press", "Twelve riso prints, one for each month, on a hanging card.", "Calendar", "CAL-2027", "28.00", "30", "PRINTS & MERCH", "250 g"],
      ["Small Hours", "Ines Varga", "Short poems written on the night bus between two and five.", "Paperback", "SH-PB", "16.00", "15", "POETRY & ESSAYS", "180 g"],
      ["Night Buses", "", "", "", "", "", "12", "", ""],
    ]),
  },
  // Books › Import, "an export from your old shop": one line per version, grouped by its handle.
  "old-shop-products.csv": {
    title: "A product export from an old shop",
    body: () => {
      const rows = [["Handle", "Title", "Body (HTML)", "Vendor", "Type", "Tags", "Option1 Name", "Option1 Value", "Option2 Name", "Option2 Value", "Variant SKU", "Variant Grams", "Variant Inventory Qty", "Variant Price", "Status"]];
      let first = true;
      for (const colour of ["Black", "Bone"]) {
        for (const size of ["S", "M", "L", "XL"]) {
          rows.push([
            "moth-hoodie", first ? "Moth Hoodie" : "", first ? "<p>A heavy hoodie with the <strong>moth</strong> printed on the back.</p>" : "",
            first ? "Moth Press" : "", first ? "Apparel" : "", first ? "merch, hoodie" : "",
            first ? "Size" : "", size, first ? "Colour" : "", colour,
            `HOOD-${size}-${colour.toUpperCase()}`, "600", size === "XL" && colour === "Bone" ? "0" : "6", "55.00", first ? "active" : "",
          ]);
          first = false;
        }
      }
      return csv(rows);
    },
  },
  // Customers › Bring customers over: a customer list, two of whom said yes to the newsletter.
  "old-shop-customers.csv": {
    title: "A customer list from an old shop",
    body: () => csv([
      ["First Name", "Last Name", "Email", "Accepts Email Marketing", "Default Address City", "Default Address Province Code", "Default Address Country Code", "Total Orders", "Total Spent", "Tags", "Note"],
      ["Ada", "Moreau", "ada@example.com", "yes", "Montréal", "QC", "CA", "4", "112.00", "zines, fair", "Met at the Toronto book fair."],
      ["Ben", "Okafor", "ben@example.com", "no", "Calgary", "AB", "CA", "1", "26.00", "", ""],
      ["Chloé", "Lam", "chloe@example.com", "yes", "Victoria", "BC", "CA", "7", "240.50", "photobooks", "Buys every photobook."],
      ["Dev", "Rao", "dev@example.com", "no", "Halifax", "NS", "CA", "2", "48.00", "", ""],
    ]),
  },
  // Gift cards › Bring gift cards over: two cards still worth something (one with its full code kept) and one used up.
  "old-shop-gift-cards.csv": {
    title: "A gift card list from an old shop",
    body: () => csv([
      ["Code", "Customer Name", "Email", "Date Issued", "Expires On", "Initial Value", "Balance", "Currency", "Disabled At"],
      ["MOTH-GIFT-AAAA-1111", "Ada Moreau", "ada@example.com", "2026-02-14", "2027-12-31", "50.00", "35.00", "CAD", ""],
      ["MOTH-GIFT-BBBB-2222", "Chloé Lam", "chloe@example.com", "2026-05-01", "", "25.00", "25.00", "CAD", ""],
      ["MOTH-GIFT-CCCC-3333", "Ben Okafor", "ben@example.com", "2025-12-01", "", "20.00", "0.00", "CAD", ""],
    ]),
  },
  // Orders › Bring past orders over: past sales as history only, one line per item, one of them paid in US dollars.
  "old-shop-orders.csv": {
    title: "An order list from an old shop",
    body: () => csv([
      ["Name", "Email", "Financial Status", "Currency", "Subtotal", "Shipping", "Taxes", "Total", "Discount Amount", "Created at", "Lineitem quantity", "Lineitem name", "Lineitem price", "Billing Name", "Refunded Amount", "Cancelled at"],
      ["#1001", "ada@example.com", "paid", "CAD", "48.00", "10.00", "7.54", "65.54", "0.00", "2026-03-02 14:10:00 -0500", "2", "Moth Hoodie", "24.00", "Ada Moreau", "", ""],
      ["#1002", "chloe@example.com", "paid", "CAD", "40.00", "0.00", "2.00", "42.00", "0.00", "2026-04-11 09:30:00 -0400", "1", "Salt Hours", "40.00", "Chloé Lam", "", ""],
      ["#1003", "dev@example.com", "paid", "USD", "30.00", "8.00", "0.00", "38.00", "0.00", "2026-05-20 18:45:00 -0400", "1", "Night Buses", "30.00", "Dev Rao", "", ""],
      ["#1004", "ben@example.com", "pending", "CAD", "26.00", "0.00", "0.00", "26.00", "0.00", "2026-06-01 11:00:00 -0400", "1", "Small Hours", "26.00", "Ben Okafor", "", ""],
      // A refund, a part refund and a cancelled order, as real exports carry them (plan 23.31).
      ["#1005", "ada@example.com", "refunded", "CAD", "40.00", "0.00", "2.00", "42.00", "0.00", "2026-06-15 10:00:00 -0400", "1", "Salt Hours", "40.00", "Ada Moreau", "42.00", ""],
      ["#1006", "chloe@example.com", "partially_refunded", "CAD", "48.00", "0.00", "2.40", "50.40", "0.00", "2026-07-02 16:20:00 -0400", "2", "Moth Hoodie", "24.00", "Chloé Lam", "10.00", ""],
      ["#1007", "dev@example.com", "voided", "CAD", "26.00", "0.00", "0.00", "26.00", "0.00", "2026-07-09 12:00:00 -0400", "1", "Small Hours", "26.00", "Dev Rao", "", "2026-07-09 12:30:00 -0400"],
    ]),
  },
});
