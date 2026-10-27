# Moving the storefront to Firebase Hosting

GitHub stays the code home and the place builds run. Only where the built shop is served changes: from
GitHub Pages (`https://yourpress.github.io/shop/`) to Firebase Hosting
(`https://lmb-test-shop.web.app`, at the root of its own address; your own domain later). Stripe,
Firestore and the Cloud Functions' payment and order logic do not change.

The move happens in three steps so that each one can be checked, and undone, on its own.

| Step | What changes | Status |
| --- | --- | --- |
| 1. Side by side | Every release also publishes the shop to web.app, hidden from search engines. GitHub Pages stays the live shop. | Done (merged) |
| 2. Cutover | web.app becomes the shop's address: links in emails, sitemap and search listings. The old Pages address forwards every link (including ones in emails already sent) to the same page on web.app, bringing the shopper's bag along. | This change |
| 3. Cleanup | Remove the GitHub Pages-only redirect code; after 30–60 days stop accepting checkout calls from the old address. | Later |

## Before switching step 1 on (owner, in the consoles)

1. **Hosting site.** Firebase console › Hosting: open it once (Get started) so the default site
   `lmb-test-shop` exists. `firebase.json` pins that site ID, so a different ID fails the deploy loudly.
2. **Deploy key.** Google Cloud console › IAM › Service accounts: create one with only the
   **Firebase Hosting Admin** role, make a JSON key and save it as the GitHub repository secret
   `FIREBASE_HOSTING_SERVICE_ACCOUNT`. Without it the workflow uses `FIREBASE_SERVICE_ACCOUNT`, if that account
   may deploy Hosting.
3. **Allowed addresses.** Add `lmb-test-shop.web.app` to:
   - the reCAPTCHA Enterprise key's domains, if a key is set (docs/RECAPTCHA.md);
   - Firebase Auth › Settings › Authorized domains in the legacy project `lmb-test-stockroom`, for the
     admin's leftover second sign-in at login (optional since the inventory app link runs on the server,
     docs/INVENTORY_LINK.md; the main project allows web.app by default);
   - any HTTP-referrer restrictions on the browser API key (Google Cloud › APIs & Services › Credentials).
4. **Variables.** `RECAPTCHA_ENTERPRISE_SITE_KEY` and `APP_CHECK_MODE`, if used, must be **repository** variables,
   not only `github-pages` environment variables.
5. **Release history.** Firebase console › Hosting › Release storage settings: keep about 30 versions.
6. **Deploy the Cloud Functions** that allow web.app (Deploy Firebase runs on merge). Then set the repository
   variable **`FIREBASE_HOSTING_ENABLED` = `true`** and run **Actions › Deploy storefront › Run workflow**.

## Trying the new address (a few days)

The deploy job checks the live site itself (`scripts/hosting-smoke.mjs`). Then, on
`https://lmb-test-shop.web.app`:

- Sign in to the admin with Google, and open Inventory › Inventory app link to check it still says Connected.
- Open Studio and preview every template, including Page not found.
- Publish a change in Studio. Within about 15 minutes both addresses should rebuild.
- Firebase console › App Check: requests from web.app are verified (if a key is set).
- Settings › Payments › **Register this site with Stripe**, once in test mode and once in live mode.
- Place one real low-value order by card and one by PayPal, then refund them. Test mode applies to the whole
  shop, so don't switch it on while shoppers are buying.
- Sign up for the newsletter and send a contact message (these call the Cloud Functions).
- Emails still link to the GitHub Pages address until the cutover. That is expected.

`https://lmb-test-shop.firebaseapp.com` serves the same files but forwards visitors to web.app, so there is
only one public address.

## Merging the cutover (step 2)

Merge it only after step 1 has been switched on and you have tried web.app (the list above). Two safety checks
stop an early merge from hurting the live shop:

- **Deploy Firebase** first checks that the email-link address (web.app) answers with the shop. If it doesn't, the
  backend deploy stops, emails keep their current links, and the storefront workflow waits for it, so nothing changes.
