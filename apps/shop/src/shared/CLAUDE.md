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
  Discounts screen's category choices).
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
