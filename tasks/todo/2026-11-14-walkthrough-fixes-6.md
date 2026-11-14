# Walkthrough fixes, part 6 (14 November 2026)
- [x] Found on the re-walk after Reset sample data: the test shop's footer still linked to the made-up instagram.com/yourpress. The starting design and the footer's fallback carried it, so a clear in the stored settings was merged back. Both now start empty and the old value is read as none (typed accounts stay).
- [x] Reset sample data also replaces the old one-publisher description on a test shop (the admin form shows stored text, not the storefront's reading of it); a description someone wrote stays
## Review
- Shop `vitest`: only the `functions/` suites fail locally (they need `npm ci` in `functions/`, CI runs it).
