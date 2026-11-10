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
- **Proof.** `apps/shop/scripts/firestore-rules-emulator.mjs` runs every check inside shop `s1` and ends with the walls:
  owners, staff, owner roles, customers and support visits of shop `s2`, and a sign-in with no tenant, are all refused in
  `s1`, and the other way round.

## Phases

| # | Phase | State |
| --- | --- | --- |
| 1 | Walls: shop rules and pages in shop folders, two-shop rule checks | built |
| 2 | Shop server code (Cloud Functions) in shop folders: shop from each request, triggers on `shops/{shopId}/…`, nightly jobs per shop | next |
| 3 | Stockroom in shop folders (its database, live sync, files) | |
| 4 | Per-shop sign-in (Identity Platform tenants) for customers, staff, helpers, support | |
| 5 | Front door: one site for every address, profile by address, crawlable pages, own domains | |
| 6 | Shop maker in seconds (record + tenant + starter content); ends "In the queue" | |
| 7 | Platform services: control room, health, per-shop costs, export, closing, backups, staged updates | |
| 8 | Test shop rebuilt in the shared test project (`lmb-test-shop`) with a test purchase | |

Until phase 2 lands, the shop's pages and its server code disagree on where data lives; nothing is deployed from these
copies to a live shop in between (the per-project test shop build is on hold).

## Projects

- `lmb-test-shop` becomes the shared **test** project: the test shop is one folder in it, and every update lands there
  first.
- Live shops go in one shared project for real shops (working name `lmb-shops`), made once.
- The platform's own project (`lmb-platform-prod`) keeps the platform's data and the four platform secrets.
