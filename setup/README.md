# Shop maker

Creates one press's Firebase copy in numbered steps (`docs/shop-setup.md`). Each step is safe to re-run and resumes after
a failure. Each step is logged to the shop registry and the shop's audit log.

Plain Node 22 ES modules with no packages; tests use Node's own test runner (`npm test` at the repo root).

## The runner (`runner.js`)

`runSteps({ shop, steps, registry, auditLog, dryRun, print })` runs the steps for one shop, in order, and stops at the
first failure.

- **Steps** are `{ number, name, check(ctx), act(ctx) }`, numbered 1, 2, 3… with no gaps. `check` only looks and returns
  true when the work is already there; `act` does it. The runner checks first and skips the step when it's done, and
  checks again after acting: a step only counts as done when its check agrees.
- **Logged twice.** Every outcome goes to the registry as `{ step, name, status, acted?, startedAt, finishedAt, error? }`
  (`status` is `done` or `failed`). Once the shop's database exists, the registry's whole history for the shop is copied
  to its audit log, then each new entry; entries have stable ids, so a copy made twice keeps one.
- **Resumes.** The next run starts at the first step the registry doesn't record as done (the failed one). Earlier steps
  aren't run again.
- **Dry run** (`dryRun: true`) writes nothing and acts on nothing. It prints, step by step, "already done, would skip"
  or "would run". After the first step that would run, later steps aren't checked: their project may not exist yet.
- **Never deletes.** A failed step is fixed and retried, never undone (deleted Google Cloud projects can't be reused for
  30 days).
- **One run per shop.** A real run takes the shop's lock in the registry (`takeLock`) before its first step, renews it
  before each step and gives it back at the end, even after a failure. A second run on the same shop stops at once with
  `locked: true` and records nothing. A crashed run's lock lapses after an hour (`LOCK_MINUTES`) and the next run takes
  it over; a run that finds its lock taken over stops before its next step. Dry runs take no lock but say when a real
  run would be turned away. Locks for different shops don't touch.

The registry and audit log are passed in. `fakes.js` holds in-memory ones with the same shape as the real ones, for tests
and dry runs; Google is never called from tests.

## Steps 1–6 (`steps.js`)

`firstSteps({ google, registry, profileFiles, config })` returns steps 1–6 of `docs/shop-setup.md`:

1. Reserve the shop id in the registry (refused if the id belongs to another owner).
2. Create the Google Cloud project in the shops folder (`config.folder`) and link the platform billing account
   (`config.billingAccount`). The project id is the shop id. A project outside the folder, or marked for deletion, stops
   the run for a person to decide; it is never deleted or replaced.
3. Add Firebase to the project.
4. Turn on the services in `SERVICES` (only the missing ones).
5. Create the Firestore database (delete protection on) and the storage bucket in `northamerica-northeast1`. One in
   another region stops the run, since neither can be moved. With the stockroom in the plan, also its own named
   database `stockroom` (delete protection on) and bucket `<shop id>-stockroom` in the same region, and the project's
   Realtime Database in `us-central1` (it has no Montréal location). One in the wrong place, or a bucket name another
   project holds, stops the run too (plan 1.20).
