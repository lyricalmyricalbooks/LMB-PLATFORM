# Bill each shop in its own country's currency and tax (12 November 2026)

Julian: "an American customer: everything in USD, their shop set to USD, tax on monthly invoices for their own
jurisdiction. A Canadian customer: everything in CAD, shop in CAD, tax for their province."

Sign-up stays Canada-only (SIGNUP_OPEN_COUNTRIES=CA) until Julian opens it. The US terms are another thread's work.
Julian adds a Stripe Tax registration for each place Colophon collects tax (Stripe only charges tax where registered).

## Rules
- The person who pays (one Stripe customer) has one billing currency: USD when their first shop is in the United
  States, CAD otherwise. Stripe allows one currency per customer, so a second shop of the same account bills in the
  same currency. Kept on the customer row and on each shop's billing row (`currency`), mirrored to the registry.
- The shop's own selling currency already starts from its country (signup/form.js COUNTRIES: US -> USD, CA -> CAD).
- Platform fee: `prices` (CAD) and `usdPrices` (USD), both $5 by default, both editable in the control room.
- Running cost: Google bills Colophon in CAD. A US shop's running cost is converted at the Bank of Canada's
  US-dollar rate for the last business day of the month (no markup); the rate is kept on the bill's record and in
  the line's metadata. No rate reachable: the line waits and is tried again the next night.
- Tax: Stripe Tax (already on with BILLING_TAX) works it out from the billing address: GST/HST/PST/QST by province
  in Canada, sales tax by state in the US, only where Colophon is registered in Stripe. Plan and running-cost lines
  carry the SaaS tax code (PLATFORM_TAX_CODE, default txcd_10103001, "software as a service, business use") and are
  "plus tax". Billing address needs a province (Canada) or a state and ZIP code (US).
- Tax watch in the control room adds US sales by state against a US$100,000 watch line (the lowest common state
  line; Stripe Tax's own Registrations page gives each state's exact one).

## Steps
- [x] Read billing, Bills (#719), sign-up, control room money
- [x] services/billing/currencies.js: billing currency by country, fee by currency, money words
- [x] settings: usdPrices (+ PLAN_PRICE_BOTH_USD), PLATFORM_TAX_CODE; control room fee setting shows both
- [x] plans.js planPrice by currency; billing.js uses the row's currency everywhere (prices, card page, running
      cost, heads-up email, cost alert, hub texts)
- [x] startTrial takes the country; sign-up passes it
- [x] exchangeRate.js: Bank of Canada month-end USD rate; billRunningCosts converts for USD rows
- [x] tax code on products and running-cost lines; tax_behavior exclusive on running-cost lines
- [x] Address: US state + ZIP checks, Canadian province required; shop admin Billing details form gets Country,
      State/ZIP for US, GST/HST field only for Canada
- [x] taxWatch: US states
- [x] Control room: monthly income per currency on Today and the income record; shop record shows billing currency
- [x] Tests, docs (services/billing/README.md, docs/payments.md), npm test

## Verification
- Unit tests: a US account's subscription, price lookup key and card page are in USD; a CA one in CAD; a second
  shop of a US account stays USD; running cost converts at the month's rate and waits without one; tax code set;
  US address checks; tax watch by state; Today shows CAD and USD apart.
- npm test green; CI green before merge.

## Review
Built as planned. npm test (1966 tests), the shop admin's typecheck and its admin tests pass.
Found on the way, not changed here: the platform fee edited in the control room isn't read by billing (it builds
prices from the environment), so a fee change there doesn't reach new bills yet.
