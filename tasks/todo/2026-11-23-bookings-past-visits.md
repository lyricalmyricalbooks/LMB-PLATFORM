# Bookings plan 4, step 3.8: Past visits spreadsheet (Beta)

Plan: https://claude.ai/artifact/N7j2zKU7D4gH8uvNrMtqS5

- [x] `admin/pastVisits.ts`: what happened to each booking (checked in, visited, no-show, cancelled by client or by
      you, request declined; unfinished payments and the future left out), counts, rows, the day range.
- [x] `PastVisitsDialog.tsx`: From/To (a year at most, up to today), include cancelled, only no-shows, live counts,
      Download spreadsheet (CSV that opens in Excel, Numbers or Google Sheets). Button on List › Past.
- [x] Tests (`pastVisits.test.ts`), help line, release note, admin CLAUDE.md note, screenshots at 1440 and 390.

## Review
Fixture run: 10 visits, 1 no-show in November; the downloaded file has one row a visit with plain amounts. Read only:
nothing is written.
