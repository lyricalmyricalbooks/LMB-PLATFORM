// Files to try the shop's importers with in the walkthrough: a plain product spreadsheet, a product export from "your
// old shop" (a hoodie in sizes and colours, so the sizes come over as buttons), and a customer list. The practice
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
});
