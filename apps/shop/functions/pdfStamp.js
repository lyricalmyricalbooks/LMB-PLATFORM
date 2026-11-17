// Digital D2b (Beta, 17 November 2026): a PDF with the buyer's name and email printed small at the foot of every page,
// made when they download it (product setting `stampPdf`). The download endpoint keeps the stamped copy per order and
// file, so a second download costs nothing. Larger files go out as they are: stamping reads the whole file into memory.
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

/** Files over this size are sent without the stamp (a Cloud Function holds the whole file while it stamps). */
const MAX_STAMP_BYTES = 50 * 1024 * 1024;

const isPdf = name => /\.pdf$/i.test(String(name || ""));

/** The line printed on each page, kept to characters the built-in font can draw. */
function stampLine({ name, email, orderId }) {
  const who = [String(name || "").trim(), email ? `(${String(email).trim()})` : ""].filter(Boolean).join(" ");
  const text = `Licensed to ${who || "the buyer"}${orderId ? ` · Order ${orderId}` : ""}`;
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E·]/g, "").slice(0, 160);
}

/** Returns the stamped PDF bytes. Throws on a PDF it can't open (for example one with a password). */
async function stampPdf(bytes, buyer) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const text = stampLine(buyer);
  for (const page of doc.getPages()) {
    const { width } = page.getSize();
    const size = Math.max(5, Math.min(8, width / 80));
    const textWidth = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: Math.max(6, (width - textWidth) / 2), y: 8, size, font, color: rgb(0.45, 0.45, 0.45) });
  }
  return doc.save();
}

module.exports = { MAX_STAMP_BYTES, isPdf, stampLine, stampPdf };
