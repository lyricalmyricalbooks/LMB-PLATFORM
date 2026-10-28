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

Every step is safe to repeat and is logged in the registry and the shop's audit log. Nothing here removes an address.

## Files

- `domains.js`: `createDomainService({ registry, auditLog, hosting, envFiles, deploy, payments, platformDomain })` and
  `domainState` (Google's state in the press's terms). `hosting` is `clients/google.js` `hosting`; `payments` the
  payment service.
- `names.js`: address rules (`normalDomain`, `domainProblem`, `MAX_DOMAINS`) and the settings line (`domainOrigins`,
  `withExtraOrigins`), shared with setup step 8.
- `http.js`: `handleDomains(request, { service })`, the door (`POST /shop`).
- `fakes.js`: the pretend Hosting, deploy and settings files.

## Not yet

- Hosting this service (one function in the platform project) and writing its address into the shops' settings
  (`PLATFORM_DOMAINS_URL`, like `PLATFORM_EMAIL_URL`).
- Removing an address, and making one the shop's main address (emails and links still use the shop's `web.app` one).
- Two adds for one shop at the same moment could overwrite each other's registry entry; the admin sends one at a time.
