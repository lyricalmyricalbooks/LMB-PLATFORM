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

## 26.3 (built): the app connection, reading

`services/apps/connection.js`, answered by the hosted server under `/api/apps/v1` (Hosting already sends `/api/**` to it).
The app sends its key as `Authorization: Bearer cak_…`. All calls are GET and answer JSON with `ok`:

| Call | Permission | Answers |
| --- | --- | --- |
| `/api/apps/v1/shop` | `read_shop` | name, web address, currency |
| `/api/apps/v1/products?limit&after` and `/products/<id>` | `read_products` | products; stock too with `read_inventory` |
| `/api/apps/v1/inventory?limit&after` | `read_inventory` | how many of each product and variant |
| `/api/apps/v1/orders?limit&after&since&status` and `/orders/<id>` | `read_orders` | paid orders, newest first, with where they ship; email and phone only with `read_customers` |

`/api/apps/v1/alerts?since&limit&after` (no permission needed) lists the alerts queued for the app, oldest first, with
`delivered`, so an app whose server was down can catch up.

Lists page with `next` (pass it back as `after`), at most 250 a page. At most 120 calls a minute per app and shop
(429 with `Retry-After`). Never answered: cost prices, payment details, private notes, test or unpaid orders.

## 26.3b (part built): the app connection, changing

Apps never change a shop directly. The platform checks the key and permission, writes a request to the shop's
`appRequests/<id>` with its own access, and the shop's `onAppRequest` function applies it with the shop's own checks
(`apps/shop/functions/appRequests.js`), then writes the answer on the same document. No shop rule lets shoppers or
staff read or write `appRequests`.

| Call | Permission | What |
| --- | --- | --- |
| `POST /api/apps/v1/orders/<id>/fulfillment` | `write_orders` | `{ trackingCarrier, trackingNumber, trackingUrl?, shipped? }`: add tracking and mark sent (`shipped: false` only adds tracking) |
| `POST /api/apps/v1/inventory/<productId>` | `write_inventory` | `{ change, variantId?, expected? }`: add or take copies; with `expected`, only if the stock is still that |
| `GET /api/apps/v1/requests/<id>` | the app that asked | `{ status: waiting \| done \| refused, result, reason }` |

The POST waits up to 5 seconds for the shop's answer (200), else answers 202 with the request to look up. An
`Idempotency-Key` header makes a retry return the first request; the same key with a different order or tracking is
refused (409). Each order line carries `quantityToSend`, the copies still to pack after some went ahead or were
refunded. Marking sent uses the same checks as a dispatch from
the stockroom app (paid, not a test, ships by carrier, no open request, dispute, hold, failed refund, label being bought
or waiting pre-order), and tracking the shop or another app put on an order is never replaced (nor can the shop buy a
second label on top of an app's). The customer gets the
usual shipped email. Stock changes are refused for items whose stock comes from the stockroom (it would undo them) and
items that don't count stock; stock never goes below 0, and checkout holds are untouched.

Product changes come next, the same way.

## 26.5 (part built): apps in the shop's admin

**Settings › Apps** (`AppsSettings.tsx`, `apps.css`, `appActivity.ts`) has three tabs, like the big platforms' Apps page:

- **Installed**: one row per app with its category picture, a chip per permission ("Changes orders", "Sees customers";
  ones with customers' personal details are marked), Help (the app's support email) and Remove (asks first).
- **App store**: every listed app as a card, filtered by category. Details shows the description and "It can" list;
  Add opens the app's install address (`installAddress` when its maker gave one, with `?shop=<shopId>`, else its
  website), which leads to the permission page.
- **Activity**: every request an app made (`appRequests`, read from the shop's own Firestore): the change in plain words,
  Done / Refused / Waiting and the shop's reason. Admins can read `appRequests`; nobody writes them from the browser.

Installed and the store come through the **shop door**: the shop's server action `apps` (`functions/appsLink.js`,
admins only) posts `{op, args}` to `POST /api/apps/shop` (`services/apps/shopDoor.js`) with `X-Shop-Id` and the shop's
service key, the same pattern as the email and payments doors. Ops: `apps.installed`, `apps.store` (listed apps plus
categories), `apps.remove` (recorded as `shop admin: <email>`). The address is `PLATFORM_APPS_URL` in the shop's settings
(`setup/later-steps.js` for a shop with its own project; `sharedServerEnv` in `services/release-runner/shared.js` for
every shop on the shared system, since 12 November 2026); without it the two tabs say "The app store opens soon" and only Activity works.

