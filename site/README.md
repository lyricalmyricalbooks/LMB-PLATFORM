# The platform site

Every platform page on one Hosting site in the platform project, `lmb-platform-prod`
(https://lmb-platform-prod.web.app), in the folder layout their links expect:

| Address | Page |
| --- | --- |
| `/` and `/waitlist/` | the waitlist (`waitlist/`) |
| `/signup/` | sign-up (`signup/`) |
| `/account/` (also `/accounts/`) | your shops (`accounts/index.html`) |
| `/account/billing?shop=<id>` | plan and billing (`accounts/billing.html`) |
| `/help/`, `/terms/`, `/status/`, `/experts/` | help, terms, status, experts |
| `/control-room/` | the control room |

`build.js` copies only the files each page loads in the browser (its scripts, styles and their imports) into `dist/`,
so no server code, test or note is published. It stops, writing nothing, when a page loads a missing file or a browser
file imports something only a server has. Tested by `build.test.js` (root `npm test`).

## Publishing it

A deliberate step on the owner's machine, never from CI. From the repo root:

```bash
node site/build.js
npx firebase-tools@15.32.1 deploy --config site/firebase.json --project lmb-platform-prod --only hosting,firestore:rules
```

This replaces the waitlist-only deploy from `waitlist/`: deploying that folder now would leave the site with only the
waitlist. The platform's database rules are still `waitlist/firestore.rules`, deployed from here. To look first, deploy
to a preview address that lasts a week and leaves the live site alone:

```bash
npx firebase-tools@15.32.1 hosting:channel:deploy platform-pages --config site/firebase.json --project lmb-platform-prod --expires 7d
```

## What works, and what waits

The pages are static and work on the free plan. Everything they do after sign-in goes through the platform's web door,
`/api` (`signup/api.js`), which is not hosted yet (plan 15.6, and Cloud Functions need the Blaze plan). Until then the
pages load and sign in, and every call to `/api` answers 404.

- **Google sign-in** needs the Google provider turned on in the Firebase console (Authentication › Sign-in method), once.
- **Email sign-in links** are sent by the platform's email service through `/api/signin-link`, so they wait for `/api`.
- **The control room** also needs `PLATFORM_ADMIN_EMAILS` set on the `/api` function and two-step sign-in for the admin.
- **The status page** reads `publicStatus/current`, written by the health run; until it runs, the page says it can't
  confirm the current status.
