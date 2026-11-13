# A shop that sells in its own currency (13 November 2026)

Julian, 13 November: "do #2" (past orders for shops that sell in US dollars), then chose "Whole shop in its own
currency" on the card. Rule from 12 November: a US customer has everything in USD, a Canadian one everything in CAD.

## What is true today
- Sign-up keeps a currency per shop (signup/form.js COUNTRIES: US -> USD) and billing follows it (services/billing).
- Inside the shop every stored amount is Canadian dollars: catalog prices, order totals, reports. Checkout converts
  from CAD to the shopper's CAD/USD/EUR at the saved daily rate (functions/exchangeRates.js, feed base CAD).
- Neither the shop's server (shopConfig.js) nor its pages (shop-profile.js) are told the shop's currency.
- No US shop exists yet (sign-up is Canada-only), so nothing has to be converted.

## The rule
A shop has one **shop currency** (CAD or USD for now). Every stored amount is in it. A shop with none is CAD, so
nothing changes for a shop that exists today. The shopper's currency picker still converts, from the shop currency.

## Updates (each small, each its own PR)
- [x] 1. (PR #766) The shop knows its currency. `SHOP_CURRENCY` in the shop's server record, `currency` in the public profile,
      one shared rule (`src/shared/shopCurrency.ts`) for the code, sign and words. Nothing reads it for money yet.
- [x] 2. The admin shows it (`admin/moneySign.ts`): every "CA$" and "Canadian dollars" in the admin comes from the shop currency.
- [x] 3. Checkout: rates saved against the shop currency (feed base, sane ranges), the shopper's picker and the
      charge start from it, emails and receipts say it. Payment-integrity tests for a USD shop.
- [x] 4. Reports, bookkeeping, stockroom money and tax: labelled and summed in the shop currency. Sales tax for a US
      shop is its own piece (the tax rules are Canadian) and is listed for Julian before it is built.
- [x] 5. Past orders: a USD shop's old orders come in as USD; other currencies convert to the shop currency
      (pastOrders.ts, PastOrdersDialog.tsx, functions/orderImport.js, pastOrderRates.js).
- [ ] 6. Sign-up to a made shop: a USD test shop end to end (make it, price, check out in test mode, report).
      Done in code: one joined test from sign-up's country through setup to the shop's server and pages
      (`functions/shopCurrencyCheckout.test.js`). Waiting on Julian: whether to make a third test shop that sells in
      US dollars for the click-through (asked 13 November).

## Verification
- A CAD shop: every existing test passes unchanged at each step.
- A USD shop: unit tests per update, and at update 6 a click-through on a USD test shop.

## Review
- Updates 1 to 5 are merged or in review (#766, #768, #769, #771). A shop that sells in Canadian dollars passes every
  earlier test unchanged at each step; a US shop has its own tests per update (checkout step and rate reader, emails,
  admin sign, stockroom home currency, past orders, and the joined sign-up-to-shop test).
- Simplest thing that worked: one rule (`shared/shopCurrency`), read through `shopCurrency()` on the server and
  `SHOP_CURRENCY` / `MONEY_SIGN` / `MONEY_NAME` in the admin. No stored data changed, because no US shop exists.
- Left on purpose, each named in `src/shared/CLAUDE.md`: the shared stockroom library's CAD fallbacks, the tax centre's
  Canadian sales tax pages, and live carrier quotes (assumed to come back in the shop's currency; check on the US
  test shop).
- Not proven by local tests: a real US dollar payment, payout and platform bill. That is the click-through of update 6.