6. Create the web app ("Shop"), build the public profile from its settings, check it with `profile/profile.js`, and
   save it to the registry and to the per-shop `/shop-profile.js` file (`profileFiles`). With the stockroom in the plan
   the profile's `stockroom` block names its database and bucket. Every switch is written down,
   as `false` for a new shop; a re-run keeps a switch the saved profile already has. The step's audit entry carries
   the switches it wrote (`detail`; a step's `act` may return `{ detail }` and the runner records it).

Google is reached only through the injected `google` clients (shape at the top of `steps.js`). There is no real client
in this folder yet, so nothing here can create a real project. `fakes.js` has a pretend Google; `test-shop.js` holds the
made-up test shop (`lmb-test-shop`) and made-up folder and billing ids.

## Steps 7–16 (`later-steps.js`, `payments.js`)

`laterSteps({ deploy, envFiles, google, shopData, providers, email, siteCheck, registry, config })` returns steps 7–15;
`shopSteps({ config, ...clients })` returns all fifteen. `config` adds `release` (`{ version, starterContent(shop) }`)
and `senderEmail` (the platform's sending address) to the folder and billing account. Each step stops for a person
when what it finds is neither done nor untouched:

7. Deploy the rules and indexes for the plan's apps. Another release already live stops the run (this applies to 8 and
   9 too); rules for the wrong apps are deployed again.
8. Write `functions/.env.<project id>` (`SHOP_OWNER_EMAIL`, `SHOP_SENDER_NAME`, `SHOP_SENDER_EMAIL`, `SHOP_SITE_URL`,
   `SHOP_EXTRA_ORIGINS` from the registry row's `domains` (the press's own addresses, `services/domains`; empty at first, so writing the file again never drops one), `SHOP_PAYMENT_PROVIDER` from the press's choice, `SHOP_FUNCTIONS_REGION`, `SHOP_TEST_SHOP` `"true"` only for the test shop and `"false"` for every other, `SHOP_STOCKROOM_DATABASE` (the stockroom's named database, where the shop's link to it reads and writes; plan 1.21), `SHOP_PAYMENT_MODE="platform"` and
   `SHOP_PAYMENTS_SERVICE_URL` from `config.paymentsServiceUrl` (https), and `PLATFORM_EMAIL_URL` when `config.platformEmailUrl` is set: the shared email sender for shops without their own Gmail; `PLATFORM_DOMAINS_URL` when `config.platformDomainsUrl` is set; `PLATFORM_ACCOUNTING_URL` when `config.platformAccountingUrl` is set: the QuickBooks link). Before the deploy it gives the shop
   its **service key** (`serviceKey.js`): one random key per shop in the Functions secret `PLATFORM_SERVICE_KEY` of the
   shop's project (`google.secrets.latest` / `add`), its SHA-256 alone in the registry (`serviceKeyHash`). A re-run keeps
   a key the registry already knows ("kept"), records the hash of a key a halfway run left ("recorded"), and makes one
   only when the secret has none ("created"); the audit entry says which, never the key. Then it deploys the server
   code with the region passed explicitly (`northamerica-northeast1`). Server code already in another region stops the run. Skipped for a stockroom-only plan.
9. Deploy the pages of each app in the plan. The deploy client picks the Hosting site and returns its address.
10. Give the nightly backup its permission and make the first backup.
11. Write a test file, then read it without signing in: refused passes; a read that works stops the run (the shop's
    files would be public); any other answer stops it too.
12. Create the owner's `members/<email>` entry (role `owner`), `firstWeek/start` (the sign-up answer `sellingToday` and
    the plan, for the Overview's first-week list, plan 3.3; shops with the shop app only) and the release's starter
    documents. Create only: a
    document already there is kept, whatever it holds. **The test shop** (`testShop: true`, plan "both") also gets its
    starter catalogue (`test-catalogue.js`): three printed books with 5 copies (stock tracked), a pre-order, an e-book
    and a Canada shipping zone in the shop; the three printed books in the stockroom (`stockroom` client: 5 printed,
    none sold, added only when missing); and each printed shop book linked to its stockroom book through the shop's own
    link (`inventoryLink.saveLinks`, after its connection check). The links already saved are sent back unchanged; a
    test book linked to another stockroom book stops the run for a person. The step's audit entry lists what it
    created, added and linked.
