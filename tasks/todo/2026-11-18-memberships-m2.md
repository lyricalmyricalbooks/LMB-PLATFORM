# Memberships M2: perks (Beta)

Plan: https://claude.ai/artifact/AJtw9ihHaKAg4B7EtBva9N (M2, approved 17 November 2026).
Rule kept throughout: who is a member and what they pay is decided on the server, every time it prices.

## M2a: member prices at checkout
- [x] A plan's **Member price**: a whole percent off (0 to 50) in the plan form (`cleanPlan` `memberPercent`), shown on
      the Membership page's plan card as a perk line.
- [x] Checkout asks the server for member prices for a signed-in shopper (like trade pricing: `membershipPricing`
      action, verified email, writes `memberId` on the order). priceOrder re-reads the membership and its plan on
      every pricing; only a membership with perks (trial, active, ending, pastDue) of a plan with a percent counts.
- [x] The percent lowers each product line (never gift cards, never a payment link), the lower of member and trade price
      wins, and codes and automatic offers apply on top as today. The line carries `memberPrice: true`. When it lowers the
      total, checkout says "Your member price is on" (Text & labels › Checkout) instead of "Your total changed".
- [ ] Later: a "Member price" label on order lines and receipts (trade lines have none either).
- [x] Tests: pricing with and without a membership, a membership that ended after the claim, a test membership on a live
      checkout, gift cards untouched.

## M2b: members-only pages and downloads
- [x] A custom page can be "Members only": its body is kept server-side and served by a function to a signed-in member;
      everyone else sees a "For members" box with Join.
- [ ] A digital product can be "Free for members": a member claims it from the product page (a free order, server-made),
      and it lands in their Library.

## M2c: early tickets
- [ ] Events and classes get "Members can book from" (a date and time before sales open to everyone); the server refuses
      a non-member before then.

## Checks
- [ ] Shop tests, typecheck, lint, root `npm test`; Studio check for any new storefront box; desktop and phone screenshots.

## Review
M2a: member prices are a line price, like trade prices, so codes stack on top. Claimed only on the card path, like trade pricing; PayPal and manual payment pay the shop's price for now.
