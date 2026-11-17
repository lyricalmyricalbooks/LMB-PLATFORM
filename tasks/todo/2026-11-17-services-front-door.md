# Services front door, help and text costs (Services plan phase 7, last part)

- [x] `/services` page: hero, bento (booking page, desk, clients), what's included, three steps, closing card
- [x] Buttons follow `/api/plans` (`signupOpen` + `servicesOpen`): waitlist until both are on, then `/join/?type=services`
- [x] Join page picks the Services card from `?type=services`
- [x] Site wiring: build route, canonical, sitemap, after-deploy check, nav and footer links
- [x] Help: text reminders, no-shows, packs of visits (platform help + shop search words)
- [x] Running costs: texts line (count, cost so far, free in trial)
- [x] Control room: Texts column in Costs › Each shop's use
- [x] Tests: servicesPage, billingTexts, sharedSystem, platformBilling, help
- [x] Screenshots: desktop and phone, no sideways scroll

## Review
The page stays a waitlist page until both switches are on, so nothing opens early. Texts show in the same money words as
the rest of the bill (US$ for US shops). Root `npm test`, shop vitest, typecheck, lint and vite build pass.
