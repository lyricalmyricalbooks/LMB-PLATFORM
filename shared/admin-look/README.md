# Admin look (shared)

The one source of the admin's look: colour tokens (`adminThemes.css`, Riso Press and Paper, day and night) and the
Pressroom component styles (`pressroom.css`). The website admin (`apps/shop`) and the stockroom (`apps/stockroom`) build
from copies written by `node shared/admin-look/sync.mjs`. Never edit a copy; `admin-look.test.js` fails when a copy
differs from the source. Plan: `docs/admin-look-plan.md` (Phase 11).

Rule from the shop's tests: no colour outside `adminThemes.css`; styles read `var(--rp-…)`.
