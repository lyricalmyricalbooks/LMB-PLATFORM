# Domain service

A press puts their shop on their own web address from the shop's settings (code plan 2.9). Plain Node 22 ES modules,
no packages; tests use a pretend Firebase Hosting and a pretend deploy (`domains.test.js`, `fakes.js`).

## How it works

1. **The press types the address** in their shop's admin (Settings › General › Your web address). The shop's server
   calls this service with its service key (`X-Shop-Id` + `Authorization: Bearer`), like the payment and email services.
2. **The address is saved** in the shop's registry row (`domains: [{ name, state, addedAt, paymentDomainAt? }]`), at
   most three per shop, and never one another shop has, the platform's own or a Firebase address.
3. **The shop's server code accepts calls from it**: the saved settings file gets `SHOP_EXTRA_ORIGINS` (every address the
   shop has) and the server code is deployed again at the version the shop runs. This comes before Hosting serves the
   shop there, so checkout works on the new address from its first visit. Setup step 8 writes the same line from the
   registry, so running setup again never drops an address.
4. **Firebase Hosting is asked to serve the shop there** (`customDomains.create` on the shop's default site).
5. **The press adds the DNS records** the admin lists (from Google's `requiredDnsUpdates`: records to add and to
   remove). `domains.check` reads where it stands: `waiting_dns`, `securing` (the certificate), `live`, or `conflict`
   (another Firebase project has it).
6. **Once live**, the address is registered with Stripe for Apple Pay and Google Pay on the press's account
   (`services/payments` `registerPaymentDomain`). Square's checkout page is Square's own, so a Square shop needs none.
7. **Make main** (plan 5.9): a live address becomes the shop's main address (registry `mainDomain`). It is checked
   again first (which also registers it for Apple Pay and Google Pay). Then the server settings get
   `SHOP_SITE_URL="https://<main>"` (emails and the links in them) and the server code is redeployed at the version the
   shop runs; the shop profile's `siteUrl` (canonical links, the sitemap, the Google feed) is rewritten and the pages are
   redeployed. Making the shop's own `<project>.web.app` address main (or sending an empty domain) goes back to it.
8. **Remove** (plan 5.9): Firebase Hosting stops serving the shop there (`customDomains.delete`), the registry drops it,
   and the server settings stop listing it (redeployed). Refused for the main address (`is_main`: make another one main
   first) and for the shop's own web.app address (`own_address`), so a shop always has a working main address.

Every step is safe to repeat and is logged in the registry and the shop's audit log. A deploy that fails leaves the saved
settings (server file, registry profile) as they were, so the next call deploys again. Every call acts only on the
calling shop's own registry row and Firebase project: another shop's address answers `unknown_domain` and is never
touched.

## The calls

All through `POST /shop` with the shop's service key (`X-Shop-Id` + `Authorization: Bearer`), body `{ op, args }`.
Answers are `{ status, body }`; a refusal is `{ error: { code, message } }` with `message` in plain words for the press.

| op | args | answer | refusals |
| --- | --- | --- | --- |
| `domains.list` | none | `{ domains: [{ name, state, addedAt, paymentDomainAt, main }], own, main, max }` | |
| `domains.add` | `{ domain }` | the `domains.check` answer | `bad_domain` 400, `too_many` 409, `in_use` 409 |
| `domains.check` | `{ domain }` | `{ name, state, records: [{ action, host, type, value }], paymentDomain }` | `unknown_domain` 404 |
| `domains.makeMain` | `{ domain }` (empty or the web.app name: back to it) | the list, plus `paymentDomain` | `unknown_domain` 404, `not_live` 409 |
| `domains.remove` | `{ domain }` | the list, plus `removed` | `own_address` 400, `unknown_domain` 404, `is_main` 409 |

`state` is `connecting`, `waiting_dns`, `securing`, `live`, `conflict` or `missing`. Google failing is 502
`google_error`. A one-step connect (plan 6.15) can build on these calls: `add`, then `check` until `live`, then
`makeMain`.

## Files

- `domains.js`: `createDomainService({ registry, auditLog, hosting, envFiles, profileFiles, deploy, payments,
  platformDomain })` and `domainState` (Google's state in the press's terms). `hosting` is `clients/google.js`
  `hosting`; `profileFiles` the per-shop /shop-profile.js store (setup step 6); `payments` the payment service.
- `names.js`: address rules (`normalDomain`, `domainProblem`, `MAX_DOMAINS`), the settings lines (`domainOrigins`,
  `withExtraOrigins`, `withSiteUrl`) and the main address (`ownAddress`, `mainAddress`, `siteUrlOf`), shared with setup
  steps 6 and 8 so a re-run keeps the press's choice.
- `http.js`: `handleDomains(request, { service })`, the door (`POST /shop`).
- `fakes.js`: the pretend Hosting, deploy, settings files and profile files.

## Not yet

- Hosting this service (one function in the platform project) and writing its address into the shops' settings
  (`PLATFORM_DOMAINS_URL`, like `PLATFORM_EMAIL_URL`).
- Stripe keeps a removed address's Apple Pay registration (harmless: nothing is served there any more).
- The shop's own copy of the sitemap is written only by a full shop build; platform shops' pages skip it (see
  `services/release-runner/builder.js`), so the main address reaches the sitemap whenever that build runs.
- Two adds for one shop at the same moment could overwrite each other's registry entry; the admin sends one at a time.
