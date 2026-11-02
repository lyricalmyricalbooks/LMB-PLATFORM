// Printable hang tags for the Fair kit (plan 14.8): one small tag per book with its title, author, price and ISBN, cut
// from a plain sheet and tied or stuck on the copy. It opens in its own print window, which cannot see the app's
// stylesheet, so every colour and font is written out in full. Pure: returns a complete HTML document.
//
//   hangTagsHtml({ books: [{ title, author, price, currency, isbn }], copies: 1, eventName: '' }) -> string
//
// `price` is a number, or empty for a blank "___" the seller writes in. Tags are repeated `copies` times each
// (1 to 10), in the order given, 8 to a sheet (2 across, 4 down).
import { escapeHtml as esc } from './html.js';

export const HANG_TAGS_PER_SHEET = 8;

/** A price as printed: "CA$ 24.00", or a blank line for the seller to fill in when there is no usable price. */
export function tagPrice(price, currency = '') {
  const n = Number(price);
  if (price === '' || price == null || !Number.isFinite(n) || n < 0) return `${esc(currency)} ____`.trim();
  return `${esc(currency)} ${n.toFixed(2)}`.trim();
}

/** Every tag to print, each book repeated `copies` times (clamped to 1 to 10), skipping books with no title. */
export function tagList(books, copies = 1) {
  const times = Math.min(10, Math.max(1, Math.floor(Number(copies)) || 1));
  const tags = [];
  for (const book of books || []) {
    if (!String(book?.title || '').trim()) continue;
    for (let i = 0; i < times; i++) tags.push(book);
  }
  return tags;
}

export function hangTagsHtml({ books, copies = 1, eventName = '' }) {
  const tags = tagList(books, copies);
  const cell = (b) => `<div class="tag">
      <div class="hole"></div>
      <div class="title">${esc(b.title)}</div>
      ${b.author ? `<div class="author">${esc(b.author)}</div>` : ''}
      <div class="price">${tagPrice(b.price, b.currency)}</div>
      ${b.isbn && b.isbn !== '—' ? `<div class="isbn">ISBN ${esc(b.isbn)}</div>` : ''}
      ${eventName ? `<div class="event">${esc(eventName)}</div>` : ''}
    </div>`;
  const sheets = [];
  for (let i = 0; i < tags.length; i += HANG_TAGS_PER_SHEET) sheets.push(tags.slice(i, i + HANG_TAGS_PER_SHEET));
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Hang tags</title><style>
    @page { size: letter; margin: 0.4in; }
    body { font-family: Archivo, Arial, sans-serif; color: #17130f; margin: 0; }
    .sheet { display: grid; grid-template-columns: 1fr 1fr; grid-auto-rows: 2.4in; gap: 0; break-after: page; }
    .sheet:last-child { break-after: auto; }
    .tag { border: 1px dashed #8a8174; padding: 0.18in 0.2in; position: relative; text-align: center; display: flex; flex-direction: column; justify-content: center; gap: 4px; }
    .hole { position: absolute; top: 0.1in; left: 50%; width: 0.14in; height: 0.14in; margin-left: -0.07in; border: 1px solid #8a8174; border-radius: 50%; }
    .title { font-family: Anton, Impact, sans-serif; font-size: 17pt; line-height: 1.15; text-transform: uppercase; }
    .author { font-size: 10pt; color: #5d544a; }
    .price { font-size: 20pt; font-weight: 800; margin-top: 4px; }
    .isbn { font-size: 8pt; color: #5d544a; }
    .event { font-size: 8pt; color: #5d544a; text-transform: uppercase; letter-spacing: .06em; }
    .bar { padding: 10px; text-align: center; font-size: 13px; }
    @media print { .bar { display: none; } }
  </style></head><body>
  <div class="bar"><button id="print-now">Print or save as PDF</button> Cut along the dashed lines and punch the small circle.</div>
  ${sheets.map((s) => `<div class="sheet">${s.map(cell).join('')}</div>`).join('') || '<p class="bar">Pick at least one book.</p>'}
  <script>document.getElementById('print-now')?.addEventListener('click', function () { window.print(); });</script>
  </body></html>`;
}