- **GitHub Pages** is replaced with the forwarding pages only after the web.app deploy and its live check succeeded.

What happens when it goes out:

1. Deploy Firebase deploys the Cloud Functions, whose emails now link to web.app.
2. Deploy storefront publishes the shop to web.app, now open to search engines, then replaces GitHub Pages with
   forwarding pages.
3. Old links land on the same page of web.app with the same query and `#…`: order tracking, unsubscribe and
   cart-reminder links, `/admin#orders/<id>`, bookmarks, and the old `/?/…` addresses. A shopper's bag and wishlist
   come along once. A customer returning from a card or PayPal payment keeps their order confirmation.

Browser storage belongs to an address, so after the move you and your customers sign in once more and answer the
cookie banner again.

## After the cutover (owner)

- **Google Search Console:** add `https://lmb-test-shop.web.app/` as a URL-prefix property. Put its
  verification token in Studio › Text & labels › Site & sharing, which replaces the old one. Then submit
  `sitemap.xml`. GitHub Pages can't use the Change of Address tool, so the forwarding pages' canonical links carry the
  move instead.
- **Google Merchant Center:** change the feed URL to `https://lmb-test-shop.web.app/google-merchant-feed.xml` and
  claim the new website.
- **Stripe and PayPal:** update the business website address in each dashboard.
- **Email delivery:** watch Resend's spam and bounce numbers for a week. Links to `*.web.app` addresses can score worse
  than links to your own domain, which is one more reason to add it soon.
- **Social profiles** (Instagram etc.): update the shop link.

## Your own domain (later)

The step-by-step guide for yourpress.example is `docs/CUSTOM_DOMAIN.md`. In short:

1. Firebase console › Hosting › **Add custom domain**. Follow the DNS steps and wait for the certificate.
2. Add the domain to the reCAPTCHA key, to Stripe payment-method domains (test and live, from the admin opened on the
   new domain), and to Firebase Auth authorized domains in both projects. `ALLOWED_ORIGINS` already lists
   yourpress.example and www.
3. Once the domain opens the shop, set the repository variable **`SITE_URL`** to `https://<your domain>`. Both deploys
   refuse an address that isn't in `ALLOWED_ORIGINS` or doesn't serve the shop yet, so a typo or a pending
   certificate can't redirect your visitors to a dead address.
4. Run **Deploy Firebase**, then **Deploy storefront**. The site, the sitemap, email links and the old-address
   forwarding all follow, and the web.app and firebaseapp.com addresses forward to the domain.

## How Firebase Hosting serves the shop (`firebase.json`)

- `books/<slug>.html` (prerendered) answers at `/books/<slug>` with 200. `/books/<slug>/` and `/books/<slug>.html`
  301-redirect there.
- Account, checkout, admin, tracking, wishlist, and book/page/category addresses that have no snapshot get the
  app shell (`spa.html`).
- Any other address gets a real **404** that still shows the shop's editable missing page (`404.html` is the same
  app shell). There is deliberately no catch-all rewrite.
- `/assets/*` (hashed file names) are cached for a year; pages, the sitemap, robots and the feed are revalidated
  on every visit.
- Every response sends `nosniff`, `Referrer-Policy` and `X-Frame-Options: SAMEORIGIN` (Studio shows the shop in a
  frame). Only the bare app shell (`/spa`, `/404`) is marked `noindex`.

`scripts/hostingConfig.test.ts` checks these rules (and that every app route is covered). The Hosting emulator check
runs in CI and before every deploy.

## Undoing it

- **A bad release:** Firebase console › Hosting › Release history › Rollback.
- **The cutover:** revert the change. Deploy Firebase moves email links back, and Deploy storefront then needs the
  old GitHub Pages job back (the revert restores it). The forwarding pages keep sending visitors to web.app, which
  still works, until GitHub Pages is rebuilt, so there is no outage.
- **Never turn Hosting off after the cutover**: emails and the old address both point there.
  `FIREBASE_HOSTING_ENABLED` must stay `true`; setting it to anything else only stops new releases.
