# Bookings plan 4, step 5.6: Promo texts (Beta)

Plan: https://claude.ai/artifact/N7j2zKU7D4gH8uvNrMtqS5

- [x] Shared rules (`shared/promoTexts.ts`): groups, message length, the text as sent (shop name first, STOP last, English
      and French), parts billed, daytime hours on the shop's clock, phone matching.
- [x] Booking form: "Text me offers" tick box beside "Text me reminders", its own yes, only with a phone number (Studio
      region `bookingsTexts`, English and French words). Kept only while the owner's switch is on.
- [x] Server: ops `promoAudience`, `promoSend`, `promoHistory`. One text per phone, at most 500, 9 a.m. to 8 p.m., one
      promo per 24 hours (claimed in a transaction), STOP takes the client off promos and reminders.
- [x] Admin: Promo texts tile in Hours & rules with the switch, Send a promo text (group, service, message, preview,
      count and cost) and the last ten sent.
- [x] Tests, help line, release note, CLAUDE.md notes, screenshots at 1440 and 390.

## Review
The text company's own STOP handling still applies on top. Promo texts are billed like reminders (at cost, on the
monthly bill). A scheduled send ("Friday at 10") could follow if owners ask.
