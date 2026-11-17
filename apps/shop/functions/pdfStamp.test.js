import { describe, expect, test } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PDFDocument } = require('pdf-lib');
const { stampPdf, stampLine, isPdf } = require('./pdfStamp');

describe('PDF stamp', () => {
  test('names the buyer and the order in characters the font can draw', () => {
    expect(stampLine({ name: 'Zoë Ng', email: 'zoe@example.com', orderId: 'AB-1' })).toBe('Licensed to Zoe Ng (zoe@example.com) · Order AB-1');
    expect(stampLine({})).toBe('Licensed to the buyer');
    expect(isPdf('a/Book.PDF')).toBe(true);
    expect(isPdf('song.mp3')).toBe(false);
  });
  test('prints on every page and keeps the pages', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 600]); doc.addPage([600, 400]);
    const out = await stampPdf(await doc.save(), { name: 'Ada', email: 'ada@example.com', orderId: 'X-9' });
    const back = await PDFDocument.load(out);
    expect(back.getPageCount()).toBe(2);
    expect(out.length).toBeGreaterThan((await doc.save()).length);
  });
  test('refuses something that is not a PDF', async () => {
    await expect(stampPdf(Buffer.from('not a pdf'), { name: 'A' })).rejects.toThrow();
  });
});
