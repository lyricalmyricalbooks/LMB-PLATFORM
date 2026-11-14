# Services shops, phase 1: three kinds of shop at sign-up (14 November 2026)

Julian: "similar to how squarespace does it we can have the platform work for things like hair salons who do not sell
products, but they do booking and payment processing"; sign-up should tell product sellers apart from service
businesses, each with its own tools. Plan: https://claude.ai/artifact/3BeTQE5ZMfyRnowrVxCNh8. This is phase 1, part 1.

## Plan
- [x] Six service answers (hair, wellness, lessons, fitness, studio, services) in every copy of the "what you sell" list
      (`shared/sells`, `help/sells.js`, `apps/shop/src/shared/shopSells.ts` + generated copy, the stockroom's list),
      with `sellsServices`, `shopKind`, client words and payment categories.
- [x] Sign-up (`join/`, `signup/form.js`): Bookshop / Product shop / Services, then "What do you do?".
- [x] Control room switch `servicesShops` (off by default): `/api/plans` `servicesOpen` shows the card, and the front
      door refuses a new services answer while it is off.
- [x] Shop maker: a services shop starts with Bookings on (`platform/features`), listed in the registry.
- [x] Admin: services menu (Calendar, Clients, Messages, Sales, Marketing, Analytics, Online store, Settings; second
      side "Money"), no shipping settings, no fair mode; Settings › General › What you do + "Sell products too".
- [x] Rules: `firstWeek/start` accepts `sellsProducts` and a service answer only for a shop that is already one.
- [x] Tests, screenshots (sign-up and admin, computer and phone), release note.

## Not in this pull request (next ones)
Test Studio test shop; control room Services filter and counts; a services Home and setup guide; phases 2 to 7.

## Review
- Root `npm test` and the shop's `pnpm test`, typecheck and lint pass. New tests: `servicesShop.test.ts`, service
  cases in `shared/sells/sells.test.js`, the front door refusal, Bookings on at setup.
- Bookshops and product shops: same menus (`adminMenu(…, "shop")` returns the same objects), same words, same sign-up
  cards while the switch is off.
- Seen on screen: sign-up with three cards and "What do you do?" (walkthrough, 1280 and 390 wide); the admin fixture
  `admin-fixture.html?sells=hair` menu and Settings card.
- Known gaps, by design for now: Home and the setup guide still read like a product shop's; a shop cannot switch into
  Services from Settings.
