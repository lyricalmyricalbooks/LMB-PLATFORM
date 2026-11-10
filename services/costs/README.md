# What each shop costs us

Code plan 19.15. Google's bill for each shop's project, next to what the shop pays, so a shop that costs the platform
more than it brings in shows in the control room. It also feeds row 15.17's spend guards.

## The sums (`costs.js`)

- `readCosts({ rows, period })`: one month (`"2026-11"`) of Cloud Billing's standard usage cost export, summed per
  project and currency, net of credits: `{ period, projects: [{ projectId, currency, costCents, creditCents, netCents }] }`.
  A row counts in the month its usage started (UTC). Amounts are added in millionths and rounded to cents once. A charge
  with no project keeps `projectId: null`.
- `costReport({ rows, costs, settings, fees })`: per shop (registry rows; a shop's project is its `projectId`, else its
  shop id):
  - **Google**: the month's net cost in the plans' currency;
  - **pays**: its plan price less its own percent off, as Today counts it (`control-room/today.js` `monthlyCents`), plus
    pay-as-you-sell fees for the month when given (`fees: { [shopId]: cents }`);
  - **margin** and `losing: true` when Google cost more than the shop pays.

  Most losing first. Projects that aren't a shop (the platform's own, a charge with no project) are listed apart in
  `notShops`, never dropped. A cost in another currency is kept (`otherCurrencies`) and has no margin.
- `costPerShop({ rows, costs })`: `{ [shopId]: { cents, currency } }`, the per-shop totals row 15.17's spend guards read.
  Nothing here sets budgets or caps; that is 15.17. Since pay what you use (10 November 2026) it is also the fallback
  source of each shop's running cost until the shared system writes per-shop meters (`services/billing/README.md`).
- Each report row also carries `runningCents` / `runningMonth`: the running cost last billed to the press, so the
  Costs table shows Google's cost and what the press paid for it side by side.

## The control room

`GET /api/control/costs` (`control-room/costs.js` `createCostsDesk({ registry, reader, settings, fees, admins })`,
added to the web door with `costRoutes(desk)`): this month's report. The page's **Costs** table lists the shops, most
losing first, then the projects that aren't a shop. Until the export is on it says: "Costs appear once Google's billing
export is switched on."

## Julian's step: switch the billing export on

The real reader is not built until this is done, because the table and its name only exist afterwards.

1. In the Google Cloud console, open **Billing** for the platform's billing account (the one every shop project is
   linked to).
2. **Billing export** › **BigQuery export** › **Standard usage cost** › **Edit settings**: choose a project (the
   platform's own) and a new dataset, for example `billing_export`, then **Save**.
3. Google starts filling the table from that day; earlier months are not filled in. Tell Claude the dataset's name.

Then the reader is one BigQuery query, handed in as `createCostReader({ fetchRows })`:

```sql
SELECT project.id AS project_id, cost, credits, usage_start_time, currency
FROM `<platform project>.billing_export.gcp_billing_export_v1_<account id>`
WHERE usage_start_time >= TIMESTAMP(@monthStart) AND usage_start_time < TIMESTAMP(@nextMonthStart)
```

with each row mapped to `{ project: { id: project_id }, cost, credits, usage_start_time, currency }`. The platform's
service account needs **BigQuery Data Viewer** on the dataset and **BigQuery Job User** on the project. Until then
`createCostReader({})` (no `fetchRows`) answers "not switched on" and `fakes.js` `fakeBillingExport(rows)` stands in for
tests.

## Not yet

- The real `fetchRows` (above), once the export is on.
- Pay-as-you-sell fees per calendar month: the fee ledger keeps billing months (`services/payments/payAsYouSell.js`), so
  `fees` is passed in by the caller; the web door passes none yet.
