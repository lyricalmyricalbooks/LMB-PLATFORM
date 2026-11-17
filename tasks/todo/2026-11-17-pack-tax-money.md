# Packs of visits: tax and money pages (Services plan 2, A3)

Plan 1 left two gaps: packs of a taxed service were sold without tax, and pack sales never reached the Tax centre,
Bookkeeping or Reports.

- [x] Server: `bookingPackBuy` charges `packPriceMinor` + `taxOn(...)`; the pack keeps `priceMinor` (with tax),
      `taxMinor`, `taxLines`; op `packs` and the pack email show them.
- [x] Website: the pack offer and pack panel say "plus tax" (Text & labels `bookTimePlusTax`) for a taxed service.
- [x] Money pages: `packSales` / `withPackSales` (serviceSales.ts), read in `readServiceSales` through op `packs`.
- [x] Tests: serviceSales.test.ts (paid day, refund, tax share, future/unpaid left out, ledger rows),
      moneyRecords.test.ts (merge, one failed read), bookings.test.js (taxed pack charge, list, email, full refund).
- [x] Notes: functions/CLAUDE.md, admin/CLAUDE.md, release note.
- [x] Checks: shop vitest, typecheck, lint, vite build, root npm test.

## Review
Taxed packs charge tax on top, stored inside `priceMinor` so activation (`amount_total === priceMinor`), refunds and
the close cap needed no change. Packs count on the day paid, net of refunds; pack visits are priced 0 so nothing doubles.
Packs bought before this stay untaxed (no `taxMinor`), which `taxIn` treats as no tax. Op `packs` lists the newest 300,
so a shop with more packs than that would see the oldest drop off the money pages; fine for now. Not tried live.
