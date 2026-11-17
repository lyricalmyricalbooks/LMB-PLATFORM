# Take a payment at the desk (Services plan, phase 3, part 1)

Plan: https://claude.ai/artifact/3BeTQE5ZMfyRnowrVxCNh8 › phase 3. This part: the Take a payment screen and the QR code.
Card readers (Stripe Terminal and Square Terminal) come in the next part.

- [x] Server: bookings admin op `walkIn` (service, name, optional email, amount 0.50 to 10,000): a confirmed visit
      starting now, paid at the shop, no calendar time, no emails, its pay link kept as `payKey`.
- [x] The client pays from the same booking pay page as the rest of a booking, tip included.
- [x] Admin page `takePayment` (`TakePayment.tsx`, rules in `deskPayment.ts`): Someone at the desk form, Still to pay
      today list, the QR dialog followed live (Paid with the tip, or Paid another way).
- [x] Menu: its own item in the services menus, beside Bookings elsewhere; hidden while Bookings is off.
- [x] Fixture op `walkIn`; release note; admin and functions CLAUDE.md notes.
- [x] Verify: server test (walk-in, link, no time taken, no email), page rules test, nav and route tests, typecheck,
      lint, full shop and root tests, fixture screenshots on desktop and phone.

## Review

A walk-in is a booking with `walkIn: true` and `source: "desk"`, so the pay page, tips, refunds, the calendar and the
figures all work on it with no new money path. It takes no time on the calendar because the client is already at the
desk, so it can never refuse a payment for a clash. Reminders are stamped as sent so none go out.
