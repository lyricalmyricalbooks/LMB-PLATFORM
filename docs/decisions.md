# Decisions

Newest first. One line each: date, decision, why.

| Date | Decision | Why |
| --- | --- | --- |
| 2026-10-27 | The public shop profile is a script file (`/shop-profile.js`) that sets `window.__SHOP_PROFILE__`, loaded with `defer` before the app. Server-only values (plan, test mode, Stripe account) stay out of it. | The page has the profile before Firebase starts with no extra wait, and one build serves every shop. |
| 2026-10-27 | Build order is `docs/code-plan.md`, one pull request per line. | Small steps, each keeping the live shop working. |
| 2026-10-27 | One central payment service holds the Stripe platform key; shops never do (`docs/payments.md`). | Connect needs the platform key on every call; one place to protect it, one address for Stripe events. |
| 2026-10-27 | A permanent test shop gets every update first and must complete a test purchase (`docs/test-shop.md`). | Today's checks never pay, so a broken checkout would reach paying presses. |
| 2026-10-27 | Shop setup is numbered, re-runnable steps logged per shop (`docs/shop-setup.md`). | The Phase 1 script becomes the Phase 2 shop maker instead of being written twice. |
| 2026-10-27 | Shop and stockroom stay in their own repos; this repo holds only platform parts. | One codebase to fix, not two; Lyricalmyrical becomes one shop's settings. |
| 2026-10-27 | No monorepo yet. | The two apps use different tools and deploy separately. Revisit if the stockroom moves inside each shop's project. |
| 2026-10-27 | Repo public for now. | Owner's choice; make private before the first paying press. |
