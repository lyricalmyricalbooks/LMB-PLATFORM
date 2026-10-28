// Plan 7.17: the bookkeeper's read-only tax centre. The copy they read carries the expenses and nothing else
// (settings/taxCenter also holds AI keys), and their screen offers no way to change anything.
import { describe, it, expect } from 'vitest';
import { baseAmountOf, bookkeeperCopyKey, bookkeeperTaxCopy, copyYears, isBookkeeperPass, yearCsv, yearSummary } from '../src/lib/bookkeeper-copy.js';
import { bookkeeperViewHtml } from '../src/features/bookkeeper-view.js';

const TAX_CENTER = {
  settings: { baseCurrency: 'CAD', geminiKey: 'secret-gemini', claudeKey: 'secret-claude', rates: { USD: 1.37 } },
  recurring: [{ id: 'r1', desc: 'Web host', amount: 12 }],
  businessExpenses: [
    { id: 1, date: '2026-02-03', desc: 'Paper', vendor: 'Mill', cat: 'Printing', currency: 'CAD', amount: 120, baseAmount: 120, receipt: 'receipts/x.pdf', sourceSnippet: 'Dear publisher…', emailMsgId: 'm1' },
    { id: 2, date: '2026-03-09', desc: 'Fair table', cat: 'Fairs', currency: 'USD', amount: 50, baseAmount: 68.5, trip: 'Fair 2026' },
    { id: 3, date: '2026-04-01', desc: 'Ink, rate pending', cat: 'Printing', currency: 'EUR', amount: 20, fxMissing: true },
    { id: 4, date: '2025-11-20', desc: 'Stamps', cat: 'Postage', currency: 'CAD', amount: 9.25 },
    { id: 5, date: '2026-05-01', desc: 'Unknown amount', cat: 'Other', currency: 'CAD', amount: 0, amountUnknown: true },
  ],
};

describe("the bookkeeper's copy", () => {
  const copy = bookkeeperTaxCopy(TAX_CENTER, '2026-05-02T00:00:00.000Z');

  it('carries no key, receipt, email or recurring setup: only the expense fields', () => {
    const text = JSON.stringify(copy);
    for (const secret of ['secret-gemini', 'secret-claude', 'receipts/x.pdf', 'Dear publisher', 'm1', 'Web host', 'rates']) expect(text).not.toContain(secret);
    expect(copy.businessExpenses[0]).toEqual({ id: 1, date: '2026-02-03', desc: 'Paper', vendor: 'Mill', cat: 'Printing', currency: 'CAD', amount: 120, baseAmount: 120 });
    expect(copy.baseCurrency).toBe('CAD');
  });

  it('only changes when what the bookkeeper sees changes', () => {
    const later = bookkeeperTaxCopy({ ...TAX_CENTER, settings: { ...TAX_CENTER.settings, geminiKey: 'new' } }, '2026-06-01T00:00:00.000Z');
    expect(bookkeeperCopyKey(later)).toBe(bookkeeperCopyKey(copy));
  });

  it('sums a year by category in the base currency, and says what is still waiting for a rate', () => {
    expect(copyYears(copy)).toEqual(['2026', '2025']);
    const year = yearSummary(copy, '2026');
    expect(year.total).toBe(188.5);
    expect(year.categories).toEqual([{ cat: 'Printing', total: 120 }, { cat: 'Fairs', total: 68.5 }, { cat: 'Other', total: 0 }]);
    expect(year.unconverted).toBe(1);
    expect(baseAmountOf({ currency: 'CAD', amount: 9.25 })).toBe(9.25);
  });

  it('downloads the year as a spreadsheet', () => {
    const lines = yearCsv(copy, '2026').split('\n');
    expect(lines[0]).toBe('"Date","Description","Vendor","Category","Trip","Amount (CAD)","Amount as charged","Currency as charged"');
    expect(lines).toContain('"2026-03-09","Fair table","","Fairs","Fair 2026","68.50","50.00","USD"');
    expect(lines).toContain('"2026-05-01","Unknown amount","","Other","","","","CAD"');
    expect(lines).toHaveLength(5);
  });
});

describe("the bookkeeper's sign-in and screen", () => {
  it('needs a verified pass with the bookkeeper role', () => {
    expect(isBookkeeperPass({ emailVerified: true }, { role: 'bookkeeper' })).toBe(true);
    expect(isBookkeeperPass({ emailVerified: false }, { role: 'bookkeeper' })).toBe(false);
    expect(isBookkeeperPass({ emailVerified: true }, { role: 'author' })).toBe(false);
    expect(isBookkeeperPass(null, { role: 'bookkeeper' })).toBe(false);
  });

  it('shows the year, offers only a download and sign out, and escapes what it shows', () => {
    const copy = bookkeeperTaxCopy({ ...TAX_CENTER, businessExpenses: [...TAX_CENTER.businessExpenses, { id: 9, date: '2026-01-02', desc: '<img src=x onerror=alert(1)>', cat: 'Other', currency: 'CAD', amount: 1 }] });
    const html = bookkeeperViewHtml(copy, '2026', 'kit@press.test');
    expect(html).toContain('Download 2026 expenses (CSV)');
    expect(html).not.toContain('<img src=x');
    const actions = [...html.matchAll(/data-(?:action|on-change)="([^"]+)"/g)].map(m => m[1]).sort();
    expect(actions).toEqual(['bookkeeper.download', 'bookkeeper.signOut', 'bookkeeper.year']);
    expect(html).not.toMatch(/onclick=/);
  });

  it('says plainly when the press has not saved a copy yet', () => {
    expect(bookkeeperViewHtml(null, '', 'kit@press.test')).toContain('Nothing to show yet');
  });
});
