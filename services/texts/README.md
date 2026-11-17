# Text messages (`services/texts`)

Booking reminders by text, sent through Twilio with the platform's own keys and billed to each shop at cost.
A shop never holds the keys: its server asks through the shop door `POST /api/texts/shop` (`X-Shop-Id` and the
shop's service key, like email).

- `config.js` reads `TEXTS` (`on` to switch on), `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` (a `+1`
  number or a Messaging Service `MG…` id) and the cost of one text part in millionths: `TEXT_PART_MICROS_CAD`
  (16000 = 1.6¢) and `TEXT_PART_MICROS_USD` (11600). Off or missing a key: `texts.status` answers
  `{ available: false }` and the shop shows "Opening soon".
- `index.js` (`createTexts`): ops `texts.status` and `texts.send` (`{ to, body, kind, idempotencyKey }`). One send per
  `${shopId}/${idempotencyKey}`; a paused or closed shop is refused; at most `DAILY_LIMIT` (500) texts a shop a day;
  bodies over `MAX_BODY` (459 characters, three parts) are refused. The log (`textSent`, platform database) keeps the
  kind, the last digits of the number, the parts, the cost and the result, never the words or the whole number.
  A dropped connection is logged `unsure` and never resent or billed. Twilio's "opted out" answer (21610) comes back
  as `optedOut` so the shop stops texting that client.
- `runTexts` (daily job `texts`) puts last month's texts on each shop's next bill through `billing.billTexts`
  ("Text messages, November 2026", once per shop and month; nothing in the trial or for test shops).
- Tests: `texts.test.js` with `fakes.js` (fake Twilio and log). Never point them at real keys.
