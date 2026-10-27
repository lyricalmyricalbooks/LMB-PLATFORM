# Switching the shop to lyricalmyricalbooks.com

Right now the shop's address is `https://lmb-test-shop.web.app`. The code is ready for the move to
**`https://lyricalmyricalbooks.com`**. Nothing changes until you do the steps below. The main step is setting one
GitHub setting, `SITE_URL`.

The bare domain `lyricalmyricalbooks.com` is the main address. `www.lyricalmyricalbooks.com` forwards to it.

## What's already done in the code

- Checkout and the other Cloud Functions already accept `lyricalmyricalbooks.com` and `www.lyricalmyricalbooks.com`
  (`ALLOWED_ORIGINS` in `functions/index.js`).
- Once `SITE_URL` is set, every build follows it: page links in search results and social previews, the sitemap and
  robots.txt, the Google Shopping feed, links in emails (order tracking, unsubscribe, cart reminders, the shop's
  "Fulfil this order" button) and the old GitHub Pages forwarding pages.
- Visitors who open `lmb-test-shop.web.app`, `lmb-test-shop.firebaseapp.com` or
  `www.lyricalmyricalbooks.com` are sent to the same page on `lyricalmyricalbooks.com`, keeping the rest of the link.
  So emails already sent and old bookmarks keep working.
- Both deploys check the address before using it. A typo, a capital letter problem, or a domain that doesn't open the
  shop yet stops the deploy, and visitors are never sent to a dead address. (Capital letters are fine:
  `Lyricalmyricalbooks.com` is read as `lyricalmyricalbooks.com`.)

## 1. Connect the domain (the shop keeps working on web.app meanwhile)

1. **Firebase console › Hosting › Add custom domain.** Enter `lyricalmyricalbooks.com`. Firebase shows the DNS
   records to add (a TXT record to prove you own it, then A records). Add exactly those at the company where you
   bought the domain.
   - **Don't delete or change your email records** (MX, SPF, DKIM) if you use email on this domain. Only add or
     replace what Firebase asks for.
2. Add a second custom domain, `www.lyricalmyricalbooks.com`, and tick **Redirect to an existing website** →
   `lyricalmyricalbooks.com`. Add the record Firebase shows for it too.
3. Wait until both show **Connected** in Firebase (DNS can take a few hours; the security certificate follows).
4. Open `https://lyricalmyricalbooks.com` in your browser. You should see the shop. (Until step 3, search engines
   and emails still use web.app, so there's no rush between this and the switch.)

## 2. Allow the domain in the other consoles

Do these before switching. They don't affect the current shop.

- **Firebase console › Authentication › Settings › Authorized domains:** make sure `lyricalmyricalbooks.com` and
  `www.lyricalmyricalbooks.com` are listed (add them if not). Without this, Google sign-in and email-link sign-in fail
  on the new address, including the admin login.
- **Legacy project `lmb-test-stockroom`:** the same Authorized domains list, if the admin's leftover second sign-in
  still runs at login (optional, see `docs/FIREBASE_HOSTING.md`).
- **reCAPTCHA key** (if one is set up, `docs/RECAPTCHA.md`): add both names to the key's domains. If App Check is set
  to enforce, checkout fails on a domain the key doesn't list.
- **Browser API key** (Google Cloud › APIs & Services › Credentials): if it has website restrictions, add
  `https://lyricalmyricalbooks.com/*` and `https://www.lyricalmyricalbooks.com/*`.

## 3. Switch

1. GitHub › the repository › **Settings › Secrets and variables › Actions › Variables** › New repository variable:
   name `SITE_URL`, value `https://lyricalmyricalbooks.com` (no slash at the end).
2. **Actions › Deploy Firebase › Run workflow.** Emails now link to the new address.
3. **Actions › Deploy storefront › Run workflow.** The shop rebuilds for the new address, then the old GitHub Pages
   address is updated to forward there too. The deploy finishes by checking the live site; a yellow warning about
   `www` means step 1.2 isn't finished.

If either run stops with "isn't serving the shop yet", the domain isn't connected yet. Wait and run it again.

## 4. After the switch

Sign in to the admin at `https://lyricalmyricalbooks.com/admin`. Browser storage belongs to an address, so you and
your customers sign in once more and answer the cookie banner again. Bags and wishlists from web.app don't move over.

- **Apple Pay / Google Pay:** Settings › Payments › Stripe › **Register this site with Stripe**, once in test mode and
  once in live mode, from the admin opened on the new address.
- **Try it:** place one small real order by card (and PayPal, if on), check the emails link to the new address,
  then refund it.
- **Google Search Console:** add a **Domain** property for `lyricalmyricalbooks.com` (it asks for one DNS TXT record),
  put its verification token in Studio › Text & labels › Site & sharing if you use the HTML-tag method, and submit
  `https://lyricalmyricalbooks.com/sitemap.xml`. The Change of Address tool may refuse the move because web.app forwards
  by script, not by a server redirect; the pages' canonical links and the new sitemap carry the move instead.
- **Google Merchant Center:** change the feed URL to `https://lyricalmyricalbooks.com/google-merchant-feed.xml` and
  claim the new website.
- **Stripe and PayPal dashboards:** update the business website.
- **Inventory app:** if it links to the shop's admin (order links), point it at the new address.
- **Social profiles and printed material:** update the shop link.
- **Optional, better email delivery:** verify `lyricalmyricalbooks.com` with Resend so the backup sender can send from
  an address on your own domain (Settings › Email sender). Gmail sending is unaffected by the move.

## Undoing it

Delete the `SITE_URL` repository variable and run **Deploy Firebase**, then **Deploy storefront**. web.app becomes the
main address again and visitors on the domain are sent there. Keep the domain connected in Firebase Hosting until you
are sure nobody still uses it.
