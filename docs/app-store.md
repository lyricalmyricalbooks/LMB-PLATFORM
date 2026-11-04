# The app store (code plan Phase 26)

Outside apps can link to a press's Colophon shop, the way apps link to a Shopify store. Planned 4 November 2026.

## What Shopify does, and what we copy

| Shopify | Colophon | Row |
| --- | --- | --- |
| Partner account: app makers sign up free, each app gets an id and a secret | Any signed-in person registers apps on the platform; secret shown once, only its fingerprint kept | 26.1 |
| OAuth install: a permission screen lists the scopes, the merchant agrees, a code is swapped for a shop-only token | Same, on the platform's own site; only the shop's owner can say yes | 26.2 |
| Admin API: apps read and change the store through Shopify, never its database | `/apps/v1/…` on the platform server; the platform reads the shop's own project with its own access | 26.3 |
| Webhooks: signed messages when an order is placed, a product changes, the app is removed | Same; the shop tells the platform, the platform signs and sends | 26.4 |
| Embedded apps: the app's page shown inside the admin | Same (Settings › Apps), like the stockroom shown inside the combined admin | 26.5 |
| Theme app extensions: blocks the merchant places in the theme editor | App blocks placed and styled in Studio | 26.6 |
| Billing API: charges land on the Shopify bill, Shopify keeps a share | Charges land on the press's Colophon bill; the share is a control-room setting | 26.7 |
| App Store review and listing pages, ratings | Review in the control room, store pages on the platform site, reviews by presses | 26.8, 26.10 |
| Mandatory privacy webhooks (customer data request, redact, shop redact) | Same, written for Canada and Quebec | 26.9 |

## Why it fits one project per shop

Each press has its own Firebase project. Handing an app a shop's own keys would give it everything, forever. So apps
only ever talk to the platform: the platform checks the app's key, the permissions the owner agreed to and the fair-use
limits, then reads or changes that one shop's data with its own access. One shop's key can never reach another shop,
and removing the app ends its access at once.

## Rules

- Payments, stock holds, checkout and webhook authority stay with the shop. No app permission can weaken them: there is
  no permission to change a price inside a paid order, mark an order paid or read card details.
- An app sees only what its permissions say. Each permission has plain words for the press (`services/apps/scopes.js`).
- Secrets and keys are kept only as fingerprints (SHA-256); the real ones are shown once.
- Return addresses must match exactly, and must be https (a local address is allowed while an app is being built).
- Julian's own website and stockroom never get apps. This is product work only.

## 26.1 (built): app makers register apps

`services/apps/makers.js` `createAppMakers({ store, admins, now, newId, newSecret })`, calls in `services/apps/routes.js`:

| Call | Who | What |
| --- | --- | --- |
| `GET /api/apps/permissions` | anyone | The list of permissions in plain words |
| `GET /api/apps/store` | anyone | Approved apps (their approved copy only) |
| `POST /api/apps/maker/create` | signed in | Register an app; answers its id and its secret, once |
| `GET /api/apps/maker/mine` | signed in | Your apps |
| `POST /api/apps/maker/update` | the app's maker | Change the draft |
| `POST /api/apps/maker/secret` | the app's maker | Replace the secret (the old one stops working) |
| `POST /api/apps/maker/submit` | the app's maker | Send the draft for review |
| `POST /api/control/apps` | platform admins | Apps by status (default: waiting for review) |
| `POST /api/control/apps/approve` | platform admins | The draft becomes the listed copy |
| `POST /api/control/apps/send-back` | platform admins | Back to the maker with a reason |
| `POST /api/control/apps/unlist` | platform admins | Off the store, with a reason |

Statuses: `draft` → `in-review` → `listed`, or back to `draft` with `sentBack`; `unlisted` is off the store. An app
edited after it was listed stays listed with its approved copy until the new draft is approved. Each app is
`apps/<appId>` in the platform project (`clients/stores.js` `firestoreApps`).

`verifyClient(appId, secret)` and `returnAddressAllowed(app, address)` are ready for 26.2's code swap.

## 26.2 (built): install with permission

`services/apps/installs.js` `createAppInstalls({ apps, makers, installs, codes, roleIn, registry, auditLog })` and the
permission page `accounts/install.html` (served at `/account/install.html`).

1. The app sends the press to `/account/install.html?app=<appId>&shop=<shopId>&back=<return address>&state=<its own>`.
2. The page shows the app's name and its permissions in plain words (`POST /api/apps/install/preview`). Anyone on the
   team can look; only the owner sees Add the app (`POST /api/apps/install/approve`).
3. The press goes back to the return address with `code`, `shop` and `state`. The code lasts 10 minutes and works once.
4. The app posts `{ appId, secret, code, returnAddress }` to `POST /api/apps/oauth/token` and gets
   `{ accessToken, shopId, scopes }`. The key starts `cak_`; only its fingerprint is kept. A code used twice takes back
   the key made from it.
5. The owner removes the app with `POST /api/apps/install/remove`; `POST /api/apps/installed` lists a shop's apps.

Installs are `appInstalls/<shopId>~<appId>`, codes `appInstallCodes/<fingerprint>`. Each install, change and removal
goes in the shop's audit log and the registry's events. A draft app can be installed only by its own maker on a shop
they own (testing). `authenticate(key)` is ready for 26.3.

## The first apps (Julian's picks, 4 November 2026)

Shipping (26.11), email marketing (26.12) and Zapier (26.13). Outside companies rarely build for a new platform, so
Colophon builds these itself, as apps on the same plumbing any app maker uses. That proves the plumbing too.

## Needs real accounts or people

- A Zapier developer account to publish the Zapier app (26.13); Mailchimp and Klaviyo app registrations (26.12).

- A lawyer: the app developer terms (what makers promise about data, Quebec's Law 25), before the store opens (26.9).
- Stripe test mode for app charges (26.7).
- Julian: the platform's share of app charges (open decision in the code plan).
