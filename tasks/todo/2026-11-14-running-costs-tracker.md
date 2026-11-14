# Running costs tracker and bill estimate (14 November 2026)

Julian: "can we give shop owners a tracker of running costs and bill estimations? let's beef this feature up".

Before: Settings › Billing › Running cost showed last month's billed cost, the fee and the email-me amount.

- [x] `services/billing/costTracker.js`: pure figures (so far, five plain groups, month-end estimate, bill before tax,
      past months, the alert), tested; `billing.costTracker` puts them in the press's currency and words
- [x] `costs` call on both billing doors, given the usage meters (server/world.js)
- [x] The next bill carries its cents so the estimate is taxed at the press's own rate
- [x] Settings › Billing › Running costs card (desktop, phone, CAD, USD, founding, trial, nothing measured, over the amount)
- [x] Control room: Costs › Each shop's use shows what each owner's tracker shows
- [x] Tests: costTracker.test.js, sharedSystem.test.js, BillingHub.test.tsx, platformBilling.test.ts
- [ ] Home tile: not built. The v4 Home has To do, Both sides at a glance and Today only.

## Review
The tracker reads the same meters and uses the same straight-line estimate as the daily heads-up email, so the page
and the email agree. Shop records (database) cost shows $0 until the month closes, because it isn't counted shop by
shop yet (services/usage/meters.js); it is shared out when the month is reconciled, so a closed month can come out a
little above the estimate. Not checked against a live shared project: the test shops are never billed.
