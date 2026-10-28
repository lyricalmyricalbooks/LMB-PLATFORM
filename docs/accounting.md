# Bookkeeping: the QuickBooks link

Code plan 7.14 (this page), 7.15 (`services/accounting/`) and 7.16 (the shop's Settings › Bookkeeping). Written 28
October 2026. Every QuickBooks word used here is explained under [Words](#words); a test checks that.

**State:** built and tested against a pretend QuickBooks only. **Off** until Julian switches it on (see
[Turning it on](#turning-it-on)). The monthly bookkeeping file (7.12) is the first step and needs none of this.

## What a press gets

In their shop's admin, **Settings › Bookkeeping › Connect to QuickBooks**, three steps:

1. **Sign in with Intuit.** The press picks their QuickBooks company and allows the link.
2. **One line per day or every order.** One **sales receipt** per day is the default: short books, enough for a small
   press. Every order as its own sales receipt is what Intuit's own shop connector does ([Q6]); it suits a press that
   wants to find single orders in QuickBooks.
3. **Match taxes.** Each tax name the shop uses (GST, HST ON, PST BC, QST…, plan 7.11) is matched once to one of the
   company's **tax codes**, plus the code for sales with no tax. The same step picks five **accounts**, with a
   suggestion already chosen: where sales are recorded, where card sales wait for their payout (**Undeposited Funds**),
   the bank the payouts land in, and the expense for card fees, plus the liability account for gift cards.

After that, every night:

| From the shop | Becomes in QuickBooks |
| --- | --- |
| The day's sales (or each order): books, shipping, discounts, gift cards, each tax by its name | one **sales receipt**, into Undeposited Funds |
| Refunds made that day | one **refund receipt** |
| Card fees | one **expense** (an Intuit `Purchase`), paid out of Undeposited Funds |
| Each payout | one **deposit** from Undeposited Funds to the bank |

This is the shape Intuit's own connector uses: sales and fees wait in Undeposited Funds, and the payout's deposit is
what the bank feed matches ([Q6]).

**Never twice.** The service keeps its own record of every write, per shop, company and day (or order, or payout). A
re-run writes nothing new. A refund or a fee that arrives after a day was sent goes on its own, for the difference. A
day whose sales changed after sending is reported to the press, not sent again. Each write also carries Intuit's
`requestid`, so a retried call is not taken twice; the service doesn't rely on that alone (whether Intuit promises it
is not confirmed, see below).

The admin page shows the last day sent, a **Send again** button for one day (it sends the sales receipt again only if
the press deleted it in QuickBooks), and **Disconnect**.

## What it costs

Intuit's App Partner Program ([Q8], guide v1.2, March 2026):

| Level | Fee a month | Reads included (CorePlus) | Writes (Core) |
| --- | --- | --- | --- |
| **Builder** | none | 500,000; calls over that are blocked | not counted |
| Silver | US$300 | 1 million | not counted |
| Gold | US$1,700 | 10 million | not counted |
| Platinum | US$4,500 | 75 million | not counted |

Writing sales in is **Core**: "Core API calls are unmetered and uncharged." Reading is **CorePlus** and metered. The
service reads little: the company's name once at connect, its tax codes and accounts when the press opens step 3, the
three items it needs once, and one receipt when the press presses Send again. A night's run reads nothing. So the free
**Builder** level is enough for any number of presses at this volume.

What Builder can't do: be listed on the **Intuit App Marketplace**. Listing needs Silver or above plus Intuit's
security, technical and marketing reviews. Publishing any app at all (leaving development keys for production keys)
first needs Intuit's self-attested **assessment questionnaire** ([Q8]). Presses would connect from their shop's admin,
not from the marketplace, so the platform doesn't need a listing.

## Connections last five years

Since Intuit's 2026 policy ([Q9]):

- A **refresh token** lasts at most five years. Accounting connections made from October 2023 start ending in October
  2028. The service asks Intuit for the hard end of each connection when it gets tokens, keeps it, and emails the
  owner once, 30 days before (QuickBooks itself warns in the product 30 days before and by email 7 days before).
- Every app must give a **Reconnect URL**: the page QuickBooks sends a press to when a connection ended. The service's
  is `/quickbooks/reconnect`. It sends the press to their own shop's Settings › Bookkeeping, where they press Connect to
  QuickBooks again. Signing in must start from the shop's own admin, so nobody can link a company to someone else's shop.
- An **access token** lasts an hour; the service refreshes it as needed and keeps the newest refresh token Intuit
  returns.

A press who disconnects the app inside QuickBooks makes Intuit refuse the next refresh (`invalid_grant`). The service
then stops sending for that shop, emails the owner once and shows "QuickBooks stopped taking this shop's sales" on the
Bookkeeping page. Reconnecting the same company keeps the press's choices, and the missed days go on the next run.

## The button

Intuit's "Connect to QuickBooks" buttons are **text only**, no logo inside, and come in French too ([Q12]). The shop's
button is plain text in the admin's own button style: "Connect to QuickBooks", or "Se connecter à QuickBooks" when the
admin is in French.

## How it is built

- `services/accounting/` in the platform project holds the platform's Intuit keys and each press's tokens, sealed with
  AES-256-GCM like Square's (`services/payments/tokenSeal.js`, its own key `QUICKBOOKS_TOKEN_KEY`). A shop never sees
  either. The shop calls it with its service key, like the payment, email and domain services.
- The shop's server sends the numbers; the service adds nothing up. A day's numbers have one fixed shape (made by the
  shop's bookkeeping summary, plan 7.12): `{ date, salesCents, shippingCents, discountsCents, giftCardsSoldCents,
  giftCardsUsedCents, refundsCents, taxes: { [book name]: cents }, feesCents, netCents, currency }`; an order adds
  `orderId`.
- Every Intuit address and field name lives in `services/accounting/endpoints.js`, with where it was confirmed.
- A shop in test mode connects to an Intuit **sandbox** company with the app's development keys; a live shop to a real
  company with the production keys.

## Turning it on

Julian, in this order:

1. Make an Intuit developer account and an app with the Accounting scope. Add the redirect address
   `https://<accounting service>/quickbooks/oauth` and the Reconnect URL `https://<accounting service>/quickbooks/reconnect`.
2. Put the development keys in the service's settings (`QUICKBOOKS_CLIENT_ID_TEST`, `QUICKBOOKS_CLIENT_SECRET_TEST`),
   with `QUICKBOOKS_REDIRECT_URL` and a new `QUICKBOOKS_TOKEN_KEY` (32 random bytes, Base64).
3. Host the service (one function in the platform project) with three stores (connections, sign-in states, sent
   record) and a nightly job, and give each shop `PLATFORM_ACCOUNTING_URL`.
4. Set `ACCOUNTING_ENABLED=true` and try the test shop against a sandbox company. Check the open points below there.
5. Fill in Intuit's assessment questionnaire, get the production keys, and add `QUICKBOOKS_CLIENT_ID_LIVE` /
   `QUICKBOOKS_CLIENT_SECRET_LIVE`.

## Confirmed where

- developer.intuit.com's documentation pages load only in a browser and could not be read on 28 October 2026 (OAuth
  set-up, discovery document, partner FAQ, non-US sales tax). Every address, scope and field name was read instead in
  Intuit's own published code: its Node OAuth client (github.com/intuit/oauth-jsclient) and its QuickBooks V3 Java SDK
  (github.com/intuit/QuickBooks-V3-Java-SDK: request addresses, minor version 75, and the data schema `Finance.xsd`).
  `endpoints.js` names the file for each.
- The cost table and the assessment questionnaire were read again in the partner guide PDF ([Q8]); the five-year rule,
  the Reconnect URL and the 30- and 7-day warnings in Intuit's blog ([Q9]); the button rule in [Q12].

## Not confirmed yet (check in a sandbox company before switching on)

- **Canadian tax on a summary.** Intuit's page on non-US sales tax couldn't be read. The service puts one tax code on
  the day's lines (the day's largest tax) and lists every tax as its own tax line with its amount ([Q10] says the tax
  detail "should provide the details of all taxes"). Check that QuickBooks keeps the shop's amounts, and how QST is
  shown.
- **Gift cards.** Cards used are a negative line on the Gift cards item. Check that a sales receipt takes a negative
  line, or change it to a separate liability entry.
- **Refund tax.** A refund receipt carries one line, tax included, on the no-tax code. The shop's summary has no tax
  split for refunds yet; when it has one, send it.
- **Whether a Builder app may connect any number of real companies without a listing.** The partner FAQ couldn't be
  read. Ask Intuit before the first paying press.
- **Intuit's `requestid` as a promise against double writes.** Intuit's SDK sends it; its meaning wasn't read on an
  Intuit page. The service's own record is what stops double sending.

## Words

- **Access token**: the one-hour pass the service uses for each call to a press's company.
- **Account**: a line in the company's chart of accounts (bank, income, expense, liability).
- **Assessment questionnaire**: the form Intuit asks an app maker to fill in before the app may use production keys.
- **Builder**: Intuit's free partner level; reads capped at 500,000 a month, writes not counted, no marketplace listing.
- **Chart of accounts**: the list of every account in a QuickBooks company.
- **Company id** (`realmId`): the number Intuit gives each QuickBooks company; it comes back with the sign-in.
- **Core**: Intuit's name for calls that write data in; free and not counted.
- **CorePlus**: Intuit's name for calls that read data out; counted against the level's allowance.
- **Deposit** (`Deposit`): money moved into the bank account, here from Undeposited Funds, one per payout.
- **Expense** (`Purchase`): money spent; the service records card fees this way.
- **Intuit App Marketplace**: Intuit's public list of apps; listing needs Silver or above.
- **Item** (`Item`): a product or service in QuickBooks; every sales line names one. The service uses three: Book sales,
  Shipping, Gift cards.
- **Minor version**: the version of Intuit's data format the service asks for on each call (75).
- **Reconnect URL**: the page an app must give Intuit, where QuickBooks sends a press whose connection ended.
- **Refresh token**: the long-lived pass that gets new access tokens; lasts at most five years.
- **Refund receipt** (`RefundReceipt`): money given back to a customer.
- **Sales receipt** (`SalesReceipt`): a sale paid at once (not invoiced).
- **Sandbox**: a pretend QuickBooks company Intuit gives developers for testing; nothing in it is real.
- **Silver**: Intuit's US$300 a month partner level, the first that can be listed in the marketplace.
- **Tax code** (`TaxCode`): a tax as QuickBooks knows it (GST, HST ON, Exempt…), with its rates.
- **Undeposited Funds**: the account where money waits between a sale and the payout that brings it to the bank.

## Sources

The research behind this page: `docs/research/2026-10-28-next-build-plan.md` (on the code plan's branch), section 3.

- [Q6] Connect Shopify to QuickBooks Online (Canada, 22 September 2026), Intuit help: https://quickbooks.intuit.com/learn-support/en-ca/help-article/manage-integrations/shopify-quickbooks-online-integration-guide/L8bw6PiWJ_CA_en_CA
- [Q8] Intuit App Partner Program Guide v1.2 (March 2026, PDF), read again 28 October 2026: https://static.developer.intuit.com/resources/Intuit_App_Partner_Program_Guide.pdf
- [Q9] Intuit developer blog, "Important changes to refresh token policy", read again 28 October 2026: https://blogs.intuit.com/?p=35349
- [Q10] Intuit .NET SDK reference, TxnTaxDetail: https://static.developer.intuit.com/sdkdocs/qbv3doc/ippdotnetdevkitv3/html/7328bab2-a9ed-621e-41fa-188e45aaac65.htm
- [Q12] Intuit and QuickBooks buttons update, read again 28 October 2026: https://blogs.a.intuit.com/2021/04/01/intuit-and-quickbooks-buttons-update
- Intuit's Node OAuth client: https://github.com/intuit/oauth-jsclient (src/OAuthClient.js, src/access-token/Token.js)
- Intuit's QuickBooks V3 Java SDK: https://github.com/intuit/QuickBooks-V3-Java-SDK (develop: ipp-v3-java-data/src/main/xsd/Finance.xsd, IntuitRestServiceDef.xsd; ipp-v3-java-devkit PrepareRequestInterceptor.java, intuit-default-config.xml)
