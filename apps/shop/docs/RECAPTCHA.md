# reCAPTCHA Enterprise / Firebase App Check

The app uses invisible, score-based reCAPTCHA Enterprise through Firebase App Check.
It starts before Firestore and Auth in src/lib/firebaseApp.ts (imported by src/lib/firebase.ts and src/lib/firestoreLite.ts). The Firebase SDK attaches
attestation to supported Firebase requests; functionFetch attaches X-Firebase-AppCheck
to the shop's HTTP Functions. External requests (Stripe, exchange rates, address lookup)
do not receive that token. Server handlers verify tokens with the Admin SDK and accept
only this storefront's registered Firebase app ID.

## Current rollout state

No site key is committed or configured by this change. Missing configuration defaults
to monitoring, preserving existing traffic. **Monitoring does not block bots.** Real
reCAPTCHA assessments, console metrics, and live enforcement remain unverified until
the owner completes registration and the checks below.

## 1. Register the key

1. Open the Google Cloud console for project lmb-test-shop. Enable the
   reCAPTCHA Enterprise API and create a Web / score-based key. Leave the checkbox
   challenge option off.
2. Allow these hostnames (without paths): yourpress.github.io,
   lmb-test-shop.web.app (Firebase Hosting), yourpress.example and
   www.yourpress.example (the shop's own domain, docs/CUSTOM_DOMAIN.md). Add any other hostname
   actually serving the app. Do not allow localhost on a production key.
3. In Firebase console > App Check > Apps, register web app
   1:100000000001:web:0000000000000000000001 with the Enterprise provider and this key.
   Start with the default token TTL and risk threshold, then evaluate real traffic.
4. Register every other legitimate app using the same Firebase project before
   enabling Firebase service enforcement. App Check is separate from authentication
   and Firestore rules; keep the admin allowlist and existing data validation intact.

## 2. Deploy in monitoring mode

In GitHub repository Settings > Secrets and variables > Actions > Variables, set:

| Repository variable | Value |
| --- | --- |
| RECAPTCHA_ENTERPRISE_SITE_KEY | The public score-based site key from registration |
| APP_CHECK_MODE | monitor |

The site key is public, not a secret. Do not enter a secret key, service-account JSON
or debug credential. Set them as **repository** variables (not only in the github-pages
environment): the Firebase Hosting jobs run outside that environment and cannot see
environment-scoped values. Run **Deploy storefront** and **Deploy Firebase (rules, indexes, functions)**.
The Pages build supplies VITE_RECAPTCHA_ENTERPRISE_SITE_KEY and VITE_APP_CHECK_MODE;
the backend workflow writes APP_CHECK_MODE into the project's Functions dotenv file
so it persists in deployed Functions, rather than only in the CI runner environment.

For local development, set VITE_RECAPTCHA_ENTERPRISE_SITE_KEY and
VITE_APP_CHECK_MODE=monitor in an ignored .env.local. If testing against enforced live
Firebase services, use an App Check debug token registered in Firebase console and
set VITE_APP_CHECK_DEBUG_TOKEN in that local file. This code enables debug credentials
only in Vite development on loopback hosts, never in a production build. Never commit,
share, print, or set that credential in GitHub repository variables. Firebase Functions
emulators bypass attestation on the server; production does not accept a client-selected
bypass. To test server enforcement locally, exercise the handler regression tests.

## 3. Verify before enforcement

- In Firebase App Check metrics, confirm verified Firestore requests from the deployed
  app, including contact messages, newsletter and stock-alert submissions, reviews,
  order tracking, and authenticated account/admin workflows.
- In Cloud Logging, filter event=app_check. For browser HTTP Functions, verify status
  is valid for checkout, Stripe/PayPal returns, shipping/address lookup, discounts,
  admin payment diagnostics, refunds and label actions. Logs contain status and path,
  never tokens or provider error details. Monitoring traffic stays allowed even when
  status is missing or invalid.
- Exercise a sandbox purchase, webhook, return/recovery, refund and fulfillment flow.
  Do not use a production charge to test this integration. Check browser privacy tools
  and the Studio iframe/new-tab preview too; they use the same legitimate app.
- Keep Google's provider-managed reCAPTCHA badge visible. Review the shop's published
  privacy policy for reCAPTCHA disclosure and Google Privacy Policy/Terms links through
  Studio's existing policy content controls. The verification failure message is
  editable in Studio > Text & labels > Site & sharing > reCAPTCHA verification failed;
  it uses existing notice surfaces rather than introducing a new storefront region.

## 4. Enforce and rollback

Set APP_CHECK_MODE=enforce and redeploy Pages and Functions **after** the monitored
client is working. Both workflows reject invalid modes; Pages refuses an enforced
build without a key. Browser HTTP Functions then reject missing/invalid tokens with
401 / APP_CHECK_REQUIRED before business logic, and tokens from another Firebase app
are rejected too. A verification failure offers an editable refresh-and-retry message.
No payment or label purchase is automatically retried. App Check is an abuse barrier,
not a guarantee against replay or all fraud; existing payment/label idempotency remains
responsible for preventing duplicate charges.

Separately enable **Cloud Firestore enforcement in Firebase App Check console** to
protect direct public form and order writes. This cannot be enabled in Firestore rules;
no document shapes, rule permissions or indexes changed. Enable Storage enforcement
only after testing all legitimate upload/download consumers. Register those apps first.
For the existing onRequest HTTP Functions, console callable-function enforcement is
not a replacement for this server verifier.

Signed Stripe, PayPal and Shippo webhooks are excluded from browser attestation so
provider events still arrive. Emailed digital-download links keep their existing paid
order / secret-token checks because email navigation cannot send App Check headers.
All browser admin endpoints still require their existing verified admin ID token.

To recover from false rejections, set APP_CHECK_MODE=monitor and redeploy Functions
first, then Pages. Turn off any Firebase console enforcement separately. For a full
provider rollback, set APP_CHECK_MODE=off and redeploy both after disabling console
enforcement. Retain the key/registration for a later monitored retry.

## Validation boundaries

Automated tests cover request headers, local enforcement failures, monitoring fallback,
server-side missing/invalid/wrong-app rejection, preflight handling, and exported HTTP
handler coverage. They do not certify real Google assessments, token issuance, Cloud
permissions, Firebase console enforcement, or live payment/fulfillment outcomes.

Official setup: https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider
Custom HTTP verification: https://firebase.google.com/docs/app-check/custom-resource-backend
