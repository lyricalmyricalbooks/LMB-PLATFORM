// A forwarded receipt that is only words (no photo or PDF attached) is filed as a small PDF of those words, so the
// expense keeps a receipt copy like any other (receiptInbox.js). Plain PDF 1.4 written by hand: Helvetica, US Letter,
// one line of text per line, no package. Letters outside Western European (WinAnsi) print as "?".

const PAGE = { width: 612, height: 792, left: 54, top: 738, lineHeight: 13, lines: 52, chars: 92 };
// WinAnsi's extras over Latin-1 (the euro sign, curly quotes, dashes…), by Unicode code point.
const WIN_ANSI = { 0x20ac: 0x80, 0x201a: 0x82, 0x201e: 0x84, 0x2026: 0x85, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x2122: 0x99 };

/** One line of text as a PDF string in octal escapes, so the file stays plain ASCII. Pure. */
function pdfText(line) {
  let out = "";
  for (const ch of line) {
    const point = ch.codePointAt(0);
    const byte = point < 0x80 || (point >= 0xa0 && point <= 0xff) ? point : WIN_ANSI[point] ?? 0x3f;
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) out += `\\${String.fromCharCode(byte)}`;
    else if (byte >= 0x20 && byte < 0x7f) out += String.fromCharCode(byte);
    else out += `\\${byte.toString(8).padStart(3, "0")}`;
  }
  return out;
}

/** The words as lines no longer than the page is wide, breaking at spaces where it can. Pure. */
function wrapLines(text, width = PAGE.chars) {
  const lines = [];
  for (const raw of String(text ?? "").replace(/\r\n?/g, "\n").replace(/\t/g, "  ").split("\n")) {
    let rest = raw.replace(/\s+$/, "");
    if (!rest) { lines.push(""); continue; }
    while (rest.length > width) {
      const at = rest.lastIndexOf(" ", width);
      const cut = at > width / 2 ? at : width;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut).replace(/^ /, "");
    }
    lines.push(rest);
  }
  return lines;
}

/**
 * The email as a PDF: a short heading (from, subject, received) and then its words. Returns a Buffer.
 * At most `maxPages` pages; a longer email ends with a line saying it was cut.
 */
function emailPdf({ from = "", subject = "", receivedAt = "", text = "" }, maxPages = 6) {
  const head = ["Receipt received by email", "", `From: ${from}`, `Subject: ${subject}`, ...(receivedAt ? [`Received: ${receivedAt.slice(0, 10)}`] : []), "", ""];
  let lines = [...head.flatMap((l) => wrapLines(l)), ...wrapLines(text)];
  const room = PAGE.lines * maxPages;
  if (lines.length > room) lines = [...lines.slice(0, room - 1), "(The rest of this email was left out.)"];
  const pages = [];
  for (let i = 0; i < Math.max(1, lines.length); i += PAGE.lines) pages.push(lines.slice(i, i + PAGE.lines));

  // Objects: 1 catalog, 2 page list, 3 font, 4 bold font, then a page and its content for each page.
  const objects = [];
  const pageIds = pages.map((_, i) => 5 + i * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  pages.forEach((pageLines, i) => {
    const body = pageLines.map((line, n) => `${i === 0 && n === 0 ? "/F2 13 Tf" : i === 0 && n === 1 ? "/F1 10 Tf" : ""} (${pdfText(line)}) Tj T*`.trim()).join("\n");
    const stream = `BT\n/F1 10 Tf\n${PAGE.lineHeight} TL\n${PAGE.left} ${PAGE.top} Td\n${body}\nET`;
    objects[pageIds[i]] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`;
    objects[pageIds[i] + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  let file = "%PDF-1.4\n";
  const offsets = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = file.length;
    file += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = file.length;
  file += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map((at) => `${String(at).padStart(10, "0")} 00000 n \n`).join("")}`;
  file += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(file, "latin1");
}

module.exports = { emailPdf, pdfText, wrapLines, PAGE };
