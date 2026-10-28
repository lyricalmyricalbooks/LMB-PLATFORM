# Email service

The only place the platform's email sender key lives (code plan 2.3). Plain Node 22 ES modules, no packages: Resend is
called over its REST API with an injected `fetch`, and tests use a pretend Resend (`fakes.js`).

## Who sends what

| Email | Sent from | Reply-to |
| --- | --- | --- |
| A press's receipts and customer notices, when the press **has connected its own Gmail** | the press's own Gmail address, by the shop itself (`apps/shop/functions/email`); never reaches this service | the press's choice |
| The same, when the press **hasn't connected Gmail** (or Gmail refused a send) | `"<Press name>" <notifications@<platform domain>>`, through this service's shop door (`apps/shop/functions/email/platformSender.js`, when the shop's env has `PLATFORM_EMAIL_URL`) | the press's reply-to address, else the owner's |
| The shop maker's welcome to a new owner (setup step 14) | the same, with the press's name | the press |
| The platform's own email: billing, sign-up, invites, health alerts (services/health) | `"Colophon" <notifications@<platform domain>>` | `support@<platform domain>` |

The press's name and reply-to always come from the shop registry, never from the request, so one shop can't sign as
another.

## Files

- `index.js`: `createEmailService({ env, fetch, registry, sentLog })` → `send(shopId, message)`, `sendPlatform(message)`,
  `wasSent(shopId, kind)` (the shape setup step 14 already uses).
- `resend.js`: the Resend client. One recipient per email, an `Idempotency-Key` on every call, retries only on network
  drops, 429 and 5xx (with the same key), never on 4xx.
- `templates.js`: the words of each email kind, HTML-escaped, https links only.
- `http.js`: the shop door. `X-Shop-Id` plus `Authorization: Bearer <shop service key>`; the registry keeps only the
  key's SHA-256 (`serviceKeyHash`). At most 2,000 emails per shop a day. Setup step 8 gives each shop its key
  (`setup/serviceKey.js`: the Functions secret `PLATFORM_SERVICE_KEY` in the shop's project).
- `fakes.js`: in-memory sent log and pretend Resend for tests.

## Settings

The key is `RESEND_API_KEY` in this service's environment and nowhere else. Names, domain and addresses are in
`services/settings.js`: `PLATFORM_NAME` (Colophon), `PLATFORM_DOMAIN` (placeholder `platform.example` until there is a
real one), `PLATFORM_SENDER_EMAIL` (default `notifications@<domain>`), `PLATFORM_SUPPORT_EMAIL` (default
`support@<domain>`). The platform domain must be verified in Resend before anything real is sent.

## Not yet

- Hosting: the handler and service run nowhere yet. They become one function in the platform project.
- The sent log's Firestore store (`emailSent/<key>` in the platform project).
