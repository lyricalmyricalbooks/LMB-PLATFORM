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
- **Each shop's own sign-in list.** A shop's owner, staff, helpers and customers sign in on its own Identity Platform
  tenant. The profile names it (`tenant`, `profile/shop-profile.schema.json`) and both apps set it on their sign-in
  (`auth.tenantId`), so every pass carries it; the record names it too, and the rules and the server's `admin.auth()`
  take a pass only from that list. `setup/shopTenant.js` makes the list (email links, Google sign-in copied from the
  shared project's own Google settings, authenticator codes allowed) or finds the one already made; the shop maker calls
  it (phase 6). The platform's own sign-ins into a shop (support visits, the release check's test owner, the two-step
  tools) name the shop's list too (`clients/identity.js`).
- **One front door for every address.** One Hosting site serves the app (the same files for every shop). Hosting
  sends a shop's own paths to the `frontDoor` function (`apps/shop/functions/frontDoor.js`; the rewrites are added by
  `scripts/deployConfig.mjs` `frontDoorHosting`, and those files are left out of the upload): `/shop-profile.js` and
  `/stockroom/shop-profile.js`, the shop's published files (`sitemap.xml`, `robots.txt`, `storefront-data.json`,
  `llms.txt`, the two product feeds, the change marker) and its storefront pages (`/`, `/books/x`, `/products/x`,
  `/page/x`, `/collections/x`). It reads the address the visitor typed, looks it up in `addresses/{host}` (`{ shopId }`,
  written only by the platform: the free address and any own domain, cached a minute), and answers from that shop
  only: the profile from its record (with its sign-in list), the files and pages from the bucket at
  `shops/<id>/site/`, a page not drawn yet with the app's blank page. An address that names no shop gets a plain "There
  is no shop here" page, a closed shop a "This shop has closed" one, never another shop. An own domain is one more
  `addresses/` entry plus that domain on the shared Hosting site.
- **Each shop's pages, drawn for search engines.** `setup/shopSite.js` publishes one shop: it copies the built app,
  writes the shop's profile beside it and runs the shop's own build scripts against that copy (`SHOP_PROFILE_FILE`,
  `SHOP_BUILD_DIR`; they read the shop's folder in the database through `shopDocumentsBase`), then uploads exactly the
  files the front door serves to `shops/<id>/site/` and removes the shop's older ones (a page whose book was taken
  down). A failed build uploads nothing, so the last good files stay. A new shop has no books to draw, so the front
  door answers it with the blank app until its first catalogue change: the staged updates run this after each release
  and catalogue change (phase 7).
- **A shop made in seconds.** `setup/sharedSteps.js` is the shop maker for the shared system, run by the same runner
  (`runner.js`: a re-run resumes, nothing is deleted). Eleven steps: reserve the id (the registry row names the shared
  project), make the sign-in list, write the profile (the shared web app, both apps), write the record and its copies
  in the stockroom's database and the Realtime Database, claim the free address `<id>.<shop domain>` in `addresses/`
  (an address another shop holds stops for a person), then the old maker's starter content, payments, welcome email,
  the free address put on the shared site and a check that the shop and stockroom answer there (then live; it waits while Google secures the address, see Web addresses), the stockroom link and the setup hand-over.
  One server runs every shop, so it has one key for the platform's services: the secret `PLATFORM_SERVICE_KEY` in the
  shared project, made once by the shop maker when missing (`setup/serviceKey.js` `sharedServiceKeyHash`). Step 1 writes
  its hash on each shop's registry row, so the payment, email and domain services take the shared server's calls for
  that shop, and a re-run fills it in on a shop made before.
  The stockroom link of a new shop is turned on in its folder (`setup/real.js` `folderInventoryLink`: a start day,
  never over one there); the test shop's goes through its own admin. The hosted server runs it once
  `SHARED_SHOPS_PROJECT` and `SHARED_SHOPS_DOMAIN` are in its settings (`server/world.js`, `sharedShopRun`); sign-up's
  progress screen follows these steps (`SHARED_STEP_PLAN`). Until then making shops stays "not switched on".
