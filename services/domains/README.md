# Domain service

**In the shared system** (`docs/shared-system.md`) the service runs on the hosted server (`hosted.js`, `/api/domains`)
for shops with `shared: true` only. Their addresses also go in the front door's address book (`addresses/{host}`, before
Hosting serves them, out after), and steps 3 and 7 below write the shop's record (`server`, `profile`) instead of a
settings file and a deploy (`domains.js` `syncRecord`). Everything else below is the same.

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
`google_error`.

## Connect in one step (plan 6.15)

`domains.connect { domain }` is `add` plus the way to finish: it looks up where the press bought the domain (a public
lookup, `sellers.js`: the registry's own answer for the seller, and the zone's `_domainconnect` line for that seller's
Domain Connect settings) and answers the `domains.check` answer plus:

- `way: "allow"`, `seller`, `allowUrl`: the seller works with Colophon (its settings say the template is registered).
  `allowUrl` is the seller's own sign-in-and-Allow window, with Colophon's template filled in (the lines Firebase Hosting
  asks for) and **signed with the platform's private key** (`domainConnect.js` `allowLink`; the key is read only in
  `config.js` from `DOMAIN_CONNECT_*` and never leaves this service). The press says yes there, and the seller sends
  them back to `GET /allowed?shop=&domain=&state=`, which records it (only for the `state` this service made, once) and
  sends them on to their shop's web address settings.
- `way: "guide"`, `guide`: any other seller, or no key set, or lines that don't fit the template. The guide is
  `{ seller, zone, steps, lines: [{ action, kind, name, value }], message: { subject, body } }` in plain words: `kind` is
  Address, Text, Mail or Alias, never a technical name, names are relative to the seller's zone, and the shop shows a
  Copy button on every line and a mail to the press's web person. Also given alongside `allowUrl`, as "do it yourself".

