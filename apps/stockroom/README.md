# Your Press Inventory

Inventory, sales and bookkeeping for Your Press: a point-of-sale for
markets and fairs, per-book ledgers, consignment, author payouts, invoices,
shipping labels, receipts and the tax centre.

It is an offline-first Progressive Web App. It works with no signal and syncs
when the connection comes back.

## How it fits together

| Piece | What it is |
| --- | --- |
| **App** | Vanilla JavaScript, no framework. The code is in `index.html`, `src/main.js`, `src/features/*.js` (the larger screens) and `src/lib/*.js` (pure logic, each with tests). Vite bundles it and builds the service worker. |
| **Data** | Firebase: **Firestore** (books under `books/{bookId}/data/{part}`, config under `settings/{name}`), the **Realtime Database** (older fallback), **Auth** (Google sign-in) and **Storage** (receipt files). The SDK is loaded from `www.gstatic.com` in `src/firebase.js` and precached so the app starts offline. |
| **Offline saving** | Changes show on screen at once, then save to Firestore. When the device is offline, the latest state of each book waits in an on-device queue and uploads later. If another device changed the same book in the meantime, the two versions are merged, not overwritten. |
| **Outside services** | Canada Post, Big Cartel and outgoing email go through your deployed Google Apps Script (`apps-script/Code.gs`). Stripe, the Gmail receipt finder and AI receipt scanning are called from the browser. |
| **Hosting** | GitHub Pages for now (`.github/workflows/deploy.yml`, every push to `main`). Inside a shop's Firebase project the stockroom has its own Hosting site, `<project id>-stockroom` (plan 1.20). |
| **Access rules** | `firestore.rules`, `database.rules.json`, `storage.rules`. Only the publisher account reads everything. An author reads and writes only their own book, plus the few settings their screens need. |

`backend/server.js` is a **local development helper only**. When the app runs
on `localhost`, it relays Canada Post, Zonos and newsletter sends. Nothing in
production uses it, and it never holds book data.

## Run it locally

Needs Node 22 or newer (see `.nvmrc`).

```bash
npm ci
npm run dev            # the app, at http://localhost:5173
npm run dev:all        # the app plus the local API helper (for Canada Post / Zonos / campaign sends)
```

To use the helper, copy `backend/.env.example` to `backend/.env` and fill in
the values it asks for.

## Checks

Run these before pushing. CI (`.github/workflows/ci.yml`) runs all of them on
every pull request except `lint:tokens`:

```bash
npm run lint           # ESLint
npm run lint:contrast  # text contrast in both light and dark themes
npm run lint:tokens    # stylesheets don't add new hard-coded design values
npm test               # Vitest (jsdom)
npm run build          # production build + service worker
```

## Deploying

- **The app:** merge to `main`. The Pages workflow does the rest.
- **Into a shop's project (rules and pages together):** run `deploy-firebase.yml` by hand with the project id, or
  locally: `SHOP_OWNER_EMAIL=… node scripts/deployConfig.mjs --project <id>`, then
  `firebase deploy --config firebase.deploy.json --only firestore:rules,database,storage` and `--only hosting`.
  The three rules files hold the slot `__SHOP_OWNER_EMAIL__` for the owner's address; the step fills it, names the
  stockroom's own database (`stockroom`) and bucket (`<project id>-stockroom`) from `public/shop-profile.js`, and
  refuses to write anything without them. Deployed unfilled, the rules let in only the shop's Team owner role.
- **Apps Script:** when `apps-script/Code.gs` changes, the build copies it to
  `public/gas-code.txt`. Paste it into your Apps Script project and redeploy.
  See `CLAUDE.md` for the version-bump rule.

## More

- `CLAUDE.md`: project rules for anyone (or any AI assistant) changing the code.
- `memory.md`: architecture notes, data shapes and past decisions.
- `.agents/`: design system, UX patterns and the offline-sync and ledger rules.
- `docs/`: Canada Post integration rules and feature plans.