- **The platform reaches each shop in its folder.** One setting, `SHARED_SHOPS_PROJECT` on the hosted server
  (`clients/shared.js` `shopStores`), points every platform reader and writer into a shop at its folder in the shared
  project: billing's plan copies, control-room messages, the closing sweep, accounts, health and backups. Where a shop
  answers comes from its registry row (`shopPlaces`): its free address or own domain on the front door, the stockroom
  under `/stockroom`, and its server functions on the shared server with `?shop=<id>` (the payment service forwards
  Stripe and Square events there; the health checks call the checkout there). `ownAddress` (services/domains/names.js)
  is the free address for a shared shop. A shared shop is live for health, backups and team sync
  (`rings.js` `notLive`), but gets no per-project release (`leftOut`). The nightly backup exports the shared project's
  two databases once for all its shops. The monthly restore drill restores that export into a scratch database and counts
  one shop's own folder there and in the live database (`restoreDrill.js` `placeOf`), a different shop each month.
- **Staged updates.** A release goes to a project, not a shop (`services/release-runner/shared.js`,
  `node services/release-runner/run-shared.js <version>`): the shared test project first, then the live one
  (`SHARED_SHOPS_PROJECT`). Each gets the stamped rules of both apps, the shared server's code with its own settings
  (`sharedServerEnv`: the platform's doors and the region; each shop's settings stay in its record) and the one site,
  whose front door points at the functions' own region. Then one shop answers at its own address (home, `/admin`, its
  profile, the stockroom), and in the test project the release check passes on the test shop. A failed check puts the
  project back on its release before and stops, so the live project never gets what the test project refused. After a
  project passes, each of its shops' pages are drawn again from its own books (`setup/shopSite.js`); a shop whose
  pages fail keeps its last good ones and is listed, and the release goes on. Data changes still run per project, so
  the shared release refuses to start while the release has any. The per-project runner leaves shared shops out.
- **Web addresses.** The domain service runs on the hosted server once the shared system is on
  (`services/domains/hosted.js`, `/api/domains`, the `web-addresses` job). A shop's address goes in `addresses/{host}`
  first (refused when another shop holds it), then on the shared Hosting site; letting one go takes it off the site,
  then out of `addresses/` (only an entry that names this shop). Its server settings (`SHOP_EXTRA_ORIGINS`,
  `SHOP_SITE_URL`) and profile (`siteUrl`) are fields of its record, which the shared server reads within 30 seconds:
  nothing is deployed. A shop with a project of its own is refused there in plain words. The shared server calls it at
  `PLATFORM_DOMAINS_URL` (`<platform>/api/domains`) with the shared server's key.
  **Limit:** Firebase Hosting takes no wildcard address and only a few dozen own addresses per project, and each one
  waits minutes to hours for its certificate. One per shop runs out at about 40 shops. A Google load balancer with a
  wildcard certificate in front of the front door removes both limits. Julian, 10 November 2026: stay on Hosting for
  now and switch to the load balancer at about 40 shops. Until then a new shop opens once Google has secured its free
  address: the shop maker's step 9 puts it on the shared site and waits (`setup/runner.js` `StepWaiting`: no failure
  counted, the press told in plain words, a look every five minutes, a person told after a day), and the owner gets
  the "your address works" email when it does.