13. **Connect payments with the press's chosen provider** (`shop.paymentProvider`, Stripe when none). `payments.js`
    lists the providers: Stripe and Square (plan item 2.2b); any other name is refused at step 1. Square needs no
    client: the platform can't make a Square account, so the step records `payments: { provider: "square", mode }`
    (sandbox for a press in test mode; a saved mode is never changed) and the profile's `{ provider: "square", mode:
    "platform" }`, and the press connects their own account from Settings › Payments (the payment service saves the
    account id in the registry then). Each other provider is a client of the platform payment service
    (`findAccount`, `createAccount`, shop id as the idempotency key; `services/payments/index.js` `setupClient` for
    Stripe). The account id is saved in the registry row as `payments: { provider, accountId, mode }` (`mode`: the mode
    the account was made in; the service refuses live payments on a test account). A registry that names another provider or another account, or an account the
    service can't find, stops the run. The step also writes `payments` into the shop profile (`/shop-profile.js`:
    provider, mode `platform`, the account id and the platform's publishable keys from `config.stripePublishableKeys`,
    all public), so the card form loads on the press's account; step 6 keeps it on a re-run. Skipped for a
    stockroom-only plan. No sign-up link is made here: they expire
    within minutes, so the admin's Connect button makes one (plan item 2.10).
14. Email the owner their sign-in links through the email service, once (`wasSent`, and an idempotency key for retries).
15. Check the home page, `/admin` and `/shop-profile.js` (and the stockroom page) answer, then mark the registry row
    `live`. A shop marked `abandoned` is never made live.
16. **Test shop only** (`testShop: true`, plan "both"): turn on the shop's stockroom link through the shop's own link
    calls (`inventoryLink` client): its connection check first (a failure stops the run for a person), then sales sent
    from today, Toronto time. Done once a start day is set, so a re-run changes nothing. Every other shop skips it.

Dry run for the test shop: `node setup/dry-run.js` (pretend Google and services, changes nothing).

## Real clients (`real.js`)

`realSetupClients({ fetch, token, run, buildDir, paymentService, emailService, serviceAccount })` gives the steps their
real clients, all from `clients/` (each tested there with a fake `fetch` that checks the exact requests):

| Steps reach | Real client | Google API (from its discovery document) |
| --- | --- | --- |
| `google.projects`, `google.billing` | `clients/google.js` | Resource Manager v3, Cloud Billing v1 |
| `google.firebase` | `clients/google.js` | Firebase Management v1beta1 (add Firebase, web apps, their settings) |
| `google.services` | `clients/google.js` | Service Usage v1 (batches of 20) |
| `google.firestore`, `google.storage` | `clients/google.js` | Firestore Admin v1, Firebase Storage v1beta (default bucket) |
| `google.backups` | `clients/google.js` | IAM policy on the project (the functions' account gets `roles/datastore.importExportAdmin`), Cloud Storage (latest `backups/<day>/`), Firestore export |
| `google.storageProbe` | `clients/google.js` | Cloud Storage upload; the unsigned read goes to the address the shop's pages read files from |
| `deploy` | `clients/deploy.js` | Reads what is live over REST (rules stamp, functions' `SHOP_RELEASE_VERSION`, Hosting release message); deploys with the Firebase command line in the release's build folder |
| `envFiles`, `profileFiles` | `clients/shop.js` | Registry documents `shops/<id>/files/<name>`, copied into each shop's deploy by the release build |
| `shopData`, `stockroom` | `clients/shop.js` | Firestore: the shop's database, the stockroom's named database `stockroom` (plan 1.20) |
| `inventoryLink` | `clients/shop.js` | The shop's own link admin call, as the test owner (`clients/identity.js`); test shop only |
| `siteCheck` | `clients/shop.js` | A plain GET |
| `registry`, `auditLog` | `clients/registry.js` | Firestore in the platform project, and the shop's `audit-log` |
| `providers.stripe`, `email` | `services/payments`, `services/email` | The services themselves; their stores are `clients/stores.js` |

Two things are not hand-written over REST: deploying Cloud Functions and uploading Hosting files. Both go through the
Firebase command line, as the shop's own deploy workflow does. Functions need their source built and uploaded, and the
Hosting upload address could not be confirmed from Google's docs from here.

Not yet: a command that runs the shop maker against the real clients (it needs the platform project and its account,
Julian's step 1–2 in `docs/test-shop.md`); the bot-check key in the profile (left out, so the app's build setting is used); a book page in the shop
check (a new press has no books; the test shop's starter catalogue now has five, so the release check's book page
can use one).

Open points from 1.30:

- **Functions region (closed by 1.15).** `apps/shop/functions/shopConfig.js` reads `SHOP_FUNCTIONS_REGION`, which step 8
  writes, for every function and the Stripe webhook and download links. The shop copy's `firebase.json` still names
  `nam5` for Firestore; that only matters if a deploy creates the database, and step 5 creates it first in
  `northamerica-northeast1`.
- **Stockroom rules and Hosting site (1.20).** The stockroom deploys from its own config
  (`apps/stockroom/scripts/deployConfig.mjs`): site `<shop id>-stockroom`, named database `stockroom`, bucket
  `<shop id>-stockroom`, the project's Realtime Database. The deploy client creates that Hosting site before step 9's
  first stockroom deploy. Step 11 checks the shop's bucket only; the stockroom's bucket has the same closed rules.
- **Starter documents** come from the release, since the shop copy owns their shape (see 1.23 for theme presets).