`check` keeps both current (a new `allowUrl` only when the lines asked for change) and the sweep `checkAll()` (run
every few minutes by the platform's scheduler) checks every address not live yet. When an address connected this way
goes `live` (certificate and all) the owner gets one `domain-live` email, never twice. The free web.app address keeps
working throughout. No one is told a record type, DNS or CNAME.

Platform-only calls (not on the shop's door), reached by the Google link and the own-domain sender through
`google/domainBridge.js` `domainsCall`:

| call | answer |
| --- | --- |
| `applyRecords(shopId, { domain, records, purpose })`, `purpose` `email` (6.18) or `google` (6.17) | `{ waiting: true }` until the press allowed them (the same Allow link then carries those groups too) or the lines show from outside, then `{ done: true }`. Re-running with the same lines changes nothing |
| `removeRecords(shopId, { domain, purpose })` | `{ done: true }`; the lines are forgotten. Safe to repeat |
| `removeDomain(shopId, { domain, deleting })` | `{ done: true, removed }` |

**Rule for `removeDomain`:** without `deleting: true` it is `domains.remove`, so the **main address is refused**
(`is_main`) while the shop runs, and the shop always keeps a working main address. With `deleting: true` the address
comes off hosting and out of the registry even if it is the main one (and `mainDomain` is cleared), with no redeploy:
only the 6.8 deletion hook (`google/teardown.js`) passes it, after the warning emails, since the shop's project is deleted
right after. An address that is gone already answers `{ done: true, removed: null }`. Every call is audit-logged.

Settings (platform, from the environment): `DOMAIN_CONNECT_PROVIDER_ID`, `DOMAIN_CONNECT_PRIVATE_KEY` (RSA, PEM),
`DOMAIN_CONNECT_REDIRECT_URL` (this service's `/allowed`), optional `DOMAIN_CONNECT_SERVICE_ID` (`shop`) and
`DOMAIN_CONNECT_KEY_HOST` (`_dck1`). Without them every press gets the guide. `domainConnect.js` `colophonTemplate()`
builds the template file Julian registers with each seller (a one-time step), and the public key goes in a text line
`<key host>.<provider id>` on the platform's own domain.

## Files

- `domains.js`: `createDomainService({ registry, auditLog, hosting, envFiles, profileFiles, deploy, payments,
  platformDomain })` and `domainState` (Google's state in the press's terms). `hosting` is `clients/google.js`
  `hosting`; `profileFiles` the per-shop /shop-profile.js store (setup step 6); `payments` the payment service.
- `names.js`: address rules (`normalDomain`, `domainProblem`, `MAX_DOMAINS`), the settings lines (`domainOrigins`,
  `withExtraOrigins`, `withSiteUrl`) and the main address (`ownAddress`, `mainAddress`, `siteUrlOf`), shared with setup
  steps 6 and 8 so a re-run keeps the press's choice.
- `http.js`: `handleDomains(request, { service })`, the doors (`POST /shop`, `GET /allowed`).
- `domainConnect.js`: Colophon's template (`TEMPLATE_GROUPS`, `colophonTemplate`), fitting lines to it (`fitTemplate`)
  and the signed Allow link (`allowLink`). `config.js`: the `DOMAIN_CONNECT_*` settings. `sellers.js`: the public seller
  lookup (`sellerLookupClient`), the lines-seen-from-outside check (`publicLinesClient`) and the guide per seller.
- `fakes.js`: the pretend Hosting, deploy, settings files, profile files, seller lookup, outside view and platform email.

## Not yet

- The scheduler that runs `checkAll()` every few minutes, and the real `sellers` / `publicLines` wiring (RDAP over
  `fetch`, Node's resolver), the template registration with each seller, and the public key line, all with hosting.

- Hosting this service (one function in the platform project) and writing its address into the shops' settings
  (`PLATFORM_DOMAINS_URL`, like `PLATFORM_EMAIL_URL`).
- Stripe keeps a removed address's Apple Pay registration (harmless: nothing is served there any more).
- The shop's own copy of the sitemap is written only by a full shop build; platform shops' pages skip it (see
  `services/release-runner/builder.js`), so the main address reaches the sitemap whenever that build runs.
- Two adds for one shop at the same moment could overwrite each other's registry entry; the admin sends one at a time.

## A domain brought in setup, and www

`domains.connect` takes `{ main, www, redirectTo }` (platform calls; the shop's door sends `www` on by default):

- `main: true` marks the address `mainWhenLive`: the first check that finds it live makes it the main address, unless
  the press already chose a main address of its own (a free address doesn't count: the press's domain takes over from it).
- `www: true` connects the partner of a bare domain (`www.<domain>`, or the bare one for a www name) as a Hosting
  redirect (`redirectTarget`) to the main one. It never becomes main, and failing to add it never stops the main one.

The shop maker (`signup/shopMaker.js connectAddresses`) calls `connect(shopId, press.domain, { main: true, www: true })`
for the domain a press kept in setup (`POST /api/press/domain`, signup/frontDoor.js).

## Free addresses (freeAddress.js, platformZone.js)

With `SHOP_ADDRESS_DOMAIN`, `SHOP_ADDRESS_ZONE` and `SHOP_ADDRESS_ZONE_PROJECT` set, every shop gets
`<press name>.<shop domain>` (`moth-press.shops.example`; `moth-press-2` when the name is taken), the way the big shop
builders give every shop a name on their own domain. `connectFreeAddress(shopId)` picks the name once (registry
`freeAddress`), adds it as a `free: true` entry (not counted in the three a press may add, never removable by the press)
and writes Hosting's lines in the platform's own Cloud DNS zone on every check until it is live. It becomes main once
live, unless the press's own domain is main. The shop domain must be a domain of its own, never the platform's or one
under it, so a shop's pages can never read the platform's sign-in. Unset, shops keep their `<project id>.web.app` address.

- **The press's own pick.** Setup's `freeName` (signup/pressRecord.js) is used instead of the press name when it can be
  (`connectFreeAddress(shopId, { handle })`). `handleProblem` refuses names the platform keeps (www, admin, help,
  checkout …), big brands' names and rude words (whole words of the name), so an address under the platform's name
  never passes as someone else's. A press name that can't be an address gets `my-shop`.
- **A new name later** (`domains.renameFree { name }`, Settings › General › Change name): refused when another shop
  has it. The one before stays as `former: true`, keeps opening the shop and stays main until the new one is live; then
  it sends visitors on to the new one (`hosting.redirectDomain`, customDomains.patch) and the press may remove it.
  Taking back a name that sends on removes and re-adds it in Hosting so it serves the shop again.
- **Setup's check while typing**: `POST /api/press/free-name` (frontDoor.js checkFreeName, `freeAddressTaken` over the
  registry). A press whose own name can't be an address (`freeNameNeeded`) is asked for one. Only one former address is kept: the next rename takes the older one off (Hosting and zone).
- **Email.** `free-address-live` goes once when the current free address works (the welcome email goes out before it
  exists).
