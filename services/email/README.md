# Email service

The platform's one door for email (code plan 2.3). Plain Node 22 ES modules, no packages: every email goes out through
Google's Gmail API (`gmail.js`) from the platform's Google Workspace mailbox, with an injected `fetch`, and tests use
pretend Google (`fakes.js`). There is no sending key anywhere (decided 10 November 2026, replacing Resend).

## Who sends what

| Email | Sent from | Reply-to |
| --- | --- | --- |
| A press's receipts and customer notices, when the press **has connected its own Gmail** | the press's own Gmail address, by the shop itself (`apps/shop/functions/email`); never reaches this service | the press's choice |
| The same, when the press **hasn't connected Gmail** (or Gmail refused a send) | `"<Press name>" <notifications@<platform domain>>`, through this service's shop door (`apps/shop/functions/email/platformSender.js`, when the shop's env has `PLATFORM_EMAIL_URL`) | the press's reply-to address, else the owner's |
| The shop maker's welcome to a new owner (setup step 14) | the same, with the press's name | the press |
| The platform's own email: billing, sign-up, invites, terms notice, health alerts (services/health) | `"Colophon" <notifications@<platform domain>>` | `support@<platform domain>` |

The press's name and reply-to always come from the shop registry, never from the request, so one shop can't sign as
another.

## Files

- `index.js`: `createEmailService({ env, fetch, token, registry, sentLog })` → `send(shopId, message)`,
  `sendPlatform(message)`, `wasSent(shopId, kind)` (the shape setup step 14 already uses). `hasEmailSending(env)`,
  `mailAccount(env)`, `EMAIL_SETTING` (the Launch page's line).
- `gmail.js`: the Gmail sender. The server's own Google token asks IAM to sign a token for the `platform-mail` service
  account with the mailbox as its subject (domain-wide delegation, scope `gmail.send`), swaps it for a mail token
  (kept for its hour) and posts the email as an RFC 2822 message with a plain-words and an HTML part. Tags (kind, shop,
  stream) and the idempotency key travel as `X-Colophon-Tags` and `X-Colophon-Key` headers. Gmail has no idempotency
  key, so only its slow-down answers (429, 403 rate limits, 503) are retried; a dropped connection is not, because the
  email may have gone. The sent log stops a second send of the same key.
- `templates.js`: the words of each email kind, HTML-escaped, https links only.
- `templatesFr.js` (closing emails) and `templatesFrPress.js` (every other email to a press or its people): French
  twins of the templates. `sendPlatform({ language })` sends the twin for "fr" and French then English for "fr+en";
  with no `language`, a message with a `shopId` takes the shop's own, and `send()` (the welcome email) does too:
  `mailLanguage` reads the registry's billing mirror (the press's choice on the Plan page, else French then English for
  a Quebec billing address) or the language it signed up in. Only the platform's own staff alerts have no twin.
  Account-level emails sent without a shop (sign-in links and codes, new device, recovery, waitlist) stay English.
- `http.js`: the shop door. `X-Shop-Id` plus `Authorization: Bearer <shop service key>`; the registry keeps only the
  key's SHA-256 (`serviceKeyHash`). At most 2,000 emails per shop a day. Setup step 8 gives each shop its key
  (`setup/serviceKey.js`: the Functions secret `PLATFORM_SERVICE_KEY` in the shop's project).
- `streams.js`: the two streams, orders and newsletter (below).
- `reputation.js`: the newsletter pause (below).
- `fakes.js`: in-memory sent log, pretend Google (`fakeGmailFetch`) and the reputation store for tests.

With Gmail sending switched on (`GOOGLE_GMAIL_SENDING`, after Google's security review), `createEmailService({ gmailSend
})` sends a shop's emails from the press's own Gmail while the registry's `gmailSender.on` is true. When Gmail refuses
one, it goes the usual way.

## Limits

A Google Workspace mailbox sends about 2,000 emails a day, to at most 10,000 recipients. Over that, Gmail refuses sends
for up to 24 hours: each is logged as failed and retryable. Shops with their own Gmail connected don't count against it.
Google's rules don't allow bulk marketing from Workspace, so a shop's newsletter should go from the press's own Gmail.
When the platform outgrows one mailbox: more mailboxes, or Google's SMTP relay (10,000 a day per user).

## Email reputation (plan 8.3)

Every email is tagged `stream: orders` (receipts, order and shipping notices, sign-in, billing: what a person is
waiting for) or `stream: newsletter` (newsletters, campaigns, back in stock, review requests, abandoned-cart
reminders), by its kind (`streamOf`). A shop's newsletter can be paused while its receipts keep going: `reputation.js`
counts complaints and hard bounces over 7 days and pauses at more than 0.3% complaints (at least 2) or 4% hard bounces
(at least 5); the owner gets one plain email and the control room a repair item with **Turn the newsletter back on**.
Gmail has no delivery events, so nothing feeds the count yet: bounces arrive as returned mail in the mailbox.

## Settings

No key. `GMAIL_SENDING` ("on" sends; anything else and nothing is sent), `GMAIL_ACCOUNT` (default
`platform-mail@<PLATFORM_PROJECT>.iam.gserviceaccount.com`). Names, domain and addresses are in `services/settings.js`:
`PLATFORM_NAME` (Colophon), `PLATFORM_DOMAIN`, `PLATFORM_SENDER_EMAIL` (the mailbox, default
`notifications@<domain>`), `PLATFORM_SUPPORT_EMAIL` (default `support@<domain>`). Setting up the mailbox, DKIM, SPF,
DMARC and the delegation: `server/README.md`, "Email through Google".

## The mailing address (plan 15.8)

Canadian anti-spam law asks for a mailing address in commercial emails. `PLATFORM_MAILING_ADDRESS` (a PO box is fine)
puts Colophon's name, that address and the support contact at the foot of every platform email, once (`withIdentity` in
`templates.js`). A press's own emails carry the press's words and are left alone. `waitlist-invite` is a commercial
kind (`COMMERCIAL_KINDS`): `sendPlatform` refuses it until the address is set. The invite says "Reply STOP and we'll
take you off the list at once"; a person who replies STOP is removed from the waitlist by hand from the support inbox
within 10 business days (a clickable link waits on the platform being able to remove a waitlist entry).

## Receipts and account changes (plan 25.1-25.3)

- `bill-paid`: a receipt for every paid bill with money on it (Stripe's `invoice.paid`): amount, bill number, the days
  it covers, tax, and buttons to the bill and the billing page. Keyed on the bill (`billing/bill-paid/<invoice id>`), so
  a repeated event never sends two. A bill that settles a failed payment sends `payment-received` instead (with the
  bill's button). **Leave Stripe's own "email customers about successful payments" off**, or presses get two receipts.
- `card-changed`: a card was added or made the one that pays (safety notice). The card company's automatic update
  sends nothing.
- `shop-reopened` (a card reopened a paused shop, instead of `card-changed`) and `cancel-undone` (Keep my plan).

## The control room's view (plan 19.10-19.12)

- `sendPlatform` marks its sent-log entries `platform: true`, and the sent log has `listForShop(shopId, { limit })`:
  the platform's own emails about one shop, newest first, for the shop's timeline. A shop's emails to its shoppers are
  never listed. Entries sent before the mark existed don't show.
- The control room counts each shop's emails sent over 7 days (`countSince`) and its bounces and spam reports from the
  reputation guard's own events, never counting them twice (`control-room/delivery.js`).
- `job-late` (`templates.js`) goes only to the platform's alert address when a scheduled job stops running on time
  (`services/jobs`).
