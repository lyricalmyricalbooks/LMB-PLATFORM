# Artsy Website for Publisher

This is a code bundle for Artsy Website for Publisher.
The original project is available at https://www.figma.com/design/NzVBBNBNBtFNCYIT9PgF6l/Artsy-Website-for-Publisher.

## Local development

1. Install dependencies (pnpm pins the React versions; see `CLAUDE.md` › Verification):
   ```bash
   pnpm install
   ```
2. Start the storefront + admin (one Vite single-page app):
   ```bash
   npm run dev
   ```

## Backend + Admin (publisher)

There is no separate Node/Express server any more (the old `backend/server.js` and its
`ADMIN_PASSWORD` login were removed). The site talks directly to **Firebase**:

- **Data & files:** Firestore (catalog, orders, settings, pages…) and Firebase Storage, guarded
  by `firestore.rules` / `storage.rules`.
- **Server work:** Firebase Cloud Functions in `functions/` (Stripe checkout and webhook, emails,
  shipping/Shippo, downloads, scheduled sweeps). Run them locally with
  `cd functions && npm install && npm run serve` (emulator); deploy with `npm run deploy` there or
  the `Deploy Firebase` workflow.
- **Admin:** open `/admin` on the site and sign in with **Google**. Access is restricted to the
  shop's allow-listed account (checked in the app and again by `requireAdmin` in the Functions).

See `CLAUDE.md` for the full architecture, commands and deployment notes.

## Production build

Create an optimized build:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Deploy (Firebase Hosting)

The shop is served by Firebase Hosting at `https://lmb-test-shop.web.app`, published by
`.github/workflows/deploy-pages.yml` ("Deploy storefront").

- Every push to `main` builds the site (Vite, sitemap, prerendered pages) and deploys it to Firebase Hosting; a
  15-minute schedule rebuilds when published content changed.
- The old GitHub Pages address (`…github.io/shop/`) only forwards to the same page on the shop. Keep
  **Settings → Pages → Source** set to **GitHub Actions**.
- You can also run it manually from **Actions → Deploy storefront → Run workflow**.
- Setup, the move from GitHub Pages and adding your own domain: `docs/FIREBASE_HOSTING.md`.

> Firestore rules/indexes, Storage rules and Cloud Functions are deployed separately
> (`.github/workflows/deploy-firebase.yml`).

## Going live checklist (e-commerce)

The payment/fulfillment backend runs on Firebase. Before taking real orders:

1. **Secrets (Firebase → Functions → Secrets)** — set real values for:
   - `STRIPE_SECRET_KEY` (live key, `sk_live_...`)
   - `STRIPE_WEBHOOK_SECRET` (from the Stripe webhook endpoint pointing at `stripeWebhook`)
   - `RESEND_API_KEY` (transactional email)
   - `SHIPPO_API_TOKEN` (address verification + labels; without it addresses are flagged unverified and label generation refuses to run)
2. **GitHub secret `FIREBASE_SERVICE_ACCOUNT`** — JSON service-account key so the
   `Deploy Firebase` workflow can ship Firestore rules, indexes, Storage rules
   and Cloud Functions automatically. Until it is set, deploy manually with
   `npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage,functions`.
3. **Stripe webhook** — in the Stripe dashboard add an endpoint for
   these events: `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`,
   `charge.refunded` (syncs Dashboard refunds) and `charge.dispute.created`,
   pointing to
   `https://us-central1-lmb-test-shop.cloudfunctions.net/stripeWebhook`.
   Orders are created `unpaid` and only this webhook marks them paid,
   decrements stock, counts discount redemptions and records revenue.
4. **Policies** — fill in shipping / returns / privacy / terms in Admin →
   Settings before launch (required by Stripe and card networks).
5. **Tax rates** — Admin → Taxes now supports an optional state/province per
   rate (e.g. Canada + Ontario = 13). Add one row per region you must collect
   in; a row with an empty region is the country-wide fallback.
6. **Allowed origins** — if the site moves to a custom domain, add it to
   `ALLOWED_ORIGINS` in `functions/index.js`, to Firebase Auth's authorized domains
   and the reCAPTCHA key's domains, and build with `SITE_URL=https://<domain>` and
   `SITE_BASE=/`.
