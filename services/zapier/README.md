# Colophon on Zapier (code plan 26.13)

Colophon's own Zapier app. Zapier runs it, not the platform: this folder is pushed to Zapier with Zapier's command
line. It talks to the platform only through the app store, like any outside app (`services/apps/connection.js`), with
the key a press gives it on Colophon's permission page.

| In Zapier | What it does | Colophon call |
| --- | --- | --- |
| New Paid Order (trigger) | a customer pays | `GET /api/apps/v1/orders` |
| New Newsletter Reader (trigger) | someone confirms the shop's newsletter | `GET /api/apps/v1/subscribers` |
| Product Added or Changed (trigger) | a product is added or edited | `GET /api/apps/v1/products` |
| Add Tracking to an Order (action) | marks the order sent; the customer gets the tracking email | `POST /api/apps/v1/orders/<id>/fulfillment` |
| Change Stock (action) | adds or takes copies | `POST /api/apps/v1/inventory/<productId>` |

Sign-in is OAuth 2: Zapier opens `/account/install.html` (the press picks a shop if they own more than one), and swaps
the code at `POST /api/apps/oauth/token`. A shop's key doesn't run out; removing the app in Settings › Apps stops it.

`services/apps/ownApps.test.js` runs this app against the real platform plumbing, the way Zapier calls it.

## Putting it on Zapier (Julian, once)

1. Make a free Zapier developer account, then in this folder: `npm install`, `npx zapier-platform-cli login`,
   `npx zapier-platform-cli register "Colophon"`, `npx zapier-platform-cli push`.
2. Give it its keys: `CHECKUP_SECRET=$(gcloud secrets versions access latest --secret=checkup-secret) node keys.mjs`
   prints `CLIENT_ID` and `CLIENT_SECRET`. Set both, and `COLOPHON_URL` to the platform's address, with
   `npx zapier-platform-cli env:set 1.0.0 CLIENT_ID=… CLIENT_SECRET=… COLOPHON_URL=https://…`.
3. In Zapier's developer page, copy the app's OAuth redirect address
   (`https://zapier.com/dashboard/auth/oauth/return/App…CLIAPI/`) and its invite link (Sharing). Put them in
   `server/env.yaml` as `ZAPIER_RETURN_ADDRESS` and `ZAPIER_INVITE_URL` and run the deploy: Zapier then lists itself on
   the app store. Until both are set it stays off, so no press finds an app that can't connect.
4. Try it with the test shop: make a Zap from New Paid Order, and one that adds tracking.
5. Later, to be listed in Zapier's public directory: Zapier's own review (needs a few live users first).