The permission page (`accounts/install.html`) uses the same category picture, names the shop (`shopName` in the preview)
and lists the permissions with the same "Personal details" tag. An app already added shows "Added" and the button reads
"Update access".

## 26.4 (built): alerts to apps

`services/apps/alerts.js`, run by the `app-alerts` job every minute. An app lists `alertTopics` when it registers, each
needing its permission (`services/apps/topics.js`): `orders/paid`, `orders/shipped`, `orders/refunded`,
`products/changed`, `inventory/changed`. `app/uninstalled` goes to every app with an alerts address.

The message is a POST of `{ id, topic, shopId, createdAt, data }`, with `X-Colophon-Topic`, `X-Colophon-Shop`,
`X-Colophon-Alert-Id` and `X-Colophon-Signature`: Base64 HMAC-SHA256 of the body, keyed with the SHA-256 (hex) of the
app's secret. A 2xx answer within 10 seconds counts. Retries after 1, 5, 15, 60, 180, 360 and 720 minutes, then the alert
is marked failed. Only public https addresses are sent to (no IP numbers or local names). Outbox `appAlerts/<id>`, last
look `appAlertState/<shopId>`.

The platform finds changes by reading orders and products changed since its last look, so the shops need no change.

## 26.11 (first part built): Chit Chats, the shipping app

Colophon's own app for [Chit Chats](https://chitchats.com/docs/api/v1), the Canadian discount courier, built on the same
plumbing any app uses (`services/chitchats/`). The shop already buys labels itself; this app is for presses who ship
through Chit Chats for its cheaper rates.

1. Settings › Apps › Add opens `/account/chitchats.html?shop=<id>` (`accounts/chitchats.html`). The page sends the owner
   through the permission page (`read_orders`, `write_orders`, alert `orders/paid`), and back with a code.
2. The owner gives the Chit Chats client ID and access token (Chit Chats › Settings › Developer) and their usual parcel.
   `POST /api/chitchats/connect` checks them with Chit Chats, swaps the code for the app's key (`installs.exchange`) and
   keeps both sealed (`CHITCHATS_SEAL_KEY`, `services/payments/tokenSeal.js`) in `chitchatsShops/<shopId>`.
3. A paid order's alert reaches `POST /api/chitchats/alerts` (signed like every app alert). The app makes one Chit Chats
   shipment for it with `postage_type: "unknown"`, so nothing is bought: the press picks and pays for postage on Chit
   Chats. Pickup and digital orders are skipped; an order with no full address is noted for the press.
4. Every 10 minutes the `chitchats-tracking` job looks up open shipments. Once one has a tracking number, the app marks the
   order sent through `POST /api/apps/v1/orders/<id>/fulfillment`, and the shop sends the usual shipped email.
5. Disconnecting, or removing the app (alert `app/uninstalled`, or a key that stops working), forgets the details.

Turning it on: nothing to do. Chit Chats is one of Colophon's own apps (below), so it lists itself and has its secret
and sealing key from the start. `CHITCHATS_APP_ID`, `CHITCHATS_APP_SECRET` and `CHITCHATS_SEAL_KEY` still win when
set. Try it first against Chit Chats' sandbox (`https://staging.chitchats.com`) with a test press.

Company logos on store cards: an app listing may carry `brand` (an id from `shared/brand-logos`), accepted only from the
platform team's own apps, so an outside maker can't borrow a company's logo. The shop shows that logo in place of the
category picture.

## 26.12 (first part built): Mailchimp, the email marketing app

Colophon's own Mailchimp app (`services/mailchimp/`), on the same plumbing as any app. It asks for `read_orders` and
`write_customers` and the alerts `orders/paid` and `app/uninstalled`.

1. Settings › Apps › Add opens `/account/mailchimp.html?shop=<id>`. The page sends the owner through the permission
   page; back with a code, `POST /api/mailchimp/begin` swaps it for the app's key and answers Mailchimp's own "allow"
   address. Mailchimp sends the owner back to the same page with its code; `POST /api/mailchimp/finish` keeps the press's
   Mailchimp token sealed (`mailchimpShops/<shopId>`) and, when the account has more than one audience, the owner picks
   one (`/api/mailchimp/audience`; `/api/mailchimp/lists` to change it later).
