# Shared rules (one copy for the shop and the server)

A rule the browser and the Functions must agree on (what a pre-order is, later shipping quotes, discount maths) lives
here once, as a TypeScript module, instead of a hand-kept mirror pair with a parity test.

- The storefront imports it as usual (`src/app/features/site/preorder.ts` just re-exports `src/shared/preorder.ts`).
- The Functions deploy uploads only `functions/`, so `scripts/build-shared.mjs` (`pnpm run build:shared`) translates each
  file to CommonJS in `functions/shared/<name>.js`, which is committed and `require`d from there
  (`require("./shared/preorder")`). Never edit `functions/shared/` by hand. After changing a file here run
  `pnpm run build:shared` and commit both; `scripts/sharedRules.test.ts` (in `pnpm test`) fails while a copy is stale,
  missing or left over.
- A shared file is pure (no Firebase, no DOM, no network) and imports only other files in this folder (`./name`), so its
  copy works inside `functions/shared/` too. Types-only TypeScript is fine: the translation drops it.
- Moving a mirror here: merge both copies into one file (the union of their exports, same behaviour), point the
  storefront file at it, point the Functions' `require`s at `./shared/<name>` and delete the old server file. Keep the
  old parity test's cases, now run against the generated copy. Done so far: `preorder`, the shipping engine
  (`shippingEngine`, `shippingZones`, `weightGrams`) and discount maths (`discountMath`, with `bogoPercent`; the shop's
  `checkoutFulfillment.ts` and the shared `localFulfillment` re-export it), and promotions (`promotions`: sale
  windows, add-ons, box sets, gift-card products; the server now throws the shop's `PromotionProblem`, same messages).
  Address rules (`addressRules`, which also owns the
  checkout form's no-postcode list). Local pickup and delivery (`localFulfillment`: quotes,
  settings check, the server's choice check and physical subtotal; the config types now live here and `types.ts`
  re-exports them). Discount categories (`discountCategories`: which books a category discount covers, plus the
  Discounts screen's category choices). The shop's name (`shopIdentity`, plan 5.8: `shopName`, `pressName` for the
  server; `features/site/shopIdentity.ts` re-exports it).
- Bookkeeping (plan 7.11, 7.12, 28 October 2026): `taxBooks.ts` names each tax rate for the books (`bookName`, else
  `suggestedTaxBookName`); `authoritativeTax` (functions/index.js) stores each order's `taxLines` (`[{ name, cents }]`, adds up
  to the rounded tax) through `taxLinesFor`. `bookkeeping.ts` turns orders into the month's order, day
  (`dailyBookkeeping`, the shape the accounting link reads) and payout lines; `admin/bookkeepingCsv.ts` writes them as CSV
  for Settings › Backups & export › Download for your bookkeeper. Practice (`practice: true`), test and sandbox orders never count.
- `src/app/features/site/merchantFeed.mjs` keeps its own small copy of the pre-order date check because plain Node build
  scripts can't import TypeScript; `features/site/merchantFeed.test.ts` guards it.

## Typed edges (requests and records)

`edge.ts` is a small dependency-free schema kit (`string`, `number`, `boolean`, `oneOf`, `optional`, `nullable`, `array`,
`object`, `check`, `Infer`): one schema both checks a value at the boundary and gives both sides its TypeScript type. Objects
keep only the keys they list and ignore extras, so an older admin tab still works. `orderActions.ts` holds the first ones: the
admin's refund (`refundOrderBody`) and cancel / payment-mismatch / restock actions (`orderActionBody`). The admin builds those
bodies with `satisfies` on their types (`admin/api.ts`), and `functions/index.js` `readBody(req, res, schema)` refuses any other
shape with 400 `bad_request` before touching the order. Friendly business checks (amount above zero, at most what is left)
stay in the handlers. `giftCardActions.ts` (26 October 2026) adds one schema per gift card `op` (`GIFT_CARD_BODIES`);
`handleGiftCardAdmin` refuses an unknown op or a wrong shape before reading a card, and `adminApi.giftCardAdmin(op, body)` is
typed per op. Manual local orders and the public checkout keep their hand-written field checks (`createManualLocalOrder`);
discounts are written straight to Firestore under `firestore.rules`; their stored shape is the `discountRecord` schema in
`discountRecord.ts` (`DiscountRecord` is its type; `discountMath.ts` re-exports it). `adminApi.saveDiscount` checks the
whole record and `updateDiscount` checks the fields it writes (`discountUpdate`; other keys pass untouched), so a
wrong-typed field is refused with a plain message before any write. `records.ts` (types only) holds `OrderRecord` / `BookRecord`, the stored
`orders` and `books` shapes: the common fields typed, the rest open. The Overview's `Order` / `Book` (`overviewInsights.ts`)
and the other admin files that used `Record<string, any>` for them now use these; type new admin code with them too. Next: one schema per Firestore collection for what
browsers may write (mirroring `firestore.rules`).
- What a shop sells (plan 10.23, 29 October 2026): `shopSells.ts` holds the sign-up answers and `sellsBooks` (the admin's
  `sells.ts` re-exports them) plus the customer-email words for a shop that doesn't sell books (`GOODS_EMAILS`,
  `emailDefaultsFor`, `withShopEmailWords`, `goodsDownloadNote`). The server's `loadNotificationSettings` reads
  `firstWeek/start` › `publishes` and sets `settings.sells`; Settings › Notifications shows the same defaults.
  The word swaps (`goodsWords`, `wordsFor`; the admin's `adminWordsFor` is `wordsFor`) live here too: the Monday report
  (`weeklySummary.js`, `weeklyPdf.js`) takes a `words` option and only its own fixed words pass through it.
- Shipping by kind (plan 10.4, 29 October 2026): `kindDefaults.ts` (`kindShipping(product)`) holds each kind's customs words,
  tariff code and fallback weight. `functions/customs.js` uses it where a product's own boxes are blank; a product with
  no kind is a printed book with today's values. "other" has no tariff code, so the form goes without one.
- Random-cart checks (3 November 2026): `discountMath.property.test.ts` uses fast-check to try 400 random bags and discount
  codes per rule: the shop's figure equals the server copy's, a discount is 0 ≤ amount ≤ bag (and ≤ its cap), item order
  never matters, and automatic discounts pick the biggest saving. A failure prints the smallest bag that breaks the rule.
  Add a rule there when you change discount maths; the same pattern suits the shipping engine and tax.
- `shippingAndTax.property.test.ts` (3 November 2026) does the same for shipping (shop = server, prices in whole cents and
  never negative, cheapest first, unique ids, bag order never matters, Free-for-all is free) and tax (shop = server, the
  tax sits between the lowest and highest rate used, no kinds means one rate as before, bookkeeping cents add up). It
  found that two shipping profiles with equal bases charged by bag order: `quoteShipping` now breaks the leader tie by
  the bigger waived extra, then profile id.
- The shop's own currency (13 November 2026, `tasks/todo/2026-11-13-shop-currency.md`): `shopCurrency.ts` (`shopCurrencyOf`,
  `currencySign`, `currencyName`, `shopMoney`). The server reads `shopConfig.currency` (the record's `SHOP_CURRENCY`,
  written by the platform's setup from sign-up's country), the pages `shopCurrency()` in `lib/shopProfile` (the
  profile's `currency`, left out for CAD). CAD and USD only; anything else is CAD. New money code takes the currency from here, never writes "CAD" or "CA$".
  **Checkout (update 3):** every stored amount is in the shop's currency and every exchange rate is from it, so the
  shop's own is 1 (`functions/exchangeRates.js` `BASES`, mirrored in `features/site/exchangeRates.ts`; the saved
  `settings/exchangeRates` carries `base` and a copy for another base reads as missing, which
  `functions/shopCurrencyCheckout.test.js` pins). Server code reads `shopCurrency()` / `shopSign()` from
  `functions/shopMoney.js` when it runs. The shopper's picker starts from the shop's currency outside Canada, the
  Americas and Europe.
  **Reports and the stockroom (update 4):** admin code reads `SHOP_CURRENCY` / `MONEY_NAME` from `admin/moneySign.ts`
  (reports, Orders CSV via `shopCurrency()`, bookkeeping, social, invoice pay links, the Google feed's `currency`
  option). The stockroom ledger's home currency is the same constant: defaults, the tax centre's `baseCurrency`
  fallback and the rate keys (`USD_CAD` in a Canadian shop, `CAD_USD` in a US one; `homeCurrency.test.ts`). Still
  Canadian: the shared stockroom library's own fallbacks (`apps/stockroom/src/lib/money.js`, a book saved with no
  currency reads as CAD) and the tax centre's sales tax words (GST/HST).
  **Past orders (update 5):** `admin/pastOrders.ts` takes the home currency (`home`, default `SHOP_CURRENCY`): orders in
  it come over as they are, any other needs the owner's rate into it. `functions/orderImport.js` checks against
  `shopCurrency()`, and `pastOrderRates.js` `averageRates({ base })` turns the Bank of Canada's Canadian-dollar rates
  into US-dollar ones day by day for a US shop.
  The admin's sign is `MONEY_SIGN` (`admin/moneySign.ts`, read once from the profile): admin code writes
  `${MONEY_SIGN}${n.toFixed(2)}`, never a literal sign. Left as literals on purpose: sample text in email and theme
  previews, the look gallery, and the platform's own bill (its currency is the billing one, `platformBilling.ts`).
