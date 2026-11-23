# Bookings plan 4, step 3.1: Signed waivers and contracts

Builds on the one form before the first visit (Services plan 2, B4).

- [x] Shared rules: `intakeForms` (up to `MAX_FORMS` 5, each with an `id` and `renewMonths` 0/6/12/24); an older
      `intakeForm` is read as the first, id "main", so its signatures still count. `formsFor`, `formRunsOut`,
      `formStillSigned` (this wording, not run out by the visit).
- [x] Server: a record per form (`bookingForms/{emailHash}` for "main", `{emailHash}-{formId}` for the others); the
      booking card offers the next form waiting with `formsLeft` and `renew`; `bookingForm` takes `formId`; emails name
      every form waiting; `clientForm` lists each form with its signature and when it runs out.
- [x] Admin: Forms before a visit tile (Health form, Waiver, Contract starters, Sign again choice, remove); client card
      lists each form.
- [x] Booking page: "N forms to fill in", the sign-again note, French words, Studio preview with two forms.
- [x] Tests, help line, release note. Verify: typecheck, lint, vitest, help test; screenshots at 1440 and 390.

## Review
A signature counts if it is valid on the day of the visit, not the day the booking is viewed, so a client is never
let in on a waiver that runs out before they arrive. Renewal is not part of the wording's version, so changing it
never asks everyone at once.