2. Every 15 minutes the `mailchimp-sync` job, per connected shop:
   - reads `GET /api/apps/v1/subscribers` (confirmed readers who never unsubscribed) and adds new ones to the audience,
     tagged "Shop newsletter" (`status_if_new`, so someone who left in Mailchimp stays out);
   - reads `GET /api/apps/v1/unsubscribes` (opt-out fingerprints only) and unsubscribes the matching people it sent;
   - reads Mailchimp's unsubscribed members since the last run and, for people it sent, asks the shop to record the
     opt-out (`POST /api/apps/v1/subscribers/unsubscribe`, applied by the shop's `newsletter.unsubscribe` request).
3. A paid order's alert tags a buyer who is on the list "Customer" and "Bought: <title>". A buyer who never joined the
   newsletter is never sent or looked up.
4. The app keeps no addresses: per person, the shop's opt-out fingerprint and Mailchimp's member id. Disconnecting or
   removing the app forgets the shop and every fingerprint.

Only calls Mailchimp documents are used (`services/mailchimp/client.js` lists them). `services/apps/ownApps.test.js`
runs it end to end against a pretend Mailchimp.

Turning it on (Julian, about 5 minutes): on Mailchimp's Registered Apps page (https://admin.mailchimp.com/account/oauth2/), Register an app with the
redirect address `https://<platform address>/account/mailchimp.html`. Put its client ID and secret in Secret Manager as
`mailchimp-client-id` and `mailchimp-client-secret`, then run the deploy. Until both are there, Mailchimp stays off the
store, so no press can find an app that can't connect.

## 26.13 (built, waiting for Zapier): Zapier

Colophon's own Zapier app (`services/zapier/`, its README has the table). Zapier runs it; it reaches the platform only
through the app connection with the key a press gives it, so it can do only what the owner allowed.

- Triggers: New Paid Order, New Newsletter Reader, Product Added or Changed (Zapier asks every few minutes).
- Actions: Add Tracking to an Order (the shop sends its usual shipped email) and Change Stock, both through the shop's
  own rules (`appRequests`), with an Idempotency-Key so a retry from Zapier never marks an order twice.
- Sign-in: Zapier opens the permission page without a shop. The page now uses the press's one shop they own, or asks
  which (`accounts/install.js`), then sends them back to Zapier with the code, swapped at `/api/apps/oauth/token`.
- It lists itself on the store (`ownApps.js`) once `ZAPIER_INVITE_URL` and `ZAPIER_RETURN_ADDRESS` are in
  `server/env.yaml`. Add on the store sends the press to the invite link.
- `services/apps/ownApps.test.js` runs the Zapier app the way Zapier calls it, against the real token exchange and app
  connection: sign-in, every trigger, both actions, a retry, a refused change, and removal stopping it at once.

Turning it on (Julian): `services/zapier/README.md` › Putting it on Zapier.

## Colophon's own apps (11 November 2026)

The apps the platform team builds (Chit Chats, Mailchimp and Zapier) put themselves on the store
(`services/apps/ownApps.js`), so no one registers, approves or configures them before a press can add one.

- Each has a fixed id (`ownAppId(name)`), and its secret and sealing key are made from one platform secret through their
  own HMAC labels: `OWN_APPS_SECRET` when set, else the `CHECKUP_SECRET` link phrase the server already needs. Nothing
  new goes in Secret Manager. Changing that secret means presses connect these apps again.
- `ensure()` runs before the store is read (`makers.storeList`) and before every app-alerts sweep. It writes the app as
  listed and approved by "Colophon", only when its details changed, keeps a logo the team set, and never puts back an
  app an admin took off the store. Its details pass the same checks as any maker's (`makers.detailsFrom`).
- Control room › Apps shows them as "ours", so the team can set a company logo or take one off the store as usual.
- `services/apps/ownApps.test.js` runs Chit Chats through the real plumbing: the store, the permission page, connect, a
  paid order's alert, the shipment, the tracking request back to the shop, and removal.

## The first apps (Julian's picks, 4 November 2026)

Shipping (26.11), email marketing (26.12) and Zapier (26.13). Outside companies rarely build for a new platform, so
Colophon builds these itself, as apps on the same plumbing any app maker uses. That proves the plumbing too.

## Needs real accounts or people

- A Zapier developer account to push the Zapier app (26.13, `services/zapier/README.md`); a Klaviyo app registration (26.12, later).
- Mailchimp: register the app and add its two secrets (26.12, "Turning it on" above), then try it with a free Mailchimp
  account on the test shop.
- A Chit Chats account (sandbox first) to try the Chit Chats app (26.11) on the test shop, and Chit Chats' permission to
  show its logo.

- A lawyer: the app developer terms (what makers promise about data, Quebec's Law 25), before the store opens (26.9).
- Stripe test mode for app charges (26.7).
- Julian: the platform's share of app charges (open decision in the code plan).
