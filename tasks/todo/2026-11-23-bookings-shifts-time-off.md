# Bookings plan 4, step 4.3: Shifts and time off (Beta)

Plan: https://claude.ai/artifact/N7j2zKU7D4gH8uvNrMtqS5

- [x] Shared rules `src/shared/teamRota.ts`: a planned shift (`cleanRotaShift`), a time off ask (`cleanTimeOff`: whole
      days from today, at most 60, or part of one day), `daysBetween`, `rotaMinutes`, `timeOffWhen`.
- [x] Server: owner ops `rota`, `saveRota`, `removeRota`, `copyRota`, `timeOff` (with clashes), `answerTimeOff` (approved
      for someone on Team & rooms: days off, or a "Time off" block for part of a day; emails the person). Desk ops
      `askTimeOff` (emails the owner) and `withdrawTimeOff`; the desk answer carries the person's `rota` and `timeOff`.
- [x] Admin tab Bookings › Shifts & time off (`RotaPanel.tsx`): asks to answer with clash warnings, the week's rota grid
      (a card per person on phones), Copy last week, Answered lately.
- [x] Team desk (`DeskPlans.tsx`): Your shifts for two weeks, Time off with Ask for time off and Withdraw.
- [x] Tests (shared, server), help lines, release note, CLAUDE.md notes, screenshots at 1440 and 390.

## Review
Planned shifts are a plan for the team; booking times still follow each person's hours (said on the page). Server tests
prove approved whole days land in the person's days off, part of a day becomes a block, a front desk's approval
changes no booking times, and the desk can't read or change the rota.
