# Card pay links on invoices and author settle-ups, plus the reminder PDF

Approved by Julian 2026-11-11 (follow-up 2 of the stockroom move). Last approved build; stop after it.

## Plan
- [ ] Server: `paymentLink` op `invoice` — makes an unpaid order for one custom line (invoice number, amount owed, no tax added: invoice already carries its tax), reusing paymentLinks.js expiry, key hash and priceOrder path. Admin-only.
- [ ] Webhook: when that order is paid, mark the invoice paid in its stockroom record (merge-safe write through the same saveBookState shape the admin uses), add audit-log line.
- [ ] Admin: Invoices › invoice › "Make card pay link" button; stores link in `inv.stripe = { url, orderId }`; reminder email + invoice paper already read `stripe.url`.
- [ ] Author settle-up: same link for a settle-up the author owes the press (book shops only).
- [ ] Reminder PDF: Reminders dialog "Download reminder" builds the overdue notice with the pay link (invoicePaper).
- [ ] Two-shop rules check if any rule changes; tests for server op, webhook marking, admin helpers.
- [ ] Release note 87; tsc, lint, vitest.

## Verification
Unit tests for amount/currency guard, refusal on paid/void invoice, idempotent webhook; screenshot of button and PDF.
