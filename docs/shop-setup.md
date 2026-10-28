# Setting up a new shop

The steps the shop maker (`setup/`) runs to give a press its own copy. Phase 1 runs them by hand from one command for
the first presses; Phase 2 runs the same code from sign-up. Write the code once, as these steps.

## Rules every step follows

- **Numbered and re-runnable.** Running a step twice does nothing new. A failed run resumes at the step that failed.
- **Checks before it acts.** Each step first looks at whether its work is already done ("project exists?") and skips if so.
- **Logged twice.** Each step writes `{ step, status, startedAt, finishedAt, error? }` to the shop registry in the
  platform project and, once the shop's database exists, to that shop's `audit-log` collection.
- **Never deletes a project to start over.** Deleted Google Cloud projects linger 30 days and their ID can't be reused.
  A broken setup is resumed or retried, or the project is marked `abandoned` in the registry and left for cleanup.
- **One run per shop at a time.** A run holds the shop's lock in the registry; a second run on the same shop stops
  without changing anything. A crashed run's lock lapses after an hour.
- **No platform keys in the shop.** The Stripe platform key and the email sender key stay in the platform's services
  (see `payments.md`). The shop project only gets keys that belong to that press.

## Inputs

| Input | Example | From |
| --- | --- | --- |
| Shop ID (also the project ID suffix) | `mothpress` | sign-up, checked unique in the registry |
| Press name | Moth Press | sign-up |
| Owner email | owner@example.com | sign-up |
| Plan | shop, stockroom or both | sign-up |
| Country and currency | CA, CAD | sign-up |
| Payment provider | stripe (square later) | sign-up; Stripe when not chosen |

## The steps

| # | Step | Checks first | Done when |
| --- | --- | --- | --- |
| 1 | Reserve the shop ID in the registry | ID free or already this shop's | registry row `status: creating` |
| 2 | Create the Google Cloud project in the `shops` folder, link billing | project exists | project active and billed |
| 3 | Add Firebase to the project | Firebase already added | Firebase project ready |
| 4 | Turn on services: Firestore, Storage, Auth, Functions, Hosting, Cloud Build, Artifact Registry, Eventarc, Scheduler, Secret Manager, App Check, IAM | each service on | all listed services on |
| 5 | Create the Firestore database (region from country) and the Storage bucket; with the stockroom in the plan, also its own named database `stockroom`, its bucket `<shop id>-stockroom` and the Realtime Database (us-central1, the only nearby choice) | database exists | databases and buckets exist |
| 6 | Create the web app; write the shop profile (Firebase config, site address, bot-check key) to the registry and to a per-shop file Hosting serves | profile matches | shop can read its profile at page open |
| 7 | Deploy security rules and indexes for the shop (and the stockroom when the plan includes it) | deployed version = release version | rules live |
| 8 | Write the shop's server details to `functions/.env.<project id>` (`SHOP_OWNER_EMAIL`, `SHOP_SENDER_NAME`, `SHOP_SENDER_EMAIL`, `SHOP_SITE_URL`, `SHOP_EXTRA_ORIGINS` even empty, `SHOP_PAYMENT_PROVIDER` from the press's choice, `SHOP_FUNCTIONS_REGION`, `SHOP_TEST_SHOP` `"true"` only for the platform test shop and `"false"` otherwise; read by `functions/shopConfig.js`, which refuses a provider it hasn't built), then deploy the shop's server code from the current release | deployed version = release version | functions live |
| 9 | Deploy the shop and stockroom pages from the current release | deployed version = release version | site answers on its Firebase address |
| 10 | Grant the nightly backup its permission and run one backup | backup permission present | a backup file exists |
| 11 | Check storage is private: an unsigned read of a test file is refused | a recent pass recorded | refused as expected |
| 12 | Write starter content and settings (theme, currency, shipping zone, owner as admin member) | settings doc exists | admin opens with the setup checklist |
| 13 | Connect payments with the provider the press chose (Stripe now; Square planned, 2.2b): create the press's account through the payments service and save the provider and account ID | account ID saved and found at the provider | the press finishes sign-up from the admin's Connect button |
| 14 | Email the owner their sign-in link (via the email service) | email logged as sent | email sent |
| 15 | Run the shop check: home page, a book page, admin sign-in | — | all pass; registry `status: live` |
| 16 | Test shop only: turn on its stockroom link (the shop's connection check, then sales sent from today) | link has a start day | link on |

Steps 2–5 borrow the service list and backup permission from a public Firebase project factory
(https://github.com/cilly-yllic/terraform-google-firebase-project-factory). Plain Node scripts using Google's APIs are
enough. Terraform isn't needed.

## What has to change in the shop and stockroom first

Before step 6 can work, the apps must read their settings when the page opens instead of having them baked into the
build:

- Shop: the Firebase config in `src/lib/firebaseApp.ts`, the project ID in `src/app/lib/functionsBase.ts`, the site
  address in `vite.config.ts`, and the bot-check key in `src/lib/appCheck.ts`.
- Stockroom: the Firebase config in `src/firebase.js`, and hosting moves from GitHub Pages to each shop's Firebase
  Hosting (its own site `<shop id>-stockroom`, built by `apps/stockroom/scripts/deployConfig.mjs`, plan 1.20).

## Open questions

- Who pays for each shop project: one platform billing account, with the cost in the subscription price (assumed here)?
- Region choice for presses outside North America.
