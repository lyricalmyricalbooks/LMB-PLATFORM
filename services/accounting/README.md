# Bookkeeping service

The QuickBooks link (code plan 7.15, `docs/accounting.md`): a press connects their own QuickBooks Online company from
their shop's Settings › Bookkeeping, and every night the shop's sales go there once. Plain Node 22 ES modules, no
packages: Intuit is called over its REST API with an injected `fetch`, and tests use a pretend QuickBooks (`fakes.js`).
**Off unless `ACCOUNTING_ENABLED=true`**; while off, the shop hides its Bookkeeping page.

## Doors

| Door | Who knocks | What it checks |
| --- | --- | --- |
| `POST /shop` | the shop's server: the admin's Bookkeeping page and the nightly run | `X-Shop-Id` plus `Authorization: Bearer <shop service key>` (the registry keeps its SHA-256), like the payment, email and domain services |
| `GET /quickbooks/oauth` | Intuit, sending the press back with `code`, `state` and `realmId` | the one-use state (15 minutes); one company per shop and one shop per company (`?quickbooks=in_use` or `other_company` otherwise) |
| `GET /quickbooks/reconnect` | QuickBooks, for a press whose connection ended (the app's Reconnect URL) | nothing to prove: it only points to that shop's Settings › Bookkeeping, where signing in starts again |

The shop's calls (`accounting.js` header has the details): `accounting.status`, `.connectLink`, `.options`, `.save`
(style, tax codes, accounts; makes three items if missing), `.post` (the nightly run: days or orders, and payouts),
`.resend` (Send again for one day or order) and `.disconnect`.

## What it writes

| From the shop | In QuickBooks |
| --- | --- |
| a day (default) or an order | a `SalesReceipt` into the clearing account (Undeposited Funds) |
| its refunds | a `RefundReceipt` for whatever is new since the last send |
| its card fees | a `Purchase` (expense) for whatever is new |
| a payout | a `Deposit` from the clearing account to the bank |

Never twice: `sent` keeps one record per shop, company and day / order / payout, saved after each write; every write
also carries Intuit's `requestid` (a hash of that record's key). A day whose sales changed after sending is reported,
not sent again.

## Tokens and connections

- Sealed with AES-256-GCM (`../payments/tokenSeal.js`, key `QUICKBOOKS_TOKEN_KEY`), bound to shop, mode and company.
  Access tokens last an hour and are refreshed five minutes before; the newest refresh token is kept.
- The connection's five-year end comes from Intuit's `x_refresh_token_hard_expires_in`; `nightly()` emails the owner
  once, 30 days before.
- `invalid_grant` on a refresh, or a refused fresh token, marks the company lost: sends stop, the owner gets one email,
  the page says to connect again. Reconnecting the same company keeps the choices and catches up on missed days.

## Files

- `accounting.js`: `createAccountingService(...)`: the doors, the nightly run and `nightly()` warnings.
- `quickbooksApi.js`: the Intuit client (sign-in, tokens, revoke, company calls, queries).
- `endpoints.js`: every Intuit address, scope, entity and field value, with where each was confirmed.
- `config.js`: the environment. `http.js`: `handleAccounting(request, { service })`. `index.js`: `createAccountingFromEnv`.
- `fakes.js`: pretend QuickBooks and the stores. `accounting.test.js`, `accountingDoc.test.js`.

## Settings

`ACCOUNTING_ENABLED`, `QUICKBOOKS_CLIENT_ID_LIVE` / `_SECRET_LIVE` (production), `QUICKBOOKS_CLIENT_ID_TEST` /
`_SECRET_TEST` (development keys, sandbox companies), `QUICKBOOKS_REDIRECT_URL`, `QUICKBOOKS_TOKEN_KEY`, in this
service's environment only. A shop in test mode uses a sandbox company; a live shop a real one.

## Not yet

- Hosting (one function in the platform project), the three Firestore stores (`accountingConnections`,
  `accountingStates`, `accountingSent`) and the nightly schedule.
- The shop's nightly push: it needs the daily summary builder (plan 7.12) and payouts (plan 7.10).
- Julian: the Intuit developer account, the app, its keys and Intuit's assessment (`docs/accounting.md`, Turning it on).
