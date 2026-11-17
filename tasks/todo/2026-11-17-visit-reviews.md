# Reviews of visits (Services plan, phase 7)

Goal: after a visit, clients can review it; approved reviews show on the shop's website.

- [x] Shared rules: `siteReviews` setting, `reviewOpen`, `cleanVisitReview` (+ tests)
- [x] Server: `bookingReview` action (one transaction: review, private contact, booking stamp), owner email,
      `bookingInfo.reviews` (approved only), thank-you/tip emails link to the booking page's review box (+ tests)
- [x] Booking page: review box with stars and words; words in Text & labels, region in Studio
- [x] Website: Client reviews section (registry, fields, fallbacks, thumbnail, renderer, preview samples)
- [x] Admin: Bookings › Hours & rules › Collect reviews for your website; Reviews page names the visit
- [x] Verify: shop vitest, typecheck, lint, vite build, root npm test, Studio browser check, screenshots of the review box

## Review
Reviews go through the normal Reviews queue, so nothing shows before the owner approves it. Emails stay private
(admin-only `reviewContacts`). The section reads reviews through the server's `bookingInfo`, so no new rule or index.
Checked in the browser: empty send asks for stars, a filled review sends and thanks, the section draws 3 sample reviews.