- **What each shop uses (the meters).** The shared server writes one usage line per request, change and tick
  (`functions/usageLog.js`: the shop and its time) and the front door one per page answered (the shop and its size).
  Two log-based metrics in the shared project count them by shop (`server/setup-usage-metrics.js`, run once with `--apply`).
  Each night `services/usage/meters.js` writes every shop's month so far to `usage/{shopId}_{YYYY-MM}` in the
  platform's database: server time, memory time, web traffic, files kept (the bucket under `shops/<id>/`) and emails
  sent. From the 3rd it splits last month's bill for the shared project across the shops by their use at list prices,
  in whole cents that add up to the bill exactly, and marks the month `reconciled` (never rewritten). Until the billing
  export is set up, the meters run and nothing is split. Database reads and writes are not counted per shop yet: their
  cost is spread with the rest by use.
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

## Every shop gets everything (Julian, 10 November 2026)

There is no longer a shop-only or stockroom-only press: every press gets the shop and the stockroom on one plan, paid
by use (a small editable monthly fee plus its running cost). So the shared system has no per-app switch: the shop maker
(phase 6) always makes both (the record copy in every store, `apps` both on in the profile), and nothing here turns an
app off. The per-shop cost meters (phase 7) are what the plan charges by.

## Phases

| # | Phase | State |
| --- | --- | --- |
| 1 | Walls: shop rules and pages in shop folders, two-shop rule checks | built |
| 2 | Shop server code (Cloud Functions) in shop folders: shop from each request, triggers on `shops/{shopId}/…`, nightly jobs per shop | built |
| 3 | Stockroom in shop folders (its database, live sync, files) | built |
| 4 | Per-shop sign-in (Identity Platform tenants) for customers, staff, helpers, support | built |
| 5 | Front door: one site for every address, profile by address, crawlable pages, own domains | built |
| 6 | Shop maker in seconds (record + tenant + starter content); ends "In the queue" | built |
| 7 | Platform services: control room, health, per-shop costs, export, closing, backups, staged updates | built |
| 8 | Test shop rebuilt in the shared test project (`lmb-test-shop`) with a test purchase | built; runs when the "Make the test shop" workflow is pressed |

Left for later: a Shippo or PayPal webhook set up by hand needs `?shop=<id>` on its address. The tick runs every
shop in one five-minute run; it is spread out once there are many shops. Nothing is deployed from these copies to a
live shop until phase 8 (the per-project test shop build is on hold).

## Projects

- `lmb-test-shop` becomes the shared **test** project: the test shop is one folder in it, and every update lands there
  first. `setup/make-test-shop.js` (the "Make the test shop" workflow) readies it once (`setup/sharedProject.js`:
  Firebase, the services, the databases and buckets, the web app called Shop, sign-in lists allowed, the shared
  server's key, the nightly copy's permission, photos readable from the admin for Download your shop, the old builds' cleanup), sends its first release while it has no shop
  (`firstSharedRelease`), and makes the test shop `test-press` with the shared shop maker's steps, at the project's
  own address `lmb-test-shop.web.app`. The test shop from before (`lmb-test-shop`, the project to itself) is marked
  abandoned in the registry, so the per-project runner never sends its old rules here; its data stays. The release
  check reads the test shop in its folder and calls the shared server with `?shop=` (`release-check/run.js`
  `shopWhere`), so the staged update's test purchase runs on it.
- Live shops go in one shared project for real shops (working name `lmb-shops`), made once by a person in the Google
  Cloud console (shops folder, billing linked), then readied by the "Shared system" workflow's `ready-project` job
  (`setup/ready-shared-project.js`, the same steps as the test project). Its id then goes in the server's settings
  as `SHARED_SHOPS_PROJECT`, with `SHARED_SHOPS_DOMAIN`.
- The same workflow runs the restore drill once (`restore-drill`). Updates have their own workflows
  (`docs/updating.md`): every merge goes to the test shop by itself ("Update the test shop"), and "Send the update to
  shops" sends the version the test shop runs on to the live project, test project first. The "Make the test shop" workflow hands the test shop's payment and email steps the platform's
  test keys from Secret Manager when they are there, so the test shop takes test-mode payments.
- The platform's own project (`lmb-platform-prod`) keeps the platform's data and the four platform secrets.
