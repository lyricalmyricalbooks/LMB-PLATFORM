# The shared system

Decided 10 November 2026 (Julian: "Yes, switch to shared"). Plan and comparison:
https://claude.ai/artifact/6z8BRWAkT8CdTJf5XJ7c8t

Every shop lives in one Firebase project, each in its own folder. This replaces one Google Cloud project per shop, which
needed a Google organization before any shop could be made ("In the queue") and deployed every update once per shop.

## How it works

- **One folder per shop.** Everything a shop owns sits under `shops/<shopId>/` in the database (`shops/<id>/books/…`,
  `shops/<id>/orders/…`) and in the file bucket (`shops/<id>/products/…`). The folder's own document, `shops/<shopId>`,
  is the shop's record: its sign-in list (`tenant`) and owner address (`ownerEmail`). Only the platform writes it; no
  browser can read or write it.
- **The rules are the walls.** `apps/shop/firestore.rules` and `storage.rules` put every rule inside
  `match /shops/{shopId}`. A sign-in counts in a shop only through `signedInHere()`: its Identity Platform tenant must be
  the one the shop's record names. A role, an owner address or a support visit from another shop's sign-in list (or from
  no list) opens nothing. The rules name no address, so one set serves every shop (`scripts/deployConfig.mjs` refuses
  rules that name one). No rule may use a collection-group match (`{path=**}`): it would cross every shop's folder.
- **The shop's pages read inside the folder.** `apps/shop/src/lib/shopFolder.ts` turns the profile's `shopId` into the
  folder. `db` (`src/lib/firebase.ts`) and `liteDb` (`src/lib/firestoreLite.ts`) are the folder's document, so
  `collection(db, "books")` reads `shops/<id>/books`. Batches and transactions take `firestore` / `liteFirestore`, the
  whole database (the type checker refuses `db` there). Every file path goes through `shopFilePath`.
- **One server for every shop.** The shop's server code (`apps/shop/functions`) is deployed once and runs every shop.
  `functions/shopScope.js` is its wall: `runInShop(shop, fn)` runs `fn` for one shop (Node's AsyncLocalStorage, so every
  await, timer and callback stays in that shop), and the Admin SDK that index.js hands out is scoped: `admin.firestore()`
  reads and writes only `shops/<id>/…`, `admin.storage()` only the shop's file folder, `admin.auth()` is the shop's own
  sign-in list and refuses a pass from another list. Outside a shop the database, files and sign-ins throw
  (`outside_shop`), so a forgotten wrapper can't write to another shop or the root. Collection-group reads are refused.
- **How the server finds the shop** (`functions/shopEntry.js`): a database trigger listens on `shops/{shopId}/<path>` and
  takes the shop from the path; a web request takes it from `?shop=<id>` on the address (the shop's pages add it in
  `functionUrl`, and every address the server writes into an email, a webhook or a payment page adds it through
  `functionLink`); the five-minute tick runs once for every shop that isn't `closed`, four at a time, one shop's failure
  never stopping another. The shop's record is read at most every 30 seconds.
- **Each shop's server settings** come from its record: `ownerEmail`, `tenant` and `server` (the `SHOP_…` keys a shop
  used to keep in its own `functions/.env`: site address, sender, payment provider and mode, test shop, stockroom
  database). `configForShop` (`functions/shopConfig.js`) joins them with the server's shared settings; `shopConfig` is a
  live view of the current shop's. Services built from them (card payments, email, the settlement code) are made once
  per shop (`perShop`).
- **The stockroom lives in the same folder.** Its data sits under `shops/<id>/` in each of its stores: the Realtime
  Database (`shops/<id>/lyrical/…`, with a copy of the record at `shops/<id>/record`), its own Firestore database
  `stockroom` (`shops/<id>/books/…`, the record copy at `shops/<id>`) and its file bucket (`shops/<id>/receipts/…`).
  `apps/stockroom/src/lib/shop-profile.js` turns the profile's `shopId` into `SHOP_FOLDER` and `DATA_ROOT`;
  `src/firebase.js` reads and writes Firestore through `home`, the folder's document, and every file path through
  `shopFilePath`. Its three rules files (`firestore.rules`, `storage.rules`, `database.rules.json`) sit inside the shop
  folder, take the owner and the sign-in list from the record and name no one, so one deploy serves every shop
  (`scripts/deployConfig.mjs` refuses one that names an address). The shop's server reaches the stockroom only inside
  its shop's folder (`functions/inventoryLinkStore.js` goes through the same wall). The platform writes each record copy
  when it makes the shop (phase 6); the demo seeds them (`demo/seed.js`).
- **Backups.** The managed Firestore export would copy every shop, so inside a shop only the server's own document copy
  runs. Its paths carry no shop folder (`books/a`), and `scripts/restore-json-backup.mjs --shop <id>` puts them back
  into that shop's folder only.
- **Proof.** `apps/shop/scripts/firestore-rules-emulator.mjs` runs every check inside shop `s1` and ends with the walls:
  owners, staff, owner roles, customers and support visits of shop `s2`, and a sign-in with no tenant, are all refused in
  `s1`, and the other way round. `apps/stockroom/scripts/rules-emulator.mjs` does the same for the stockroom's three
  stores, plus a shop with an empty sign-in list name, and checks that no record can be read or written from a browser. On the server, `functions/shopScope.test.js` runs two shops at once and checks each
  stays in its folder, `shopEntry.test.js` checks triggers, `?shop=` and the tick, and `sharedLoad.test.js` loads
  index.js with the folders on and checks every trigger listens inside the shop folders. The older handler tests run
  one shop with the folders off (`SHOP_FOLDERS: "off"` in `apps/shop/vite.config.ts`); nothing else turns them off.

## Phases

| # | Phase | State |
| --- | --- | --- |
| 1 | Walls: shop rules and pages in shop folders, two-shop rule checks | built |
| 2 | Shop server code (Cloud Functions) in shop folders: shop from each request, triggers on `shops/{shopId}/…`, nightly jobs per shop | built |
| 3 | Stockroom in shop folders (its database, live sync, files) | built |
| 4 | Per-shop sign-in (Identity Platform tenants) for customers, staff, helpers, support | next |
| 5 | Front door: one site for every address, profile by address, crawlable pages, own domains | |
| 6 | Shop maker in seconds (record + tenant + starter content); ends "In the queue" | |
| 7 | Platform services: control room, health, per-shop costs, export, closing, backups, staged updates | |
| 8 | Test shop rebuilt in the shared test project (`lmb-test-shop`) with a test purchase | |

Left for later phases: the platform's services still call each shop's server code at its own project's address
(`services/payments` forwarding events, `services/health`), which phase 7 moves to the shared server with `?shop=`. A
Shippo or PayPal webhook set up by hand needs `?shop=<id>` on its address. The tick runs every shop in one five-minute
run; phase 7 spreads it out once there are many shops. The platform's writers into a shop (billing's `platform/plan`
and `platform/status`, control-room messages, the closing sweep, setup's stockroom books) still address each shop's own
project; phases 6 and 7 point them at the shop's folder in the shared project. Nothing is deployed from these copies to a live shop until
phase 8 (the per-project test shop build is on hold).

## Projects

- `lmb-test-shop` becomes the shared **test** project: the test shop is one folder in it, and every update lands there
  first.
- Live shops go in one shared project for real shops (working name `lmb-shops`), made once.
- The platform's own project (`lmb-platform-prod`) keeps the platform's data and the four platform secrets.
