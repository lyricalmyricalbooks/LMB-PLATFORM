// What the background receipt sweep searches Gmail for, which emails are worth
// an AI read, and the text the AI is given. Free of the DOM so it can be tested directly.

// The receipt search. Matching "order",
// "tax", "payment" or "shipping" anywhere in an email found about 200
// conversations a month in the publisher's real mailbox — notifications about
// this very app, promotions, their own sent invoices — and a genuine receipt
// four weeks back sat past the 100th of them, out of reach of a 25-email page.
// Gmail's own Purchases sorting, receipt-shaped subject lines and PDF invoices
// found 17, with every receipt among them on the first page.
export const RECEIPT_QUERY = '(category:purchases OR subject:(receipt OR invoice OR bill OR statement OR "order confirmation" OR "payment confirmation" OR "payment received") OR (has:attachment filename:pdf (invoice OR receipt)))';

// Never an expense, whatever the search: the publisher's own mail (the invoices
// they send customers came back as expenses to dismiss), GitHub notifications
// about this app — full of the words receipt and invoice — and the shop's own
// "You've received a new order!" sale alerts.
export const RECEIPT_NOISE = '-from:me -from:notifications@github.com -subject:"received a new order"';

// A receipt always names an amount, in its text or in an attached PDF or photo.
// An email with neither — a shipping-status ping, a newsletter, a password
// reset that happens to say "order" — cannot be a receipt, so it is set aside
// without spending an AI read on it. Matches a currency mark or code beside a
// number, or a money word followed by a two-decimal figure.
//
// Every part is anchored on a single character or bounded in length. This runs
// on whatever text anyone mails the publisher, and an open-ended run such as
// `\d[\d,.]*` before the currency mark made one long line of digits cost the
// square of its length — 40,000 digits held the scan for seconds.
const AMOUNT_IN_TEXT = new RegExp([
  String.raw`(?:[$€£¥₹]|\b(?:CAD|USD|EUR|GBP|AUD|NZD|CHF|JPY|MXN|INR)\b)\s?-?\d`,
  // "12,50 $" is how French-Canadian receipts write it. Only the digit right
  // before the mark matters for a yes/no answer.
  String.raw`\d\s?(?:[$€£]|\b(?:CAD|USD|EUR|GBP|AUD|NZD|CHF|SEK|NOK|DKK)\b)`,
  String.raw`\b(?:total|subtotal|amount|paid|charged|balance|due)\b[^\n\d]{0,40}\d[\d,.]{0,15}[.,]\d{2}\b`,
].join('|'), 'i');

// A small picture that is not marked inline is still almost always a logo or a
// social-media icon; a photographed receipt is far bigger. Such pictures stay
// with the email for the record but are never sent to the AI to look at.
export const MIN_RECEIPT_IMAGE_BYTES = 15 * 1024;

export function receiptFileForAi(file) {
  if (!file) return false;
  if (String(file.mime || '').startsWith('image/') && file.size > 0 && file.size < MIN_RECEIPT_IMAGE_BYTES) return false;
  return true;
}

// Delivery pings, review requests and account mail often repeat the order
// total, so the amount check alone lets them through — and the AI then rightly
// finds no receipt in them, after being paid to read them. The real receipt for
// the same order arrives as its own email. Bounded phrases only, run on the
// subject line alone.
const NOT_A_RECEIPT_SUBJECT = /\b(?:has shipped|have shipped|is on (?:its|the) way|out for delivery|was delivered|has been delivered|delivery update|shipment update|tracking (?:number|update)|rate your|review your|how did we do|tell us what you think|verify your|reset your password|password reset|security alert|sign-?in attempt)\b/i;

// Why an email is not worth an AI read, or '' when it is. A receipt always
// names an amount, in its text or in an attached PDF or photo.
export function receiptSkipReason(email) {
  const files = (email?.fileParts || []).filter(receiptFileForAi);
  if (files.length) return '';
  if (NOT_A_RECEIPT_SUBJECT.test(String(email?.subject || '').slice(0, 300))) return 'notification';
  return AMOUNT_IN_TEXT.test(`${email?.subject || ''}\n${email?.body || ''}`) ? '' : 'no-amount';
}

export function receiptWorthReading(email) {
  return !receiptSkipReason(email);
}

// A marketing receipt's plain-text part spells out every tracking link in full
// — often 200+ characters each, dozens per email — and closes with the same
// legal footer every time. None of it names an amount, a date or a vendor, all
// of it is paid for as AI input. Only the AI's copy is trimmed; the saved email
// the publisher reviews keeps everything.
const LINK = /\b(?:https?:\/\/|www\.)[^\s<>"'()[\]]+|<mailto:[^\s<>]+>/gi;
const BOILERPLATE_LINE = /unsubscribe|privacy (?:policy|notice)|all rights reserved|view (?:this email )?in (?:your|a) browser|manage (?:your )?(?:email )?preferences|this (?:email|message) was sent to|you(?:'|’)re receiving this|you are receiving this|update your preferences|terms of (?:service|use)/i;

export function receiptTextForAi(body) {
  const lines = String(body || '').replace(LINK, '').split('\n');
  const kept = [];
  for (const raw of lines) {
    const line = raw.replace(/[ \t]+/g, ' ').replace(/^[ <>()[\]|:-]+$/, '').trim();
    if (!line) continue;
    // A footer line is short prose; a line that also carries a figure could be
    // a total that happens to share the line, so it stays.
    if (line.length < 300 && BOILERPLATE_LINE.test(line) && !/\d[.,]\d{2}\b/.test(line)) continue;
    // HTML receipts repeat a line back-to-back when a layout table is nested.
    if (kept[kept.length - 1] === line) continue;
    kept.push(line);
  }
  return kept.join('\n');
}
