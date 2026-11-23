# Bookings plan 4, step 4.2: Clock in and out (Beta)

Plan: https://claude.ai/artifact/N7j2zKU7D4gH8uvNrMtqS5

- [x] Shared rules `src/shared/timeClock.ts`: a shift and its breaks (`cleanShift`), minutes worked (`shiftMinutes`),
      the desk's steps (`clockStep`: in, break, back, out), a forgotten clock-out (`forgotten`, over 16 hours).
- [x] Server: desk op `clock` for a front desk or provider (one open shift each, in a transaction); the desk answer
      carries `clock`. Owner ops `shifts`, `saveShift`, `removeShift` (never from the desk). Records in `timeClock`.
- [x] Team desk: a time clock card (Clock in, Start a break, End break, Clock out with a check).
- [x] Team pay: hours and hourly pay per person (hourly rate in Team & rooms), a front desk with no entry on a line of
      their own, a forgotten shift left out until fixed, spreadsheet columns. Hours worked list with Add hours, fix, remove.
- [x] Tests (shared, server, team pay), help line, release note, CLAUDE.md notes, screenshots at 1440 and 390.

## Review
Fixture: Ben 37h 45m at $22.50 an hour comes to $849.38 with his tips on top; Ana's forgotten shift is flagged and
not counted until its finish time is added. Server tests prove one open shift a person, the desk can't read or change
anyone's hours, and breaks come off.
