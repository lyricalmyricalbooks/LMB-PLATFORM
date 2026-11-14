# Walkthrough fixes, part 3 (14 November 2026)
- [x] Storefront footer "Admin" link off by default (`showFooterAdminLink`, Studio can turn it on); parity fixture regenerated with a sample that has it on
- [x] Test shops' name: sample data fills Store name and Site name ("Your Press" in the admin brand); owner's own name is kept
- [ ] After deploy: Reset sample data on the three test shops (needs Julian's sign-in in Chrome), then re-walk
## Review
Existing shops that saved the link as on keep it; only shops that never chose get it off.
