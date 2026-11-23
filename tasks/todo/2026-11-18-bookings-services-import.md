# Bookings plan 4, step 2.11: Bring your services from a spreadsheet

Read as: the owner exports services from their own records or another booking tool and brings the file in.

- [x] `admin/serviceImport.ts` (pure): headings each field answers to, lengths ("45 min", "1 h 30", "1:30") and prices
      ("$45", "1.200,50", "free") read, each skipped line with its reason, names already in the shop and repeats skipped.
- [x] Server op `importServices` (functions/bookings.js): every line through `cleanService`, names the shop has skipped,
      the 30-service cap, order after the existing ones, hidden unless "show now", id from the name so a second run adds
      nothing, `tellWebsite` once.
- [x] Admin window (`ServiceImportDialog.tsx`, Beta): file or Google Sheet, sheet choice, preview table, left-out reasons,
      sample sheet, Show them now, result.
- [x] Tests (serviceImport.test.ts, bookings.test.js), help line, release note.
- [x] Verify: typecheck, lint, vitest, help test; screenshots at 1440 and 390.

## Review
The browser's reading is a preview only: the server checks each service again and decides what is a repeat. Priced
services come in as paid at the visit, since a sheet can't say how the owner wants card payment set up.
