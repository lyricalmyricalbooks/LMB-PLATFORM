# Classes (Beta): class passes and first-visit prices

Last Classes piece of the approved "Four more ways to sell" plan ("passes"; Bookings already had packs of visits).

## Plan
- [x] Shared rule: `packAnyClass` on a weekly class's pack (not a course, not one-to-one); `anyClass` on the pack;
      `packProblem(…, weeklyClass)` lets a class pass book any weekly class. `introPriceMinor` on a priced service
      (at least 0.50, below the price).
- [x] Server: the pack record carries `anyClass` and "Any class"; the three pack checks pass `weeklyClass(service)`.
      `introFor` gives someone with no held or confirmed booking under their email the first-visit price, at booking and
      when trying a discount code; the booking keeps `intro: true` and `listPriceMinor`.
- [x] Admin: First-visit price field under the price; "A class pass" switch in the pack box for a weekly class.
- [x] Website: Book a time shows "First visit {price}" and "· any class" on a pass (Text & labels, French too).
- [x] Release note, functions guide note.

## Verification
- [x] `functions/bookings.test.js` "classes: a class pass and a first-visit price" (4 tests); `bookingTimes.test.ts` pass rule.
- [x] Full shop suite, typecheck, lint; root `npm test`.

## Review
A pass is an ordinary pack with one more rule at the three places a pack is checked, so buying, emails, closing and
money pages are unchanged. "New" means no held or confirmed booking under that email; a different email gets the offer
again, which is the usual trade-off for an intro price without accounts.
