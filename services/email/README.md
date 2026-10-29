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
- `streams.js`: the two streams and each shop's own sender address (below).
- `reputation.js`: the newsletter pause (below).
- `webhook.js`: the door for Resend's delivery events, signed the Svix way (`svix-id`, `svix-timestamp`,
  `svix-signature`; HMAC-SHA256 of `<id>.<timestamp>.<raw body>` with the base64 part of `whsec_…`), refused when
  unsigned, wrongly signed or over five minutes old. The secret is `RESEND_WEBHOOK_SECRET`.
- `fakes.js`: in-memory sent log, pretend Resend and the reputation store for tests.

## The press's own domain (plan 6.18)

Once a press's own web address opens their shop, their emails can come from it too (`ownDomain.js`):

1. `connect(shopId, domain)` adds the domain to the platform's Resend account (once). It sends the sending records
   Resend asks for to the domain service through `domainsCall` (`google/domainBridge.js`; the registrar's Allow window
   is plan 6.15). Until then the answer is "waiting", and Colophon's sender carries on.
2. `check(shopId)` reads Resend. Once the records check out, the registry's `emailSender.state` is `on`, and
   `send` puts `orders@<their domain>` on the From line. The reply-to stays the press's, so replies reach them.
3. If the records break, the shop goes straight back to Colophon's sender. The owner gets one plain email
   (`own-email-paused`, one per time it was on). When the records come back, so does the own address.
   `checkAll()` is the sweep, every few hours.
4. `disconnect(shopId)` removes the records and Resend's domain when the shop is deleted (`google/teardown.js`).

The Google link's email step runs `connect` for the shop. With Gmail sending switched on (`GOOGLE_GMAIL_SENDING`, after
Google's security review), `createEmailService({ gmailSend })` sends a shop's emails from the press's own Gmail while
the registry's `gmailSender.on` is true. When Gmail refuses one, it goes the usual way.

## Email reputation (plan 8.3)

One shop's newsletter must never put the other shops' receipts in spam.

- **Two streams.** Every email is tagged `stream: orders` (receipts, order and shipping notices, sign-in, billing:
  what a person is waiting for) or `stream: newsletter` (newsletters, campaigns, back in stock, review requests,
  abandoned-cart reminders), by its kind (`streamOf`). Resend's advice is a subdomain per purpose, so a bad reputation
  stays on that subdomain, and one tag per sender on a shared account, because tags come back in its events.
- **Each shop's own address.** With `SHOP_SENDER_ADDRESSES=on`, a shop's email comes from `<shop id>@mail.<domain>`
  (orders) or `<shop id>@news.<domain>` (newsletter); `PLATFORM_ORDERS_EMAIL_DOMAIN` and
  `PLATFORM_NEWSLETTER_EMAIL_DOMAIN` change the subdomains. Off by default: everything comes from
  `notifications@<domain>`, as before. The platform's own email always does.
- **The pause.** `email.complained` and permanent `email.bounced` events for a shop's newsletter stream are counted over
  7 days. More than 0.3% complaints (and at least 2), or more than 4% hard bounces (and at least 5), pauses that shop's
  newsletter: further newsletter emails are refused (the shop door answers 422, no retry), the owner gets one plain
  email (`newsletter-paused`), and the repair queue gets a `newsletter-reputation` item. Receipts and every other
  orders-stream email keep going. A platform admin presses **Turn the newsletter back on** on that item in the control
  room (logged, with a reason); only problems after that count.

### Switched on by Julian

1. Choose the sending domain, then add `mail.<domain>` and `news.<domain>` in Resend and publish their DNS records.
2. Add a webhook in Resend for `email.bounced` and `email.complained`, pointing at this service's event door; put its
   signing secret in `RESEND_WEBHOOK_SECRET`.
3. Set `SHOP_SENDER_ADDRESSES=on`.

## Settings

The key is `RESEND_API_KEY` in this service's environment and nowhere else. Names, domain and addresses are in
`services/settings.js`: `PLATFORM_NAME` (Colophon), `PLATFORM_DOMAIN` (placeholder `platform.example` until there is a
real one), `PLATFORM_SENDER_EMAIL` (default `notifications@<domain>`), `PLATFORM_SUPPORT_EMAIL` (default
`support@<domain>`). The platform domain must be verified in Resend before anything real is sent.

## Not yet

- Hosting: the handler and service run nowhere yet. They become one function in the platform project.
- The sent log's Firestore store (`emailSent/<key>` in the platform project), and the reputation store
  (`emailReputation/<shop id>` with its events).
- Hosting the event door (`webhook.js`).

## The mailing address (plan 15.8)

Canadian anti-spam law asks for a mailing address in commercial emails. `PLATFORM_MAILING_ADDRESS` (a PO box is fine)
puts Colophon's name, that address and the support contact at the foot of every platform email, once (`withIdentity` in
`templates.js`). A press's own emails carry the press's words and are left alone. `waitlist-invite` is a commercial
kind (`COMMERCIAL_KINDS`): `sendPlatform` refuses it until the address is set. The invite says "Reply STOP and we'll
take you off the list at once"; a person who replies STOP is removed from the waitlist by hand from the support inbox
within 10 business days (a clickable link waits on the platform being able to remove a waitlist entry).
