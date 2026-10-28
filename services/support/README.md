# Support inbox

Where presses ask the platform team for help, and where the team answers (plan 4.4). Plain Node 22 ES modules, no
packages; tests use in-memory stores and a pretend email service (`support.test.js`).

## How it works

- **A press asks** from their account page (`accounts/`, Get help from Colophon): which shop it is about (optional),
  a few words and the message. They get an email copy, and the team gets an email at the platform's support address.
  A named shop must be one the person has a role in, so nobody can ask in another press's name. A double press of
  Send makes one request. At most 10 new requests per person a day.
- **The team answers** in the control room (`control-room/`, Support requests): waiting, answered and closed lists,
  an answer box and Close. Each answer is emailed to the press and kept on the request. Only platform admins
  (`PLATFORM_ADMIN_EMAILS`) get in.
- **The press adds more** to their own request from the account page; that opens it again and tells the team.
- The press sees their requests and answers, but never which admin answered.

Each request is `support/<id>` in the platform project (`clients/stores.js` `firestoreSupport`): who asked, the shop,
the subject, the status (`open`, `answered`, `closed`) and every message.

## Files

- `inbox.js`: `createSupportInbox({ store, email, registry, roleIn, settings, admins })`. `roleIn` is the accounts
  service's (`accounts/accounts.js`).
- `routes.js`: the calls on the platform's one web door: `createApi({ …, routes: { ...supportRoutes(inbox) } })`.
- `fakes.js`: the in-memory store.
- The emails are `support-received`, `support-new` and `support-reply` in `services/email/templates.js`.

## Not yet

- Replies by email: a press who answers the email reaches the support address's mailbox, not the request. Bringing
  those replies in needs inbound email on the platform domain.
- A Help button inside each shop's own admin. Today it is on the account page.
