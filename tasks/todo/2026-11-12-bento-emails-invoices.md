# Emails and invoices in the Colophon bento look (12 November 2026)

Julian: "redesign the emails that send out in the colophon bento design style", then "same for the invoices", "show me
screenshots after".

## Where every email comes from

- Colophon's own emails (sign-in, welcome, trial, bills, receipts, closing, support, alerts): one layout,
  `layout()` in `services/email/templates.js`; French twins use it too (`templatesFr.js`, `templatesFrPress.js`).
- A shop's emails to its customers and to itself (orders, shipping, refunds, gift cards, reminders, newsletters, shop
  alerts): one shell, `risoLayout` in `apps/shop/functions/emailTheme.js` (admin preview mirror
  `src/app/admin/emailTheme.ts`). `email/index.js` wraps every fragment in it before sending.
- Invoices: the shop's printed invoice and line sheet use the document kit (`src/shared/documentKit.ts`). Colophon's
  monthly bills are Stripe's PDF.

## Plan

PR 1, emails
- [x] Platform `layout()`: cream page, Colophon pill, subject on the mint tile, words on a white tile, ink pill buttons,
      footer line under the tiles (`withIdentity` fills a marker). Tables + bgcolor for Outlook; hidden preview line.
- [x] Shop `risoLayout`: shop name or logo on the accent tile (mint by default; ink or white words by contrast), words on
      a white tile, ink pill buttons. Themes light/dark/market/index kept (setting still works). Old defaults
      (purple, flare red) read as mint.
- [x] Tests updated (parity, weekly PDF cream), all suites green; previews at desktop and phone width.

PR 2, invoices
- [ ] Document kit in bento (cream head tile, detail tiles, rounded table head, mint amount due, reference pill).
- [ ] Colophon's bills: a bento bill page built from the Stripe bill's own lines, tax lines and numbers, with Stripe's
      PDF kept beside it.
- [ ] Screenshots of both to Julian.

## Review

(filled in when done)
