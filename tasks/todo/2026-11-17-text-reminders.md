# Services shops, phase 7: text-message reminders at cost (17 November 2026)

Plan https://claude.ai/artifact/3BeTQE5ZMfyRnowrVxCNh8, decision "Text-message reminders? Yes, in phase 7, charged at
cost." The platform holds the text company's keys (Twilio); a shop asks through its own door, like email.

## Plan
- [x] `services/texts/`: config (TEXTS=on + Twilio keys, price per text part in CAD/USD), Twilio sender, the shop
      door `POST /api/texts/shop` (`texts.status`, `texts.send`), the sent log (no message words kept), daily limit,
      paused/closed shops refused, one send per key.
- [x] Bill: `billing.billTexts` puts last month's texts on the next bill as "Text messages, <month>", at cost, once per
      shop and month; trial months and test shops free (same as the bank feed). Job `texts` + schedule.
- [x] Server wiring: world.js route + part, deploy secrets, Launch page line, release runner gives shops
      `PLATFORM_TEXTS_URL`.
- [x] Shop: `functions/textSender.js`, `shopConfig.platformTextsUrl`; bookings `textReminders` setting; the reminder
      and the second reminder also go by text to a client who ticked "Text me reminders" and gave a mobile number.
- [x] Booking page: the tick box (words in Studio Text & labels, French too) shows only when the shop sends texts.
- [x] Admin Bookings › reminders: "Text reminders" switch, price line, "Opening soon" while the platform has no keys.
- [x] Tests (platform + shop), screenshots, release note, CLAUDE notes.

## Review
- Built as planned. Texts are a separate bill line (not the Google usage meters), so cost reconciliation is untouched.
- Safety: one send per idempotency key; a dropped connection is logged "unsure" and never resent or billed; no message
  words or whole numbers are kept; Twilio opt-outs turn the client's box off.
- Off until Julian makes a Twilio account and sets the keys (server/README.md › Text reminders); until then the admin
  shows "Opening soon" and the booking form hides the box.
- Checks: root `npm test`, shop vitest, typecheck, lint, vite build, Studio e2e check for the booking form box.
