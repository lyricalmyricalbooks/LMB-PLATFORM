# A press's data, on request

Code plan 19.16. One button builds a press's whole export and emails its owner a link that works 7 days. Used when a
press leaves, for a privacy request, and in the 90 days after a shop closes.

> The press's one-click **Download your shop** (shop admin Settings › General and the cancel step) is a different, faster
> door: the admin builds a zip in the browser (import-ready product files for four shop systems, customers, orders, pages,
> settings, photos; `apps/shop/src/app/admin/shopTakeout.ts`). This service is the emailed copy for closed shops, privacy
> requests and the control room.

## What is in it (`export.js` `buildExport`)

Under `exports/{shopId}/{stamp}/` in storage, one file per collection plus a README.txt, and one zip holding them all
(the emailed link is the zip's):

- the shop: `books`, `authors`, `orders`, `customers`, `discounts`, `giftCards`, `reviews`, `pages`, `newsletter`,
  `stockists`, `shipping-profiles` as CSV, and `settings.json` (settings are nested);
- the stockroom: `stockroom-books.csv` (its catalogue) and one CSV per book record kind across every book:
  `stockroom-ledger.csv`, `-hist`, `-expenses`, `-stores`, `-artistTransfers`, `-artistPayouts`, `-artistReceivables`,
  each with a `bookId` column.

Only the plan's apps are read. An empty collection still gets its file with a header. Never in it: `adminSecrets`, the
shop's working records (holds, claims, limits, logs), sub-collections such as a book's `private` costs, and any field
named like a password, token or secret, at any depth (`files.js` `withoutPrivate`).

The CSV files open in any spreadsheet app: a byte-order mark for accents, fields one level deep as `name.part`, lists
and deeper records as JSON in one cell, and text that starts like a formula (`=`, `+`, `-`, `@`) gets a leading
apostrophe so opening the file never runs it. The zip is written by `files.js` `zipFiles` (stored, no library).

## The two doors (`createDataExports`, `exportRoutes`)

| Route | Who | What |
| --- | --- | --- |
| `POST /api/control/export` | platform admins (two-step) | `{ shopId, reason }`: logged in the registry, the shop's audit log and the activity log before it is built |
| `POST /api/account/export` | the shop's owner (`accounts.roleIn`) | `{ shopId }`: at most one a day per shop (429 in plain words after); logged in the registry and the shop's audit log |

Both email the owner (`data-export-ready`) and answer `{ emailedTo, expiresAt }`; the link itself goes only to the
owner's inbox. Each export is a row in the store (`dataExports/<id>`: making, ready or failed). "Ready" is written only
after the email has gone; a failed build or a failed email marks the row "failed", sends nothing and doesn't count. The
owner's once-a-day check and claim are one `store.update(id, fn)` on the shop's lock row (`owner-lock-<shopId>`, a
transaction in the real store), so two clicks at once can't both pass. A lock still "making" after 15 minutes (a build
that was stopped) no longer holds the owner back.

`closingExportHook(exports)` is the closing sweep's `onClose` hook (`services/billing/closing.js`): when a shop closes,
its owner is emailed the whole export, so the 90 days to download start with the files in hand.

Clients: `shopData` (`list`, `get`; clients/shop.js), `stockroomData` (`ready`, `get`; the stockroom's own database),
`storage` (`write(path, content, { contentType })`, `signedUrl(path, { expiresAt })`), `store`, `registry`,
`auditLog`, `activity`, `email`, `roleIn`. `fakes.js` has pretend ones; the pretend storage's `open(link, at)` answers
like a signed link (the file until it runs out).

## Not yet

- The real storage client: a private bucket in the platform project with a 30-day delete rule on `exports/`, writing
  with the platform's service account and signing links through IAM (V4 signed links work at most 7 days, which is the
  export's link). The real stockroom reader (`get` on the stockroom's named database) beside `clients/shop.js`.
- Hooking `closingExportHook` into the hosted closing sweep, and the web door, once they are hosted.
