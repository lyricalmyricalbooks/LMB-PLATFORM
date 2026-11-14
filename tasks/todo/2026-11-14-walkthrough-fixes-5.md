# Walkthrough fixes, part 5 (14 November 2026)
- [x] The storefront header's "Admin" link is off by default (Studio › Style › Header icons & buttons › Hide "Admin" link now starts on); parity fixture covers it switched on
- [x] The starting banner, description and first slide subtitle no longer describe one photography publisher; the old wording is still recognised and read as the new neutral words (goods shops get their own words), typed wording stays
- [ ] Left for the starter-site choice (thread "Design 10 starter site skeletons"): tagline, category list, About page and search-topic starter words that still say photography and ephemera
## Review
- Root and shop tests pass; the only failures locally are the `functions/` suites, which need `npm ci` in `functions/` (CI runs it).
