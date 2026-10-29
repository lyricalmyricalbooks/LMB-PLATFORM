# How long records are kept

Written 29 October 2026 (code plan 13.8). Less stored means less to leak, and Canadian privacy law expects a company not
to keep personal data longer than it needs it. This is the list the code follows. A privacy policy page can quote it.

| Record | Kept | Then | Where it is enforced |
| --- | --- | --- | --- |
| Abandoned bags (a shopper's saved cart) | 30 days | deleted | the shop's hourly bag sweep (`apps/shop/functions/cartCleanup.js`) |
| Stock holds on a payment page | until the payment page closes (minutes to hours) | released | the shop's hold sweep |
| Shop bookkeeping records (webhook events, email send claims, throttles) | 90 to 400 days, set on each record | deleted by Firestore's TTL | `apps/shop/firestore.indexes.json` |
| Shopper-side error reports (no names, emails or addresses) | 30 days | deleted by Firestore's TTL | `apps/shop/functions/clientErrors.js` |
| A shop's admin history (who changed what) | two years | deleted | the shop's hourly sweep (`apps/shop/functions/retention.js`) |
| Control room activity (what platform staff did) | one year | deleted | `services/retention/` (nightly) |
| Account recovery requests | two years | deleted | `services/retention/` (nightly) |
| Shop history on the platform (events recorded about a shop) | two years | deleted | `services/retention/` (nightly) |
| Setup step history (what the shop maker did, step by step) | two years | deleted | `services/retention/` (nightly) |
| **Orders** and the customers on them | **at least six years** (the tax office can ask) | **never deleted by a job**; the press can erase a customer's personal details on request while the order record stays | nothing deletes them |
| Billing and invoices | at least six years | kept | nothing deletes them |
| A closed shop | 60 days paused, then 90 days to download everything, then the shop's project is deleted after warnings at 30 and 7 days | deleted | the closing sweep (`services/billing/closing.js`, plan 6.8) |
| Backups | 30 days | replaced by newer ones | the nightly backup |

Notes:

- Where a job deletes, it works oldest first in small batches, and running it twice does nothing more.
- `services/retention/retention.test.js` fails if a job rule names orders, customers, billing or payments, and if a
  record listed here as deleted by `services/retention/` is missing from this page.
- The nightly job writes its last result to `platformState/retention` (when it ran, how many records of each kind it
  removed, and any place it could not clean).
- To run it: `node services/retention/run.js`. It needs the platform project and a schedule, like the health jobs.
