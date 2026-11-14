# Records cost by the day, and a heads-up on Alerts (14 November 2026)

Julian: "do #1, #2" from the running-costs tracker's next moves.

## Plan
- [x] #1 Count each shop's share of the shared database every day (Firestore's Cloud Monitoring figures, split by each shop's other use, the split reconciliation already gives).
- [x] Keep sizes (photos, records) out of the straight-line projection (`monthPace`), for tracker, control room and heads-up email alike.
- [x] #2 Heads-up on the admin's Alerts page: stored on the billing row when the email goes, copied to `platform/plan`, read by the admin's existing plan watch (no new reads every 5 minutes).
- [x] Raising the amount above where the month is heading takes the alert off; it ends with the month.
- [x] Tests (root + shop), typecheck, lint, screenshots.

## Review
- Verified: root `npm test`, shop `pnpm test`, typecheck and lint clean; fixture screenshots of the alert (desktop, phone) and the records row.
- Not proven: the live Firestore figures in Cloud Monitoring on the shared project (metric types checked against Google's metric list); the service account already reads Monitoring for the other meters.
- The share is an estimate by use, not a true per-shop count: Google doesn't count Firestore by path.
